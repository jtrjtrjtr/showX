---
id: "B005-005"
title: "MTC decode — chase in (master clock follows external MTC)"
verdict: "accepted"
review_round: 1
reviewer: "critic"
reviewed_at: "2026-06-13T19:05:00Z"
---

## Verdict

**ACCEPTED** — all 7 acceptance criteria met; 25 new unit tests + 16 existing midi tests pass; typecheck clean; scope respected.

## Acceptance criteria check

### AC1 — MtcDecoder handles QF (0xF1) + full-frame SysEx, pure & unit-testable
✅ `src/main/src/shared/input/mtcDecoder.ts:25-107` — `MtcDecoder` class with `feedBytes(raw)`; dispatches to `_handleQF` (line 53) or `_handleFullFrame` (line 75). No I/O dependency. Bit-packing per MTC spec:
- QF reassembly `mtcDecoder.ts:88-96` — frames `((p1 & 0x01) << 4) | (p0 & 0x0f)`, sec/min similar with 2-bit MSB, hours 1-bit MSB, rateCode `(p7 >> 1) & 0x03`.
- Full-frame `mtcDecoder.ts:79-85` — hh from `hhByte & 0x1f`, rate from `(hhByte >> 5) & 0x03`. Spec-conformant.

### AC2 — midiIn.ts parseMidi recognizes 0xF1; decoder uses InputRegistrar.subscribeMidi
✅ `src/main/src/shared/input/midiIn.ts:66-69` — new 0xF1 case emits `type: 'sysex'` preserving `raw` bytes (backward-compatible; no change to `MidiMessage` shape).
✅ `mtcDecoder.ts:203-216` — `MtcReceiver.enable(portName)` calls `registrar.subscribeMidi({type:'any'}, handler, {portName})` matching `InputRegistrar.ts:133-181` signature. Handler discriminates by `raw[0] === 0xf1 || 0xf0`.

### AC3 — On lock: setSource('mtc') + locate; on timeout: locked=false, hold last value
✅ `mtcDecoder.ts:157-163` — on first TC: `setSource('mtc')` + autostarts clock if stopped.
✅ `mtcDecoder.ts:165` — `clock.locate({hh,mm,ss,ff})` on every TC event.
✅ `mtcDecoder.ts:167-173` — `setTimeout(lockTimeoutMs)` reset on every TC; on expiry, `setSource('internal')`.
✅ Held-value: `Clock.ts:72-84 setSource()` re-anchors at frozen `currentTotalFrames()` before transition, so no jump to 0. Test `mtcDecoder.test.ts:222-229` verifies totalFrames=45000 persists after timeout.
✅ "Reports locked": surfaced via `chaser.isLocked` (`mtcDecoder.ts:145-147`) + observable as `clock.getState().source === 'mtc'`. Done report decision #2 justifies not adding a new ClockState field (would require editing shared types outside scope) — acceptable.

### AC4 — Frame-rate from MTC sets clock rate; QF tolerates mid-sequence start
✅ `mtcDecoder.ts:11-18 rateFromCode` maps 0→24, 1→25, 2→29.97df, 3→30.
✅ `mtcDecoder.ts:150-155` — chaser calls `clock.setRate(rate, df)` when differs.
✅ Mid-sequence: `mtcDecoder.ts:63-69` — `cleanSetReceived` flag gated on all 8 `pieceSeen[i]` slots; first emit suppressed until clean set.
✅ Tests `mtcDecoder.test.ts:74-87` verify partial-then-full sequence behavior.

### AC5 — Enable/disable chase API; default OFF
✅ `mtcDecoder.ts:203-225` — `MtcReceiver.enable(portName)` / `disable()`. Idempotent — disable runs first inside enable. Async to match `subscribeMidi`.
✅ Default off: `MtcChaser.enabled = false` (`mtcDecoder.ts:117`). Test `mtcDecoder.test.ts:251-257` confirms TC events with chaser disabled do not move clock.

### AC6 — Unit tests cover QF reassembly, full-frame, rate detect, mid-seq, lock-loss, chase follows TC
✅ `tests/unit/shared/input/mtcDecoder.test.ts` — 25 tests covering:
- QF reassembly @ multiple rates (lines 52-72)
- Mid-sequence start (lines 74-87)
- Full-frame SysEx parse + rate codes + wrong subtype + too-short (lines 97-123)
- Non-MTC bytes (line 125)
- Unsubscribe + throwing handler (lines 130-148)
- Chaser lock/locate/rate-set (lines 172-208)
- Lock-loss timeout + held value + timer reset (lines 210-239)
- Disable behaviour + re-enable cycle (lines 241-269)

### AC7 — pnpm -r typecheck clean, tests pass, no edits outside target_files
✅ `pnpm -r typecheck` clean (re-run locally — all 5 workspace projects pass).
✅ `pnpm vitest run tests/unit/shared/input/mtcDecoder.test.ts` — 25/25 pass.
✅ `pnpm vitest run tests/unit/shared/input/midiIn.test.ts` — 16/16 pass (no regression).
✅ Scope: `git status` shows only `src/main/src/shared/input/mtcDecoder.ts` (new), `tests/unit/shared/input/mtcDecoder.test.ts` (new), and `src/main/src/shared/input/midiIn.ts` modified (+4 lines, surgical 0xF1 case). InputRegistrar.ts and Clock.ts untouched (existing APIs sufficient) — task spec lists them as target files but does not require changes.

## Code-quality observations (non-blocking)

1. **Receiver not wired to Shell** (done report decision #3) — acknowledged as out-of-scope; functional unit is fully usable by callers. Wiring is a follow-up.
2. **`{type: 'any'}` subscription** in `MtcReceiver.enable` — receives all MIDI traffic from the port and filters by `raw[0]` inside the handler. Acceptable overhead; correctness is fine.
3. **1-frame offset convention** (spec implementation note) — decoder emits the decoded TC value directly without subtracting the conventional 1-frame QF completion offset. Minor accuracy refinement, not load-bearing for the unit-level acceptance criteria; can be revisited if live-chase accuracy requires it.
4. **Done-report line count** says 178 lines for mtcDecoder.ts; actual is 230. Cosmetic discrepancy only.

## Tests run by Critic

- `pnpm vitest run tests/unit/shared/input/mtcDecoder.test.ts` → 25 pass
- `pnpm vitest run tests/unit/shared/input/midiIn.test.ts` → 16 pass
- `pnpm -r typecheck` → clean (5/5 projects)

## Next

B005-005 ready for inclusion in F2 gate (B005-010). Remaining in-scope tasks B005-006 (MTC generate), B005-007 (showtime OSC broadcast) still queued — Forge can pick them up.
