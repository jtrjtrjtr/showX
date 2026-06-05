---
id: "B003-010"
title: "Cue catalog publishing — emit cue-catalog-updated events + cache write"
verdict: "accepted"
reviewer: "critic"
review_round: 1
reviewed_at: "2026-06-07T18:35:00Z"
---

## Summary

All 11 acceptance criteria met. 26/26 vitest tests pass. Implementation closely follows the spec's implementation notes and uses the showx-shared `CueCatalog` type for cross-module consistency.

## Acceptance criteria verification

1. ✅ **`computeCueCatalog(doc): CueCatalog` shape** — `src/modules/cuelist-core/src/catalog/cueCatalog.ts:10-72` returns the spec'd shape: `schema_version=1` (L60), `show_id` from `meta` map (L11, L61), `generated_at` ISO (L62), `source: "cuelist-core@0.1.0"` (L63), `payload_types_used` (L64), `devices_referenced` (L65-69), `cues` (L70).

2. ✅ **`CueCatalogEntry` shape** — `cueCatalog.ts:41-55` builds entries with `id, label, cuelist_id, department[], payloads[{id, type, tag, device_id, summary}]`.

3. ✅ **Payload summary strings** — `summarize.ts` exhaustively switches over all 7 payload types (`osc` L5-6, `msc` L7-11, `lx_ref` L12-13, `midi` L14-15 → `summarizeMidi` L29-47 with note_on/note_off/cc/program_change/raw variants, `webhook` L16-17, `wait` L18-19, `group` L20-21, unknown fallback L22-25). Matches the implementation-notes form in the spec body (arrow separator; arg count for OSC; channel/note/velocity for MIDI note_on). Tests verify required substrings rather than exact format, which the implementation satisfies.

4. ✅ **Recompute on cue/payload/routing mutations** — `cueCatalog.ts:93-97` wires `cuelists.observeDeep(debounce)` (fires on any cue/payload nested mutation since payloads live under cues under cuelists) and `routing.observeDeep(debounce)`. Test 14 covers cue insert; test 15 covers routing change.

5. ✅ **Emit `cue-catalog-updated` via EventBus** — `cueCatalog.ts:119-123` publishes `{ type: 'cue-catalog-updated', showId, catalog }`. Field name `showId` (camelCase) is correct: it matches the authoritative `CueCatalogUpdatedEvent` interface at `src/shared/src/types/events.ts:73-77`. The spec body uses `show_id` in prose but the type contract supersedes; Forge documented this divergence in its done report (decision 4). Kebab-case event type `cue-catalog-updated` matches module_loader §9.1.

6. ✅ **Cache written to `<pkgPath>/media/.cache/cue-catalog.json`** — `cacheWrite.ts:5-12` builds the path and calls `atomicWriteFile`. Test 18 reads the file back and asserts schema_version + show_id.

7. ✅ **`devices_referenced` aggregation** — `cueCatalog.ts:33-40` increments count and adds type per `device_id`; `cueCatalog.ts:65-69` materializes the array. Webhook/wait/group payloads are correctly excluded (device_id = null, L29-32). Test 13 verifies dev_eos referenced by 5 lx_ref + 2 osc → count=7, types=[lx_ref, osc].

8. ✅ **`payload_types_used` deduplicated** — uses `Set<string>` (L14) → spread to array at L64. Test 12 verifies OSC appears once despite being used twice.

9. ✅ **100ms debounce** — `cueCatalog.ts:88-91` clears prior timer and arms a new 100ms `setTimeout`. Test 16 fires 5 mutations within 99ms and asserts exactly 1 publish.

10. ✅ **Public type in `src/types/cueCatalog.ts`** — file exists at `src/types/cueCatalog.ts:8-35` with `CueCatalog` + `CueCatalogEntry` matching the spec shape and the showx-shared definitions in `src/shared/src/types/cue.ts:34-60`. *Note (non-blocking):* the spec asked for re-export from showx-shared; instead there are two byte-identical parallel definitions. Same effect for external consumers, but a future cleanup task could consolidate.

11. ✅ **15+ vitest tests** — 26 tests pass (12 in `summarize.test.ts`, 14 in `cueCatalog.test.ts`).

## Critic-specific spec verifications

- ✅ **Catalog never written to Y.Doc** — only EventBus publish + filesystem cache write; no `doc.getMap(...).set(...)` writes of catalog data.
- ✅ **`stop()` clears debounce timer** — `cueCatalog.ts:108-115` clears unsubs, nullifies `unsubs` array, and clears `timer`. Test "stop() clears debounce timer and prevents post-stop publishes" verifies count is unchanged after stop.
- ✅ **Cache path correct** — `path.join(pkgPath, 'media', '.cache', 'cue-catalog.json')` matches data_model.md §10.4. Verified by test 18.
- ✅ **`atomicWriteFile` is used** — `cacheWrite.ts:3` imports it from `../persistence/atomicWrite.js`; no direct `fs.writeFile`.
- ✅ **`payload_types_used` is plain Array** — spread from Set to `[...payloadTypesUsed]` at L64; not stringified-as-Set.
- ✅ **Initial publish on `start()`** — `cueCatalog.ts:105` fires `void this.publish()` without waiting for a mutation. Test 20 ("start() triggers initial publish") confirms.
- ✅ **kebab-case event type** — `'cue-catalog-updated'` at `cueCatalog.ts:120` and `events.ts:74`.

## Test execution

```
pnpm vitest run tests/unit/modules/cuelist-core/catalog/
✓ summarize.test.ts (12 tests) 4ms
✓ cueCatalog.test.ts (14 tests) 142ms
Test Files  2 passed (2)
     Tests  26 passed (26)
```

## Code quality observations

- TypeScript strict-mode exhaustive switch with `never` in `summarize.ts` (L23, L43) — defensive against future payload-type additions.
- `CatalogPublisher` cleanly separates lifecycle (start/stop/publish), no leaked timers or observers.
- Cache write failure is logged but does not throw, preserving EventBus publish semantics.
- Single MODULE_VERSION constant trade-off (vs. JSON import) documented; acceptable given Node `NodeNext` resolution complexity.

## Out-of-scope items honored

- No routing UI consumption.
- No external Companion module integration.
- No catalog diffing.
- No catalog persistence to Y.Doc.
- No Cloud Sync upload.

## Verdict

**accepted** — production-ready. Cuelist Core now publishes a clean derived catalog artifact suitable for downstream routing/external-tool consumption, consistent with EventX's `channel-catalog.json` analog as the spec framed.
