---
id: "B002-002"
title: "EventX Bridge module manifest + skeleton (Module class + lifecycle)"
type: "implementation"
estimated_size_lines: 320
priority: "P0"
depends_on: ["B002-001"]
target_files:
  - "src/modules/eventx-bridge/src/index.ts"
  - "src/modules/eventx-bridge/src/manifest.ts"
  - "src/modules/eventx-bridge/src/EventXBridge.ts"
  - "src/modules/eventx-bridge/src/config/schema.ts"
  - "src/modules/eventx-bridge/tests/unit/module-skeleton.test.ts"
  - "src/modules/eventx-bridge/tests/unit/manifest.test.ts"
  - "src/modules/eventx-bridge/vitest.config.ts"
acceptance_criteria:
  - "`src/index.ts` exports `manifest: ModuleManifest` and `default class EventXBridge implements Module`"
  - "`manifest.slug === 'eventx-bridge'`, `manifest.tier === 'free'`, `manifest.default_enabled === true`, `manifest.persistedConfigSchemaVersion === 1`, `manifest.version` matches package.json"
  - "`manifest.requires.transports` includes `osc-out`, `midi-out`, `dmx-artnet-out`, `webhook-out`, `ws-out` (per kind list in showx-shared `TransportRequirement`)"
  - "`manifest.requires.permissions` includes `network.lan` and `fs.readwrite.userdata`"
  - "`manifest.requires.depends_on === []` (EventX Bridge is standalone per absorption spec §2.2)"
  - "`EventXBridge` implements `init(ctx)`, `start()`, `stop()`, `teardown()`, optional `onConfigChange(newConfig)`, optional `onHealthCheck()`"
  - "Lifecycle hooks store the injected `ModuleContext` on the instance; `init()` calls `ctx.persisted.load(configSchema)` and registers `ctx.events.subscribe('module-state-changed', ...)`"
  - "`start()` and `stop()` are no-ops at this stage (full wiring in B002-003 through B002-008); they MUST be idempotent (start-after-start logs a warning; stop-after-stop is silent)"
  - "`teardown()` calls `ctx.health.report(slug, 'unknown', 'torn down')` and clears subscriptions"
  - "`config/schema.ts` exports `configSchema: ConfigSchemaDescriptor<EventXBridgeConfig>` with Zod schema for `{ lastEventId: string | null, oscHost: string, oscPort: number, listenerHost: string, listenerPort: number, listenerEnabled: boolean }` matching BridgeX 0.3.x `bridgex-config.json` shape"
  - "Vitest unit test `module-skeleton.test.ts` covers happy-path lifecycle (init → start → stop → teardown) against a mock ModuleContext, including: double-start logs warning; double-stop silent; teardown after start runs stop first"
  - "Vitest unit test `manifest.test.ts` validates manifest shape against `showx-shared` `ModuleManifest` type via `expectTypeOf`, asserts all required fields populated, asserts no surprise fields"
  - "`pnpm --filter @showx/module-eventx-bridge typecheck` passes"
  - "`pnpm --filter @showx/module-eventx-bridge test` passes (≥6 tests)"
---

## Context

B002-001 brought BridgeX 0.3.x source into `legacy/`. This task gives the module its public face: a Module class implementing the shell loader contract from `docs/specs/module_loader.md` §2-§3, a manifest the shell's `ModuleLoader.discover()` can ingest (B001-010), and a config Zod schema the shell's `PersistedStore` (B001-004) will persist.

This is the **handshake task** between the module and the shell. After this task, `ModuleLoader` can load `eventx-bridge` against a real or mock `ModuleContext`, run `init()` → `start()` → `stop()` → `teardown()` cleanly, and surface the module in the UI registry. Behavioral wiring (Supabase subscription, rule engine, OSC dispatch) is added in B002-003 through B002-008.

## Implementation notes

### Module class shape

```ts
// src/modules/eventx-bridge/src/EventXBridge.ts
import type { Module, ModuleContext } from 'showx-shared';
import { configSchema, type EventXBridgeConfig } from './config/schema.js';

export default class EventXBridge implements Module {
  private ctx?: ModuleContext;
  private started = false;
  private config?: EventXBridgeConfig;
  private subscriptions: Array<{ unsubscribe(): void }> = [];

  async init(ctx: ModuleContext): Promise<void> {
    this.ctx = ctx;
    this.config = await ctx.persisted.load(configSchema);
    ctx.log.info('init', { lastEventId: this.config.lastEventId });

    // Subscribe to abort signal — fires on shell shutdown or module disable
    ctx.abortSignal.addEventListener('abort', () => {
      ctx.log.info('abort signal received');
    });

    // Subscribe to config change (re-emit by PersistedStore.onChange)
    const configSub = ctx.persisted.onChange<EventXBridgeConfig>((next) => {
      this.config = next;
      ctx.log.info('config changed', { lastEventId: next.lastEventId });
    });
    this.subscriptions.push(configSub);

    ctx.health.report(ctx.slug, 'unknown', 'initialized, not started');
  }

  async start(): Promise<void> {
    if (!this.ctx) throw new Error('start() called before init()');
    if (this.started) {
      this.ctx.log.warn('start() called twice — idempotent no-op');
      return;
    }
    this.started = true;
    // B002-005 wires Supabase subscriber here
    // B002-006 wires rule engine here
    this.ctx.log.info('started (skeleton — no wiring yet)');
    this.ctx.health.report(this.ctx.slug, 'healthy', 'started');
  }

  async stop(): Promise<void> {
    if (!this.ctx || !this.started) return;
    this.started = false;
    // B002-005/B002-006 add real teardown of subscriber + rule engine
    this.ctx.log.info('stopped');
    this.ctx.health.report(this.ctx.slug, 'unknown', 'stopped');
  }

  async teardown(): Promise<void> {
    if (this.started) await this.stop();
    for (const sub of this.subscriptions) sub.unsubscribe();
    this.subscriptions = [];
    if (this.ctx) {
      this.ctx.health.report(this.ctx.slug, 'unknown', 'torn down');
      this.ctx.log.info('torn down');
    }
    this.ctx = undefined;
    this.config = undefined;
  }

  async onConfigChange(newConfig: unknown): Promise<void> {
    // PersistedStore validates via Zod before calling us; cast is safe
    this.config = newConfig as EventXBridgeConfig;
    this.ctx?.log.info('onConfigChange', { lastEventId: this.config.lastEventId });
  }

  onHealthCheck() {
    return this.started ? 'healthy' : 'unknown';
  }
}
```

### Manifest

```ts
// src/modules/eventx-bridge/src/manifest.ts
import type { ModuleManifest } from 'showx-shared';
import EventXBridge from './EventXBridge.js';

export const manifest: ModuleManifest = {
  slug: 'eventx-bridge',
  name: 'EventX Bridge',
  version: '0.0.1',           // match package.json; bump in B002-015
  description: 'Subscribes EventX Supabase changes; dispatches OSC/MIDI/DMX. Absorbed BridgeX 0.3.x.',
  tier: 'free',
  default_enabled: true,
  persistedConfigSchemaVersion: 1,
  requires: {
    transports: [
      { kind: 'osc-out' },
      { kind: 'midi-out' },
      { kind: 'dmx-artnet-out' },
      { kind: 'webhook-out' },
      // ws-out not in TransportRequirement.kind enum yet (showx-shared B001-002)
      // — if missing, file follow-up to widen the enum and use webhook-out as placeholder
    ],
    permissions: ['network.lan', 'fs.readwrite.userdata'],
    depends_on: [],
    min_shell_version: '0.5.0',
  },
  entry: EventXBridge,
  // uiPanel: () => import('./ui/EventXBridgePanel.js') — wired in B002-008
};
```

If `showx-shared` `TransportRequirement.kind` does NOT include `ws-out` (per B001-002 — verify by reading the type), file a Forge sub-note in the done report and use `webhook-out` as a placeholder; widening the enum is a separate showx-shared task.

### index.ts (public entry)

```ts
// src/modules/eventx-bridge/src/index.ts
export { manifest } from './manifest.js';
export { default } from './EventXBridge.js';
```

### Config schema

```ts
// src/modules/eventx-bridge/src/config/schema.ts
import { z } from 'zod';
import type { ConfigSchemaDescriptor } from 'showx-shared';

export const eventXBridgeConfigSchema = z.object({
  lastEventId: z.string().nullable().default(null),
  oscHost: z.string().default('127.0.0.1'),
  oscPort: z.number().int().min(1).max(65535).default(7000),
  listenerHost: z.string().default('0.0.0.0'),
  listenerPort: z.number().int().min(1).max(65535).default(7001),
  listenerEnabled: z.boolean().default(false),
});

export type EventXBridgeConfig = z.infer<typeof eventXBridgeConfigSchema>;

export const configSchema: ConfigSchemaDescriptor<EventXBridgeConfig> = {
  schemaVersion: 1,
  zodSchema: eventXBridgeConfigSchema,
  defaults: {
    lastEventId: null,
    oscHost: '127.0.0.1',
    oscPort: 7000,
    listenerHost: '0.0.0.0',
    listenerPort: 7001,
    listenerEnabled: false,
  },
};
```

Schema matches `apps/bridgex-app/src/main/config-store.ts` shape verbatim so B002-009 can map fields 1:1 during migration.

### Mock ModuleContext for tests

Use the shared `makeMockContext` helper (per B001-002 test plan, helpers in `tests/helpers/mock_context.ts` at repo root). If not yet available, write a local minimal mock inline in the test file:

```ts
function makeMockContext(slug = 'eventx-bridge'): ModuleContext {
  const subs: Array<{ unsubscribe(): void }> = [];
  const log: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => log };
  const health: any = { report: vi.fn(), observe: vi.fn(), aggregate: vi.fn(), snapshot: vi.fn() };
  const persisted: any = {
    load: vi.fn().mockResolvedValue(configSchema.defaults),
    save: vi.fn().mockResolvedValue(undefined),
    onChange: vi.fn().mockReturnValue({ id: 'sub1', unsubscribe: vi.fn() }),
  };
  // ... fill remaining service stubs as no-op vi.fn()
  return { slug, shellVersion: '0.5.0', tier: 'free', /* ... */ abortSignal: new AbortController().signal, /* ... */ } as ModuleContext;
}
```

Prefer the shared helper if it already lands in B001-002 work — read `tests/helpers/mock_context.ts` first.

### vitest.config.ts

```ts
// src/modules/eventx-bridge/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'lcov'] },
  },
});
```

## Test plan

### `tests/unit/module-skeleton.test.ts` (≥5 tests)

1. **init populates ctx + loads config** — `await module.init(mockCtx)`; expect `mockCtx.persisted.load` called once with `configSchema`; expect `mockCtx.health.report` called with `'unknown', 'initialized, not started'`.
2. **start → started** — `await module.init(); await module.start();` expect log `'started'`, expect health `'healthy', 'started'`.
3. **double start idempotent** — `await module.start(); await module.start();` second call logs warning, does NOT throw.
4. **stop while started** — start then stop; expect health `'unknown', 'stopped'`.
5. **stop while not started silent** — fresh init, then stop; expect NO health emit, no log error.
6. **teardown calls stop if started** — start then teardown; expect stop ran first; expect subscriptions cleared; expect health `'unknown', 'torn down'`.
7. **onConfigChange updates internal config** — fire onConfigChange with new value; expect internal `this.config` updated.

### `tests/unit/manifest.test.ts` (≥3 tests)

1. **manifest is well-typed `ModuleManifest`** — `expectTypeOf(manifest).toMatchTypeOf<ModuleManifest>()`.
2. **manifest fields populated** — assert all required fields (`slug`, `name`, `version`, `description`, `tier`, `requires`, `entry`, `persistedConfigSchemaVersion`) are set; `slug === 'eventx-bridge'`; `tier === 'free'`.
3. **transports include osc/midi/dmx/webhook** — assert array contains each expected kind.
4. **entry is constructable** — `const m = new manifest.entry(); expect(m).toBeInstanceOf(EventXBridge);`.

## Out of scope

- Wiring Supabase subscriber (B002-005).
- Wiring rule engine (B002-006).
- Wiring OSC/MIDI/DMX dispatchers (B002-004).
- Migrating handlers (`handlers/wordcloud.ts` etc — B002-003).
- Auth manager (B002-007).
- UI panel implementation (B002-008).
- Config migration from BridgeX 0.3.x (B002-009).
- Importing or referencing anything from `src/legacy/`.

## Notes for Critic

- Verify `manifest.slug` matches the validation regex `^[a-z][a-z0-9-]{1,39}$` from module_loader spec §2.3 (it should: `eventx-bridge` is 13 chars, kebab-case, lowercase).
- Verify `manifest.entry` is the class constructor (not an instance).
- Verify `EventXBridge.init()` does NOT throw on the mock context.
- Verify lifecycle ordering: stop should be safe to call without start; teardown should always run stop first.
- Verify `configSchema.defaults` matches `bridgex-config.json` shape from `apps/bridgex-app/src/main/config-store.ts` (read the BridgeX source as ground truth).
- No `legacy/` imports — if any line in `manifest.ts`, `index.ts`, or `EventXBridge.ts` references `legacy/`, that's an immediate `changes_requested`.
- No `process.env` reads inside module code; if config is needed at runtime it goes through `ctx.persisted` or `ctx.secrets`.
