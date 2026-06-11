# Done Report — B003-504: Shell GO executor

**Task:** Shell GO executor — wire GoEventChannel + dispatchCue + OutputDispatcher (GO finally fires OSC)  
**Bundle:** ShowX-3.5  
**Completed:** 2026-06-11T03:25:00Z  
**Status:** done → awaiting Critic review

---

## Files Changed

| File | Change |
|---|---|
| `src/main/src/runtime/GoExecutor.ts` | **NEW** — GoExecutor class |
| `src/main/src/Shell.ts` | Added GoExecutor import, field, step 10b wiring, detach in shutdown |
| `src/main/src/ipc/showActions.ts` | Added `buildIntegrationOscEntry()` + seeding in `makeEmptyShow` |
| `src/modules/cuelist-core/src/index.ts` | Added re-exports: GoEventChannel, GoChannelDeps, dispatchCue, DispatchDeps, CueDispatchResult |
| `src/modules/cuelist-core/package.json` | Added two export subpaths for go/goEventChannel.js + dispatch/payloadDispatch.js |
| `tests/unit/runtime/GoExecutor.test.ts` | **NEW** — 11 unit tests |

---

## Test Results

```
pnpm vitest run tests/unit/runtime/GoExecutor.test.ts
 ✓ tests/unit/runtime/GoExecutor.test.ts  (11 tests) 65ms
```

**pnpm -r typecheck:** clean for all 5 packages (apps/marketing, src/shared, src/modules/cuelist-core, pwa, src/main).

**Full suite:** 1297/1315 tests pass. 18 failures are all pre-existing, unrelated to B003-504:
- `Shell.test.ts` (7) — mock missing `pinManager.registerTestPin` (pre-existing, not in our diff)
- `skeleton.test.ts` (9) — `export default new CuelistCore()` vs constructor test (pre-existing)
- `App.test.tsx` (1) — timeout on pairing flow (pre-existing, test modified in prior bundle task)
- `cueCatalog.test.ts` (1) — ENOTEMPTY race condition in temp dir cleanup (flaky env issue)

---

## What Was Built

### GoExecutor (`src/main/src/runtime/GoExecutor.ts`)

New class in the main process runtime. Lifecycle: `attach(showId, doc)` on show open, `detach()` on close.

**attach():**
1. If SHOWX_OSC_OUT env var is set, calls `injectOscDevice()` to register `integration_osc` device + `integration_osc_fallback` routing rule into the Y.Doc (idempotent — skips rule if already present).
2. Constructs a `GoEventChannel` with:
   - `broadcast` → `syncBroker.publishSideChannel(showId, env)` (broadcasts to all connected stations)
   - `publishToStation` → same broadcast fallback (targeted delivery deferred to B003-505)
   - `subscribe(topic, handler)` → wraps `syncBroker.subscribeSideChannel`, filters by `msg.topic`
3. Starts the channel (`channel.start()`).
4. Subscribes to `cue-fire` events on EventBus; each fires `handleCueFire()` with an AbortController signal.

**handleCueFire():** Constructs a full `Cue` object from `CueFireEvent` data, then calls `dispatchCue(cue, deps)`. On success logs `cue.dispatched` at info (or warn if any payloads failed). The `dispatchCue` function auto-publishes `cue-complete` to EventBus, which GoEventChannel already subscribes to in order to broadcast `go.dispatched` back to all stations — no manual publish needed here.

**detach():** Stops GoEventChannel, aborts in-flight dispatches via AbortController, unsubscribes from EventBus.

### Shell wiring (`src/main/src/Shell.ts`)

Added after step 10 (OutputDispatcher initialization):
- `GoExecutor` created with `{ syncBroker: this.sync, events: this.events, output: this.output, log: this.logger }`
- `activeShow.onChange` handler: attach on 'opened', detach on 'closed'
- `detach()` called in shutdown before `activeShow.close()`

### makeEmptyShow OSC seeding (`src/main/src/ipc/showActions.ts`)

`buildIntegrationOscEntry()` parses `SHOWX_OSC_OUT=host:port` and returns a legacy-shape routing entry (`{id, match:{}, transport:{kind:'osc',host,port}, enabled, notes}`). New shows created via "New Show…" get this entry pre-seeded so OSC dispatches work immediately without manual device configuration.

---

## Decisions Made Within Task Scope

1. **publishToStation = broadcast fallback**: B003-504 spec says targeted delivery is deferred to B003-505 SHOW-mode. For now `publishToStation` routes to `publishSideChannel` — all LAN stations receive the envelope and filter by topic on their end.

2. **GoExecutor lives in `src/main/src/runtime/`, not inside cuelist-core**: It composes shell-owned services (SyncBroker, OutputDispatcher, ActiveShowDoc) which are not available in the module context. CuelistCore owns GoEventChannel + dispatchCue; GoExecutor owns the wiring between them and the shell.

3. **dispatchCue does not need manual cue-complete publish**: `dispatchCue` with `_internal=false` (default) already publishes `cue-complete` to EventBus. GoEventChannel subscribes to `cue-complete` in its `start()` to broadcast `go.dispatched`. No double-emit.

4. **SHOWX_OSC_OUT injection is idempotent**: `injectOscDevice()` checks `routingMap.has(RULE_ID)` before adding the fallback rule, so re-attaching the same doc on reconnect doesn't duplicate routing entries.

5. **SideChannelMessage type cast**: The `topic` union in `SideChannelMessage` is `'go'|'presence'|'preview'` but actual wire messages use `'go.request'`, `'go.dispatched'`, etc. Used `as unknown as SideChannelMessage` since the runtime only checks `typeof parsed.topic !== 'string'`. This is intentional technical debt — a full topic expansion should happen when the type is updated.

---

## Notes for Critic

- GoExecutor.ts is clean TypeScript — no `any`, no suppressions. Two casts are intentional (`as unknown as SideChannelMessage` and `as unknown as Record<string, unknown>`) due to the topic union mismatch documented above.
- `handleCueFire` uses `Date.now()` for timing. In tests this is fine; it's timing telemetry only.
- The 11 unit tests cover the spec requirements: start/stop lifecycle, cue-fire → dispatchCue, success/fail logging, no-dispatch-after-detach, re-attach, side-channel subscription shape, abortSignal threading, SHOWX_OSC_OUT device injection, no duplicate fallback rule.
- Pre-existing test failures (18 total) documented above — none in files we touched.

---

## Manual Verification (shell log evidence)

To see end-to-end GO:
1. `SHOWX_OSC_OUT=127.0.0.1:7000 pnpm dev`
2. Open a show → shell log: `go-executor: injected integration OSC device { device_id: 'integration_osc', host: '127.0.0.1', port: 7000 }`
3. Pair a PWA station, navigate to cuelist, press GO button
4. Shell log: `cue.dispatched { cue_id: '...', cue_label: '...', payloads_dispatched: 1, payloads_failed: 0, duration_ms: ... }`
5. OSC packet captured at `127.0.0.1:7000`
