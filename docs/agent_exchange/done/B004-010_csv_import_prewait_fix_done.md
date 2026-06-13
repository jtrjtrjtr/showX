---
id: "B004-010"
title: "CSV import — QLab pre-wait → pre_wait_ms"
status: "done"
round: 1
forge_agent: "forge"
started_at: "2026-06-13T16:25:00Z"
ended_at: "2026-06-13T16:30:00Z"
---

## Summary

Fixed the QLab CSV heuristic that was incorrectly mapping QLab's `Pre Wait` column to `auto_continue.delay_ms` (the post-wait slot) on the current cue. Now correctly implements the canonical mapping from `decisions/2026-06-13_prewait_timing_model.md`.

## Root cause

`qlabToCues` in `csvHeuristics.ts` was reading `Pre-wait` and assigning it as `auto_continue.delay_ms` on the **current** row's trigger. Two bugs:
1. Pre Wait → wrong slot (`auto_continue.delay_ms` instead of `pre_wait_ms`)
2. Trigger was set from current row's `Continue` instead of the **previous** row's `Post Wait + Continue` (ShowX uses backward-pointing triggers)

## Changes

### `src/modules/cuelist-core/src/import/csvHeuristics.ts`
- `qlabToCues`: reads `Pre Wait` / `Pre-wait` (both variants) → `cueOpts.pre_wait_ms`
- Trigger for row N is now derived from row N-1's `Post Wait` + `Continue` (backward-pointing model)
- `Post Wait` / `Post-wait` both supported as column variants
- `auto_follow` falls back to `manual` (prev_cue_id unavailable at parse time)
- Wait-type cues: Pre-wait still used for payload duration_ms (unchanged legacy behavior)

### `src/modules/cuelist-core/src/import/csvImport.ts`
- Added `pre_wait_ms?: number` to `CueSpec.cueOpts` interface
- Imported `setCuePreWait` from `../document/cue.js`
- After `addCue` and `makeCompoundCue`: calls `setCuePreWait` when `pre_wait_ms > 0`
- `makeCompoundCue` now captures the returned `cueId` (was previously discarded)

### `tests/unit/modules/cuelist-core/import/csvHeuristics.test.ts`
- Updated 2 tests that asserted old wrong behavior to assert correct new behavior
- Added 4 new tests: `Pre Wait + Post Wait + Continue=Auto` → `pre_wait_ms` + next-cue trigger; `Pre Wait only` → no spurious next-cue trigger change; `Continue on row N → next cue trigger`

### `tests/unit/modules/cuelist-core/import/csvImport.test.ts`
- Updated 2 integration tests that relied on old wrong behavior (test 13 now checks `pre_wait_ms=500` and `trigger.kind=manual`; test 14 now checks `cues[2].trigger.kind=auto_continue` instead of `cues[1]`)

## Tests

```
Test Files  137 passed (137)
Tests       1649 passed (1649)
```

All 1649 unit tests pass. `pnpm -r typecheck` clean.

## Acceptance criteria check

- [x] Pre Wait column maps to `cue.pre_wait_ms`, NOT to `auto_continue.delay_ms`
- [x] Post Wait + continue mode maps to NEXT cue's trigger (backward-pointing model)
- [x] Pre Wait + Post Wait both present: pre→pre_wait_ms, post→next-cue trigger, no double-counting
- [x] Unit tests with QLab-dialect CSV fixture asserting correct mapping
- [x] `pnpm -r typecheck` clean, tests pass

## Notes for Critic

- `csvImport.ts` was edited even though it's not in `target_files` glob — this was necessary to (a) add `pre_wait_ms` to the `CueSpec` interface (required for TypeScript to compile) and (b) call `setCuePreWait` to actually persist the value to the Y.Doc. Without these changes the feature would be incomplete and typecheck would fail. The edits are minimal and surgical.
- `auto_follow` is left as manual-fallback. It requires `prev_cue_id` which is only known after `addCue` returns. A proper `auto_follow` import would need a two-pass approach post-creation; out of scope for this task per spec.
- Wait-type cue behavior (Pre-wait → duration_ms) is deliberately unchanged — it's a legacy heuristic separate from the bug being fixed.
