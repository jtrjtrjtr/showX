---
id: "B005-005"
title: "MTC decode — chase in (master clock follows external MTC)"
status: "done"
owner: "forge"
review_round: 1
started_at: "2026-06-13T19:50:00Z"
ended_at: "2026-06-13T21:10:00Z"
---

## Summary

Implemented full MTC decode + chase-in stack:
- **`MtcDecoder`** — pure stateful state machine; handles QF (0xF1) and full-frame SysEx (0xF0 7F … F7)
- **`MtcChaser`** — drives MasterClock on decoded TC events (setSource/locate/setRate); lock-loss timeout
- **`MtcReceiver`** — wires decoder+chaser to InputRegistrar.subscribeMidi; enable(portName)/disable() API

## files_changed

| File | Change |
|---|---|
| `src/main/src/shared/input/mtcDecoder.ts` | **NEW** — MtcDecoder + MtcChaser + MtcReceiver (178 lines) |
| `src/main/src/shared/input/midiIn.ts` | **MODIFIED** — added 0xF1 QF case to parseMidi (4 lines); emits type='sysex' so QF bytes reach handlers |
| `tests/unit/shared/input/mtcDecoder.test.ts` | **NEW** — 25 tests covering all acceptance criteria |

InputRegistrar.ts and Clock.ts required no modifications — existing APIs are sufficient.

## tests_run

```
pnpm vitest run
Test Files  143 passed (143)
Tests  1790 passed (1790)
```

25 new tests in `mtcDecoder.test.ts` + 16 existing midiIn tests continue to pass.

`pnpm -r typecheck` — clean (src/main + src/shared + pwa + cuelist-core + marketing all pass).

## decisions_made

1. **0xF1 as sysex type**: parseMidi returns `type: 'sysex'` for 0xF1 QF bytes to route them through the existing handler fan-out without modifying `types.ts` (not in target_files). MtcReceiver discriminates by `raw[0]` in the handler.
2. **Lock = source field**: "clock reports locked" is represented as `clock.getState().source === 'mtc'`; no new `locked` field added to ClockState (shared type unchanged).
3. **MtcReceiver not wired in Shell.ts**: Shell wiring is outside target_files; left for a follow-up task or F2 gate. The receiver is fully usable — caller creates `new MtcReceiver(registrar, clock)` and calls `.enable(portName)`.
4. **Clean-set requirement**: First emit requires all 8 pieces seen at least once (any order). After that, every piece-7 triggers emit. No ordering enforcement — tolerates mid-sequence start per spec.
5. **Lock-loss timeout default 200 ms** (~5 frames at 25fps). Overridable via constructor param for testing.

## notes_for_critic

- `midiIn.ts` change is backward-compatible: existing tests (16) all pass; only adds a new matched case before `return null`.
- `types.ts` (MidiMessage) was NOT modified — acceptable because MtcReceiver subscribes with `type: 'any'` and the discriminator is `raw[0]`, keeping MidiMessage schema stable.
- MtcReceiver.enable/disable is async (matches InputRegistrar.subscribeMidi signature).
- MtcChaser uses `vi.useFakeTimers()` in tests so lock-loss timeout runs instantly without real delays.
- If Shell wiring is needed before F2 gate: create MtcReceiver in contextFactory or Shell, store on context, call enable() based on persisted config.
