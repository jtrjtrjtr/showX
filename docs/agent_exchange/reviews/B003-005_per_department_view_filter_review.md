---
id: "B003-005"
critic_started_at: "2026-06-06T14:45:00Z"
critic_completed_at: "2026-06-06T14:55:00Z"
verdict: "accepted"
review_round: 2
prior_verdict: "changes_requested (round 1)"
---

## Summary

Round 2 addresses the single round-1 blocker (TS2459 in `src/shared` workspace: `show.ts` imported `DepartmentTag` from `./cue.js` but `cue.ts` no longer exported it after the department.ts refactor). Forge applied Option A as recommended — added `export type { DepartmentTag } from './department.js';` to both `src/shared/src/types/cue.ts:6` and `src/types/cue.ts:7`. The two-line, non-invasive fix preserves the historic import path while keeping the new department.ts module as the canonical source. Typecheck for `src/shared` now exits 0; 54/54 cuelist-core view tests still pass. Task accepted.

## Round-2 diff inspection

Two files modified, one line each:

```diff
# src/shared/src/types/cue.ts:6
  import type { DepartmentTag } from './department.js';
+ export type { DepartmentTag } from './department.js';
```

```diff
# src/types/cue.ts:7
  import type { DepartmentTag } from './department.js';
+ export type { DepartmentTag } from './department.js';
```

No behaviour change. No other files modified. Inspection of the in-scope implementation (filter logic, highlights, view profiles, memoization, reactive subscription) carries forward unchanged from round 1.

## Verification commands run

| Command | Result |
|---|---|
| `pnpm --filter showx-shared typecheck` | exit 0 — `src/shared typecheck: Done` (round-1 TS2459 blocker resolved) |
| `pnpm vitest run tests/unit/modules/cuelist-core/views/` | 3 files, 54 tests passed |
| `pnpm -r typecheck` | `src/shared`, `apps/marketing`, `pwa` all green; `src/main` builds the shared package and completes; `src/modules/cuelist-core` still fails on **pre-existing** errors (TS6133/TS6196/TS2307/TS6307 in `CuelistCore.ts`, `document/cue.ts`, `document/payload.ts`, `document/uuid.ts`, `persistence/projections.ts`, `persistence/showxPackage.ts`) — these are the B003-024 cleanup scope, explicitly out of B003-005. No new regressions introduced. |

## Acceptance criteria (re-verification — all green from round 1, unchanged in round 2)

- [x] `visibleCues(cues, ctx)` filters `cue.department ∩ (owned ∪ watched) ≠ ∅` → `src/modules/cuelist-core/src/views/departmentFilter.ts:37-52`
- [x] `isActionable(cue, owned)` → `departmentFilter.ts:55-58`
- [x] `highlightedPayloads(cue, owned)` per §6.3 + Q4 → `departmentFilter.ts:129-157` + re-export `highlights.ts:9-14`
- [x] Multi-department ownership (solo) → `viewProfiles.ts:24`
- [x] Compound cue visibility across views → `departmentFilter.test.ts:114-124`
- [x] All ten view profile shortcuts present → `viewProfiles.ts:14-25`; SM watched = 7 others
- [x] Pure functions (no Y.Doc reads inside filter helpers) → confirmed by signatures
- [x] `subscribeFilteredCuelist` with `observeDeep`, diff hints `{full, added, removed, changed}` → `departmentFilter.ts:75-114`
- [x] Memoization (referential equality) → `departmentFilter.ts:37-52` + tests pass
- [x] `CANONICAL_DEPARTMENTS` order matches protocol_dictionary.md §A.5 → `department.ts:4-6`
- [x] Custom dept strings handled opaquely → `departmentFilter.test.ts:126-132`
- [x] 30+ vitest tests → 54 tests across 3 files

## Re-export pattern verification

`src/shared/src/types/show.ts:4` still imports `DepartmentTag` from `./cue.js`. With the round-2 re-export in `cue.ts:6`, this resolves correctly. Future consumers can import `DepartmentTag` from either `cue.js` (historical path) or `department.js` (canonical). The choice is idempotent — no breakage path remains.

The parallel `src/types/cue.ts` ↔ `src/types/show.ts:6` pair is fixed identically. That workspace currently has no tsconfig run in `pnpm -r typecheck` (the `src/types/` tree is consumed by `src/main` via path mapping), so the fix is preventative there but still correct and consistent with `src/shared`.

## Out-of-scope failures noted (carry-forward to B003-024)

The following `src/modules/cuelist-core` typecheck errors are **pre-existing** and explicitly the scope of `B003-024` per the cleanup spec — NOT introduced by B003-005:

- `src/CuelistCore.ts:6:11` TS6133 unused `config` (B003-001 origin)
- `src/document/cue.ts:5:27` TS6133 unused `getPayloads` (B003-002 origin)
- `src/document/payload.ts:2:24` TS6196 unused `PayloadType` (B003-002 origin)
- `src/document/uuid.ts:2:34` TS2307 missing `uuid` types (B003-002 origin)
- `src/persistence/projections.ts:141` TS6133 unused `a`,`b` destructure (B003-003 origin)
- `src/persistence/showxPackage.ts:7,14` TS6133 unused + TS6059/TS6307 `migrations/` outside `rootDir` (B003-003 origin)

Verified by file path — none of these touch `src/modules/cuelist-core/src/views/*` or the files Forge changed in B003-005 round 2. Round-1 review confirmed the same exclusion. B003-024 is queued and will clear these in a dedicated pass.

## Verdict rationale

`accepted` — round-1 issue was a one-line cross-workspace type-export omission; round 2 fixed it precisely via Option A with the matching change in the parallel `src/types/cue.ts`. The fix preserves both import paths permanently, eliminating the regression class. Typecheck clean for `src/shared`. All 54 in-scope vitest tests pass. No scope expansion. No new regressions. In-scope acceptance criteria all verified in round 1 and unchanged in round 2.

Task is ready to accept and the spec moves to `done/`.
