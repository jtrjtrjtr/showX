---
id: "B001-010"
title: "Module loader implementation"
type: "implementation"
estimated_size_lines: 500
priority: "P0"
depends_on: ["B001-002", "B001-003", "B001-004"]
target_files:
  - "src/main/src/ModuleLoader.ts"
  - "src/main/src/moduleLoader/discovery.ts"
  - "src/main/src/moduleLoader/lifecycle.ts"
  - "src/main/src/moduleLoader/contextFactory.ts"
  - "src/main/src/moduleLoader/types.ts"
  - "tests/fixtures/stub-module/index.ts"
  - "tests/fixtures/stub-module/manifest.json"
  - "tests/fixtures/crashing-module/index.ts"
  - "tests/fixtures/crashing-module/manifest.json"
  - "tests/unit/moduleLoader.test.ts"
  - "tests/unit/moduleLoader/lifecycle.test.ts"
  - "tests/unit/moduleLoader/discovery.test.ts"
acceptance_criteria:
  - "ModuleLoader scans src/modules/*/manifest.json + src/modules/*/index.ts at startup"
  - "Manifest validated via Zod schema; invalid manifest → module quarantined + HealthBus error, other modules unaffected"
  - "Module loaded only if tier requirement satisfied (free OR pro depending on install state)"
  - "Module loaded only if user config has not disabled it (per-module enabled flag in PersistedStore)"
  - "Lifecycle order: discovery → manifest validate → init (parallel where no deps) → start (ordered by depends_on) → ... → stop (reverse-order) → teardown (reverse-order)"
  - "Module crash during init/start/stop/teardown is caught; emits HealthBus 'module.<slug>.crashed' event; other modules continue"
  - "ModuleContext built per-module via contextFactory using shared services injected by Shell"
  - "stub-module fixture loads successfully; tests assert init/start/stop/teardown sequence + correct ModuleContext shape"
  - "crashing-module fixture loads but crashes during init; isolation verified"
  - "Vitest tests pass: happy path + tier gate + disabled flag + manifest invalid + dep ordering + crash isolation + double-load idempotency"
---

## Context

ShowX runs all modules in one Electron main process. The ModuleLoader is the orchestrator that discovers modules on disk, validates their manifests, builds per-module ModuleContext objects, and walks each through its lifecycle (init → start → stop → teardown). It also handles failure isolation: a buggy module that throws during init must NOT take down the shell or other modules.

This task implements the loader as a standalone unit, exercised by stub fixtures in `tests/fixtures/`. Real modules (EventX Bridge, Cuelist Core, etc.) come in ShowX-2 and ShowX-3 — they are NOT touched here.

ModuleLoader is invoked by the Shell (B001-011), which provides the shared services (Logger, EventBus, HealthBus, PersistedStore, SecretStore, OutputDispatcher, InputRegistrar, SyncBroker, AssetServer, MdnsService, PairingStore). This task only consumes those services via dependency injection — no Shell wiring here.

## Implementation notes

### Dependencies

`zod` is already in `showx-shared` (added by B001-002 for schema). If not yet present, add to `src/shared/package.json` as `"zod": "^3.22.0"` and re-export.

### `src/main/src/moduleLoader/types.ts`

Re-imports from `showx-shared` the canonical `Module` and `ModuleContext` interfaces (declared in B001-002). Adds loader-internal types:

```ts
import { z } from 'zod';
import type { Module, ModuleContext } from 'showx-shared';

export const ModuleManifestSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  description: z.string(),
  tier: z.enum(['free', 'pro']),
  depends_on: z.array(z.string()).default([]),
  requires: z.object({
    transports: z.array(z.string()).optional(),
  }).optional(),
});
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

export type ModuleLifecycleState =
  | 'discovered' | 'manifest_invalid'
  | 'init_pending' | 'init_running' | 'init_failed' | 'inited'
  | 'start_running' | 'start_failed' | 'started'
  | 'stop_running' | 'stopped'
  | 'teardown_running' | 'torn_down'
  | 'quarantined';

export interface LoadedModule {
  slug: string;
  manifest: ModuleManifest;
  module: Module;
  state: ModuleLifecycleState;
  lastError?: { stage: string; error: Error; at: number };
}
```

### `src/main/src/moduleLoader/discovery.ts`

```ts
export interface DiscoveryResult {
  found: Array<{ slug: string; manifestPath: string; entryPath: string }>;
  errors: Array<{ slug: string; reason: string }>;
}

export async function discoverModules(modulesRoot: string, logger: Logger): Promise<DiscoveryResult>;
```

- Reads `modulesRoot` (default `src/modules/` relative to project root; pass as arg for testability).
- For each subdirectory, looks for `manifest.json` + `index.ts` (or `index.js` post-build). If either missing → record an error, skip.
- Returns `DiscoveryResult` for the caller to feed into the loader.
- Filesystem reads via `node:fs/promises`. No globs; use `readdir({ withFileTypes: true })` for clarity.

### `src/main/src/moduleLoader/contextFactory.ts`

Per-module context that wires shared services + a slug-scoped slice of the PersistedStore/SecretStore namespaces:

```ts
export interface SharedServices {
  logger: Logger;
  events: EventBus;
  health: HealthBus;
  persisted: PersistedStore;
  secrets: SecretStore;
  output: OutputDispatcher;
  input: InputRegistrar;
  sync: SyncBroker;
  assets: AssetServer;
  mdns: MdnsService;
  pairing: PairingStore;
}

export function buildContext(slug: string, manifest: ModuleManifest, shared: SharedServices): ModuleContext {
  return {
    moduleName: manifest.name,
    slug,
    tier: manifest.tier,
    logger: shared.logger.child(slug),
    events: shared.events,
    health: shared.health.scoped(slug),
    persisted: shared.persisted.namespace(`module.${slug}`),
    secrets: shared.secrets.namespace(`module.${slug}`),
    output: shared.output,
    input: shared.input,
    sync: shared.sync.scoped(slug),
    assets: shared.assets,
    mdns: shared.mdns,
    pairing: shared.pairing,
  };
}
```

Slug-scoped accessors (`namespace`, `scoped`, `child`) come from B001-002 / B001-003 / B001-004 service contracts. If a service does NOT yet expose a scoped variant, the loader falls back to the raw service handle + writes a TODO comment with the task ID that should add the scoping. Document any such gaps in the done report.

### `src/main/src/moduleLoader/lifecycle.ts`

Topological lifecycle orchestrator:

```ts
export class LifecycleOrchestrator {
  constructor(private modules: LoadedModule[], private logger: Logger, private health: HealthBus) {}

  /** Init phase: groups modules into dep-layers, runs each layer in parallel. */
  async initAll(): Promise<void> {
    const layers = this.topoLayers(this.modules);
    for (const layer of layers) {
      await Promise.allSettled(layer.map(m => this.initOne(m)));
    }
  }

  /** Start phase: same layer ordering as init. */
  async startAll(): Promise<void> { ... }

  /** Stop phase: reverse layer order. */
  async stopAll(): Promise<void> { ... }

  /** Teardown phase: reverse layer order. */
  async teardownAll(): Promise<void> { ... }

  private async initOne(m: LoadedModule): Promise<void> {
    if (m.state !== 'init_pending') return;
    m.state = 'init_running';
    try {
      await m.module.init(/* context already attached in attachContext step */);
      m.state = 'inited';
    } catch (err) {
      m.state = 'init_failed';
      m.lastError = { stage: 'init', error: err as Error, at: Date.now() };
      this.health.emit({ kind: 'error', source: `module.${m.slug}`, code: 'init_failed', message: (err as Error).message });
      this.logger.error('module.init.failed', { slug: m.slug, err });
    }
  }

  private topoLayers(modules: LoadedModule[]): LoadedModule[][] {
    // Kahn-style: each iteration emits all modules whose unmet deps are 0.
    // Modules with deps on quarantined / init_failed modules are themselves quarantined.
    // Modules with cyclic deps → quarantine the cycle + emit health error.
  }
}
```

Important behavior:
- A module whose dep is `quarantined` / `init_failed` / `manifest_invalid` is itself quarantined (state = `quarantined`), with `lastError = { stage: 'dep_failed', error: new Error('dep <X> not available') }`.
- `start` is NOT attempted for any module not in state `inited`.
- `stop` and `teardown` are best-effort: errors are logged but don't halt subsequent teardowns (we're shutting down anyway).

### `src/main/src/ModuleLoader.ts`

The public API:

```ts
export interface ModuleLoaderOpts {
  modulesRoot: string;             // default 'src/modules'
  shared: SharedServices;
  installedTier: 'free' | 'pro';   // from license/install state
  userConfig: { disabledSlugs: string[] };
}

export class ModuleLoader {
  private loaded: LoadedModule[] = [];
  constructor(private opts: ModuleLoaderOpts) {}

  /** discover + validate + filter by tier + filter by user disable. Does NOT call init yet. */
  async discoverAndPrepare(): Promise<void> {
    const disc = await discoverModules(this.opts.modulesRoot, this.opts.shared.logger);
    for (const entry of disc.found) {
      const manifestRaw = JSON.parse(await fs.readFile(entry.manifestPath, 'utf8'));
      const parsed = ModuleManifestSchema.safeParse(manifestRaw);
      if (!parsed.success) {
        this.opts.shared.health.emit({ kind: 'error', source: `module.${entry.slug}`, code: 'manifest_invalid', message: parsed.error.message });
        continue;
      }
      const manifest = parsed.data;
      if (manifest.tier === 'pro' && this.opts.installedTier === 'free') {
        this.opts.shared.logger.info('module.skipped.tier', { slug: manifest.slug });
        continue;
      }
      if (this.opts.userConfig.disabledSlugs.includes(manifest.slug)) {
        this.opts.shared.logger.info('module.skipped.user_disabled', { slug: manifest.slug });
        continue;
      }
      const mod = await this.dynamicImport(entry.entryPath);
      const context = buildContext(manifest.slug, manifest, this.opts.shared);
      (mod as any).__context = context; // contract: module.init(context) — but contextFactory attaches for callers
      this.loaded.push({ slug: manifest.slug, manifest, module: mod, state: 'init_pending' });
    }
  }

  async initAll(): Promise<void> { /* delegates to LifecycleOrchestrator */ }
  async startAll(): Promise<void> { ... }
  async stopAll(): Promise<void> { ... }
  async teardownAll(): Promise<void> { ... }

  listLoaded(): LoadedModule[] { return [...this.loaded]; }

  private async dynamicImport(entryPath: string): Promise<Module> {
    const mod = await import(pathToFileURL(entryPath).href);
    if (!mod.default || typeof mod.default.init !== 'function') {
      throw new Error(`module ${entryPath} has no valid default export`);
    }
    return mod.default as Module;
  }
}
```

In dev (tsx) the entry is `.ts`. In production (built) it's `.js` under `dist/modules/<slug>/index.js`. Make `entryPath` resolution honor both — check `index.ts` first, fall back to `index.js` if NODE_ENV=production. Document the chosen approach in code comments.

The `context` is passed to `module.init(context)` explicitly — the `__context` attachment shown above is just for `stop()`/`teardown()` to retain access. Cleaner: store `{ module, context }` on `LoadedModule` and call `m.module.init(m.context)` etc. Do that instead.

### Fixtures

`tests/fixtures/stub-module/manifest.json`:
```json
{ "name": "Stub Module", "slug": "stub", "version": "0.0.1", "description": "test fixture", "tier": "free", "depends_on": [] }
```

`tests/fixtures/stub-module/index.ts`:
```ts
import type { Module, ModuleContext } from 'showx-shared';

const calls: string[] = [];
const stub: Module = {
  manifest: { name: 'Stub Module', slug: 'stub', version: '0.0.1', description: 'test', tier: 'free' },
  async init(ctx: ModuleContext) { calls.push(`init:${ctx.slug}`); },
  async start() { calls.push('start'); },
  async stop() { calls.push('stop'); },
  async teardown() { calls.push('teardown'); },
};
export default stub;
export const __calls = calls;          // test inspection hook
```

`tests/fixtures/crashing-module/manifest.json`: same shape, slug `crasher`.

`tests/fixtures/crashing-module/index.ts`:
```ts
const crasher: Module = {
  manifest: { name: 'Crasher', slug: 'crasher', version: '0.0.1', description: '', tier: 'free' },
  async init() { throw new Error('boom'); },
  async start() {}, async stop() {}, async teardown() {},
};
export default crasher;
```

Add a third fixture `tests/fixtures/dep-module/` whose manifest declares `depends_on: ['stub']` — used for dep-ordering tests.

## Refer to specs

- `docs/specs/module_loader.md` — **binding.** Manifest schema, lifecycle order, isolation semantics MUST match. Forge: if implementation conflicts with spec, STOP and flag in done report.
- `docs/specs/data_model.md` — for `PersistedStore.namespace(...)` shape used by contextFactory.

## Test plan

`tests/unit/moduleLoader/discovery.test.ts`
- Point at a temp dir with 3 fake modules → returns all 3.
- One module missing manifest.json → 1 found + 1 error.
- One module missing index.ts → 1 found + 1 error.
- Symlinks / hidden files (`.DS_Store`) → ignored.

`tests/unit/moduleLoader/lifecycle.test.ts`
- 3 modules A, B (deps A), C (deps B): init order layers = [[A], [B], [C]]; start same; stop = [[C], [B], [A]]; teardown same as stop.
- A fails init → B + C quarantined with `dep_failed`.
- Cycle A→B→A → both quarantined with `cycle` reason; health.emit called twice.
- Manual call to initAll twice → second call is a no-op (idempotent).

`tests/unit/moduleLoader.test.ts`
- Use `tests/fixtures/` as `modulesRoot`. Happy path: stub module loads, init/start/stop/teardown called in order, `__calls` reflects sequence.
- crashing-module loaded alongside stub-module → stub still inits, crasher in `init_failed`, HealthBus received `module.crasher.crashed` event.
- Pro module on Free install → skipped at discovery (manifest read but module not pushed to `loaded`).
- User disabled list contains 'stub' → stub skipped.
- Invalid manifest (e.g. missing required field) → quarantined, HealthBus error, sibling stub still loads.
- listLoaded() returns the expected set + states.

Use in-memory test doubles for SharedServices (`makeFakeShared()` helper). PersistedStore can be backed by a temp JSON file under `os.tmpdir()`.

Run: `pnpm --filter showx-main test tests/unit/moduleLoader tests/unit/moduleLoader/`

## Out of scope

- Hot reload of a module while ShowX is running (deferred to ShowX 1.0; see module_architecture doc "open questions")
- Module config UI (Shell-side — B001-011 IPC, polish later)
- Actual modules (eventx-bridge, cuelist-core etc. — ShowX-2+)
- Module sandboxing via worker_threads / VM (single-process trust model for v1)
- Pro tier license validation (mock as `installedTier: 'pro'` for now)
- npm-distributed community modules (1.0+)
- Telemetry hook in context (deferred; SDK churn risk per module_architecture doc)

## Notes for Critic

- Walk the topological sort carefully. Easy bug: emit a layer before all of its members' deps are satisfied. The Kahn algorithm should keep a `Map<slug, unmetDepCount>` and decrement as layers are emitted.
- Confirm `Promise.allSettled` is used at each layer (NOT `Promise.all`) — one module failing must not skip the others in the same layer.
- Verify the stop/teardown ordering is the REVERSE of the init/start layers. Single trick: reverse the array of layers AND reverse the modules within each layer (so the last-started is the first-stopped within a layer too).
- Crash isolation: confirm a thrown error in `init` is caught and the loop keeps going. Common mistake: `await Promise.all(layer.map(m => initOne(m)))` — the first reject rejects the whole array. Use `allSettled`.
- HealthBus contract: every state transition that fails MUST emit. Grep for `state = 'init_failed'` — every line should have a sibling `health.emit` call.
- Confirm `userConfig.disabledSlugs` is read FROM PersistedStore once at discoverAndPrepare time. Live toggling at runtime (enable/disable while running) is OUT of scope — call out in done report if Forge needed to add a TODO.
- Check that the `manifest` declared in the spec (slug regex, semver regex) is enforced. A module with slug `Stub-Module` (capital, hyphen first) MUST fail validation.
