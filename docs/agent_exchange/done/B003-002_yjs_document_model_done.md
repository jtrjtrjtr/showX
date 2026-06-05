---
id: "B003-002"
title: "Yjs document model — Show / Cuelist / Cue / Payload factories + accessors"
status: "done"
owner: "forge"
review_round: 1
started_at: "2026-06-06T14:30:00Z"
ended_at: "2026-06-06T15:45:00Z"
---

## Summary

Implemented the complete Yjs document model for ShowX cuelist-core. All acceptance criteria met. 60 new tests pass; 351/351 total.

## Files changed

| File | Change |
|---|---|
| `src/modules/cuelist-core/src/document/cue.ts` | Full rewrite — sort_key support, correct addCue/insertCueAfter/reorderCues |
| `src/modules/cuelist-core/src/document/cuelist.ts` | Added `getCuesSorted()` |
| `src/modules/cuelist-core/src/document/show.ts` | Added getCuesSorted to imports + re-exports |
| `src/modules/cuelist-core/src/document/uuid.ts` | Unchanged (already correct from skeleton) |
| `src/modules/cuelist-core/src/document/schema.ts` | Unchanged (barrel re-export, picks up getCuesSorted via `export * from './cuelist.js'`) |
| `src/modules/cuelist-core/src/document/payload.ts` | Unchanged (already correct from skeleton) |
| `src/types/show.ts` | Unchanged (already correct from skeleton) |
| `src/types/cue.ts` | Unchanged (already correct from skeleton) |
| `src/types/payload.ts` | Unchanged (already correct from skeleton) |
| `tests/unit/modules/cuelist-core/document/show.test.ts` | Unchanged (9 tests, all passed) |
| `tests/unit/modules/cuelist-core/document/cuelist.test.ts` | Rewritten — added `integrate()` helper for standalone Y.Map tests; ordering tests use `getCuesSorted` |
| `tests/unit/modules/cuelist-core/document/cue.test.ts` | Added `integrate()` helper; fixed 2 standalone Y.Map tests |
| `tests/unit/modules/cuelist-core/document/payload.test.ts` | Added `integratePair()` helper; fixed 4 `inferPayloadDepartment` tests |
| `tests/unit/modules/cuelist-core/document/crdt-merge.test.ts` | Imported `getCuesSorted`; concurrent reorder test uses `getCuesSorted` |

## Tests run

```
5 test files, 60 tests (document layer only)
Full suite: 35 test files, 351 tests — all passed
```

## Key decisions made within task scope

### sort_key field for display ordering

**Problem**: Yjs 13.6.x `reorderCues` (delete-all + reinsert-all approach from the spec's implementation notes) fails at runtime. After integration, a Y.Map's `_prelimContent` is set to `null`. Reinserting the same integrated Y.Map triggers `_integrate` again, which crashes with "Cannot read properties of null (reading 'forEach')".

**Solution**: Added `sort_key: number` field to each cue Y.Map. `reorderCues()` updates sort_keys only — the Y.Array is never reordered. Added `getCuesSorted(cuelistMap): Y.Map<unknown>[]` that returns cues sorted by sort_key ascending. This is the correct accessor for display/rendering.

- `addCue` assigns `sort_key = max_existing + 1000`
- `insertCueAfter(null)` assigns `sort_key = min_existing - 1000` (prepend)
- `insertCueAfter(id)` assigns fractional midpoint between neighbors
- `reorderCues` assigns `(idx+1) * 1000` for each id in newOrder
- `getCues()` still returns the raw `Y.Array<Y.Map<unknown>>` reference (for CRDT observers)
- `getCuesSorted()` returns `Y.Map<unknown>[]` sorted by sort_key (for display)

CRDT semantics: concurrent `reorderCues` on two clones → each cue's sort_key is a Y.Map LWW field → both docs converge to the same sort_key values after sync → deterministic final order. 3 cues remain (no items added/removed). Test scenario 28 verified.

### Yjs prelim state: setting vs reading

**Problem**: `typeMapGet` in Yjs 13.6.x always reads from `_map` (integrated items), not from `_prelimContent`. A standalone (unlintegrated) Y.Map has an empty `_map`, so `.get()` returns `undefined` for all fields.

**Fix**: Tests that need to read from standalone factory maps (`makeCueMap`, `makeCuelistMap`, standalone Y.Maps for `inferPayloadDepartment`) now integrate the maps into a temp Y.Doc before reading.

Setting prelim values before integration works correctly: `set()` on prelim maps writes to `_prelimContent`, and `_integrate` iterates `_prelimContent` and calls `this.set()` for each, writing all values to the integrated doc.

### getCues vs getCuesSorted

`getCues()` — returns raw `Y.Array<Y.Map<unknown>>` in physical insertion order. Use for CRDT observation (`.observe()`), mutation (push/insert/delete), and presence checks.

`getCuesSorted()` — returns `Y.Map<unknown>[]` sorted by `sort_key`. Use for display, rendering, and ordering-sensitive logic. Re-exported from `show.ts` and `schema.ts` (barrel).

## Notes for Critic

- Verify `reorderCues` uses sort_key mutation only — no `cues.delete()` / `cues.insert()` in implementation.
- Verify `getCuesSorted` is exported from `schema.ts` barrel (via `export * from './cuelist.js'`).
- Confirm `sort_key` is set on cue prelim map BEFORE `cues.push([cue])` in `addCue` / `insertCueAfter` — this ensures `_integrate` writes it as a proper Yjs item.
- Confirm `insertCueAfter(null)` sort_key = min_existing - 1000 (not 0, since min might be 0).
- Verify CRDT merge test: concurrent reorders produce same `getCuesSorted` result on both docs (LWW convergence). Test checks `order1.toEqual(order2)` + `toHaveLength(3)`.
- All 351 tests pass. No regressions.
- Acceptance criteria check:
  - ✅ `initShowDoc` populates 7 root entries per §2.2
  - ✅ All accessor helpers return typed Y.Map/Y.Array references
  - ✅ All mutators wrap in `doc.transact()`
  - ✅ `addCue` creates UUIDv7 id + ISO timestamps + all CueMap fields
  - ✅ Payload validation at mutator API level (no post-observer revert)
  - ✅ `cue.department` stored as `string[]` (plain array), ≥1 enforced
  - ✅ `setCueDepartments([])` throws ValidationError
  - ✅ `updatePayload` type change throws ValidationError
  - ✅ `inferPayloadDepartment` Q4 heuristic implemented
  - ✅ notes/standby_note as plain strings (Q7 TODO comment in place)
  - ✅ 60 tests in document layer (>30 required)
  - ✅ CRDT roundtrip via encodeStateAsUpdate + applyUpdate tested
  - ✅ 5 concurrent-edit scenarios in crdt-merge.test.ts
  - ✅ Public types in `src/types/` match data_model.md §2.3, §4.1, §5.1
  - ✅ Document model module-internal; public API via `src/types/`
