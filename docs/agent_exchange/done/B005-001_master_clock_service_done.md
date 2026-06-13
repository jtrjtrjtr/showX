---
id: "B005-001"
title: "Master clock service (internal)"
status: "done"
round: 2
forge_ended_at: "2026-06-13T18:00:00Z"
---

## Round 2 — addressing Critic review (3 issues)

### Issue A + C (CRITICAL) — setSource drops accumulated free-run / jump-forward on resume

Root cause: `this.source` was mutated before calling `this.currentTotalFrames()`, so the guard
`if (!this.running || this.source !== 'internal') return this.anchor.totalFrames` short-circuited
and returned the stale anchor value (typically 0 after a clean start). Additionally, only the
non-internal transition re-anchored, so returning to 'internal' after chase caused elapsed-during-chase
wall-clock to be retroactively counted as free-run time.

Fix (Clock.ts `setSource`): capture `frozenAt = this.currentTotalFrames()` BEFORE mutating `this.source`,
then re-anchor on every transition when running:

```ts
const frozenAt = this.currentTotalFrames();
this.source = source;
if (this.running) {
  this.anchor = { perfMs: this.nowFn(), totalFrames: frozenAt };
}
```

This single change resolves both Issue A and Issue C.

### Issue B (AC2 violation) — 29.97 free-run using integer-30 instead of 30000/1001

Fix (Clock.ts `currentTotalFrames`): replaced `intFps(this.rate)` with:
```ts
const fps = this.rate === 29.97 ? 30000 / 1001 : this.rate;
```
Also removed the now-unused `intFps` import from Clock.ts.

### Tests updated (Clock.test.ts)

1. Updated existing test "29.97DF increments at integer-30 rate" → renamed + expectation 30 → 29
   (floor(1000 * 30000/1001 / 1000) = 29).

2. Added explicit `expect(frozenFrames).toBe(25)` to the two chase-mode tests that were previously
   asserting `0 === 0` due to Issue A.

3. Added 3 new regression tests:
   - `setSource("mtc") captures accumulated free-run, not 0 (issue A regression)` — 2 s → 50 frames frozen.
   - `setSource("internal") resumes without jump-forward after elapsed chase time (issue C regression)` —
     5 s elapsed during chase does not retroactively count as free-run.
   - `29.97 free-run precision: 1001 ms → 30 frames; 1000 ms → 29 frames (issue B regression)`.

## Files changed

| File | Change |
|---|---|
| `src/main/src/shared/Clock.ts` | setSource re-anchor fix (A+C), 30000/1001 real rate (B), removed unused `intFps` import |
| `tests/unit/shared/Clock.test.ts` | fixed 1 expectation, strengthened 2 chase tests, +3 regression tests |

## Tests run

```
✓ tests/unit/shared/Clock.test.ts  (50 tests) 7ms
Full suite: 1711 tests passed (138 files), 0 failures
Typecheck: pnpm -r typecheck clean across all 5 workspace packages
```

## Acceptance criteria — round 2

- [x] AC1 — anchor-based monotonic clock, no wall-clock Date. Unchanged.
- [x] AC2 — 29.97 uses 30000/1001 for free-run computation. Fixed.
- [x] AC3 — start/stop/locate/setRate/setSource/getState + onChange. Unchanged.
- [x] AC4 — Shell wiring, ModuleContext/SharedServices. Unchanged.
- [x] AC5 — chase mode freezes at correct pre-chase position. Fixed.
- [x] AC6 — tests cover chase capture, resume no-jump, 29.97 precision. Fixed + 3 added.
- [x] AC7 — typecheck clean, 1711/1711 tests.

## Notes for Critic

- `intFps` remains exported from `showx-shared` and is still correct for DF *label* math
  (framesToTc / tcToFrames). It is no longer used in Clock.ts for free-run timing.
- `MasterClock` interface placement in `timecode.ts` unchanged per round 1 non-blocking note.
- All changes localized to 2 files. No architectural decisions made.
