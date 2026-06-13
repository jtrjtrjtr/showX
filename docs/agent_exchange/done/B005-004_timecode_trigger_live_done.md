# Done Report: B005-004 — Timecode Trigger Live

**Task:** B005-004  
**Bundle:** B005 (F2 Time Layer)  
**Status:** done  
**Forge:** Sonnet  
**Started:** 2026-06-13T18:35:00Z  
**Ended:** 2026-06-13T19:00:00Z  
**Review round:** 0

---

## What was implemented

Wired `TriggerEngine` to the `MasterClock` so timecode-triggered cues fire automatically when the clock crosses their `time_ms`.

### Files modified

| File | Change |
|---|---|
| `src/modules/cuelist-core/src/trigger/types.ts` | Added `MasterClock` to imports; added optional `clock?: MasterClock` to `TriggerEngineDeps` |
| `src/modules/cuelist-core/src/trigger/triggerEngine.ts` | Full clock-driven timecode implementation (see below) |
| `src/modules/cuelist-core/src/trigger/scheduler.ts` | Updated timecode case comment — clock-driven, not chain-scheduled |
| `src/modules/cuelist-core/src/index.ts` | Added `TriggerEngine` and `TriggerEngineDeps` exports |
| `tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts` | Replaced old "MVP deferred" timecode tests with 14 new clock-driven tests |

### Design

- `TriggerEngineDeps.clock` is optional. When absent, timecode cues are inert.
- On `start()`, subscribes to `clock.onChange`. On every state change (start/stop/locate/rate/source), calls `onClockChange(state)`:
  - Converts `totalFrames → ms` via `framesToMs(frames, rate)` (handles 29.97 drop-frame fps).
  - Calls `rearmTimecode(currentMs)` — clears and rebuilds `armedTimecode: Map<cueId, cuelistId>` with all non-LTC timecode cues where `time_ms > currentMs`.
  - When running: starts a 40ms `setInterval` polling loop if not already running.
  - When stopped: clears the polling interval.
- `tickTimecode()` (every 40ms) reads `clock.getState()`, skips if stopped or backward, calls `fireArmedTimecode(lastMs, currentMs)`, updates `lastClockMs`.
- `fireArmedTimecode(from, to)` collects armed cues in `(from, to]` in cuelist/sort_key order, removes each from armed, publishes `cuelist-go` with `by_operator_id: 'timecode'`.
- LTC-source cues: not armed; logged as `'timecode: ltc source not available'`.
- `cancelAll()` also clears `armedTimecode`.
- `stop()` clears the interval before `cancelAll()`.

### Locate-forward no-fire logic

On every `onChange`, `rearmTimecode` re-arms only cues **ahead** of the new position. Jumping forward drops skipped cues from the armed set — no retroactive fire on locate.

### Known gap (pre-existing, out of scope)

`cuelist-go` events published by `TriggerEngine` are not yet subscribed to by `GoEventChannel` or `GoExecutor` in production. This gap affects all auto-trigger chains (auto_continue, auto_follow, hotkey, timecode). The timecode tests verify the event is published correctly; production wiring is a separate task.

---

## Tests

Replaced old 2-test "timecode MVP deferred" section with 14 new tests covering:

- TC-1: fires `cuelist-go` when clock crosses `time_ms` while running
- TC-1b: `by_operator_id === 'timecode'`
- TC-2: no fire when clock never started
- TC-2b: no fire after `clock.stop()`
- TC-3: re-arms and fires again after locate backward
- TC-4: does NOT fire cue jumped over by locate forward
- TC-5: LTC-source cue not fired
- TC-5b: LTC-source cue logged as not available
- TC-6: multiple cues at same time fire in cuelist sort_key order
- TC-7: fires once per pass; no double-fire on next tick

---

## Gate results

```
pnpm -r typecheck  → all 5 packages: Done (no errors)
pnpm test          → 141 test files, 1748 tests, 0 failures
```

---

## Acceptance criteria check

| AC | Result |
|---|---|
| Cuelist-go fires when running clock crosses time_ms | ✅ TC-1 |
| No fire when clock stopped | ✅ TC-2, TC-2b |
| No fire on backward locate (only on forward pass) | ✅ TC-4 |
| Re-arm after locate-before-the-cue | ✅ TC-3 |
| LTC source inert | ✅ TC-5, TC-5b |
| Fire in cuelist/sort_key order for ties | ✅ TC-6 |
| Typecheck clean | ✅ |
| All existing tests green | ✅ 1748/1748 |
