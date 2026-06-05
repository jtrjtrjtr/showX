# 08 — GO event side-channel

A separate communication channel between FOH and stations, alongside the Yjs document sync. Why separate? Per `protocol_dictionary.md` §7, GO events are non-CRDT events with strict ordering and authority requirements that don't fit Yjs semantics.

## What flows on the side-channel

Three event families:

- **GO events** — request / dispatch / reject. The actual "fire this cue" RPC.
- **ARM events** — pre-fire standby ("the SM is calling this cue").
- **MODE events** — REHEARSAL ↔ SHOW transitions broadcasted to stations.

Plus a `gap` envelope for when ring-buffer history is incomplete.

## Wire format

```ts
type Envelope = {
  topic: 'go.dispatched' | 'go.rejected' | 'arm.broadcast' | 'mode.transition' | 'gap'
  _seq: number              // monotonic per FOH session
  ts: string                // ISO
  // ... topic-specific fields
}
```

`_seq` is process-scoped (resets on FOH restart). Stations track last-seen seq for resume.

## Topics

### go.request (station → FOH)

```ts
{ request_id, cue_id, station_id, client_ts, override?: boolean }
```

`request_id` is the station's idempotency key. `client_ts` enables historic replay rejection.

### go.dispatched (FOH → all stations)

```ts
{ topic: 'go.dispatched', request_id, cue_id, _seq }
```

Broadcasted on successful authorisation + dispatch.

### go.rejected (FOH → originating station only)

```ts
{ topic: 'go.rejected', request_id, cue_id, reason, _seq }

reason: 'not_sm' | 'not_owner' | 'not_armed' | 'historic_replay' | 'duplicate' | 'mode_locked'
```

Per-station — sent via `publishToStation(req.station_id, envelope)`, NOT broadcast.

### arm.broadcast (FOH → all)

```ts
{ topic: 'arm.broadcast', cue_id, armed_by: station_id, _seq }
```

### mode.transition (FOH → all)

```ts
{ topic: 'mode.transition', to: 'REHEARSAL' | 'SHOW', actor: station_id, _seq }
```

### gap (FOH → originating station only)

```ts
{ topic: 'gap', topic_subject: 'go.dispatched' | ..., from_seq, to_seq }
```

Emitted when a station's `since_seq` predates the ring buffer (resume requested too late).

## go_authority modes

`src/go/authority.ts` — `authorise(req, cuelist, station, mode)`:

| Mode | Logic |
|---|---|
| `sm_only` | request.station_id must be the SM station |
| `sm_called` | SM must have armed this cue first (arm.broadcast must precede); operators can then GO for their dept |
| `any_owner` | requester's dept ∩ cue.dept !== ∅ |
| `manual_only` | (future) bypass GO entirely; rely on operator's local action |

Default for 0.1: `sm_called` per spec recommendation.

The `override: true` flag bypasses authority — long-press path. Logged with `override: true` in history.jsonl.

## Idempotency

`src/go/idempotencyStore.ts` — LRU keyed by `(show_id, request_id)`:

```ts
class IdempotencyStore {
  constructor(size: number) { /* LRU */ }

  has(showId, requestId): boolean
  remember(showId, requestId, result): void
  get(showId, requestId): GoResult | undefined
}
```

Size default 1000 (Q9 ruling). Configurable via cuelist-core config.

Flow:

1. Request arrives, lookup `(show, requestId)`
2. If present → respond with cached result (could be dispatched OR rejected)
3. If not present → authorise + dispatch + remember

This makes Stream Deck button mashing safe — same request_id retried = same response, no duplicate fire.

## Replay window

`src/go/replayWindow.ts` — `isHistoricReplay(clientTs, now)`:

```ts
export function isHistoricReplay(clientTsIso: string, nowMs: number): boolean {
  const requestMs = Date.parse(clientTsIso)
  return (nowMs - requestMs) > 5000   // 5 second window
}
```

If true: respond `go.rejected` with `reason: 'historic_replay'`. Prevents stale reconnect messages from re-firing.

## Ring buffer + resume

`src/go/replayWindow.ts` also exposes `RingBuffer<T>` (capacity = config; default 100 per topic).

On reconnect, a station sends `{ type: 'resume', topic, since_seq, station_id }`. FOH responds:

1. If `since_seq + 1 < oldestRetainedSeq` → emit `{ type: 'gap', from_seq, to_seq }` to that station
2. Replay missed messages via `publishToStation(station_id, ...)` for each ring entry after `since_seq`

Pre-B003-008 round 2, resume was BROADCAST to all stations. Critic caught: a single reconnect would flood every station with history. Fix: `publishToStation` only.

`gap` semantics: client sees gap → triggers full Yjs sync (the side-channel is now known-stale; the CRDT replaces it).

## mode.transition wiring

`CuelistCore.start()` subscribes to `show-mode-change` on EventBus (emitted by [04] transitions). On event:

```ts
this.go.broadcast({
  topic: 'mode.transition',
  to: event.to,
  actor: event.actor,
  _seq: this.seq.next(),
})
this.rings['mode.transition'].push(...)
```

Stations observe `mode.transition` and update local UI lock indicators.

## CRDT field guard

A station could try to put CRDT-only fields on the side-channel (e.g., cue label, payload mutation). `src/go/goEventChannel.ts` has:

```ts
const FORBIDDEN_CRDT_FIELDS = new Set([
  'label', 'description', 'department', 'payloads', 'trigger', 'sort_key', ...
])

export class DesignViolationError extends Error { /* ... */ }

export function assertNotForbiddenCrdtField(envelope: object): void {
  for (const k of Object.keys(envelope)) {
    if (FORBIDDEN_CRDT_FIELDS.has(k)) throw new DesignViolationError(k)
  }
}
```

Belt-and-braces against accidental misuse. The CRDT IS the source of truth for show structure.

## Tests

- `tests/unit/modules/cuelist-core/go/sequence.test.ts`
- `tests/unit/modules/cuelist-core/go/replayWindow.test.ts`
- `tests/unit/modules/cuelist-core/go/idempotencyStore.test.ts`
- `tests/unit/modules/cuelist-core/go/authority.test.ts` (all 4 modes)
- `tests/unit/modules/cuelist-core/go/goEventChannel.test.ts` — full request → authorise → dispatch flow, resume with gap, publishToStation targeting

## Open issues

- `stop.request` / `pause.request` / `resume.request` / `goto.request` — Stream Deck Companion module sends these but FOH side handlers TBD (Critic non-blocking flag on B003-021). Add in 0.2.
- `heartbeat` emission from FOH for connection health UI — currently expected by Companion module but FOH doesn't emit. Add in 0.2.
- Per-station rate limiting for go.request (anti-DoS) — currently relies on idempotency only.
