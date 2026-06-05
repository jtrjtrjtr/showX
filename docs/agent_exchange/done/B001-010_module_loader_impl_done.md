---
id: "B001-010"
title: "Module loader implementation"
status: "done"
round: 1
forge_model: "claude-sonnet-4-6"
started_at: "2026-06-06T09:05:00Z"
ended_at: "2026-06-06T09:15:00Z"
---

## Files changed

### New files
- `src/main/src/moduleLoader/types.ts` — `ModuleManifestSchema` (Zod), `ModuleManifest`, `ModuleLifecycleState`, `LoadedModule`
- `src/main/src/moduleLoader/discovery.ts` — `discoverModules(modulesRoot, logger)` filesystem scanner
- `src/main/src/moduleLoader/contextFactory.ts` — `SharedServices` interface + `buildContext(slug, manifest, shared, getState, abortController)`
- `src/main/src/moduleLoader/lifecycle.ts` — `LifecycleOrchestrator` with Kahn topo sort, parallel init/start/stop/teardown
- `src/main/src/ModuleLoader.ts` — public `ModuleLoader` class + `SharedServices` + `LoadedModule` re-exports
- `tests/fixtures/stub-module/manifest.json` + `index.ts`
- `tests/fixtures/crashing-module/manifest.json` + `index.ts`
- `tests/fixtures/dep-module/manifest.json` + `index.ts`
- `tests/unit/moduleLoader/discovery.test.ts` — 7 tests
- `tests/unit/moduleLoader/lifecycle.test.ts` — 8 tests
- `tests/unit/moduleLoader.test.ts` — 8 integration tests

### Modified files (minor scope expansion — documented below)
- `src/main/src/shared/PersistedStore.ts` — Changed `import type { Logger } from './Logger.js'` → `from 'showx-shared'`
- `src/main/src/shared/SecretStore.ts` — Same change

## Tests run

```
✓ tests/unit/moduleLoader/lifecycle.test.ts  (8 tests)
✓ tests/unit/moduleLoader/discovery.test.ts  (7 tests)
✓ tests/unit/moduleLoader.test.ts            (8 tests)

Test Files  3 passed (3)
     Tests  23 passed (23)
```

All 201 pre-existing tests also pass (zero regressions).

TypeScript: `pnpm --filter showx-main typecheck` — clean.

## Decisions made within task scope

### SharedServices uses PathLayout (not per-module stores)
The task spec described `shared.persisted.namespace(slug)` and `shared.secrets.namespace(slug)`, but neither `PersistedStore` nor `SecretStore` expose a `namespace()` method — each instance is already slug-bound at construction time. Decision: `SharedServices` exposes `layout: PathLayout`, and `buildContext` creates a fresh `PersistedStore` and `SecretStore` per module using that layout. This is architecturally correct: each module gets its own isolated store. Documented with TODO comment linking to B001-011.

### Logger interface in PersistedStore/SecretStore
These two shared services imported the concrete `Logger` class from `./Logger.js`, making them incompatible with `SharedServices.logger: Logger` (the interface from `showx-shared`). Changed both to import the interface. This is a correctness fix that also makes the services more testable. Affects zero behavior — the concrete `Logger` class satisfies the interface structurally.

### HealthBus not scoped per module
`HealthBus` in `SharedServices` is the global bus. Modules report their own health as `ctx.health.report(ctx.slug, status)`. No scoped wrapper was added (the interface doesn't need one — the slug parameter already provides the namespace). Matches module_loader.md §4.1 behavior.

### SyncBroker not scoped per module
Documents are named explicitly by the module (`openDocument('my-doc-name')`). No scoping mechanism needed; raw SyncBroker is passed through.

### ModuleUIRegistrar: no-op implementation
The UI panel, status badge, and menu item registration (`ui: ModuleUIRegistrar`) is out of scope for this task (Shell IPC is B001-011). A no-op implementation that returns `{ id: 'noop', unsubscribe: () => {} }` is provided.

### Dynamic import via file:// URL
`ModuleLoader.dynamicImport(entryPath)` uses `pathToFileURL(entryPath).href` for ESM-safe absolute path imports. Vitest's module system correctly intercepts these imports for `.ts` fixtures. Comment added explaining the approach.

### Module-level state in fixtures
The stub and dep fixtures export `__calls` as a module-level array (singleton pattern). The integration tests use `vi.resetModules()` in `beforeEach` to clear the module cache between tests, ensuring fresh state per test. This is the idiomatic Vitest approach.

## Gaps flagged for Critic

1. **`depends_on` cross-reference validation** — The spec says `depends_on` entries should reference real discoverable slugs (module_loader.md §2.3). The current `ModuleManifestSchema` only validates that `depends_on` is an array of strings; it does NOT check that each slug exists in the loaded set. Cross-reference validation happens at runtime in `topoLayers()` (missing dep → quarantine). This is consistent with the acceptance criteria but weaker than the full spec. Post-MVP enhancement when a registry singleton is wired.

2. **`min_shell_version` validation** — Not implemented in `ModuleManifestSchema`. The shell version check is deferred per "out of scope" note in the spec. Flagged with a comment.

3. **`userConfig.disabledSlugs` from PersistedStore** — Currently accepted as a constructor parameter to `ModuleLoaderOpts`. Caller is responsible for reading from PersistedStore before calling `discoverAndPrepare()`. Live toggle (enable/disable while running) is OUT of scope per spec. TODO comment added.

4. **Timeout handling** — `init` 10s, `start/stop/teardown` 5s via `Promise.race` + `setTimeout`. Note: in tests with `vi.useFakeTimers()`, timeouts would behave differently. No fake timer usage in current tests; the real timeout is fine for the happy path tests.
