---
task_id: "B003-006"
round: 2
status: "done"
forge_completed_at: "2026-06-06T20:18:00Z"
---

# B003-006 — Compound cue model: revision round 2

## Round 2 summary

Critic round-1 verdict: `changes_requested` — single issue: `assertCueInvariants` defined and tested but not called by any mutator.

**Fix applied**: wired `assertCueInvariants` into all mutator functions that modify cue structure or payload content.

## Critic round-1 issue addressed

**Issue**: acceptance criterion #8 — "called by mutator API as defensive check" — was not met. Function was defined and exported but `grep -r assertCueInvariants src/` found zero call sites.

**Fix**: Added a private `assertCueMapValid(cueMap)` helper in each file. Wired after every `doc.transact()` in:

- `src/modules/cuelist-core/src/document/cue.ts` — `addCue`, `insertCueAfter`, `setCueDepartments`
- `src/modules/cuelist-core/src/document/payload.ts` — `addPayload`, `removePayload`, `updatePayload`
- `src/modules/cuelist-core/src/cue/compoundCue.ts` — `makeCompoundCue` (explicit lookup post-transact; also transitively covered since it delegates to `addCue`+`addPayload`), `splitCompoundCue` (per new cue via captured `newCueMaps` array), `mergeCues` (on merged cue via `newCueMapRef` closure variable)
- `src/modules/cuelist-core/src/cue/payloadOps.ts` — `reorderPayloads` (`addPayloadWithDepartmentTag` is covered via `addPayload` delegation)

No circular import issues: `invariants.ts` imports only from `showx-shared`.

## Files changed

- `src/modules/cuelist-core/src/document/cue.ts` — add `Cue` type import + `assertCueInvariants` import + `assertCueMapValid` helper; wire into `addCue` / `insertCueAfter` / `setCueDepartments`
- `src/modules/cuelist-core/src/document/payload.ts` — add `Cue` type import + `assertCueInvariants` import + `assertCueMapValid` helper; wire into `addPayload` / `removePayload` / `updatePayload`
- `src/modules/cuelist-core/src/cue/compoundCue.ts` — add `assertCueInvariants` import + `assertCueMapValid` helper; wire into `makeCompoundCue` / `splitCompoundCue` / `mergeCues`; capture `newCueMaps[]` for split, `newCueMapRef` for merge
- `src/modules/cuelist-core/src/cue/payloadOps.ts` — add `assertCueInvariants` import + `assertCueMapValid` helper; wire into `reorderPayloads`
- `tests/unit/modules/cuelist-core/document/cue.test.ts` — add `InvariantError` import; add regression test: `setCueDepartments(['LX', 'LX'])` throws `InvariantError`
- `tests/unit/modules/cuelist-core/document/payload.test.ts` — add `InvariantError` import; add regression test: CRDT-merge duplicate-ID scenario causes next `addPayload` to throw `InvariantError`

## Tests run

```
$ pnpm vitest run tests/unit/modules/cuelist-core
 Test Files  20 passed (20)
      Tests  264 passed (264)
   Duration  1.35s
```

262 original tests + 2 new regression tests. Zero regressions.

## Regression tests added

**Test 1** (`cue.test.ts` — setCueDepartments invariant wiring):
- Calls `setCueDepartments(doc, cuelistId, id, ['LX', 'LX'], 'op1')`
- Expects `InvariantError`
- Before fix: call succeeds silently (no dup-dept check in the mutator itself)
- After fix: `assertCueMapValid` fires after transact → `assertCueInvariants` finds duplicate → throws

**Test 2** (`payload.test.ts` — CRDT duplicate-ID simulation):
- Adds a normal payload via API, then directly injects a Y.Map with the same ID (simulates CRDT merge)
- Next `addPayload` call fires `assertCueMapValid` → detects duplicate ID → throws `InvariantError`

## Decisions made within task scope

- `removePayload` wired for belt-and-suspenders — the cue may already be corrupt before removal.
- `makeCompoundCue` explicit assertion is intentionally redundant (also covered transitively via `addCue`+`addPayload`) but meets Critic's explicit ask to wire all `compoundCue.ts` functions.
- `splitCompoundCue` captures cue maps in `newCueMaps[]` array before the transact closure ends — cleaner than post-transact ID lookup.
- `mergeCues` captures `newCueMapRef` inside the transact closure — mirrors existing `newCueId` pattern.

## Notes for Critic

- Verify `grep -r assertCueInvariants src/` now shows call sites in all 4 files.
- All 10 originally-passing acceptance criteria remain met; round 1 code is unchanged.
- This round addresses criterion #8 only. Round 2 → acceptance expected.
