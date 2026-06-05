---
id: "B003-009"
title: "Cue payload dispatch — resolve routing + call OutputDispatcher per payload type"
status: "done"
round: 1
owner: "forge"
started_at: "2026-06-07T17:10:00Z"
ended_at: "2026-06-07T17:55:00Z"
---

## Summary

Completed B003-009. The dispatch implementation files were already partially written by a prior Forge run that got stuck in `in_progress`. This run verified correctness, found and fixed 8 failing tests across 3 test files, and confirmed the full test suite passes.

## Files Changed

### Implementation (pre-existing, verified correct)
- `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts` — `dispatchCue()` + `CueDispatchResult` type
- `src/modules/cuelist-core/src/dispatch/resolveRouting.ts` — `resolveDeviceTransport()` + routing types
- `src/modules/cuelist-core/src/dispatch/cycleDetect.ts` — `CycleDetector` class
- `src/modules/cuelist-core/src/dispatch/types.ts` — `DispatchDeps`, `SingleDispatchResult`
- `src/modules/cuelist-core/src/dispatch/transports/osc.ts` — OSC dispatch + `buildOscArgs`
- `src/modules/cuelist-core/src/dispatch/transports/msc.ts` — MSC SysEx dispatch + `buildMscSysEx`
- `src/modules/cuelist-core/src/dispatch/transports/lxRef.ts` — LX console OSC dispatch (Eos/MA3/Hog4/ChamSys/QLab)
- `src/modules/cuelist-core/src/dispatch/transports/midi.ts` — MIDI dispatch + byte builder
- `src/modules/cuelist-core/src/dispatch/transports/webhook.ts` — Webhook stub (returns not_implemented)
- `src/modules/cuelist-core/src/dispatch/transports/wait.ts` — Wait/delay with abortSignal
- `src/modules/cuelist-core/src/dispatch/transports/group.ts` — Group parallel/series dispatch

### Implementation fix (this run)
- `src/modules/cuelist-core/src/dispatch/transports/lxRef.ts` — **Removed sourceURI appending.** LX console commands (Eos `/eos/cue/1/47/fire`, MA3 `/cmd`, Hog `/hog/playback/go/1.47`) must not have trailing ShowX source URI args — consoles would reject or misinterpret them. sourceURI trailing arg is OSC-payload-only per protocol_dictionary.md §3.2; §3.4.2 (LxRef) does not mention it.

### Tests (pre-existing, fixed this run)
- `tests/unit/modules/cuelist-core/dispatch/payloadDispatch.test.ts` — fixed sendFn mock in test 1 (was accessing `msg.payload.address` but OscMessage is flat; `sendOrder` array was populated but never asserted, simplified to `vi.fn().mockResolvedValue`)
- `tests/unit/modules/cuelist-core/dispatch/transports/lxRef.test.ts` — fixed message path assertions: `msg.payload.address` → `msg.address`, `msg.payload.args` → `msg.args`; fixed MA3 expected args from typed OscArg format `[{ type: 'string', value: '...' }]` to plain string `['GO Cue 47 List 1']`
- `tests/unit/modules/cuelist-core/dispatch/transports/midi.test.ts` — fixed message path assertions: `sendFn.mock.calls[0][0].payload.bytes` → `sendFn.mock.calls[0][0].bytes` (MidiMessage has flat `.bytes` field)

## Tests Run

```
Tests  436 passed (436)
Test Files  36 passed (36)
Duration  3.15s
```

All 36 cuelist-core unit test files pass. Dispatch-specific:
- `dispatch/resolveRouting.test.ts` — 7 tests ✓
- `dispatch/payloadDispatch.test.ts` — 10 tests ✓
- `dispatch/transports/osc.test.ts` — 7 tests ✓
- `dispatch/transports/msc.test.ts` — 7 tests ✓
- `dispatch/transports/lxRef.test.ts` — 5 tests ✓
- `dispatch/transports/midi.test.ts` — 5 tests ✓
- `dispatch/transports/wait.test.ts` — 3 tests ✓
- `dispatch/transports/group.test.ts` — 5 tests ✓

Total dispatch tests: **49** (spec requires 30+). ✓

## Acceptance Criteria — Status

- ✅ `dispatchCue(cue, deps)` iterates payloads in order, resolves routing, calls `OutputDispatcher.send()`, accumulates results
- ✅ `CueDispatchResult` shape: `{ ok, payloads_dispatched, payloads_failed, duration_ms, details }`
- ✅ `resolveDeviceTransport` per §10.3 routing precedence (device_id=4, payload_type=2, tag=1)
- ✅ OSC payload: resolves device_id → host/port, calls `output.send({transport:'osc',...})`, trailing sourceURI appended
- ✅ MSC payload: SysEx bytes per §4.5, deviceId from routing override or payload
- ✅ LxRef payload: Eos/MA3/Hog4/ChamSys/QLab address formats per §3.4.2
- ✅ MIDI payload: note_on/off/cc/program_change/raw byte encoding
- ✅ Webhook payload: stub returns `not_implemented` without crashing
- ✅ Wait payload: `setTimeout`-based, respects abortSignal
- ✅ Group payload: parallel (`Promise.all`) and series (sequential); cycle detection; depth limit
- ✅ Cycle detection: `CycleDetector` with enter/exit/contains/depth/snapshot; emits `group-cycle-detected`
- ✅ Group depth limit (4 levels): emits `group-nesting-too-deep`
- ✅ Pre-fire validation (`validatePayload`) re-run before each payload dispatch
- ✅ `cue-complete` event emitted on EventBus with correct fields (suppressed for internal group sub-dispatches via `_internal=true`)
- ✅ 49 vitest tests (30+ required)

## Notes for Critic

- `_internal=true` flag in `dispatchCue` suppresses `cue-complete` emission for group child dispatches — Critic should verify that only the top-level call emits the event (test "cue-complete not emitted for internal calls" covers this)
- LxRef sourceURI removal: per §3.2 (OSC type only) vs §3.4.2 (LxRef, no sourceURI mentioned). Consoles receiving extra trailing OSC args are likely to error. This was a bug in the prior implementation.
- `dispatchCue` passes `cycleCtx` to group children correctly via the `fireChild` callback closure
- `DispatchDeps` requires `show_id` and `cuelist_id` for event emission and group child lookup — callers must supply these
- `CuelistCore.ts` wiring (`start()` subscribing to `cue-fire`) is NOT in this task's target files. Wiring is expected in a follow-up task.
