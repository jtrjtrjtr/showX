# 09 — Payload dispatch

When a cue fires, what physically goes out on OSC / MIDI / DMX / webhook etc.

## Entry point

`src/dispatch/payloadDispatch.ts`:

```ts
export async function dispatchCue(
  cue: CueData,
  doc: Y.Doc,
  ctx: DispatchDeps
): Promise<CueDispatchResult>
```

Returns:

```ts
{
  ok: boolean
  payloads_dispatched: number
  payloads_failed: Array<{ payload_id, error }>
  duration_ms: number
  details: Array<{ payload_id, transport, result }>
}
```

`ctx` carries the OutputDispatcher reference + actor info + abort signal.

## The pipeline

```
1. For each payload in cue.payloads (in array order):
2.   Resolve routing (payload + routing table → TransportMessage | { error })
3.   Call ctx.output.send(message) — fire-and-forget
4.   Accumulate result
5. Emit cue-complete on EventBus when all payloads dispatched (success OR fail)
```

Compound cues (Q15 ruling): payloads dispatch in array order, NO inter-payload await. Compound = atomic from cue PoV; transport-side races are dispatcher's concern, not cuelist's.

## resolveRouting

`src/dispatch/resolveRouting.ts`:

```ts
export function resolveRouting(
  payload: Payload,
  routing: Y.Map<unknown>
): TransportMessage | { error: string }
```

Routing precedence (per data_model.md §10.3, most specific wins):

1. **Exact device_id** — `payload.device_id` matches a device entry
2. **Tag-based** — `payload._tag` matches a routing rule's `tag_pattern`
3. **Type fallback** — payload.type maps to default transport (e.g., `osc` → `osc-out` with default destination)
4. **No match** → `{ error: 'no_route' }` — caller logs + skips

Output: `TransportMessage` per transport spec (see below).

## Per-transport adapters

### OSC (`transports/osc.ts`)

Builds `{ transport: 'osc-out', destination, payload: { address, args, sourceURI } }`. The `sourceURI` trailing arg per protocol_dictionary.md §3.2 — except for LX consoles (see `lxRef`).

### MSC (`transports/msc.ts`)

Builds raw SysEx bytes per protocol_dictionary.md §4.5. `device_id` only; routing decides the MIDI out port.

### LXRef (`transports/lxRef.ts`)

Lighting console abstraction. Driver selection:

```ts
driver === 'eos'      → '/eos/cue/<list>/<num>/fire'
driver === 'ma3'      → '/cmd/Cue <num> Go'
driver === 'hog4'     → '/hog/playback/go'
driver === 'chamsys'  → '/chamsys/qlist/<num>/go'
driver === 'qlab'     → '/cue/<id>/start'
```

**Critical fix (B003-009 self-rescue):** lxRef does NOT append the `sourceURI` trailing arg. LX consoles (Eos, MA3, Hog) reject OSC messages with extra trailing args. Generic OSC payloads still get sourceURI.

### MIDI (`transports/midi.ts`)

Discriminated by message kind:

- `note_on` / `note_off` — channel + note + velocity
- `cc` — channel + controller + value
- `program_change` — channel + program
- `raw` — bytes array (escape hatch)

### Webhook (`transports/webhook.ts`)

0.1 stub. Returns `{ ok: false, error: 'not_implemented' }`. Doesn't crash. Full Electron `net.request` impl in 0.2.

### Wait (`transports/wait.ts`)

```ts
await new Promise(resolve => setTimeout(resolve, payload.duration_ms))
```

Respects `ctx.abortSignal` — if abort fires mid-wait, throws and dispatch loop continues with `payloads_failed`.

NOT blocking event loop in dev mode (`setTimeout` is non-blocking). In production runtime the dispatch loop is async so other cues can be scheduled in parallel.

### Group (`transports/group.ts`)

Recursive expansion. For each `child_cue_id`:

1. Resolve child cue via `cuelist.get(id)`
2. Synthesize `cue-fire` event (re-enters dispatch pipeline)
3. Fire mode:
   - `parallel` → fire all simultaneously
   - `series` → await each before next

Cycle detection: `CycleDetector` class tracks the current expansion stack. If a child cue id appears in the stack, throw `CycleDetectedError`. Test: dispatch loop catches, logs, marks payload as failed.

Q8 ruling: max 4 levels of nesting. Beyond that, the cycle detector also throws `depth_exceeded`.

## Internal events

Group payloads use `_internal: true` flag on synthesized `cue-fire` events to suppress nested `cue-complete` emissions. Otherwise:

```
cue A (group) fires
  → child B fires → cue-complete(B)
  → child C fires → cue-complete(C)
cue-complete(A)  ← this is what we want; B and C should NOT each emit
```

`_internal` flag tells the engine to skip `onCueComplete` work for the inner events.

## DispatchDeps

```ts
type DispatchDeps = {
  output: OutputDispatcher       // shared service from shell
  log: Logger
  abortSignal: AbortSignal
  cuelistResolver: (id) => Y.Map  // for Group expansion
  cycleDetector: CycleDetector
}
```

OutputDispatcher pools sockets per transport — first dispatch opens, subsequent reuse. Cuelist-core doesn't care.

## Tests

- `tests/unit/modules/cuelist-core/dispatch/payloadDispatch.test.ts` — end-to-end with all 7 transport mocks
- `tests/unit/modules/cuelist-core/dispatch/resolveRouting.test.ts` — precedence + fallback
- `tests/unit/modules/cuelist-core/dispatch/transports/<each>.test.ts` — per-transport contract:
  - `osc.test.ts` — `msg.address`, `msg.args` (note: NOT `msg.payload.address` after B003-009 self-rescue fix)
  - `lxRef.test.ts` — driver mapping + no sourceURI
  - `midi.test.ts` — `msg.bytes` byte sequence
  - `msc.test.ts` — SysEx envelope
  - `wait.test.ts` — abort propagation
  - `group.test.ts` — recursion + cycle detection

## Performance notes

A 50-payload compound cue dispatches in under 10ms (fire-and-forget, no await). UDP OSC is the bottleneck on transport pool side — independent of dispatch.

For 1000+ payload group expansion the recursion can deep-stack. Q8 cap (4 levels) keeps this bounded.

## Open issues

- DMX direct payload from cuelist (Q17): deferred to 0.2. Currently DMX is only available via EventX Bridge module path. Cuelist payloads → OSC or MSC only.
- Webhook full impl: 0.2.
- Per-payload retry on transport failure: currently fire-and-forget; failed sends logged but not retried.
- Latency telemetry: dispatch records `duration_ms` per payload but no aggregation / dashboard yet.
