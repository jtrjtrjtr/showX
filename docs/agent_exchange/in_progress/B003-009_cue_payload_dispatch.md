---
id: "B003-009"
title: "Cue payload dispatch — resolve routing + call OutputDispatcher per payload type"
type: "implementation"
estimated_size_lines: 600
priority: "P0"
depends_on: ["B003-006", "B003-007"]
target_files:
  - "src/modules/cuelist-core/src/dispatch/payloadDispatch.ts"
  - "src/modules/cuelist-core/src/dispatch/resolveRouting.ts"
  - "src/modules/cuelist-core/src/dispatch/transports/osc.ts"
  - "src/modules/cuelist-core/src/dispatch/transports/msc.ts"
  - "src/modules/cuelist-core/src/dispatch/transports/lxRef.ts"
  - "src/modules/cuelist-core/src/dispatch/transports/midi.ts"
  - "src/modules/cuelist-core/src/dispatch/transports/webhook.ts"
  - "src/modules/cuelist-core/src/dispatch/transports/wait.ts"
  - "src/modules/cuelist-core/src/dispatch/transports/group.ts"
  - "src/modules/cuelist-core/src/dispatch/cycleDetect.ts"
  - "tests/unit/modules/cuelist-core/dispatch/payloadDispatch.test.ts"
  - "tests/unit/modules/cuelist-core/dispatch/resolveRouting.test.ts"
  - "tests/unit/modules/cuelist-core/dispatch/transports/**.test.ts"
acceptance_criteria:
  - "`dispatchCue(cue, doc, ctx): Promise<CueDispatchResult>` iterates `cue.payloads` in order, resolves each via routing table, calls shell's `OutputDispatcher.send(...)`, accumulates results"
  - "CueDispatchResult shape: `{ ok: boolean; payloads_dispatched: number; payloads_failed: Array<{payload_id, error}>; duration_ms; details: Array<{payload_id, transport, result}> }`"
  - "`resolveRouting(payload, routing): TransportMessage | { error }` per data_model.md §10.3 routing precedence — most specific match wins"
  - "OSC payload: resolves `device_id` to host/port via routing, calls `ctx.output.send({transport:'osc-out', destination, payload:{address, args, sourceURI}})` per protocol_dictionary.md §3.2 (includes trailing source URI arg)"
  - "MSC payload: builds MSC SysEx bytes per protocol_dictionary.md §4.5 example, calls `ctx.output.send({transport:'msc-out', destination, payload:{bytes}})`"
  - "LXRef payload: resolves console driver (eos|ma3|chamsys|avo|hog), formats OSC address per protocol_dictionary.md §3.4.2 table, sends via OSC OUT"
  - "MIDI payload: builds raw MIDI bytes from discriminated message kind (note_on/off, cc, pc, raw), sends via `midi-out` transport"
  - "Webhook payload: uses stub from B001-007 returning `{ok: false, error: 'not_implemented'}` for now — full Electron `net.request` implementation deferred (acceptance is that webhook does NOT crash or block — fails fast)"
  - "Wait payload: pauses payload iteration `duration_ms` via `setTimeout`; does NOT block event loop; respects abortSignal"
  - "Group payload: recursively expands `child_cue_ids`, fires each as a synthesized `cue-fire` (parallel or series per `fire_mode`); uses cycle detector to refuse to recurse into a cue already in the current call stack"
  - "Cycle detection: `CycleDetector` class tracks call stack of cue_ids; on duplicate, emits `system-error` with code `group-cycle-detected` and breaks the recursion (does not throw — other payloads continue)"
  - "Group nesting depth limit (Q8): 4 levels deep max; on exceed, emit system-error `group-nesting-too-deep`"
  - "Validation pre-fire (data_model.md §5.2 safety net): re-run `validatePayloadMap` before dispatch; on fail, skip payload + log warn + add to payloads_failed"
  - "After dispatch complete, emit `cue-complete` event on EventBus with `{success, errors, duration_ms, payloads_dispatched, payloads_failed}` for B003-008 to broadcast"
  - "30+ vitest tests covering each payload type, routing resolution, multi-payload ordering, parallel vs series group, cycle detection, depth limit, error accumulation"
---

## Context

Payload dispatch is where Cuelist Core meets the real world. The trigger engine (B003-007) and GO channel (B003-008) decide WHEN a cue fires; this task implements WHAT happens — translating the polymorphic Payload union into actual outbound bytes via the shell's shared OutputDispatcher.

The dispatcher is intentionally module-internal — it composes the shell's `OutputDispatcher` service (B001-007) with cuelist-specific routing + transport-formatting logic. The routing table (data_model.md §10.3) lives in Y.Doc; this code reads it.

## Implementation notes

### Public API

```ts
// src/modules/cuelist-core/src/dispatch/payloadDispatch.ts
import * as Y from 'yjs';
import type { ModuleContext, OutputDispatcher, EventBus, Logger } from 'showx-shared';
import type { Cue, Payload } from '../../../../types/cue';
import { resolveRouting } from './resolveRouting';
import { dispatchOsc } from './transports/osc';
import { dispatchMsc } from './transports/msc';
import { dispatchLxRef } from './transports/lxRef';
import { dispatchMidi } from './transports/midi';
import { dispatchWebhook } from './transports/webhook';
import { dispatchWait } from './transports/wait';
import { dispatchGroup } from './transports/group';
import { validatePayloadMap } from '../document/payload';
import { CycleDetector } from './cycleDetect';

export interface CueDispatchResult {
  ok: boolean;
  payloads_dispatched: number;
  payloads_failed: Array<{ payload_id: string; error: string }>;
  duration_ms: number;
  details: Array<{ payload_id: string; transport: string; result: 'ok' | 'error' | 'skipped'; error?: string }>;
}

export interface DispatchDeps {
  doc: Y.Doc;
  output: OutputDispatcher;
  events: EventBus;
  log: Logger;
  abortSignal: AbortSignal;
}

const MAX_GROUP_DEPTH = 4;

export async function dispatchCue(
  cue: Cue, deps: DispatchDeps, cycleCtx: CycleDetector = new CycleDetector(),
): Promise<CueDispatchResult> {
  const t0 = Date.now();
  const dispatched: CueDispatchResult['details'] = [];
  const failed: CueDispatchResult['payloads_failed'] = [];
  let ok_count = 0;

  if (cycleCtx.depth() > MAX_GROUP_DEPTH) {
    deps.events.publish({
      type: 'system-error', module: 'cuelist-core', severity: 'error',
      code: 'group-nesting-too-deep',
      message: `group nesting exceeded ${MAX_GROUP_DEPTH} levels`,
      context: { cue_id: cue.id },
    });
    return { ok: false, payloads_dispatched: 0, payloads_failed: [{ payload_id: cue.id, error: 'group-nesting-too-deep' }], duration_ms: Date.now() - t0, details: [] };
  }
  if (cycleCtx.contains(cue.id)) {
    deps.events.publish({
      type: 'system-error', module: 'cuelist-core', severity: 'error',
      code: 'group-cycle-detected',
      message: `group cycle: cue ${cue.id} already in call stack`,
      context: { cue_id: cue.id, stack: cycleCtx.snapshot() },
    });
    return { ok: false, payloads_dispatched: 0, payloads_failed: [{ payload_id: cue.id, error: 'group-cycle-detected' }], duration_ms: Date.now() - t0, details: [] };
  }
  cycleCtx.enter(cue.id);

  try {
    for (const p of cue.payloads) {
      if (deps.abortSignal.aborted) {
        dispatched.push({ payload_id: p.id, transport: p.type, result: 'skipped', error: 'aborted' });
        continue;
      }
      try {
        // Pre-fire safety net
        validatePayloadInline(p);
        const result = await dispatchOne(p, cue, deps, cycleCtx);
        if (result.ok) {
          dispatched.push({ payload_id: p.id, transport: p.type, result: 'ok' });
          ok_count++;
        } else {
          dispatched.push({ payload_id: p.id, transport: p.type, result: 'error', error: result.error });
          failed.push({ payload_id: p.id, error: result.error ?? 'unknown' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dispatched.push({ payload_id: p.id, transport: p.type, result: 'error', error: msg });
        failed.push({ payload_id: p.id, error: msg });
        deps.log.warn(`payload dispatch failed`, { payload_id: p.id, cue_id: cue.id, error: msg });
      }
    }
  } finally {
    cycleCtx.exit();
  }

  return {
    ok: failed.length === 0,
    payloads_dispatched: ok_count,
    payloads_failed: failed,
    duration_ms: Date.now() - t0,
    details: dispatched,
  };
}

async function dispatchOne(
  payload: Payload, cue: Cue, deps: DispatchDeps, cycleCtx: CycleDetector,
): Promise<{ ok: boolean; error?: string }> {
  const routing = deps.doc.getMap('routing').toJSON() as Record<string, unknown>;
  switch (payload.type) {
    case 'osc':     return dispatchOsc(payload, routing, deps);
    case 'msc':     return dispatchMsc(payload, routing, deps);
    case 'lx_ref':  return dispatchLxRef(payload, routing, deps);
    case 'midi':    return dispatchMidi(payload, routing, deps);
    case 'webhook': return dispatchWebhook(payload, deps);
    case 'wait':    return dispatchWait(payload, deps);
    case 'group':   return dispatchGroup(payload, cue, deps, cycleCtx);
    default:
      return { ok: false, error: `unknown payload type ${(payload as any).type}` };
  }
}
```

### Cuelist Core integration

`CuelistCore.start()` instantiates dispatch handler. Subscribe to `cue-fire` events:

```ts
this.deps.events.subscribe('cue-fire', async (e) => {
  const cuelist = getCuelist(this.doc, e.cuelist_id);
  const cue = cuelist && getCues(cuelist).toArray().find(m => m.get('id') === e.cue_id)?.toJSON() as Cue;
  if (!cue) return;
  const result = await dispatchCue(cue, this.dispatchDeps);
  this.deps.events.publish({
    type: 'cue-complete', show_id: e.show_id, cuelist_id: e.cuelist_id, cue_id: e.cue_id,
    duration_ms: result.duration_ms, success: result.ok,
    errors: result.payloads_failed.map(f => f.error),
    payloads_dispatched: result.payloads_dispatched,
    payloads_failed: result.payloads_failed.map(f => f.payload_id),
    ts: Date.now(), seq: 0, source: 'cuelist-core',
  });
});
```

### Transport implementations

```ts
// src/modules/cuelist-core/src/dispatch/transports/osc.ts
import type { OscPayload, RoutingEntry, TransportDescriptor } from '../../../../../types/payload';

export async function dispatchOsc(
  payload: OscPayload, routing: any, deps: DispatchDeps,
): Promise<{ ok: boolean; error?: string }> {
  const transport = resolveDeviceTransport(payload.device_id, 'osc', routing);
  if (!transport) return { ok: false, error: `no routing for device ${payload.device_id}` };
  if (transport.kind !== 'osc') return { ok: false, error: `device ${payload.device_id} not osc` };
  const sourceURI = buildSourceURI(deps.doc);
  const result = await deps.output.send({
    transport: 'osc-out',
    destination: { kind: 'osc-out', address: `${transport.host}:${transport.port}` },
    payload: { address: payload.address, args: payload.args, trailingSourceURI: sourceURI },
  });
  return { ok: result.ok, error: result.error };
}
```

```ts
// src/modules/cuelist-core/src/dispatch/transports/msc.ts
export async function dispatchMsc(
  payload: MscPayload, routing: any, deps: DispatchDeps,
): Promise<{ ok: boolean; error?: string }> {
  const transport = resolveDeviceTransport(payload.device_id, 'msc', routing);
  if (!transport || transport.kind !== 'msc') return { ok: false, error: 'no msc routing' };
  const bytes = buildMscSysEx(payload, transport.device_id_msc ?? 0x7F);
  return deps.output.send({
    transport: 'msc-out',
    destination: { kind: 'msc-out', address: transport.port_name },
    payload: { bytes },
  });
}

function buildMscSysEx(p: MscPayload, deviceId: number): number[] {
  // F0 7F <device_id> 02 <command_format> <command> [<cue_number> 00 <cue_list> 00] F7
  const cmdMap = { go: 0x01, stop: 0x02, resume: 0x03, load: 0x05, set: 0x0B, fire: 0x0C, all_off: 0x09 };
  const out: number[] = [0xF0, 0x7F, deviceId, 0x02, 0x01, cmdMap[p.command]];
  if (p.cue_number) out.push(...[...p.cue_number].map(c => c.charCodeAt(0)), 0x00);
  if (p.cue_list) out.push(...[...p.cue_list].map(c => c.charCodeAt(0)), 0x00);
  out.push(0xF7);
  return out;
}
```

```ts
// src/modules/cuelist-core/src/dispatch/transports/lxRef.ts
export async function dispatchLxRef(
  payload: LxRefPayload, routing: any, deps: DispatchDeps,
): Promise<{ ok: boolean; error?: string }> {
  const transport = resolveDeviceTransport(payload.device_id, 'lx_ref', routing);
  if (!transport || transport.kind !== 'osc') return { ok: false, error: 'no lx_ref → osc routing' };
  const encoding = transport.encoding ?? 'eos';
  let address: string; let args: any[] = [];
  switch (encoding) {
    case 'eos':
      address = `/eos/cue/${payload.cue_list}/${payload.cue_number}/fire`; break;
    case 'ma3':
      address = `/cmd`;
      args = [{ type: 'string', value: `GO Cue ${payload.cue_number} List ${payload.cue_list}` }];
      break;
    case 'hog':
      address = `/hog/playback/go/${payload.cue_list}.${payload.cue_number}`; break;
    default:
      return { ok: false, error: `unsupported lx encoding ${encoding}` };
  }
  return deps.output.send({
    transport: 'osc-out',
    destination: { kind: 'osc-out', address: `${transport.host}:${transport.port}` },
    payload: { address, args, trailingSourceURI: buildSourceURI(deps.doc) },
  });
}
```

```ts
// src/modules/cuelist-core/src/dispatch/transports/webhook.ts
export async function dispatchWebhook(p: WebhookPayload, deps: DispatchDeps) {
  // Stub for MVP: B001-007 OutputDispatcher webhook implementation TBD
  // Forge: try ctx.output.send({transport: 'webhook-out', ...}). If it returns not_implemented, mark accordingly.
  deps.log.warn(`webhook dispatch not implemented`, { url: p.url });
  return { ok: false, error: 'webhook_not_implemented' };
}
```

```ts
// src/modules/cuelist-core/src/dispatch/transports/wait.ts
export async function dispatchWait(p: WaitPayload, deps: DispatchDeps) {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, p.duration_ms);
    deps.abortSignal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
  }).catch(err => { throw err; });
  return { ok: true };
}
```

```ts
// src/modules/cuelist-core/src/dispatch/transports/group.ts
export async function dispatchGroup(
  p: GroupPayload, parentCue: Cue, deps: DispatchDeps, cycleCtx: CycleDetector,
) {
  const cuelistId = inferCuelistId(deps.doc, parentCue.id); // helper
  const childCues = p.child_cue_ids.map(id => lookupCue(deps.doc, cuelistId, id)).filter(Boolean) as Cue[];
  if (p.fire_mode === 'parallel') {
    const results = await Promise.all(childCues.map(c => dispatchCue(c, deps, cycleCtx)));
    const ok = results.every(r => r.ok);
    return { ok, error: ok ? undefined : 'one or more child cues failed' };
  } else {
    for (const c of childCues) {
      const r = await dispatchCue(c, deps, cycleCtx);
      if (!r.ok) return { ok: false, error: 'series child cue failed' };
    }
    return { ok: true };
  }
}
```

### Routing resolution

```ts
// src/modules/cuelist-core/src/dispatch/resolveRouting.ts
export interface RoutingEntry { id: string; match: { device_id?: string; payload_type?: string; tag?: string }; transport: TransportDescriptor; enabled: boolean; notes: string; }
export type TransportDescriptor = { kind: 'osc'; host: string; port: number; encoding?: 'plain'|'eos'|'ma3'|'chamsys'|'qlab' } | { kind: 'midi'; port_name: string } | { kind: 'msc'; port_name: string; device_id_msc?: number } | { kind: 'http'; base_url: string } | { kind: 'dmx'; universe: number } | { kind: 'inproc'; module_slug: string };

/** Most specific match wins, per data_model.md §10.3 */
export function resolveDeviceTransport(
  device_id: string, payload_type: string, routing: Record<string, RoutingEntry>,
): TransportDescriptor | null {
  const entries = Object.values(routing).filter(e => e.enabled);
  const ranked: Array<{ entry: RoutingEntry; specificity: number }> = [];
  for (const e of entries) {
    let s = 0;
    if (e.match.device_id === device_id) s += 4;
    if (e.match.payload_type === payload_type) s += 2;
    if (e.match.tag) s += 1;
    if (s > 0) ranked.push({ entry: e, specificity: s });
  }
  ranked.sort((a, b) => b.specificity - a.specificity);
  return ranked[0]?.entry.transport ?? null;
}
```

### Cycle detector

```ts
// src/modules/cuelist-core/src/dispatch/cycleDetect.ts
export class CycleDetector {
  private stack: string[] = [];
  enter(cue_id: string): void { this.stack.push(cue_id); }
  exit(): void { this.stack.pop(); }
  contains(cue_id: string): boolean { return this.stack.includes(cue_id); }
  depth(): number { return this.stack.length; }
  snapshot(): string[] { return [...this.stack]; }
}
```

### Source URI builder

```ts
function buildSourceURI(doc: Y.Doc): string {
  const showId = doc.getMap('meta').get('show_id') as string;
  const hostname = require('os').hostname();
  return `showx://${hostname}/${showId}`;
}
```

## Test plan

### `resolveRouting.test.ts`

1. device_id + payload_type + tag match: highest specificity wins.
2. device_id alone match: rank 4.
3. payload_type alone match: rank 2.
4. No match: returns null.
5. Disabled entry skipped.

### `transports/osc.test.ts`

6. OSC payload dispatched: `output.send` called with correct address, args, source URI in trailing string slot.
7. OSC payload with missing device routing: returns error.
8. OSC payload with empty args: dispatched with empty args array.
9. OSC payload with mixed-type args: type tags preserved.

### `transports/msc.test.ts`

10. MSC GO payload produces correct SysEx bytes per protocol_dictionary.md §4.5 example (verify byte-by-byte).
11. MSC STOP payload uses 0x02 command byte.
12. MSC command_format defaults to 0x01 (lighting) if routing doesn't specify.
13. MSC device_id_msc=127 used when routing has no device_id_msc.

### `transports/lxRef.test.ts`

14. Eos lx_ref → `/eos/cue/1/47/fire` with no args.
15. MA3 lx_ref → `/cmd` with string arg `GO Cue 47 List 1`.
16. Hog4 lx_ref → `/hog/playback/go/1.47`.
17. Unknown encoding → error.

### `transports/midi.test.ts`

18. note_on builds 3-byte MIDI message.
19. cc builds 3-byte CC message.
20. raw bytes pass through unchanged.

### `transports/wait.test.ts`

21. wait(100) resolves after ≥ 100ms.
22. wait respects abortSignal — reject thrown on abort.
23. wait(0) resolves on next tick.

### `transports/group.test.ts`

24. Group with 2 children parallel: both dispatched concurrently.
25. Group with 2 children series: child 2 starts after child 1 completes.
26. Group cycle (child references parent): cycle-detected, system-error emitted.
27. Group depth > 4 levels: nesting-too-deep emitted.

### `payloadDispatch.test.ts`

28. Cue with 3 payloads: all dispatched in order; result.payloads_dispatched === 3.
29. Cue with 1 failing payload + 2 succeeding: `ok: false`, payloads_failed has 1 entry, payloads_dispatched === 2.
30. abortSignal mid-dispatch: remaining payloads marked skipped; ok: false (or ok per Forge's call — document).
31. cue-complete event emitted with correct fields.
32. Webhook payload: result indicates not_implemented; does not crash.

## Out of scope

- Webhook actual HTTP dispatch (B001-007 OutputDispatcher webhook implementation; this task uses stub).
- DMX direct dispatch (Q17 → deferred to 0.2; B001-007 may stub).
- Tx-side rate limiting / batching (post-MVP).
- Pre-fire OS permission prompts (handled by module loader at start, not per-fire).
- Retry on transport failure (post-MVP).
- Disguise / Resolume specific drivers (use generic OSC + per-device routing).

## Notes for Critic

- Verify dispatch iterates payloads in array order (NOT parallel) by default — group payload uses Promise.all only for parallel fire_mode.
- Verify cycle detector is passed to all recursive group dispatches.
- Verify source URI is appended as trailing string arg on OSC packets per protocol_dictionary.md §3.2.
- Confirm MSC bytes match the example F0 7F 01 02 01 01 31 31 00 31 00 F7 for command=go, list=1, number=11 (decimal 11 in ASCII = 0x31 0x31).
- Verify validatePayloadMap re-run before dispatch (safety net) — even if mutators in B003-002 validate, defensive re-validation here protects against migrated/imported data.
- Confirm abortSignal short-circuits remaining payloads cleanly (not mid-async).
- Verify routing resolution precedence matches data_model.md §10.3 exactly.
- Watch for memory leaks in long groups — cycle detector stack should be cleaned via try/finally.
