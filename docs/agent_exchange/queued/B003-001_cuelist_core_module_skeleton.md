---
id: "B003-001"
title: "Cuelist Core module manifest + skeleton + Module class"
type: "implementation"
estimated_size_lines: 300
priority: "P0"
depends_on: []
target_files:
  - "src/modules/cuelist-core/package.json"
  - "src/modules/cuelist-core/tsconfig.json"
  - "src/modules/cuelist-core/README.md"
  - "src/modules/cuelist-core/src/index.ts"
  - "src/modules/cuelist-core/src/manifest.ts"
  - "src/modules/cuelist-core/src/CuelistCore.ts"
  - "src/modules/cuelist-core/src/config/schema.ts"
  - "tests/unit/modules/cuelist-core/skeleton.test.ts"
acceptance_criteria:
  - "`src/modules/cuelist-core/package.json` declares `@showx/module-cuelist-core`, type=module, workspace dep on `showx-shared`, runtime deps `yjs@^13.6.x`, `uuid@^10` (for UUIDv7), and devDeps `typescript`, `vitest`, `@types/node`, `zod`"
  - "`src/modules/cuelist-core/tsconfig.json` extends `../../../tsconfig.base.json` with `composite: true`, `outDir: dist`, references `../../shared`"
  - "`src/modules/cuelist-core/src/index.ts` exports `manifest: ModuleManifest` constant and `default class CuelistCore`"
  - "`manifest.slug === 'cuelist-core'`, `manifest.tier === 'free'`, `default_enabled === true`, `persistedConfigSchemaVersion === 1`"
  - "`manifest.requires.transports` includes `osc-out`, `midi-out`, `msc-out`, `webhook-out` (cuelist publishes semantic events; dispatcher resolves)"
  - "`manifest.requires.depends_on === []` — Cuelist Core is foundational, no module dependencies"
  - "`CuelistCore implements Module` from `src/types/module.ts` — `init`, `start`, `stop`, `teardown`, `getConfigSchema`, optional `onHealthCheck`"
  - "Each lifecycle hook idempotent and respects `ctx.abortSignal` — `stop()` aborts any in-flight async work"
  - "`config/schema.ts` exports `ConfigSchemaDescriptor<CuelistCoreConfig>` with Zod schema for `{ autosave_interval_ms, history_rotation_size_bytes, history_rotation_max_age_days, presence_color_palette }`; defaults match data_model.md §12 recommendations (30000, 50_000_000, 10, palette TBD by future task)"
  - "Smoke test: instantiate module with a mock ModuleContext (use `tests/helpers/mock_context.ts` from ShowX-1), call `init` → `start` → `stop` → `teardown`; assert state transitions; assert HealthBus reports 'healthy' after start"
  - "All TypeScript compiles with strict mode (`pnpm --filter @showx/module-cuelist-core typecheck` clean)"
---

## Context

The Cuelist Core module is the centerpiece of ShowX as a product — everything in ShowX-3 builds on top of it. This task establishes the scaffolding: a module that loads, registers, runs lifecycle, and exposes config — but does NOT yet implement the show document model (B003-002), persistence (B003-003), or any UI (B003-011+).

This is intentionally a **thin** task. Forge sets up the file tree, manifest, and class skeleton; downstream tasks fill in behavior. Pattern mirrors B002-002 (`eventx-bridge` module skeleton). Keep the surface small so reviews are fast and follow-up specs can extend cleanly.

## Implementation notes

### Manifest shape

```ts
// src/modules/cuelist-core/src/manifest.ts
import type { ModuleManifest } from 'showx-shared';
import { CuelistCore } from './CuelistCore';

export const manifest: ModuleManifest = {
  slug: 'cuelist-core',
  name: 'Cuelist Core',
  version: '0.1.0',
  description: 'Multi-operator FOH cuelist with per-department views and REHEARSAL mode.',
  tier: 'free',
  requires: {
    transports: [
      { kind: 'osc-out' },
      { kind: 'midi-out' },
      { kind: 'msc-out' },
      { kind: 'webhook-out' },
    ],
    permissions: ['network.lan', 'fs.readwrite.userdata'],
    depends_on: [],
    min_shell_version: '0.1.0',
  },
  default_enabled: true,
  persistedConfigSchemaVersion: 1,
  entry: CuelistCore,
  // uiPanel registered in B003-011; statusBadge optional, deferred
};
```

`src/index.ts` re-exports `manifest` (loader convention) and the default `CuelistCore` class.

### Module class skeleton

```ts
// src/modules/cuelist-core/src/CuelistCore.ts
import type { Module, ModuleContext, ConfigSchemaDescriptor, HealthStatus } from 'showx-shared';
import { configSchema, type CuelistCoreConfig } from './config/schema';

export class CuelistCore implements Module {
  private ctx?: ModuleContext;
  private config?: CuelistCoreConfig;
  private state: 'idle' | 'inited' | 'started' | 'stopped' = 'idle';

  async init(context: ModuleContext): Promise<void> {
    this.ctx = context;
    this.config = await context.persisted.load(configSchema);
    context.log.info('cuelist-core init complete');
    this.state = 'inited';
  }

  async start(): Promise<void> {
    if (!this.ctx) throw new Error('init() must precede start()');
    // Future: open Y.Doc broker, register IPC handlers, mount asset routes (B003-002+).
    this.ctx.health.report('healthy', 'cuelist-core started');
    this.ctx.log.info('cuelist-core started');
    this.state = 'started';
  }

  async stop(): Promise<void> {
    // Future: close Y.Doc, flush autosave, drain dispatch queue.
    this.ctx?.log.info('cuelist-core stopping');
    this.state = 'stopped';
  }

  async teardown(): Promise<void> {
    this.ctx = undefined;
    this.config = undefined;
  }

  getConfigSchema(): ConfigSchemaDescriptor<CuelistCoreConfig> {
    return configSchema;
  }

  onHealthCheck(): HealthStatus {
    return this.state === 'started' ? 'healthy' : 'unknown';
  }
}
```

### Config schema

```ts
// src/modules/cuelist-core/src/config/schema.ts
import { z } from 'zod';
import type { ConfigSchemaDescriptor } from 'showx-shared';

const CuelistCoreConfigSchema = z.object({
  autosave_interval_ms: z.number().int().min(1000).max(300000).default(30000),
  history_rotation_size_bytes: z.number().int().min(1_000_000).default(50_000_000),
  history_rotation_max_age_days: z.number().int().min(1).default(10),
  // presence_color_palette intentionally null in 0.1; ratified in follow-up task per Q11
  presence_color_palette: z.array(z.string()).nullable().default(null),
});

export type CuelistCoreConfig = z.infer<typeof CuelistCoreConfigSchema>;

export const configSchema: ConfigSchemaDescriptor<CuelistCoreConfig> = {
  schemaVersion: 1,
  zodSchema: CuelistCoreConfigSchema as any, // showx-shared typed adapter
  defaults: CuelistCoreConfigSchema.parse({}),
};
```

### File tree expected after task

```
src/modules/cuelist-core/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts          (re-exports manifest + default class)
    ├── manifest.ts
    ├── CuelistCore.ts
    └── config/
        └── schema.ts
tests/unit/modules/cuelist-core/
└── skeleton.test.ts
```

### Loader integration

ModuleLoader (B001-010) discovers `src/modules/cuelist-core/` automatically via glob. No registration edits required. Verify by running shell boot test (when available) — Cuelist Core appears in `registry.list()`.

## Test plan

Vitest unit suite in `tests/unit/modules/cuelist-core/skeleton.test.ts`:

1. **Manifest shape** — Import `manifest`, assert all required fields per `ModuleManifest`. Assert `slug === 'cuelist-core'`, `tier === 'free'`, `default_enabled === true`, `requires.depends_on === []`.
2. **Class lifecycle** — `new CuelistCore()`, call `init(mockCtx)`, assert `mockCtx.persisted.load` called with `configSchema`, assert `mockCtx.log.info` called with init message.
3. **start() reports healthy** — After `init` + `start`, assert `mockCtx.health.report('healthy', ...)` was invoked.
4. **stop() idempotent** — Call `stop()` twice; no throw; log mention only on first call ideally.
5. **teardown() releases ctx** — After `teardown`, calling `start()` should throw (`init must precede start`).
6. **Config defaults** — Assert `configSchema.defaults.autosave_interval_ms === 30000`, etc.

Use `makeMockContext({ slug: 'cuelist-core' })` from `tests/helpers/mock_context.ts` (delivered in ShowX-1 B001-018; if missing, mock inline with same shape).

## Out of scope

- Y.Doc creation / root setup (B003-002).
- `.showx` package read/write (B003-003).
- REHEARSAL/SHOW state machine (B003-004).
- Department view filter (B003-005).
- Trigger engine (B003-007).
- GO event channel (B003-008).
- Payload dispatch (B003-009).
- Cue catalog publishing (B003-010).
- Module panel UI / sidebar registration (B003-011).
- PWA hooks (B003-012+).
- Any actual cuelist behavior — module starts up empty, no document, no listeners.

## Notes for Critic

- Verify `manifest.slug` matches the kebab-case regex per `module_loader.md` §2.3.
- Verify `depends_on` is empty array (NOT undefined; loader treats missing as error).
- Verify lifecycle hooks all return `Promise<void>` and respect `abortSignal` even if no async work yet (so future extensions don't break the contract).
- Confirm no top-level side effects in `index.ts` or `manifest.ts` (loader contract — module-level singletons forbidden per spec §8).
- Confirm Zod schema defaults align with data_model.md §12.5 (history rotation), §12.11 (presence palette is null TBD).
- Verify tsconfig.json `references` array includes `../../shared` so workspace project graph works.
