---
id: "B003-017"
title: "CSV import — QLab / Eos / generic cue list ingestion"
verdict: "accepted"
review_round: 2
reviewed_at: "2026-06-08T20:30:00Z"
reviewer: "critic"
---

## Summary (Round 2)

All three round-1 items folded in cleanly. The required bug (undefined `skipped` ref) is fixed; the two non-blocking nits (QLab trim, duplicate import) are folded into the same edit as recommended. 44/44 tests still green, no regressions. Accepted.

## Verification of round-1 findings

### Required bug fix — RESOLVED

**`src/modules/cuelist-core/src/import/csvImport.ts:188`** — `skipped++` renamed to `innerSkipped++` (option A — the recommended fix). The declared `innerSkipped` variable (`csvImport.ts:182`) is now correctly referenced. The defensive guard (`if (dept.length === 0)`) is preserved as a future-proofing measure if heuristics evolve to emit empty department arrays.

Confirmed via:
- `Read` of `csvImport.ts:181-190` shows `let innerSkipped = 0;` and `innerSkipped++;` in the `dept.length === 0` branch.
- `git diff HEAD` shows the single-line rename `-        skipped++;` → `+        innerSkipped++;`.
- Catch branch also uses `innerSkipped++` (`csvImport.ts:222`).
- Return statement `skipped: heuristicSkips + innerSkipped` (`csvImport.ts:226`) sums correctly.

### Non-blocking nits — RESOLVED

**`csvHeuristics.ts:76`** — QLab `standby_note: notes.trim()` now aligns with Eos (`csvHeuristics.ts:116`) and Generic (`csvHeuristics.ts:154`). Verified via `Read csvHeuristics.ts:65-83` and `git diff`.

**`csvImport.ts:5`** — duplicate `import { removeCue } from '../document/cue.js'` removed; consolidated into `import { addCue, removeCue } from '../document/cue.js'`. Verified via `Read csvImport.ts:1-10` and `git diff`.

## Acceptance criteria — re-check

All 13 criteria from round 1 remain satisfied (no behavioural changes from round 2 edits). Round-2 edits are surgical:
- One-line variable rename (dead-code branch preserved, not removed).
- One-line trim addition in QLab heuristic.
- Import statement consolidation.

No test changes were needed — the dead-code branch remains untested (heuristics never emit empty depts), which is the same state as round 1. The fix is defensive only.

## Tests run

```
✓ tests/unit/modules/cuelist-core/import/csvDialects.test.ts   (7 tests)  2ms
✓ tests/unit/modules/cuelist-core/import/csvHeuristics.test.ts (16 tests) 4ms
✓ tests/unit/modules/cuelist-core/import/csvImport.test.ts     (21 tests) 15ms
Test Files  3 passed (3)
     Tests  44 passed (44)
Duration    472ms
```

Verified by running `pnpm vitest run tests/unit/modules/cuelist-core/import` from project root.

## Carry-forward notes (not blockers for B003-017)

1. **Workspace typecheck hygiene** — round-1 review noted that `pnpm --filter cuelist-core build && tsc --noEmit` did not flag the undefined-variable reference. That remains true and is a separate workspace issue worth a follow-up (potentially via B003-024 or an Architect spawn). Out of scope for this task.
2. **OSC/Network → tag inference** — round-1 aspirational note; the spec language was suggestive and the codepath is not exercised by fixtures. Acceptable for MVP, follow-up if needed.

## Verdict

**accepted** — round-1 findings fully addressed, tests green, no regressions, code quality good. CSV import ready for downstream consumption (PWA file picker wiring follow-up).
