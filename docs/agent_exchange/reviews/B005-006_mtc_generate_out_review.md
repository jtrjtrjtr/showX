---
id: "B005-006"
verdict: "accepted"
review_round: 1
reviewer: "critic"
reviewed_at: "2026-06-13T19:18:00Z"
---

## Summary

`MtcGenerator` correctly turns the `MasterClock` into an MTC master: continuous quarter-frame stream at the right cadence, full-frame SysEx anchors on start/locate/rate-change, proper port ownership via `MidiOutPool.claim()`, and clean stop/disable semantics. Pairs as a mirror image of B005-005 and is consistent with `mtcDecoder.ts`. 21 unit tests pass; `pnpm -r typecheck` clean across all 5 workspace projects.

## Acceptance criteria verification

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | QF `[0xF1, (piece<<4)\|nibble]` at correct cadence (8 QF / 2 frames); full-frame SysEx `F0 7F 7F 01 01 hh mm ss ff F7` on locate/start | ✅ | `mtcGenerator.ts:111-117` interval = `Math.round(250/fps)` = 10ms @ 25fps (8 QF per 80ms = 2 frames). `mtcGenerator.ts:137` `dataByte = (pieceIdx<<4)\|nibble`, then `[0xf1, dataByte]`. Full-frame at `mtcGenerator.ts:165-175`. Tests: `mtcGenerator.test.ts:141-153` cycles 0→7, `:155-168` continues 0→7→0→7. |
| 2 | `MidiOutPool.claim(portName,'time-layer').send({bytes})`; configurable port; releases on disable | ✅ | `mtcGenerator.ts:47` `pool.claim(portName, 'time-layer')`. Release at `mtcGenerator.ts:69` `this.claim?.release()`. Test `mtcGenerator.test.ts:82-88` verifies claim args; `:90-102` verifies release on disable. |
| 3 | QF encodes TC + rate bits in piece 7; 1-frame lookahead | ✅ | `mtcGenerator.ts:131-134` lookahead `state.totalFrames + 1` at pieceIdx=0. `mtcGenerator.ts:153-162` nibble layout matches standard MTC: ff/ss/mm/hh split, piece 7 = `((tc.hh>>4)&0x01) \| (rc<<1)`. Consistent with decoder (`mtcDecoder.ts:11-17`, `:94`). Roundtrip test `mtcGenerator.test.ts:230-261` verifies 01:02:03:04 + lookahead → 01:02:03:05 decoded. |
| 4 | Enable/disable + port selection; default OFF; ClaimConflict logged, no crash | ✅ | `mtcGenerator.ts:27` `enabled=false`. `:44 enable()`, `:64 disable()`, `:76 isEnabled`. Conflict handled at `:48-54`: returns early with `log.warn()`, no throw. Tests `:75-80` default off, `:104-116` claim conflict logs + stays disabled, `:326-333` no-throw. |
| 5 | Clock stop halts QF stream; disable releases port | ✅ | `mtcGenerator.ts:103-105` `prevMaster → false` triggers `_stopInterval()`. `:64-74` disable releases. Tests `:289-299` stop halts, `:301-312` resume works, `:90-102` disable releases. |
| 6 | Rate-bit tests (24/25/29.97df/30); port-claim conflict; stop halts; full-frame on locate; fake timers | ✅ | 4 rate tests `:170-226`. Locate full-frame `:265-285`. Fake timers throughout `:64-67`. 21 tests total, all green. |
| 7 | `pnpm -r typecheck` clean, tests pass, no edits outside target_files | ✅ | Typecheck: 5/5 workspace projects "Done". Vitest: 21/21 passed (8ms). Git status shows only new files `src/main/src/shared/output/mtcGenerator.ts` + `tests/unit/shared/output/mtcGenerator.test.ts`; `midiOut.ts` and `Clock.ts` (in target list) were not modified — generator works against existing exports. |

## Code quality notes

- **Encoding correctness:** Full-frame `hhByte = (rc << 5) | (tc.hh & 0x1f)` (`mtcGenerator.ts:169`) matches the standard MTC layout (rate in bits 5-6, hours in bits 0-4) and pairs with the decoder's `((hhByte >> 5) & 0x03)` extraction (`mtcDecoder.ts:80`).
- **Rate-code consistency:** `rateCode()` (`mtcGenerator.ts:12-17`) returns 0/1/2/3 for 24/25/29.97df/else — symmetric with `rateFromCode()` in the decoder. Round-trip is exact for the four canonical rates.
- **1-frame lookahead applied correctly:** Only at `pieceIdx === 0` snapshot for QF (`mtcGenerator.ts:131-134`), NOT to the full-frame SysEx (`:165-175`). This matches MTC semantics — full-frame is a locate anchor, QF is a streaming projection.
- **Lifecycle state machine:** `_onClockChange` (`mtcGenerator.ts:80-109`) handles four transitions cleanly: enter-master (start interval + full-frame), rate-change-while-master (restart interval + full-frame), locate-while-master (full-frame only), exit-master (stop interval). `prevMaster` tracks state.
- **No leaks on re-enable:** `enable()` line 45 calls `disable()` first if already enabled, preventing double subscriptions / orphan intervals.
- **Defensive `if (!this.claim) return`:** in both `_tick` (`:127`) and `_sendFullFrame` (`:166`) — handles the race where a tick fires after disable() but before the interval clears (cosmetic but correct).

## Minor observations (non-blocking)

- `Math.round(250/30) = 8ms` interval at 30fps / 29.97df gives a slight drift over time (true value is 8.333ms) — acceptable for MTC since the receiver clocks against the encoded TC values and uses QFs only for sub-frame interpolation. Standard practice.
- Send is `void this.claim.send(...)` — fire-and-forget. Errors are absorbed by the pool's `Logger.error` (see `midiOut.ts:73`), which is correct: a MIDI send failure should not crash the QF stream.
- No tests cover rate-change-while-master triggering a full-frame + interval restart. Not in the acceptance criteria explicitly, but the code path exists at `mtcGenerator.ts:92-99`. Acceptable gap; suggest adding in a future polish task if MTC rate hot-swap becomes user-facing.

## Verdict: accepted

All 7 acceptance criteria satisfied with file:line citations above. Encoding is correct, tests are comprehensive, typecheck clean, scope respected, no regressions. Ship it.
