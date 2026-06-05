---
id: "B003-006"
title: "Compound cue model — multi-department payload helpers + invariants"
status: "done"
round: 1
---

## Summary

Implemented compound cue helpers, payload grouping utilities, and defensive invariants across 3 source files and 3 test files. All 31 new tests pass; full cuelist-core test suite (262 tests) passes with no regressions.

## Files changed

### New source files
- `src/modules/cuelist-core/src/cue/invariants.ts` — `InvariantError`, `assertCueInvariants`
- `src/modules/cuelist-core/src/cue/payloadOps.ts` — `payloadsByDepartment`, `addPayloadWithDepartmentTag`, `reorderPayloads`
- `src/modules/cuelist-core/src/cue/compoundCue.ts` — `MakeCompoundCueOpts`, `makeCompoundCue`, `isCompound`, `splitCompoundCue`, `mergeCues`

### New test files
- `tests/unit/modules/cuelist-core/cue/invariants.test.ts` — 7 tests (covers tests 20-24 + 2 extra)
- `tests/unit/modules/cuelist-core/cue/payloadOps.test.ts` — 8 tests (covers tests 12-19)
- `tests/unit/modules/cuelist-core/cue/compoundCue.test.ts` — 16 tests (covers tests 1-11, 25-29)

## Tests run

```
✓ tests/unit/modules/cuelist-core/cue/invariants.test.ts     7 tests
✓ tests/unit/modules/cuelist-core/cue/payloadOps.test.ts     8 tests
✓ tests/unit/modules/cuelist-core/cue/compoundCue.test.ts   16 tests
─────────────────────────────────────────────────────────────
Total new: 31 tests (all pass)

Full suite: 262 tests, 20 files, 0 failures
```

## Decisions within task scope

### D1: Yjs prelim-map guard pattern
`makeCueMap()` returns a prelim Y.Map whose nested Y.Array (`payloads`) is inaccessible via `.get()` until the parent is pushed into a Y.Doc. In `splitCompoundCue` and `mergeCues`, I push the new cueMap to the cues Y.Array **first** (integrating it), then access `cueMap.get('payloads')` for payload insertion. This mirrors the existing `addPayload` pattern in `payload.ts`.

### D2: Sort-key assignment in splitCompoundCue
New cues from a split are spread evenly in the range `[origSk, nextSk)` where `nextSk` is the sort_key of the next sibling in display order (or `origSk + 1000 * N` if no sibling). This keeps all split cues between their predecessor and successor without colliding with other cues.

### D3: Unassigned payloads in splitCompoundCue
Payloads not tagged with a canonical department go to partition[0] (first listed in the partitions argument). This is documented in the function JSDoc.

### D4: Payload id regeneration on split/merge
Split and merge create new payload Y.Maps via `makePayloadMap`, which generates new UUIDs. Original payload ids are NOT preserved — this matches the spec note "payload ids regenerated" in the round-trip test (test 11) and is expected behavior.

### D5: reorderPayloads id preservation
Contrary to split/merge, `reorderPayloads` preserves original payload ids by overriding the id field after `makePayloadMap` generates a new one (`newMap.set('id', originalId)`). The semantics are different: reorder is a position change on existing payloads, not destruction+recreation.

### D6: assertCueInvariants typing
`Cue.payloads` is typed as `Payload[]` (discriminated union with known `PayloadType` values). The forward-compat check uses `p.type as string` to bypass TypeScript's narrow union type and check for `unknown_*` prefixed types at runtime.

## Notes for Critic

1. **Yjs prelim-map pattern**: Verify that `cues.push([cueMap])` inside `doc.transact()` correctly integrates the cueMap and its nested Y.Array, making `cueMap.get('payloads')` accessible within the same transaction. Tests confirm this works with yjs@13.6.31.

2. **splitCompoundCue removes original before push**: The `cues.delete(idx, 1)` call happens before the loop that pushes new cues. New cues are pushed to the END of the Y.Array (not inserted at original raw position). Display order is determined by sort_key, not Y.Array position — `getCuesSorted()` is authoritative for display. Tests 5 and 29 verify the sort order is preserved correctly.

3. **mergeCues sort_key**: Merged cue inherits `firstSk` (sort_key of the first original cue by display order). After all originals are deleted, the new cue is pushed to the end of the Y.Array but appears at the correct display position via sort_key. Test 10 verifies this.

4. **reorderPayloads validation**: Both set-equality AND length equality are checked (`existingIds.size !== newSet.size || newOrder.length !== arr.length`). This catches both duplicate ids in newOrder AND missing/extra ids.

5. **payloadsByDepartment 'unassigned' key**: The key type is `DepartmentTag | 'unassigned'`. The string `'unassigned'` is not a canonical department (not in `CANONICAL_DEPARTMENTS`) so it won't conflict with real dept tags.

6. **TypeScript strict-mode typecheck**: Tests ran through vitest/esbuild (syntax correctness verified). Full `tsc --noEmit` requires shell approval from Critic environment. Key casting points use `as unknown as` double-casts for discriminated union payload types; these are unavoidable given TypeScript's limitations with `Omit<UnionType, 'id'>` in loop bodies.

7. **Door slam fixture**: Tests 25-29 reproduce the data_model.md §4.3 example exactly (dept=['SX','LX'], OSC tagged 'SX', LXRef tagged 'LX'). Integration with B003-005 `visibleCues` + `highlightedPayloads` + `dimmedPayloads` verified in tests 26-29.
