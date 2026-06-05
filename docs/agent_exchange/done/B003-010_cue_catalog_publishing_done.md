---
id: "B003-010"
title: "Cue catalog publishing — emit cue-catalog-updated events + cache write"
status: "done"
review_round: 1
ended_at: "2026-06-07T18:22:00Z"
---

## Summary

Implemented the full cue catalog publishing pipeline: `computeCueCatalog`, `summarizePayload`, `writeCatalogCache`, and `CatalogPublisher` with 100ms debounce.

## Files changed

| File | Action |
|------|--------|
| `src/types/cueCatalog.ts` | New — `CueCatalog` + `CueCatalogEntry` public types (matching spec, mirrors shared) |
| `src/modules/cuelist-core/src/catalog/summarize.ts` | New — `summarizePayload` exhaustive switch over all 7 payload types |
| `src/modules/cuelist-core/src/catalog/cacheWrite.ts` | New — `writeCatalogCache` (mkdir + atomicWriteFile) |
| `src/modules/cuelist-core/src/catalog/cueCatalog.ts` | New — `computeCueCatalog` + `CatalogPublisher` class |
| `tests/unit/modules/cuelist-core/catalog/summarize.test.ts` | New — 12 tests covering all payload type summaries + unknown fallback |
| `tests/unit/modules/cuelist-core/catalog/cueCatalog.test.ts` | New — 14 tests covering catalog shape, device aggregation, debounce, cache write |

## Tests run

```
✓ tests/unit/modules/cuelist-core/catalog/summarize.test.ts  (12 tests)
✓ tests/unit/modules/cuelist-core/catalog/cueCatalog.test.ts  (14 tests)

26 tests passed | Full suite: 825/825 passed, 0 failed
```

## Acceptance criteria checklist

- [x] `computeCueCatalog(doc): CueCatalog` — schema_version=1, show_id, generated_at ISO, source `cuelist-core@0.1.0`, payload_types_used, devices_referenced, cues array
- [x] Each `CueCatalogEntry` carries id, label, cuelist_id, department[], payloads[] with type-specific summary string
- [x] All 7 payload summary formats implemented (OSC, LXRef, MSC, MIDI variants, Webhook, Wait, Group)
- [x] Catalog recomputed on cuelists + routing `observeDeep` observer — wired in `CatalogPublisher.start()`
- [x] Emits `cue-catalog-updated` via `ctx.events.publish` with `showId` + `catalog` fields (matches `CueCatalogUpdatedEvent` interface)
- [x] Cache written to `<pkgPath>/media/.cache/cue-catalog.json` using `atomicWriteFile`
- [x] `devices_referenced` aggregated: count + types per device_id (null for webhook/wait/group)
- [x] `payload_types_used` deduplicated Set converted to array
- [x] 100ms debounce: multiple rapid mutations → single emit (test 16)
- [x] `CueCatalog` in `src/types/cueCatalog.ts`; types from `showx-shared` used throughout module code
- [x] 26 vitest tests (≥15 required) covering all AC areas

## Decisions made within task scope

1. **Version constant instead of JSON import**: Used `const MODULE_VERSION = '0.1.0'` to avoid `assert { type: 'json' }` incompatibility between `NodeNext` module resolution (tsc) and vitest/esbuild. The catalog `source` field reads `cuelist-core@0.1.0`.

2. **`start()` is synchronous, initial publish via `void this.publish()`**: The spec didn't specify `async start()`. Initial publish fires on next microtask. Tests use `await vi.runAllTimersAsync()` + `await Promise.resolve()` to settle.

3. **Tests 18-19 use `vi.useRealTimers()` for filesystem settlement**: Fake timers are released briefly to allow the actual `fs.readFile` assertion to settle after the async cache write completes.

4. **`CueCatalogUpdatedEvent` field name**: Spec notes used `show_id` (snake_case), but the TypeScript interface in `events.ts` uses `showId` (camelCase). Implemented as `showId` to match the actual type.

## Notes for Critic

- Verify catalog is NEVER written to Y.Doc — it is derived; only EventBus events + cache file.
- Verify `stop()` clears the debounce timer (test "stop() clears debounce timer" covers this).
- Verify cache path is `<pkgPath>/media/.cache/cue-catalog.json` (test 18 covers this with real fs).
- Verify `atomicWriteFile` is used (no direct `fs.writeFile` in `cacheWrite.ts`).
- Verify `payload_types_used` is a plain Array, not a Set (JSON.stringify would produce `{}` for Set).
- Verify initial publish fires on `start()` without requiring a Y.Doc mutation.
- Verify `cue-catalog-updated` event type is kebab-case (matches `CueCatalogUpdatedEvent.type`).
- `src/types/cueCatalog.ts` defines standalone types (follows existing `src/types/` pattern); shared package already has identical types in `src/shared/src/types/cue.ts` — no duplication issue.
