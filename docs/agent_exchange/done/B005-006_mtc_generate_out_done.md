---
id: "B005-006"
title: "MTC generate — out (master clock drives MTC)"
status: "done"
review_round: 1
---

## Summary

Implemented `MtcGenerator` — a class that drives an external MIDI port as an MTC master, synchronised to the ShowX `MasterClock`. Follows the mirror-image of B005-005 (MTC decode/chase in).

## Files changed

- **`src/main/src/shared/output/mtcGenerator.ts`** — new file (~160 lines). `MtcGenerator` class.
- **`tests/unit/shared/output/mtcGenerator.test.ts`** — new file. 21 unit tests.
- **`docs/agent_exchange/state.json`** — task status updates.
- **`docs/agent_exchange/in_progress/B005-006_mtc_generate_out.md`** — moved from queued.

## Implementation

### `MtcGenerator`

**API:** `enable(portName: string)` / `disable()` / `isEnabled` (default OFF).

**Port ownership:** `MidiOutPool.claim(portName, 'time-layer')`. On `ClaimConflict` (port already owned by cue dispatch or another holder): logs a warning via `Logger`, stays disabled, no crash.

**QF cadence:** `setInterval` at `Math.round(250 / intFps(rate))` ms (10ms @ 25fps, 10ms @ 24fps, 8ms @ 30fps). At each tick, emits `[0xF1, (pieceIdx<<4)|nibble]`. Piece index cycles 0→7 continuously.

**TC snapshot + 1-frame lookahead:** At each start-of-block (pieceIdx=0), reads `clock.getState().totalFrames + 1` and computes the 8 nibbles from `framesToTc()`. Lookahead ensures that when piece 7 arrives at the receiver (~7 QFs = ~70ms later), the live clock is within one frame of the encoded TC.

**Full-frame SysEx** (`F0 7F 7F 01 01 hh mm ss ff F7`) sent on:
- Clock becomes active master (start, or source flipped to `internal` while running)
- `clock.locate()` event (same-rate onChange while already master)
- Rate change while master (restarts interval at new cadence + sends full-frame)

**Stop:** on `clock.stop()` → `_stopInterval()`. QF stream halts. Port NOT released until `disable()`.

**Rate code mapping:**
- 24fps → 0, 25fps → 1, 29.97 df → 2, 30fps → 3

**Piece 7 encoding:** `((hh >> 4) & 0x01) | (rateCode << 1)` — matches decoder in `mtcDecoder.ts`.

## Tests run

```
pnpm vitest run tests/unit/shared/output/mtcGenerator.test.ts
✓ 21 tests passed (13ms)

pnpm vitest run tests/unit
✓ 143 test files, 1806 tests passed (20.5s) — 0 regressions

pnpm -r typecheck
✓ all packages clean
```

## Acceptance criteria verification

| AC | Status |
|---|---|
| QF `[0xF1, (piece<<4)\|nibble]` at correct cadence (8 QF per 2 frames) | ✅ `interval=Math.round(250/fps)` ms; 21 tests verify piece order and cadence |
| Full-frame SysEx `F0 7F 7F 01 01 hh mm ss ff F7` on locate/start | ✅ verified: tests `full-frame on start` and `full-frame on locate` |
| Sends via `MidiOutPool.claim(portName,'time-layer').send({bytes})` | ✅ claim slug hardcoded to `'time-layer'` |
| Quarter-frame encodes rate bits in hours-high piece (piece 7) | ✅ 4 rate-code tests (24/25/29.97df/30fps) |
| Enable/disable + port selection, default OFF | ✅ tested |
| `ClaimConflict` logged, no crash | ✅ tested |
| Stop halts QF stream, release on disable | ✅ tested: stop halts, disable releases port |
| `pnpm -r typecheck` clean, tests pass, no edits outside target_files | ✅ |

## Notes for Critic

- `midiOut.ts` was NOT modified — all required types are inferred from `MidiOutPool.claim()` return value; no export changes needed.
- `Clock.ts` was NOT modified.
- The `performance` import in `Clock.ts` is used by `MasterClockImpl` for its `nowFn()`; the generator reads `clock.getState()` only and does not touch `performance` directly, so fake timer tests work without additional setup.
- `intFps(29.97)` returns 30, so interval at 29.97fps = `Math.round(250/30)` = 8ms (same as 30fps NDF) — standard for MTC which uses integer slot counts even for drop-frame.
- The 1-frame lookahead is applied only at the `pieceIdx===0` snapshot; it is NOT applied to the full-frame SysEx (full-frame encodes current position, used for locate/seek accuracy).
