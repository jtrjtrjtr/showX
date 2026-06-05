---
task_id: "B003-006"
reviewer: "critic"
round: 2
verdict: "accepted"
reviewed_at: "2026-06-06T20:30:00Z"
---

## Summary

Round-1 blocker (criterion #8 — `assertCueInvariants` wired into mutator API) is resolved. All 11 acceptance criteria now met. 264 tests pass (262 previous + 2 new regression tests). No regressions in B003-001..005 suites. Verdict: **accepted**.

## Round-1 issue: resolved

**Original issue**: `assertCueInvariants` defined and tested but no call sites in `src/` — defensive-check wiring asked for by criterion #8 and spec §"Invariants" was absent.

**Resolution verified**: `grep -rn assertCueInvariants src/` now reports 8 call sites across 4 mutator files:

```
src/modules/cuelist-core/src/cue/invariants.ts:23       (declaration)
src/modules/cuelist-core/src/cue/compoundCue.ts:10,13   (import + helper)
src/modules/cuelist-core/src/cue/payloadOps.ts:7,10     (import + helper)
src/modules/cuelist-core/src/document/cue.ts:7,77       (import + helper)
src/modules/cuelist-core/src/document/payload.ts:6,104  (import + helper)
```

Each file has a private `assertCueMapValid(cueMap)` helper that calls `assertCueInvariants(cueMap.toJSON() as Cue)`, invoked after every `doc.transact()` block in cue-mutating functions.

### Wired mutators (verified by reading)

| File | Mutator | Line | Notes |
|---|---|---|---|
| `document/cue.ts` | `addCue` | 94 | `assertCueMapValid(cue)` after `doc.transact(...)` |
| `document/cue.ts` | `insertCueAfter` | 134 | same |
| `document/cue.ts` | `setCueDepartments` | 220 | same — catches duplicate-dept after CRDT merge |
| `document/payload.ts` | `addPayload` | 148 | catches pre-existing dup-id state |
| `document/payload.ts` | `removePayload` | 168 | belt-and-suspenders per done report — acceptable |
| `document/payload.ts` | `updatePayload` | 198 | catches type-violation post-update |
| `cue/compoundCue.ts` | `makeCompoundCue` | 60 | explicit post-transact lookup (transitively also covered via addCue/addPayload) |
| `cue/compoundCue.ts` | `splitCompoundCue` | 153-155 | iterates `newCueMaps[]` after transact |
| `cue/compoundCue.ts` | `mergeCues` | 235 | uses `newCueMapRef` closure variable |
| `cue/payloadOps.ts` | `reorderPayloads` | 112 | same |

### Regression tests verified

**`tests/unit/modules/cuelist-core/document/cue.test.ts:94-98`** — `setCueDepartments(doc, cuelistId, id, ['LX', 'LX'], 'op1')` throws `InvariantError`. Without the wiring this call would silently succeed (the mutator's own length check passes; only the invariants find the duplicate). ✅ Test passes; reverting the wiring would fail it.

**`tests/unit/modules/cuelist-core/document/payload.test.ts:264-290`** — Injects a duplicate-id Y.Map directly into the payloads Y.Array (simulating CRDT merge), then verifies the next `addPayload` throws `InvariantError` via `assertCueMapValid`. ✅ Test passes.

## Acceptance criteria — final verification

| # | Criterion | Verdict |
|---|---|---|
| 1 | `makeCompoundCue` ≥2 dept guard + for_department→tag | ✅ |
| 2 | `isCompound(cue)` returns `dept.length > 1` | ✅ |
| 3 | `payloadsByDepartment` heuristic grouping | ✅ |
| 4 | `addPayloadWithDepartmentTag` canonical-only | ✅ |
| 5 | `reorderPayloads` CRDT-safe + exact-set validation | ✅ |
| 6 | `splitCompoundCue` removes original + distributes payloads | ✅ |
| 7 | `mergeCues` concat label/depts/payloads, min-sk position | ✅ |
| 8 | `assertCueInvariants` defined AND called by mutator API | ✅ (wired in round 2) |
| 9 | Door slam fixture per data_model.md §4.3 | ✅ |
| 10 | JSDoc references B003-009, B003-013, B003-014 | ✅ |
| 11 | 20+ vitest tests covering full surface | ✅ (33 in B003-006, 264 total) |

## Test run

```
$ pnpm vitest run tests/unit/modules/cuelist-core
 Test Files  20 passed (20)
      Tests  264 passed (264)
   Duration  1.47s
```

Per-file new counts in B003-006 scope:
- `invariants.test.ts` — 7 tests
- `payloadOps.test.ts` — 8 tests
- `compoundCue.test.ts` — 16 tests
- `cue.test.ts` — +1 regression (12 total in file)
- `payload.test.ts` — +1 regression (25 total in file)

## Code quality

- Wiring pattern is consistent across all 4 files (private `assertCueMapValid` helper). Clean.
- No circular imports introduced — `invariants.ts` only depends on `showx-shared` types.
- Performance: `assertCueInvariants` runs a single linear pass over `cue.payloads` after each transact. Negligible cost; the CRDT merge serialization (`cueMap.toJSON()`) is the dominant operation, and these are not hot-path operations.
- `removePayload` invariant wiring (extra, per Forge's note) is defensible — if the cue was already invalid before removal, surfacing that is correct behaviour.
- `makeCompoundCue` explicit `assertCueMapValid` after the per-payload loop is reasonable; transitive coverage via `addCue`+`addPayload` would already catch any individual issue, but the explicit check also validates the final combined state.

## Minor (informational, no fix required)

- `compoundCue.ts:5-6` still imports from `'../document/cue.js'` in two separate statements (cosmetic — already noted in round 1 as non-blocking).
- `unused _id` destructuring warnings would be tidier with `void _id;` but `_` prefix is acceptable.

## Verdict rationale

Single round-1 blocker fully resolved with surgical fix (helper function pattern, ~40 LOC across 4 files, 2 regression tests). All 11 acceptance criteria met. Tests green. Code quality consistent with prior round. No new issues surfaced.

Round 2 → `accepted`. Task complete.
