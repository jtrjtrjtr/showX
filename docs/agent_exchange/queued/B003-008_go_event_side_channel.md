---
id: "B003-008"
title: "GO event side-channel publish — pub/sub on /events/<show_id> with idempotency + replay window"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
depends_on: ["B003-002", "B003-007"]
target_files:
  - "src/modules/cuelist-core/src/go/goEventChannel.ts"
  - "src/modules/cuelist-core/src/go/idempotencyStore.ts"
  - "src/modules/cuelist-core/src/go/replayWindow.ts"
  - "src/modules/cuelist-core/src/go/authority.ts"
  - "src/modules/cuelist-core/src/go/sequence.ts"
  - "tests/unit/modules/cuelist-core/go/goEventChannel.test.ts"
  - "tests/unit/modules/cuelist-core/go/idempotencyStore.test.ts"
  - "tests/unit/modules/cuelist-core/go/replayWindow.test.ts"
  - "tests/unit/modules/cuelist-core/go/authority.test.ts"
acceptance_criteria:
  - "Side-channel WSS topic `/events/<show_id>` per protocol_dictionary.md §7.2 + data_model.md §8.2 — JSON envelope messages with `topic`, `seq`, `ts`, `payload`"
  - "Topics implemented: `go.request` (station → FOH), `go.dispatched` (FOH → all), `go.rejected` (FOH → requester), `arm.request`, `arm.broadcast`, `presence.heartbeat`, `mode.transition`"
  - "`SequenceCounter` class assigns monotonic per-show sequence numbers to outbound `go.dispatched` messages; reset only on ShowX process restart (NOT on show open)"
  - "`IdempotencyStore` LRU keyed by `(show_id, request_id)` — default size 1000 per Q9 (configurable via cuelist-core config); rejects duplicate request_ids within window"
  - "Replay window: incoming `go.request` with `client_ts > 5s ago` marked as `historic` per data_model.md §8.4 — replied with `go.rejected{reason: 'historic_replay'}` and NOT re-fired"
  - "`GoEventChannel` integrates with shell's side-channel WSS server (assumed to exist from ShowX-1 B001-008); module registers topic handlers via `ctx.sync` or dedicated channel API"
  - "Authority check before dispatch: `authorise(request, cuelist): AuthorityResult` per data_model.md §8.5 — `sm_called` / `auto_cascade` / `per_dept` / `timecode` rules; rejected requests get reason"
  - "On accepted GO: emit `cue-fire` event on EventBus → dispatcher (B003-009) → on dispatch complete, emit `cue-complete` → broadcast `go.dispatched` on side-channel"
  - "On rejected GO: emit `go.rejected` envelope to requesting station only (not broadcast); log reason"
  - "Ring buffer of last 1024 messages per topic for `resume{since_seq}` reconnect support per protocol_dictionary.md §7.2"
  - "GO events NEVER written to Yjs document — strict guard: any code path adding `fired_at` or similar to Y.Doc cue throws DesignViolationError"
  - "30+ vitest tests across files: sequencing, idempotency dedup, replay window detection, authority modes, ring buffer replay, reject reasons, EventBus integration"
---

## Context

The GO event side-channel is the architectural keystone of data_model.md §2.11: GO fires are events, NOT state, and they MUST NOT live in the CRDT. This task implements the pub/sub channel that carries GO requests from stations to FOH, FOH's authorization decision, the synchronous fire dispatch, and the broadcast back to all stations.

The side-channel transport (WSS) is provided by shell infrastructure (ShowX-1 B001-008). This task wires the Cuelist Core module's GO logic into that transport — adding the topic semantics, idempotency, authority enforcement, and ring buffer for resume.

## Implementation notes

### File tree

```
src/modules/cuelist-core/src/go/
├── goEventChannel.ts      # public API + WSS topic handlers
├── idempotencyStore.ts    # LRU dedup
├── replayWindow.ts        # client_ts age check
├── authority.ts           # data_model.md §8.5 authority modes
└── sequence.ts            # monotonic seq counter
```

### Public API

```ts
// src/modules/cuelist-core/src/go/goEventChannel.ts
import * as Y from 'yjs';
import type { EventBus, Logger, ModuleContext } from 'showx-shared';
import type { Cue, Cuelist } from '../../../../types/cue';
import { authorise, type AuthorityResult } from './authority';
import { IdempotencyStore } from './idempotencyStore';
import { isHistoricReplay } from './replayWindow';
import { SequenceCounter } from './sequence';
import { RingBuffer } from './replayWindow';

export interface GoRequest {
  topic: 'go.request';
  request_id: string;
  cue_id: string;
  cuelist_id: string;
  station_id: string;
  operator_id: string;
  client_ts: string;
  override: boolean;
}

export interface GoDispatched {
  topic: 'go.dispatched';
  request_id: string;
  cue_id: string;
  cuelist_id: string;
  sequence: number;
  dispatched_at: string;
  payloads_dispatched: number;
  payloads_failed: string[];
  fired_by: { station_id: string; operator_id: string };
}

export interface GoRejected {
  topic: 'go.rejected';
  request_id: string;
  cue_id: string;
  reason: 'not_sm' | 'not_owner' | 'historic_replay' | 'duplicate_request' | 'timecode_only' | 'unknown_cue';
  detail?: string;
}

export interface GoChannelDeps {
  doc: Y.Doc;
  events: EventBus;
  log: Logger;
  // Side-channel transport API exposed by shell (B001-008). Forge: validate signature against
  // showx-shared SyncBroker or dedicated SideChannelHandle once available.
  publishToStation: (station_id: string, envelope: object) => void;
  broadcast: (envelope: object) => void;
  subscribe: (topic: string, handler: (msg: object) => void) => () => void;
}

export class GoEventChannel {
  private seq = new SequenceCounter();
  private idem: IdempotencyStore;
  private ring = {
    'go.dispatched': new RingBuffer(1024),
    'go.rejected': new RingBuffer(1024),
    'arm.broadcast': new RingBuffer(1024),
    'mode.transition': new RingBuffer(1024),
  };
  private unsubs: Array<() => void> = [];

  constructor(private deps: GoChannelDeps, opts?: { idempotencyLruSize?: number }) {
    this.idem = new IdempotencyStore(opts?.idempotencyLruSize ?? 1000);
  }

  start(): void {
    this.unsubs.push(this.deps.subscribe('go.request', (msg) => this.onGoRequest(msg as GoRequest)));
    this.unsubs.push(this.deps.subscribe('arm.request', (msg) => this.onArmRequest(msg as any)));
    this.unsubs.push(this.deps.subscribe('resume', (msg) => this.onResume(msg as any)));
    // EventBus: when cue-fire is emitted by trigger engine (B003-007) OR by us here,
    // we will eventually emit go.dispatched after cue-complete fires.
    const cc = this.deps.events.subscribe('cue-complete', (e) => this.onCueComplete(e));
    this.unsubs.push(() => cc.unsubscribe());
  }

  stop(): void { for (const u of this.unsubs) u(); }

  private onGoRequest(req: GoRequest): void {
    const show_id = this.deps.doc.getMap('meta').get('show_id') as string;

    // Replay window
    if (isHistoricReplay(req.client_ts)) {
      this.sendRejected(req, 'historic_replay', `client_ts ${req.client_ts} > 5s old`);
      return;
    }

    // Idempotency
    if (this.idem.has(show_id, req.request_id)) {
      // Reply with the original go.dispatched (cached); do not re-fire
      const cached = this.idem.getDispatched(show_id, req.request_id);
      if (cached) this.deps.publishToStation(req.station_id, cached);
      else this.sendRejected(req, 'duplicate_request', 'request_id already processed');
      return;
    }

    // Look up cuelist + cue
    const cuelist = this.lookupCuelist(req.cuelist_id);
    if (!cuelist) {
      this.sendRejected(req, 'unknown_cue', `cuelist ${req.cuelist_id} not found`);
      return;
    }
    const cue = this.lookupCue(cuelist, req.cue_id);
    if (!cue) {
      this.sendRejected(req, 'unknown_cue', `cue ${req.cue_id} not found`);
      return;
    }

    // Authority check
    const auth = authorise(req, cuelist);
    if (!auth.ok) {
      this.sendRejected(req, auth.reason);
      return;
    }

    // Mark idempotent (placeholder; dispatched payload filled in onCueComplete)
    this.idem.mark(show_id, req.request_id, { request: req });

    // Emit cue-fire event on EventBus → dispatcher (B003-009) handles it
    this.deps.events.publish({
      type: 'cue-fire', show_id, cuelist_id: req.cuelist_id, cue_id: req.cue_id,
      cue_label: cue.label, departments: cue.department, payloads: cue.payloads,
      fired_by: req.operator_id, trigger_mode: 'manual',
      ts: Date.now(), seq: this.seq.peek(),
      source: 'cuelist-core',
    });
  }

  private onCueComplete(e: { show_id: string; cue_id: string; cuelist_id: string; success: boolean; errors?: string[]; payloads_dispatched?: number; payloads_failed?: string[]; }): void {
    // Find the most recent request matching this cue + cuelist (via idem store reverse lookup)
    const original = this.idem.findRecentRequest(e.show_id, e.cue_id);
    if (!original) return; // not initiated by side-channel (e.g. auto-trigger from B003-007)

    const dispatched: GoDispatched = {
      topic: 'go.dispatched',
      request_id: original.request_id,
      cue_id: e.cue_id,
      cuelist_id: e.cuelist_id,
      sequence: this.seq.next(),
      dispatched_at: new Date().toISOString(),
      payloads_dispatched: e.payloads_dispatched ?? 0,
      payloads_failed: e.payloads_failed ?? [],
      fired_by: { station_id: original.station_id, operator_id: original.operator_id },
    };
    this.idem.updateDispatched(e.show_id, original.request_id, dispatched);
    this.ring['go.dispatched'].push(dispatched);
    this.deps.broadcast({ topic: 'go.dispatched', seq: dispatched.sequence, ts: Date.now(), payload: dispatched });
  }

  private sendRejected(req: GoRequest, reason: GoRejected['reason'], detail?: string): void {
    const env: GoRejected = { topic: 'go.rejected', request_id: req.request_id, cue_id: req.cue_id, reason, detail };
    this.deps.publishToStation(req.station_id, { topic: 'go.rejected', seq: this.seq.next(), ts: Date.now(), payload: env });
    this.ring['go.rejected'].push(env);
    this.deps.log.warn(`GO rejected`, { reason, cue_id: req.cue_id, station_id: req.station_id });
  }

  // ... onArmRequest, onResume (handles {since_seq: number} from station reconnect)
}
```

### Sequence counter

```ts
// src/modules/cuelist-core/src/go/sequence.ts
export class SequenceCounter {
  private current = 0;
  next(): number { return ++this.current; }
  peek(): number { return this.current; }
  reset(): void { this.current = 0; }
}
```

### Idempotency store

```ts
// src/modules/cuelist-core/src/go/idempotencyStore.ts
import type { GoRequest, GoDispatched } from './goEventChannel';

interface Entry {
  request: GoRequest;
  dispatched?: GoDispatched;
  added_at: number;
}

export class IdempotencyStore {
  private map = new Map<string, Entry>();
  constructor(public readonly maxSize: number) {}

  private key(show_id: string, request_id: string): string {
    return `${show_id}::${request_id}`;
  }

  has(show_id: string, request_id: string): boolean {
    return this.map.has(this.key(show_id, request_id));
  }

  mark(show_id: string, request_id: string, e: { request: GoRequest; dispatched?: GoDispatched }): void {
    if (this.map.size >= this.maxSize) {
      // Evict oldest
      const oldest = [...this.map.keys()][0];
      this.map.delete(oldest);
    }
    this.map.set(this.key(show_id, request_id), { ...e, added_at: Date.now() });
  }

  updateDispatched(show_id: string, request_id: string, dispatched: GoDispatched): void {
    const e = this.map.get(this.key(show_id, request_id));
    if (e) e.dispatched = dispatched;
  }

  getDispatched(show_id: string, request_id: string): GoDispatched | undefined {
    return this.map.get(this.key(show_id, request_id))?.dispatched;
  }

  findRecentRequest(show_id: string, cue_id: string): GoRequest | undefined {
    // Walk map newest-first; pick first entry matching show + cue
    const entries = [...this.map.entries()].reverse();
    for (const [, e] of entries) {
      if (e.request.cue_id === cue_id) return e.request;
    }
    return undefined;
  }
}
```

### Replay window

```ts
// src/modules/cuelist-core/src/go/replayWindow.ts
export function isHistoricReplay(client_ts: string, now = Date.now()): boolean {
  const tsMs = Date.parse(client_ts);
  if (Number.isNaN(tsMs)) return false; // invalid timestamps not flagged as replay; downstream rejects
  return tsMs < now - 5000; // 5s default per data_model.md §8.4
}

export class RingBuffer<T = unknown> {
  private buf: T[] = [];
  constructor(public readonly capacity: number) {}
  push(item: T): void { this.buf.push(item); if (this.buf.length > this.capacity) this.buf.shift(); }
  since(seq: number): T[] {
    // Caller must know seq semantics; this returns last N items
    return this.buf.slice(-this.capacity);
  }
  size(): number { return this.buf.length; }
}
```

### Authority

```ts
// src/modules/cuelist-core/src/go/authority.ts
import type { GoRequest } from './goEventChannel';

export type AuthorityResult =
  | { ok: true; mode: 'sm' | 'cascade' | 'dept' | 'sm_override' }
  | { ok: false; reason: 'not_sm' | 'not_owner' | 'timecode_only' };

interface CuelistJson {
  go_authority: 'sm_called' | 'auto_cascade' | 'per_dept' | 'timecode';
  cues: Array<{ id: string; department: string[] }>;
}

interface OperatorContext {
  operatorOwns(operator_id: string, dept: string): boolean;
  operatorOwned(operator_id: string): string[];
}

export function authorise(
  req: GoRequest, cuelist: CuelistJson, octx?: OperatorContext,
): AuthorityResult {
  // ShowX-3 default: trust operator role from awareness; full operator registry comes in ShowX-4
  // For MVP: SM detection via operator_id naming convention OR awareness scope.
  // Forge wires a temp adapter that reads operators from doc.getMap('operators') to look up role.

  switch (cuelist.go_authority) {
    case 'sm_called':
      if (octx?.operatorOwns(req.operator_id, 'SM')) return { ok: true, mode: 'sm' };
      return { ok: false, reason: 'not_sm' };
    case 'auto_cascade':
      return { ok: true, mode: 'cascade' };
    case 'per_dept': {
      const cue = cuelist.cues.find(c => c.id === req.cue_id);
      if (!cue) return { ok: false, reason: 'not_owner' };
      const ownedDepts = octx?.operatorOwned(req.operator_id) ?? [];
      const overlap = cue.department.some(d => ownedDepts.includes(d));
      return overlap ? { ok: true, mode: 'dept' } : { ok: false, reason: 'not_owner' };
    }
    case 'timecode':
      if (req.override && octx?.operatorOwns(req.operator_id, 'SM')) return { ok: true, mode: 'sm_override' };
      return { ok: false, reason: 'timecode_only' };
  }
}
```

### Strict GO-not-in-CRDT guard

Add an integration check in B003-002's mutator API: `setMetaField` and cue mutators reject any field named `fired_at`, `fire_count`, `last_fired_by`, or similar. Constant `FORBIDDEN_CRDT_FIELDS = ['fired_at', 'fire_count', 'last_fired_at', 'last_fired_by']`. This enforces data_model.md §2.11 architecturally.

### Integration with shell

`CuelistCore.start()` instantiates `GoEventChannel` with:
- `publishToStation` / `broadcast` / `subscribe` from shell's side-channel API (ShowX-1 B001-008 should expose this; if not available, B003-008 documents the assumed API and B001-008 follow-up may need extension).
- `doc` from the loaded show (post-B003-003 open).
- `events` from `ctx.events`.

If shell's side-channel API surface is different from what's described, Forge documents the gap in done report and Architect rules.

## Test plan

### `idempotencyStore.test.ts`

1. Fresh store: `has` false; `getDispatched` undefined.
2. After `mark`: `has` true; `getDispatched` returns dispatched object after `updateDispatched`.
3. LRU eviction: fill to maxSize+1 → oldest evicted.
4. `findRecentRequest` returns most recent matching request_id by cue.

### `replayWindow.test.ts`

5. `isHistoricReplay` for `now` ts: false.
6. `isHistoricReplay` for `now - 6000`: true.
7. `isHistoricReplay` for `now - 4999`: false (under 5s boundary).
8. Invalid timestamp string: false (let caller reject for other reasons).
9. RingBuffer FIFO: push capacity+5 items → buf.length === capacity; oldest 5 evicted.

### `authority.test.ts`

10. `sm_called` + SM operator: ok.
11. `sm_called` + non-SM operator: not_sm.
12. `auto_cascade` + any operator: ok.
13. `per_dept` + operator owns matching cue dept: ok.
14. `per_dept` + operator doesn't own: not_owner.
15. `timecode` + non-override request: timecode_only.
16. `timecode` + override from SM: sm_override.

### `goEventChannel.test.ts`

17. Valid GO request → cue-fire event published.
18. Duplicate GO request (same request_id) → second call does NOT re-publish cue-fire; cached go.dispatched re-sent.
19. Historic GO (client_ts > 5s) → go.rejected with reason historic_replay.
20. Unknown cue → go.rejected with reason unknown_cue.
21. Unauthorised (non-SM on sm_called cuelist) → go.rejected with reason not_sm.
22. cue-complete event after dispatch → go.dispatched broadcast.
23. go.dispatched contains correct sequence number (monotonic).
24. Sequence does NOT reset on show open; only on engine.reset() / process restart.
25. Resume {since_seq: N} → ring buffer replays missed messages.
26. RingBuffer overflow: requested seq predates retained window → engine responds with gap envelope.
27. arm.request → arm.broadcast emitted with cue_id + cue label.
28. Strict CRDT guard: attempting `cue.set('fired_at', ...)` via mutator throws DesignViolationError.
29. Engine respects abortSignal — stop() unsubscribes all handlers.
30. Engine restart preserves no state (idempotency LRU + ring buffers fresh).

## Out of scope

- Side-channel WSS server infrastructure itself (ShowX-1 B001-008).
- Pairing token validation on incoming `go.request` (handled by WSS auth layer before message reaches this module).
- Operator role/identity resolution beyond SM detection (full operator registry → ShowX-4).
- SHOW mode stricter enforcement (this task implements baseline; SHOW mode adds lock-time fire secret per Q16).
- LTC/MTC scheduling (B003-007 timecode is no-op in MVP).
- Persistent idempotency store (LRU is in-memory; survives a session but not restart).
- Cross-show idempotency (keyed by show_id; different show_ids isolate naturally).

## Notes for Critic

- Verify GO events NEVER added to Y.Doc — Forge MUST not introduce any `cue.set('fired_at', ...)` or similar. Confirm the FORBIDDEN_CRDT_FIELDS guard exists and works.
- Confirm sequence counter is per-process (not per-show); doc says "monotonic per show" but really FOH process; resets only on ShowX restart (not show open).
- Verify idempotency uses (show_id, request_id) composite key — different shows can have overlapping request_ids.
- Verify replay window is 5s (matches data_model.md §8.4) — not configurable in MVP.
- Confirm authority `per_dept` case looks up cue.department, NOT operator owned vs cue owned (the latter is filtering — actionability — not authority).
- Verify ring buffer per-topic, not global (1024 per topic).
- Confirm cue-fire event payload matches protocol_dictionary.md §2.2 `CueFireEvent` shape: includes `payloads` array (so dispatcher in B003-009 has what it needs).
- Verify rejected requests are sent to requester only (not broadcast) — security/noise consideration.
