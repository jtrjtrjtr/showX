---
id: "B003-017"
title: "CSV import — QLab / Eos / generic cue list ingestion"
status: "done"
round: 2
forge_ended_at: "2026-06-08T20:10:00Z"
---

## Summary (Round 2 — revision)

Addressed all Critic findings from round 1 review. One required bug fix + two non-blocking notes folded in.

## Changes in round 2

### Bug fix (required)
- **`src/modules/cuelist-core/src/import/csvImport.ts:189`** — renamed `skipped++` → `innerSkipped++`. The variable `skipped` was never declared; the branch was dead code (all three heuristics always produce a non-empty `department` array), so tests passed and runtime never hit the error. Fixed anyway — the guard is useful as a defensive assertion if heuristics evolve.

### Non-blocking notes folded in
- **`csvHeuristics.ts:76`** — added `.trim()` to QLab `standby_note: notes.trim()` to align with Eos (line 116) and Generic (line 154) trim behaviour.
- **`csvImport.ts:5,9`** — removed duplicate `import { removeCue } from '../document/cue.js'` on line 9; merged into the existing `import { addCue } from '../document/cue.js'` as `import { addCue, removeCue }`.

## Files changed

### Modified (round 2 only)
- `src/modules/cuelist-core/src/import/csvImport.ts` — fix undefined `skipped` ref + consolidate duplicate import
- `src/modules/cuelist-core/src/import/csvHeuristics.ts` — trim QLab standby_note

### New files (from round 1, unchanged)
- `src/modules/cuelist-core/src/import/csvDialects.ts`
- `src/modules/cuelist-core/src/import/csvHeuristics.ts`
- `src/modules/cuelist-core/src/import/csvImport.ts`
- `src/modules/cuelist-core/src/import/index.ts`
- `tests/unit/modules/cuelist-core/import/csvDialects.test.ts`
- `tests/unit/modules/cuelist-core/import/csvHeuristics.test.ts`
- `tests/unit/modules/cuelist-core/import/csvImport.test.ts`
- `tests/fixtures/csv/qlab_export_minimal.csv`
- `tests/fixtures/csv/eos_export_minimal.csv`
- `tests/fixtures/csv/generic_cuelist.csv`
- `tests/fixtures/csv/qlab_export_compound.csv`

## Tests run

```
 ✓ tests/unit/modules/cuelist-core/import/csvDialects.test.ts   (7 tests)
 ✓ tests/unit/modules/cuelist-core/import/csvHeuristics.test.ts (16 tests)
 ✓ tests/unit/modules/cuelist-core/import/csvImport.test.ts     (21 tests)
 Test Files  3 passed (3)
       Tests 44 passed (44)
```

## Decisions made within task scope

All round-1 decisions stand. See round-1 report for rationale. No new architectural decisions in round 2.

## Notes for Critic

- Required fix: `innerSkipped++` now references the declared variable. Branch remains as defensive guard (option A per Critic's recommendation).
- Non-blocking: QLab `standby_note` is now trimmed consistently with the other two heuristics.
- Non-blocking: duplicate `removeCue` import consolidated.
- 44/44 tests pass, no regressions.
