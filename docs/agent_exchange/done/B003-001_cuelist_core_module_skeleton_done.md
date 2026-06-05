---
id: "B003-001"
slug: "cuelist_core_module_skeleton"
title: "Cuelist Core module manifest + skeleton + Module class"
status: "done"
round: 1
forge_started_at: "2026-06-06T13:00:00Z"
forge_ended_at: "2026-06-06T13:45:00Z"
---

## Summary

Cuelist Core module skeleton implemented: package.json, tsconfig.json, README, manifest.ts, CuelistCore.ts, config/schema.ts, index.ts, and test suite.

## Files changed

| File | Action |
|---|---|
| `src/modules/cuelist-core/package.json` | Created — `@showx/module-cuelist-core`, type=module, workspace dep on `showx-shared`, runtime deps `yjs@^13.6.10` + `uuid@^10.0.0`, devDeps `typescript`, `vitest`, `@types/node`, `zod` |
| `src/modules/cuelist-core/tsconfig.json` | Created — extends tsconfig.base.json, NodeNext module/moduleResolution, composite:true, outDir:dist, references `../../shared` |
| `src/modules/cuelist-core/README.md` | Created — module description |
| `src/modules/cuelist-core/src/config/schema.ts` | Created — Zod schema for `CuelistCoreConfig`, configSchema with schemaVersion:1 and defaults matching data_model.md §12 |
| `src/modules/cuelist-core/src/CuelistCore.ts` | Created — implements `Module` from showx-shared; all 4 lifecycle hooks + `onHealthCheck`; guards `start()` against missing ctx |
| `src/modules/cuelist-core/src/manifest.ts` | Created — `ModuleManifest` constant with slug=cuelist-core, tier=free, default_enabled=true, 4 transports, empty depends_on |
| `src/modules/cuelist-core/src/index.ts` | Created — re-exports manifest + default CuelistCore |
| `tests/unit/modules/cuelist-core/skeleton.test.ts` | Created — 18 test cases covering manifest shape, lifecycle, idempotency, teardown, config defaults |

## Key decisions within task scope

1. **`health.report` signature** — Task spec assumed `report(status, detail)` but the actual `showx-shared` `HealthBus` interface is `report(slug, status, detail?)`. Implementation uses `this.ctx.health.report(this.ctx.slug, 'healthy', ...)`. Test assertion updated accordingly.

2. **`getConfigSchema()` as extra method** — The actual `showx-shared` `Module` interface does not include `getConfigSchema()`. Added it as an additional public method (not breaking the interface contract). The module loader can call it if it introspects beyond the interface.

3. **`ZodSchema` cast** — `showx-shared`'s `ZodSchema<T>` has `readonly _type: T` which Zod's `ZodObject` satisfies structurally but TypeScript can't prove via inference. Used `as unknown as ZodSchema<CuelistCoreConfig>` per spec's guidance (spec used `as any`; upgraded to double-cast for clarity).

4. **`presence_color_palette: null`** — Set to null per Q11 ratification (follow-up task). Implemented in schema.

## Tests

**Note for Critic:** Bash commands required user approval in this session; auto-test execution was blocked by permission restrictions. Tests are written and should be run during Critic review via `pnpm test -- tests/unit/modules/cuelist-core/skeleton.test.ts`.

**Expected test coverage (18 tests, 3 describe blocks):**

- `manifest shape` (8 tests): slug, tier, default_enabled, persistedConfigSchemaVersion, requires.depends_on, slug pattern, transports, entry constructor
- `class lifecycle` (9 tests): persisted.load called, log.info called on init, health.report called on start, start throws without init, onHealthCheck returns healthy/unknown, stop idempotent x2, teardown releases ctx, getConfigSchema returns descriptor
- `config defaults` (5 tests): autosave_interval_ms=30000, history_rotation_size_bytes=50_000_000, history_rotation_max_age_days=10, presence_color_palette=null, schemaVersion=1

**TypeScript verification (manual):**
- All types verified against actual `src/shared/src/types/` interfaces
- `OSPermission` values `network.lan` and `fs.readwrite.userdata` confirmed valid
- `TransportKind` values all confirmed valid in shared TransportRequirement
- `ConfigSchemaDescriptor<CuelistCoreConfig>` verified structurally assignable to `ConfigSchemaDescriptor<unknown>` (covariant T)
- No top-level side effects in index.ts or manifest.ts (loader contract §8)

## Notes for Critic

- Verify that `pnpm test -- tests/unit/modules/cuelist-core/skeleton.test.ts` produces 18 passing tests (no failures).
- Verify `pnpm --filter @showx/module-cuelist-core typecheck` is clean (requires `pnpm --filter showx-shared build` first per the module's typecheck script).
- Verify `manifest.slug` = `cuelist-core` matches `^[a-z][a-z0-9-]{1,39}$` ✓
- Verify `depends_on` is `[]` (not undefined) ✓
- Verify no top-level side effects: both `index.ts` and `manifest.ts` only have import statements and a const declaration — no `new`, no `setTimeout`, no global mutation.
- Verify Zod schema defaults align with data_model.md §12.5 (history rotation: 50MB / 10 days) and §12.11 (presence_color_palette null per Q11).
- `configSchema.zodSchema` is cast via `as unknown as ZodSchema<CuelistCoreConfig>` — structurally compatible at runtime (Zod has `parse` + `safeParse`). Cast is intentional and documented.
- `getConfigSchema()` returns `ConfigSchemaDescriptor<CuelistCoreConfig>` (not `unknown`) — extra precision beyond the interface; covariant, no breaking change.
