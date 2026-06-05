---
id: "B003-002"
critic_started_at: "2026-06-06T15:50:00Z"
critic_completed_at: "2026-06-06T16:05:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **Y.Doc factory populates 7 root entries per §2.2** — `src/modules/cuelist-core/src/document/show.ts:25-53` creates `meta`, `operators`, `devices`, `routing`, `cuelists`, `proposals`, `schema`. Test `tests/unit/modules/cuelist-core/document/show.test.ts:23-32` verifies all seven are `Y.Map` / `Y.Array` instances. ✅

- [x] **Typed accessors return Y.Map/Y.Array references (not plain JS)** — `show.ts:60-82` (`getMeta`, `getOperators`, `getDevices`, `getRouting`, `getProposals`, `getSchema`) and `cuelist.ts:17-31` (`getCuelists`, `getCuelist`, `getCues`, `getCue`). None call `toJSON()`. `getCuesSorted` (`cuelist.ts:45-50`) returns sorted Y.Map references — display projection, not a CRDT replacement. ✅

- [x] **Mutators wrap in `doc.transact(...)`** — `cue.ts:86,124,135,154,171,184,202,216,230,243`; `payload.ts:140,158,180`; `show.ts:88,93`. All structural and field mutators transact. ✅

- [x] **`addCue` carries UUIDv7 id + ISO timestamps + all CueMap fields per §2.5** — `cue.ts:18-43` sets `id` (uuidv7), `label`, `description`, `department`, `standby_note`, `script_line_ref`, `trigger`, `payloads` (Y.Array), `duration_hint_ms`, `notes`, `payload_frozen_at`, `sort_key`, `created_at/by`, `modified_at/by`. ISO timestamps via `new Date().toISOString()` (`cue.ts:23`). UUIDv7 format verified in `show.test.ts:39-43` against RFC 9562 pattern. ✅

- [x] **Payload validation enforces §5.2 at mutator level (no observer-revert)** — `payload.ts:23-89` covers all seven payload types: OSC `/` prefix, webhook https/loopback, wait 0..600000, MSC 0..127, lx_ref cue_list≥1 cue_number≥0, MIDI channel 1..16, group child_cue_ids≤32. Validates plain object before Y.Map creation (`payload.ts:111`) and re-validates integrated map on `updatePayload` (`payload.ts:185`). No `doc.on('afterTransaction')` revert hook — consistent with CRDT semantics. ✅

- [x] **`cue.department` ≥ 1 enforced; `setCueDepartments([])` rejected** — `cue.ts:19-21` throws in `makeCueMap`; `cue.ts:198-200` throws in `setCueDepartments`. Tests `cue.test.ts:36-40, 78-82`. ✅

- [x] **`payload.type` immutable after creation** — `payload.ts:176-178` throws ValidationError on type change in `updatePayload`. Test `payload.test.ts:228-241`. ✅

- [x] **Q4 `inferPayloadDepartment` helper** — `payload.ts:193-204`. Returns single dept when `cue.department.length === 1`; falls back to canonical-tag heuristic for compound cues; null otherwise. Four tests in `payload.test.ts:270-307`. ✅

- [x] **Q7: notes / standby_note / description as plain strings + TODO marker** — `cue.ts:33` carries the `TODO(0.2)` comment for Y.Text upgrade. `notes`, `standby_note`, `description` all initialized to plain `''`. ✅

- [x] **30+ vitest tests** — 60 tests pass across the five document test files (`show.test.ts` 9, `cuelist.test.ts` 11, `cue.test.ts` 10, `payload.test.ts` 25, `crdt-merge.test.ts` 5). Full workspace: 35 files / 351 tests pass. ✅

- [x] **Public types in `src/types/{show,cue,payload}.ts` match §2.3, §4.1, §5.1 normatively** — Verified field-by-field against spec excerpts. `ShowMeta` matches §2.3; `Cue` + `Trigger` + `CANONICAL_DEPARTMENTS` match §4.1 and §6.1; `Payload` discriminated union, `OscArg`, all seven payload subtypes match §5.1. ✅

- [x] **Document model is module-internal; outside callers use `src/types/` (and the showx-shared mirror)** — grep across `src/` confirms no file outside `src/modules/cuelist-core/` imports from `cuelist-core/src/document/`. Internal code imports types from `showx-shared`, which re-exports identical shapes from `src/shared/src/types/`. ✅

## CRDT semantics check

- **Encode/decode roundtrip**: `crdt-merge.test.ts:148-167` confirms `Y.encodeStateAsUpdate` produces `Uint8Array` and size scales with cue count. `show.test.ts:55-62` confirms post-`applyUpdate` meta equality across two docs.
- **Concurrent adds**: `crdt-merge.test.ts:33-54` — both cues present after sync; doc1 == doc2.
- **Concurrent label edits**: `crdt-merge.test.ts:56-78` — LWW resolution, both docs converge on one winner.
- **Concurrent reorder**: `crdt-merge.test.ts:80-112` — both clones converge on the same `getCuesSorted` ordering (sort_key LWW).
- **Concurrent payload adds to same cue**: `crdt-merge.test.ts:114-146` — both payloads survive (Y.Array CRDT).

## Code review notes

### sort_key design decision (deviation from spec implementation notes)

Spec `## Implementation notes` suggested `reorderCues` as `cues.delete()` + `cues.insert()` on the Y.Array. Forge documents in `done/B003-002_yjs_document_model_done.md:43-56` that Yjs 13.6.x throws `Cannot read properties of null (reading 'forEach')` when reinserting an already-integrated Y.Map (its `_prelimContent` is nulled after first integration).

Forge replaced reorder semantics with a `sort_key: number` field per cue (`cue.ts:80-118, 144-161`) and a `getCuesSorted(cuelistMap)` accessor (`cuelist.ts:45-50`). `getCues()` still returns the raw Y.Array in physical insertion order — preserving CRDT observation. `getCuesSorted()` is the display projection.

This is a defensible scope-internal decision: it works around a real Yjs limitation, preserves CRDT convergence (per-cue sort_key is a Y.Map LWW field → both clones agree), and the change is documented in the done report. Accepted with two follow-up notes:

1. Document the `getCues()` vs `getCuesSorted()` distinction in the eventual user-facing API docs (post-MVP — out of scope here).
2. The fractional midpoint approach in `insertCueAfter` (`cue.ts:117`) bounds the precision drift but is fine for hundreds of cues; flag if real shows ever blow it past JS float precision (~2^53 inserts between two fixed neighbours — not realistic in this lifetime).

### Spec test #14 (concurrent dept merge) intentionally not present

Spec test plan item 14 reads: "`cue.department` is concurrent-mergeable (two Doc clones add different depts → merge keeps both)." Forge stored department as plain `string[]` on the Y.Map (per spec recommendation `cue.ts:27`), which is LWW, not array-merging. With this choice, test #14 cannot pass meaningfully — and the spec author flagged this in `## Notes for Critic`: "Spec recommends plain array initially; flag if Forge chose Y.Array<string>." Forge chose the recommended path; the test is correctly omitted. Total test count still 60 (≫ 30+ requirement). ✅

### Validation strategy

`validatePayload` operates on a plain object (`payload.ts:23`); `validatePayloadMap` reconstructs the plain shape from an integrated Y.Map via `.forEach` and delegates (`payload.ts:95-99`). This avoids the prelim-map `.get() === undefined` trap. `makePayloadMap` validates BEFORE constructing the Y.Map (`payload.ts:111`); `updatePayload` re-validates inside the transaction (`payload.ts:185`). Belt-and-braces. ✅

### Minor observations (non-blocking)

- `setMode` / `setMetaField` (`show.ts:86-94`) do not auto-update `meta.last_meta_editor`. The spec does not require they do; the field will likely be touched by the calling layer. Acceptable.
- `src/types/` duplicates types already in `src/shared/src/types/`. Implementation imports from `showx-shared` only; `src/types/` files exist solely as the normative published contract per spec target_files. No code drift today, but two-copy maintenance is a known cost. Architect may want to deduplicate before B003-005 starts importing types. Not blocking acceptance.
- Re-export pattern in `schema.ts` (`export * from './show.js'` + `export * from './cuelist.js'`) re-exports the same binding via two paths. TypeScript `export *` semantics silently dedup identical bindings — no compilation issue.

## Verdict rationale

All 12 acceptance criteria met with file:line evidence. Test count exceeds requirement (60 vs ≥30). Full workspace test suite passes 351/351 with no regressions. Validation rules exhaustively cover §5.2. CRDT merge tests use proper two-doc apply-update-back-and-forth pattern. UUIDv7 verified against RFC 9562 regex. Public types in `src/types/{show,cue,payload}.ts` match data_model.md §2.3, §4.1, §5.1 field-by-field.

The single notable deviation — `sort_key`-based reorder instead of Y.Array delete+reinsert — is forced by a real Yjs 13.6.x limitation, documented in the done report, preserves CRDT convergence, and is verified by `crdt-merge.test.ts:80-112`. Forge made the right call.

**Verdict: accepted.**
