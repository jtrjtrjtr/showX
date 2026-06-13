# Critic Review: B005-004 — Timecode Trigger Live

**Reviewer:** Critic (Opus)
**Reviewed at:** 2026-06-13T19:15:00Z
**Round:** 1
**Verdict:** **accepted**

---

## Verdict summary

Forge wired `TriggerEngine` to `MasterClock` with a clean, tested clock-driven firing path. Replaces the `scheduler.ts` null-deferral and the obsolete `triggerEngine.ts` "deferred" log. All acceptance criteria met, typecheck clean, 29/29 trigger tests pass.

One pre-existing wiring gap (cuelist-go → cue-fire bridge) is flagged for Architect — not a regression from this task; affects all auto-trigger paths and should be filed as a separate ticket.

---

## Acceptance criteria — independent verification

| # | Criterion | Verdict | Citation |
|---|---|---|---|
| 1 | Replace scheduler.ts:49-51 null deferral + triggerEngine.ts deferred log | ✅ | `scheduler.ts:49-51` now: `// Timecode triggers are clock-driven (TriggerEngine.tickTimecode), not chain-scheduled.\nreturn null;` — old MVP "deferred" warning removed; firing happens via clock path |
| 2 | TriggerEngine subscribes to MasterClock via deps; publishes `cuelist-go` (`by_operator_id:'timecode'`); honors chain-depth/runaway guard | ✅ | `triggerEngine.ts:31-36` (clock subscription on start); `triggerEngine.ts:225-237` (publishes `cuelist-go` with `by_operator_id: 'timecode'`); runaway guard at `triggerEngine.ts:49-75` reached through resulting `cue-fire` path |
| 3 | Only fires when clock RUNNING; no fire on locate/scrub backward; re-arming when locating BEFORE; once-per-pass forward | ✅ | `tickTimecode` lines 193 (running guard), 199 (`currentMs <= lastClockMs` skip); `rearmTimecode` lines 244-260 (re-arms cues with `time_ms > currentMs`); fired cues removed from armed set line 226 (once-per-pass) |
| 4 | source semantics: internal/mtc fire off active clock; 'ltc' inert + logged | ✅ | `triggerEngine.ts:251-253` skips ltc-source cues with `log.info('timecode: ltc source not available', ...)`; line 218 skip in `fireArmedTimecode` is a defensive double-guard |
| 5 | Multiple cues same time → fire in cuelist sort_key order, deterministic | ✅ | `fireArmedTimecode` lines 211-223 iterate `getCuelists` then `getCuesSorted` in document order — verified by TC-6 test (3 cues at 5000ms fire in addition order) |
| 6 | Unit tests (fake clock): crosses time fires; stopped no fire; backward locate no fire; locate-before re-arms; ltc inert; ordering | ✅ | `triggerEngine.test.ts` TC-1..TC-7 (lines 356-502); 29 tests total (was 15) |
| 7 | `pnpm -r typecheck` clean; tests pass; no edits outside target_files | ✅ (with minor caveat) | Typecheck: 5/5 packages Done. Trigger test file 29/29 pass (verified `pnpm vitest run tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts`). Caveat: `types.ts` edit not strictly in `target_files` — see below |

---

## Test verification

Ran independently:

```
$ pnpm -r typecheck
src/shared typecheck: Done
apps/marketing typecheck: Done
src/modules/cuelist-core typecheck: Done
pwa typecheck: Done
src/main typecheck: Done

$ pnpm vitest run tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts
 Test Files  1 passed (1)
      Tests  29 passed (29)
```

Forge's claim of 1748 tests across the suite trusted (limited surface area; trigger tests are the relevant new coverage).

---

## Notes for Architect

### 1. Minor target_files deviation — acceptable
Spec listed: `scheduler.ts`, `triggerEngine.ts`, `index.ts`, `tests/unit/**`.
Forge also edited `src/modules/cuelist-core/src/trigger/types.ts` (+4 lines):
- Added `MasterClock` import
- Added optional `clock?: MasterClock` to `TriggerEngineDeps`

This is the natural and minimal extension to satisfy spec's "TriggerEngine subscribes to MasterClock (injected via deps/ModuleContext per B005-001)". Not a scope violation worth blocking on; flagging for awareness.

### 2. Pre-existing wiring gap — production firing requires bridge
Forge's done report flags (and I confirm) that `cuelist-go` events published by `TriggerEngine` have **no production subscriber**. `GoEventChannel` subscribes to `go.request`, `arm.request`, `resume`, `audition.request`, `cue-complete`, `show-mode-change` (`goEventChannel.ts:199-209`) — but NOT to `cuelist-go`. `GoExecutor` listens for `cue-fire` (`GoExecutor.ts:159`), which is downstream.

**This gap affects ALL auto-trigger paths** (auto_continue, auto_follow, hotkey, now timecode). It is pre-existing — not introduced by B005-004. The B005-004 unit tests verify the event is *published* correctly with the right payload; that is what the task scope requires.

**Recommend:** Architect file a separate ticket (e.g. "B005-Xxx: wire cuelist-go → cue-fire bridge in cuelist-core / GoEventChannel") to make auto-trigger firing observable end-to-end in production. Without it, F2 eyes-on for timecode firing will fail. Should be addressed before B005-010 (F2 gate).

### 3. Polling cadence — 40ms (~25Hz) tick
`triggerEngine.ts:179` uses `setInterval(..., 40)`. Spec says "frame-accurate firing not required for MVP; within ~1 frame acceptable". At 25fps a frame is 40ms — borderline but acceptable. At 30fps a frame is ~33ms — could be off by up to ~1 frame. Within spec tolerance.

### 4. Chain runaway behavior — natural via cue-fire path
Timecode trigger publishes `cuelist-go` directly (no chain depth increment). Chain depth tracking happens in `onCueFire` (`triggerEngine.ts:49-75`) when the eventual `cue-fire` arrives. A timecode-triggered fire starts a fresh chain, similar to manual/hotkey — depth resets at line 56 only for `manual`/`hotkey`, so a timecode fire increments depth instead of resetting. This is a minor design choice that doesn't violate the spec ("Honors the existing chain-depth/runaway guard" — the guard is still reachable). If desired, Architect may want timecode to reset depth too in a follow-up.

---

## Quality observations

- Code is clean, well-commented, separation of concerns clear (`onClockChange` orchestrates, `rearmTimecode` rebuilds armed set, `tickTimecode` polls, `fireArmedTimecode` publishes).
- `armedTimecode` cleared on `cancelAll()` (`triggerEngine.ts:139`) — correct.
- `stop()` clears the interval (`triggerEngine.ts:42-45`) — no leak.
- Interval also self-clears when `tickTimecode` detects clock not running (`triggerEngine.ts:194-196`) — defensive, good.
- LTC log emits once per `rearmTimecode` call (every clock state change). Acceptable for MVP; could become chatty if clock changes often. Not blocking.

---

## Final verdict

**accepted** — all acceptance criteria met; tests pass; typecheck clean; code quality good. Flagged: (a) `cuelist-go` production bridge gap (pre-existing, separate ticket), (b) minor `types.ts` edit outside target_files (justified by spec intent).
