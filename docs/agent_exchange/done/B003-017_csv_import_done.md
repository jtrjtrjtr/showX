---
id: "B003-017"
title: "CSV import — QLab / Eos / generic cue list ingestion"
status: "done"
round: 1
forge_ended_at: "2026-06-07T22:55:00Z"
---

## Summary

Implemented CSV import subsystem for ShowX cuelist-core: auto-dialect detection (QLab / Eos / Generic), heuristic row-to-cue conversion, compound cue merging, and a pure-TS RFC-4180 CSV parser.

## Files changed

### New files
- `src/modules/cuelist-core/src/import/csvDialects.ts` — `detectDialect()` with QLab > Eos > generic priority
- `src/modules/cuelist-core/src/import/csvHeuristics.ts` — `qlabToCues()`, `eosToCues()`, `genericToCues()`
- `src/modules/cuelist-core/src/import/csvImport.ts` — `importCsv()` entry, `parseCsvWithHeader()`, `mergeByCueLabel()`, `CsvImportOpts/Result/Warning` types
- `src/modules/cuelist-core/src/import/index.ts` — barrel exports
- `tests/unit/modules/cuelist-core/import/csvDialects.test.ts` — 7 tests
- `tests/unit/modules/cuelist-core/import/csvHeuristics.test.ts` — 16 tests
- `tests/unit/modules/cuelist-core/import/csvImport.test.ts` — 21 tests
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

Full suite: 94 test files, 942 tests — all passed, no regressions.
```

## Decisions made within task scope

1. **Pure-TS CSV parser instead of csv-parse library**: `csv-parse` is not in the cuelist-core package dependencies and adding it would require modifying `package.json` (outside target_files). The spec explicitly allows "pure-TS lightweight parser". Implemented RFC-4180 parser handling quoted fields with embedded commas.

2. **pre-wait + Continue interaction**: When a QLab row has both `Continue=Auto-continue` and `Pre-wait > 0`, the pre-wait value is used as `delay_ms` (not 0). This matches task spec test 13 expectation and is semantically correct — Continue means "fire automatically" and pre-wait is the delay before doing so.

3. **Heuristic-skip accounting**: Rows silently dropped by heuristics (e.g. invalid Eos cue numbers) are counted in `result.skipped` via `heuristicSkips = records.length - rawSpecs.length`, separate from inner-loop insertion errors. This ensures `added + skipped` always equals `records.length` when no merging occurs.

4. **auto_follow not used**: The `Trigger` type supports `auto_follow` with `prev_cue_id`, but that requires knowing the previous cue's runtime ID at import time — not possible. Used `auto_continue` for both "Continue" and "pre-wait > 0" cases, which is safe and semantically close.

5. **Compound cue via makeCompoundCue for dept.length ≥ 2**: Single-dept cues use `addCue` + `addPayload`. Multi-dept cues use `makeCompoundCue`. No outer `doc.transact()` wrapper — existing functions handle their own transactions (Yjs nested transactions merge correctly).

## Notes for Critic

- Verify CSV parser handles `"LX,VIDEO"` quoted field correctly (fixture `generic_cuelist.csv` row 3 tests this via the Q3 compound test).
- Confirm validation errors per row don't abort the whole import (test: Eos malformed cue number produces 1 warning + 1 skipped, other cues still imported).
- QLab dialect detection: the `pre-wait` column presence gates QLab detection even when a `Number` column also exists, preventing false-positive on generic sheets.
- `mergeDuplicates` is opt-in (default false) — without it, 2 rows with same label create 2 separate cues.
- The `clearFirst` path uses the existing `removeCue()` mutator (which calls `assertEditAllowed`) — correct for rehearsal mode.
- All 44 new tests pass; full 942-test suite clean.
- TypeScript: cuelist-core module typecheck passes cleanly (no errors from new import files). Pre-existing PWA typecheck errors from B003-016 are unchanged.
