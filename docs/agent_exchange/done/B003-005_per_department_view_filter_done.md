---
id: "B003-005"
title: "Per-department view filter logic + actionable/highlighted computation"
status: done
round: 2
forge_session: "2026-06-06"
---

## Round 2 — Critic fix applied

**Critic finding:** Round 1 left `src/shared/src/types/show.ts` broken — it imports `DepartmentTag` from `./cue.js` but `cue.ts` no longer exported it after the department.ts refactor. This caused `TS2459` on `pnpm -r typecheck` (src/shared workspace).

**Fix applied (Option A per Critic recommendation):**
- `src/shared/src/types/cue.ts` — added `export type { DepartmentTag } from './department.js';`
- `src/types/cue.ts` — same re-export added

Both files now import _and_ re-export `DepartmentTag` from `department.js`, preserving both import paths.

**Verification:**
- `pnpm -r typecheck` → `src/shared typecheck: Done` ✓ (no more TS2459)
- Remaining cuelist-core errors are pre-existing B003-024 scope (TS6133/TS6196/TS2307 + migrations rootDir)
- `pnpm vitest run tests/unit/modules/cuelist-core/views/` → 54/54 pass ✓

## Summary

Implemented the view-filtering brain for multi-operator UI: pure filter functions, memoized for referential equality, and a reactive Y.Doc subscription helper. 54 tests across 3 test files, all passing.

## Files changed

### New files
- `src/shared/src/types/department.ts` — canonical `CANONICAL_DEPARTMENTS` const tuple, `CanonicalDepartmentTag`, `DepartmentTag = CanonicalDepartmentTag | (string & {})`, `isCanonicalDepartment()`
- `src/types/department.ts` — standalone parallel (acceptance criterion target file)
- `src/modules/cuelist-core/src/views/departmentFilter.ts` — `visibleCues`, `isActionable`, `isContextOnly`, `subscribeFilteredCuelist`, `computeHighlightedPayloads` (with WeakMap memoization)
- `src/modules/cuelist-core/src/views/highlights.ts` — `highlightedPayloads`, `dimmedPayloads`
- `src/modules/cuelist-core/src/views/viewProfiles.ts` — `viewProfiles` object (all named profiles) + `profileForRole`
- `tests/unit/modules/cuelist-core/views/departmentFilter.test.ts` — 25 tests
- `tests/unit/modules/cuelist-core/views/highlights.test.ts` — 9 tests
- `tests/unit/modules/cuelist-core/views/viewProfiles.test.ts` — 20 tests

### Modified files
- `src/shared/src/types/cue.ts` — removed inline `CANONICAL_DEPARTMENTS`/`DepartmentTag`, imports `DepartmentTag` from `./department.js`
- `src/shared/src/index.ts` — added `export * from './types/department.js'`
- `src/types/cue.ts` — same as shared/types/cue.ts change

## Architecture decisions

**Import strategy:** Views import from `showx-shared` (not relative `../../../../types/`). The spec's sample code used relative paths but the cuelist-core tsconfig has `rootDir: src` which would cause "file outside rootDir" errors. Using `showx-shared` is consistent with all other cuelist-core module code and compiles cleanly.

**Department type placement:** `CANONICAL_DEPARTMENTS` + `DepartmentTag` moved from `src/shared/src/types/cue.ts` into `src/shared/src/types/department.ts` (and parallel `src/types/department.ts`). The shared index re-exports both. No breaking change — consumers that previously imported `DepartmentTag` from `showx-shared` still work.

**DepartmentTag broadening:** Extended from union-of-8 to `CanonicalDepartmentTag | (string & {})`. This is backward-compatible: canonical values still satisfy the extended type. `isCanonicalDepartment()` now provides the narrowing guard where needed.

**Memoization:** WeakMap keyed on cue array reference (for `visibleCues`) and on `Cue` object reference (for `computeHighlightedPayloads`). Inner Map keyed on sorted stringified context. Same array + same ctx → referentially equal result. No periodic eviction needed at MVP scale.

**Highlight logic location:** `computeHighlightedPayloads` lives in `departmentFilter.ts` (where the WeakMap cache lives) and is re-exported from `highlights.ts` as `highlightedPayloads`. This avoids circular deps and keeps caching centralized.

**subscribeFilteredCuelist behavior:** Handler fires on every Y.Array structural change, including additions of cues outside the filter lens (added array will be empty). This is documented in the JSDoc comment. Tests verify this.

## Tests run output

```
Tests  54 passed (54)
Test Files  3 passed (3)
```

Full suite: 448 tests, 41 files, all passing. No regressions from shared types change.

## Notes for Critic

- Verify `visibleCues` is pure (no Y.Doc reads inside) — ✓ takes `readonly Cue[]` and `FilterContext`
- Check filter algorithm: `cue.department.some(d => lens.has(d))` where `lens = owned ∪ watched` — matches §6.3
- Verify SM profile: `owned=['SM']`, `watched=allOthers(['SM'])` (7 items) → SM sees all 8 departments via union
- Verify compound cue visibility: test "compound cue dept=[LX,SX,VIDEO] visible in LX, SX, and VIDEO operator views" passes ✓
- Check `subscribeFilteredCuelist` uses `observeDeep` (not just `observe`) — ✓ catches nested map changes (cue field edits)
- Verify memoization: WeakMap on array ref — confirmed by referential equality tests ✓
- `viewProfiles` returns new objects each call (no singleton mutation) — confirmed by mutation test ✓
- `CANONICAL_DEPARTMENTS` order matches protocol_dictionary.md §A.5: LX, SX, VIDEO, AUTO, PYRO, FS, SM, OTHER ✓
