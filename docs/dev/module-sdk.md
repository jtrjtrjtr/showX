# Writing a ShowX Module

A module is a self-contained TypeScript package under `src/modules/<slug>/` that exports two things from its `index.ts`:

1. A `manifest: ModuleManifest` constant — the loader reads this at discovery time.
2. A default-export class implementing the `Module` interface — the loader instantiates after gating.

That's it. Everything else — UI, persisted config, Yjs documents, OSC sends — happens through the `ModuleContext` injected at `init()`.

This page walks through the full author experience. The canonical contract is `src/types/module.ts`; the binding spec is `docs/specs/module_loader.md`. When this page disagrees with either, **they win**.

## 1. The Manifest

```typescript
// src/modules/hello-world/index.ts
import type { ModuleManifest } from '@showx/types';
import { HelloWorldModule } from './HelloWorldModule.js';

export const manifest: ModuleManifest = {
  slug: 'hello-world',
  name: 'Hello World',
  version: '0.1.0',
  description: 'Demo module — emits OSC on every cue fire.',
  tier: 'free',
  requires: {
    transports: [{ kind: 'osc-out' }],
    permissions: ['network.lan'],
    depends_on: ['cuelist-core'],   // we subscribe to its cue-fire events
    min_shell_version: '0.5.0',
  },
  default_enabled: false,
  persistedConfigSchemaVersion: 1,
  entry: HelloWorldModule,
};

export default HelloWorldModule;
```

### Manifest field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | `string` | yes | Pattern `^[a-z][a-z0-9-]{1,39}$`. Used as PersistedStore key, SecretStore namespace, log prefix, telemetry tag. Stable across versions. |
| `name` | `string` | yes | UI display name, ≤ 40 chars. |
| `version` | `Semver` | yes | Bumps trigger PersistedStore migration consideration. |
| `description` | `string` | yes | UI subtitle, ≤ 200 chars. |
| `tier` | `'free' \| 'pro'` | yes | License gate. Free shell refuses to load `'pro'` modules. |
| `requires.transports` | `TransportRequirement[]` | yes | Drives OS permission prompts + dispatcher pool warm-up + UI display. |
| `requires.permissions` | `OSPermission[]` | yes | Declares macOS permission needs (`network.lan`, `midi.device`, etc.). |
| `requires.depends_on` | `string[]` | yes | Slugs of modules that must `init+start` before this one. Cycle → all members rejected. |
| `requires.conflicts_with` | `string[]` | no | Slugs that cannot coexist. |
| `requires.min_shell_version` | `Semver` | yes | Loader refuses to load on older shell. |
| `default_enabled` | `boolean` | no (default `false`) | On first install, with tier allowing. EventX Bridge + Cuelist Core are `true`. |
| `persistedConfigSchemaVersion` | `number ≥ 1` | yes | Increment when persisted config schema breaks. PersistedStore migrations key off this. |
| `entry` | `ModuleConstructor` | yes | The class — loader does `new entry()` after gating. |
| `uiPanel` | `() => Promise<ReactComponentModule>` | no | Lazy import of main tab UI. |
| `statusBadge` | `() => Promise<ReactComponentModule>` | no | Status-bar badge. Max 1 per module. |
| `menuItem` | `MenuItemSpec` | no | App-menu entry. Max 1 per module. |

### Validation gates

The loader rejects manifests that fail any of:

- `slug` doesn't match `^[a-z][a-z0-9-]{1,39}$`
- `version` not valid semver
- `tier` not `'free'` or `'pro'`
- `depends_on` references unknown slug
- `conflicts_with` overlaps with `depends_on`
- `min_shell_version` newer than current shell

A rejected module ends up in registry state `unloadable`. UI shows it greyed with a tooltip. **The loader continues** with other modules; one bad apple does not break the barrel.

## 2. The Module class — lifecycle

```typescript
// src/modules/hello-world/HelloWorldModule.ts
import type {
  Module, ModuleContext, ConfigSchemaDescriptor,
  HealthStatus,
} from '@showx/types';
import { configSchema, type HelloConfig } from './config/schema.js';

export class HelloWorldModule implements Module {
  private ctx!: ModuleContext;
  private config!: HelloConfig;
  private unsubscribeCueFire?: () => void;

  async init(context: ModuleContext): Promise<void> {
    this.ctx = context;
    this.config = await context.persisted.load(configSchema);
    this.ctx.log.info('init', { configVersion: this.config.__schemaVersion });
  }

  async start(): Promise<void> {
    const sub = this.ctx.events.subscribe('cue-fire', (e) => {
      void this.onCueFire(e);
    });
    this.unsubscribeCueFire = () => sub.unsubscribe();
    this.ctx.health.report('healthy', 'subscribed to cue-fire');
  }

  async stop(): Promise<void> {
    this.unsubscribeCueFire?.();
    this.unsubscribeCueFire = undefined;
  }

  async teardown(): Promise<void> {
    // free any final resources; loader discards the instance after
  }

  getConfigSchema(): ConfigSchemaDescriptor<HelloConfig> {
    return configSchema;
  }

  onHealthCheck(): HealthStatus {
    return this.unsubscribeCueFire ? 'healthy' : 'warning';
  }

  private async onCueFire(e: { cue_id: string; cue_label: string }) {
    await this.ctx.output.send({
      transport: 'osc-out',
      destination: {
        kind: 'osc-out',
        address: this.config.echoHost,
        port: this.config.echoPort,
      },
      payload: { address: '/hello/fired', args: [{ type: 'string', value: e.cue_label }] },
    });
  }
}
```

### Lifecycle hook reference

| Hook | When called | Error semantics |
|---|---|---|
| `init(ctx)` | Once after gating, before `start()`. Module gets its sandboxed `ModuleContext` and loads persisted config. | Throw → module marked `failed`; dependent modules cascade-fail; independents continue. Timeout 10 s. |
| `start()` | Immediately after `init()` succeeds. Open listeners, subscribe upstream, begin operation. | Throw → marked `failed`; loader calls `teardown()` to free partial state; dependents cascade-fail. Timeout 5 s. |
| `stop()` | When user disables module or shell shuts down. Close listeners, unsubscribe, persist state if needed. Respect `ctx.abortSignal`. | Throw → logged at WARN; loader proceeds to `teardown()` anyway. Timeout 5 s. |
| `teardown()` | After `stop()` or on shutdown. Free remaining resources. | Throw → logged; loader marks `torn_down` regardless, discards instance. Timeout 5 s. |
| `onConfigChange?(c)` | User edits config via UI → IPC → loader notifies. | Throw → PersistedStore rolls back to last-good; module does NOT fail. Timeout 2 s. |
| `onHealthCheck?()` | Loader may call periodically. Synchronous. | Throw → treated as `health: 'error'` with the error message. |
| `getConfigSchema()` | Synchronous; called once at init by the loader. | Required. |

**Lifecycle order** is topological by `depends_on`: modules with no deps init in parallel; modules with deps wait for those to reach `started`. Deactivation runs in **reverse** order.

## 3. ModuleContext — the only thing you touch

`ModuleContext` is the sandboxed handle to every shared service. Construct nothing else with side effects. Top-level state in `index.ts` is forbidden (it breaks the path to hot reload in 1.0).

```typescript
interface ModuleContext {
  // identity
  readonly slug: string;
  readonly shellVersion: Semver;
  readonly tier: 'free' | 'pro';

  // shared services
  readonly output: OutputDispatcher;
  readonly input: InputRegistrar;
  readonly sync: SyncBroker;
  readonly assets: AssetServer;
  readonly mdns: mDNSService;
  readonly pairing: PairingStore;
  readonly secrets: SecretStore;
  readonly health: HealthBus;
  readonly persisted: PersistedStore;
  readonly log: Logger;
  readonly events: EventBus;
  readonly ui: ModuleUIRegistrar;

  // introspection
  state(): ModuleState;

  /** Fires on disable/shutdown. Modules SHOULD listen and abort async work. */
  readonly abortSignal: AbortSignal;
}
```

### Service quick reference

| Service | Highlights |
|---|---|
| `output: OutputDispatcher` | `send(msg)`, `claim(destination)`, `release(token)`, `poolStatus()`. Refcounted pool. Multiple modules sharing the same destination → one socket. |
| `input: InputRegistrar` | `listen(spec, handler)`, `unlisten(sub)`. Multiplexed; one OSC port shared across modules. |
| `sync: SyncBroker` | `openDocument(name)`, `closeDocument(handle)`, `subscribeAwareness(name, handler)`. Wraps `y-websocket`. Cuelist Core owns `show:<id>`. |
| `assets: AssetServer` | `mount({ urlPrefix, fsPath })`. `urlPrefix` MUST start with `/<your-slug>/`. |
| `mdns: mDNSService` | `advertise(ad)`, `discover(serviceType, handler)`. Shell advertises `_showx._tcp.local`. |
| `pairing: PairingStore` | `list()`, `get(id)`, `issueToken(meta)`, `revoke(id)`, `touch(id)`. Most modules don't touch this directly. |
| `secrets: SecretStore` | `get/set/delete/list`. macOS Keychain backend. Keys auto-namespaced under your slug. |
| `health: HealthBus` | `report(status, detail?)` for your own; `observe(slug, handler)` for peers. |
| `persisted: PersistedStore` | `load(schema)`, `save(value)`, `onChange(handler)`. Per-module sandboxed file. |
| `log: Logger` | `trace/debug/info/warn/error(msg, ctx?)`. Auto-prefixed with `[<slug>]`. |
| `events: EventBus` | `publish(event)`, `subscribe(type, handler)`. Origin slug stamped on publish. |
| `ui: ModuleUIRegistrar` | `notify(level, message)` for transient toasts. Main panel is wired via `manifest.uiPanel` not here. |

### Sandboxing rules

- `persisted` and `secrets` are namespaced by your slug. No cross-module reads.
- `log` automatically prefixes every line with `[<slug>]`.
- `events.publish()` tags origin slug; `subscribe()` is open (any module can listen to any topic).
- `output` and `input` are shared but track refcount + ownership per slug. Exclusive resources (MIDI input port) → first claim wins; later claims get `ClaimResult.conflict` with the winning slug.
- `assets.mount()` requires `urlPrefix` starting with `/<your-slug>/`.

### Cooperate with `abortSignal`

```typescript
async start() {
  const { signal } = this.ctx.abortSignal;
  while (!signal.aborted) {
    try {
      await this.pollUpstream({ signal });
    } catch (err) {
      if (signal.aborted) return;
      this.ctx.log.warn('poll error', { err: String(err) });
    }
  }
}
```

The loader uses `abortSignal` to bound `stop()` duration. If you don't listen, your module may be killed mid-flight.

## 4. Persisted config — Zod + migrations

```typescript
// src/modules/hello-world/config/schema.ts
import { z } from 'zod';
import type { ConfigSchemaDescriptor } from '@showx/types';

export const HelloConfigZ = z.object({
  __schemaVersion: z.literal(1),
  echoHost: z.string().default('127.0.0.1'),
  echoPort: z.number().int().min(1).max(65535).default(8000),
});

export type HelloConfig = z.infer<typeof HelloConfigZ>;

export const configSchema: ConfigSchemaDescriptor<HelloConfig> = {
  schemaVersion: 1,
  zodSchema: HelloConfigZ,
  defaults: {
    __schemaVersion: 1,
    echoHost: '127.0.0.1',
    echoPort: 8000,
  },
};
```

For a schema bump:

```typescript
export const configSchema: ConfigSchemaDescriptor<HelloConfigV2> = {
  schemaVersion: 2,
  zodSchema: HelloConfigV2Z,
  defaults: { /* v2 defaults */ },
  migrate(prevVersion, prevValue) {
    if (prevVersion === 1) {
      const v1 = prevValue as HelloConfigV1;
      return { ...v1, __schemaVersion: 2, echoSecret: '' };
    }
    throw new Error(`unsupported config version ${prevVersion}`);
  },
};
```

`PersistedStore`:

1. Reads `<userData>/modules/<slug>.json`
2. If `__schemaVersion` is older than current, calls `migrate(prev, value)`
3. Validates via `zodSchema.parse(value)`
4. Returns typed value (or defaults on corrupt JSON — corrupt file is quarantined alongside `.corrupt-<timestamp>`)

## 5. Module UI panel (React)

```typescript
// src/modules/hello-world/ui/Panel.tsx
import React from 'react';

export interface PanelProps {
  config: HelloConfig;
  onChange(next: HelloConfig): void;
  log: Array<{ ts: number; msg: string }>;
}

export default function HelloPanel({ config, onChange, log }: PanelProps) {
  return (
    <div className="module-panel">
      <h2>Hello World</h2>
      <label>
        Echo host
        <input
          value={config.echoHost}
          onChange={(e) => onChange({ ...config, echoHost: e.target.value })}
        />
      </label>
      {/* … */}
    </div>
  );
}
```

Wired via the manifest:

```typescript
export const manifest: ModuleManifest = {
  // ...
  uiPanel: () => import('./ui/Panel.js'),
};
```

The lazy import token (`() => Promise<ReactComponentModule>`) is what the loader passes to the renderer via IPC. The renderer dynamically imports + mounts. The mounted component receives a separate `ModuleUIContext` (renderer-side, NOT the main-process `ModuleContext`) that exposes typed RPC back to the main-process module instance + Yjs document handles via IPC.

You may also declare:

```typescript
manifest.statusBadge = () => import('./ui/StatusBadge.js');  // max 1
manifest.menuItem = {
  label: 'Hello → Test ping',
  accelerator: 'CmdOrCtrl+Shift+H',
  action: 'invoke-rpc',
  rpcName: 'ping',
};
```

## 6. Tier gating

If `manifest.tier === 'pro'`, the loader will NOT load your module on a Free license. UI shows the entry greyed with a lock icon and an "Upgrade to Pro" tooltip. There is no runtime "trial" mechanism in MVP — you are either licensed or you are not.

License source-of-truth is OPEN for 0.1 (see `docs/agent_exchange/decisions/2026-06-05_open_questions_architect.md` Q1). Until that's ratified, treat `tier` as a static config; do not attempt to read the license yourself.

## 7. Worked example — "Hello World" module

Goal: when any cue fires, send an OSC packet to a configurable host:port.

### Layout

```
src/modules/hello-world/
├── package.json
├── tsconfig.json
├── index.ts                  ← manifest + class re-export
├── HelloWorldModule.ts       ← Module implementation
├── config/
│   └── schema.ts             ← Zod + ConfigSchemaDescriptor
└── ui/
    └── Panel.tsx             ← React panel
```

### `package.json`

```jsonc
{
  "name": "@showx/module-hello-world",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@showx/types": "workspace:*",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

### `index.ts`

```typescript
import type { ModuleManifest } from '@showx/types';
import { HelloWorldModule } from './HelloWorldModule.js';

export const manifest: ModuleManifest = {
  slug: 'hello-world',
  name: 'Hello World',
  version: '0.1.0',
  description: 'Demo module — emits OSC on every cue fire.',
  tier: 'free',
  requires: {
    transports: [{ kind: 'osc-out' }],
    permissions: ['network.lan'],
    depends_on: ['cuelist-core'],
    min_shell_version: '0.5.0',
  },
  default_enabled: false,
  persistedConfigSchemaVersion: 1,
  entry: HelloWorldModule,
  uiPanel: () => import('./ui/Panel.js'),
};

export default HelloWorldModule;
```

### `HelloWorldModule.ts`

See §2 above — that's the full minimal implementation. Note:

- We subscribe to the `'cue-fire'` event published by Cuelist Core on the shared EventBus.
- We use `ctx.output.send(...)` (the dispatcher) rather than opening a UDP socket ourselves. This means we share the socket pool with EventX Bridge if both target the same host:port.
- We report health to `ctx.health` so the shell can roll up into the global status indicator.

### What happens at runtime

1. ShowX boots → ModuleLoader scans `src/modules/`, finds your `index.ts`, imports → reads `manifest`.
2. Manifest validates → registry stores `{ slug: 'hello-world', state: 'discovered' }`.
3. Gating runs: tier OK, default_enabled is false → state `gated`. User flips toggle in sidebar → state `validated`.
4. Loader resolves `depends_on: ['cuelist-core']` — must be `started` first. Then `new HelloWorldModule()` → `init(ctx)`.
5. `init` loads config + logs a line. State `inited`. Immediately runs `start()`.
6. `start` subscribes to `cue-fire`. State `started → running`. Health reports `healthy`.
7. Show runs. Each cue fire → `onCueFire` → OSC packet to `echoHost:echoPort`.
8. User disables → `stop()` unsubscribes → `teardown()`. State `torn_down`. Loader discards the instance.

## 8. Testing your module

The pattern is "mock everything that's not the module logic". A `makeMockContext` helper lives in `tests/helpers/mock_context.ts` (Forge writes this in ShowX-1 Foundation bundle).

```typescript
// src/modules/hello-world/HelloWorldModule.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeMockContext } from '../../../tests/helpers/mock_context.js';
import { HelloWorldModule } from './HelloWorldModule.js';
import type { MockContext } from '../../../tests/helpers/mock_context.js';

describe('HelloWorldModule', () => {
  let ctx: MockContext;
  let mod: HelloWorldModule;

  beforeEach(async () => {
    ctx = makeMockContext({ slug: 'hello-world' });
    mod = new HelloWorldModule();
    await mod.init(ctx);
    await mod.start();
  });

  it('emits OSC on cue-fire', async () => {
    ctx.events.publish({
      type: 'cue-fire',
      cue_id: 'q1',
      cue_label: 'Q 1',
      // … other CueFireEvent fields per protocol_dictionary.md §2.2
    } as never);

    // mock dispatcher records sends in ctx.output.sentMessages
    expect(ctx.output.sentMessages).toHaveLength(1);
    expect(ctx.output.sentMessages[0].payload.address).toBe('/hello/fired');
  });

  it('reports healthy after start', () => {
    expect(ctx.health.lastReport).toEqual({
      status: 'healthy', detail: 'subscribed to cue-fire',
    });
  });

  it('unsubscribes on stop', async () => {
    await mod.stop();
    ctx.events.publish({ type: 'cue-fire', cue_id: 'q2', cue_label: 'Q 2' } as never);
    expect(ctx.output.sentMessages).toHaveLength(0);
  });
});
```

Recipes for mocking:

- **PersistedStore returns defaults** — `makeMockContext` accepts an override `{ persistedReturn: HelloConfig }`.
- **SecretStore returns a fixed map** — pass `{ secrets: { 'api-key': 'sk_test' } }`.
- **Yjs documents are real `Y.Doc` instances** — see `makeMockContext({ withRealYjs: true })`. Cheap (no broker), still gives you the CRDT semantics.
- **Health observation** — `ctx.health.simulateHealth(slug, status)` triggers any observer your module registered.

For an integration test (shell + your module in process), use `bootTestShell({ enabledModules: ['hello-world'] })` once `tests/helpers/boot_test_shell.ts` lands (planned in ShowX-1 Foundation).

## 9. Packaging — file layout + package.json

A module is a pnpm workspace package. Minimum:

```
src/modules/<slug>/
├── package.json              ← name = @showx/module-<slug>, type = "module"
├── tsconfig.json             ← extends ../../../tsconfig.base.json
├── index.ts                  ← exports manifest + default class
├── README.md                 ← module overview + config reference
├── (your source files)
├── config/schema.ts          ← Zod schema + ConfigSchemaDescriptor
├── ui/Panel.tsx              ← React panel (lazy imported)
└── (tests next to source or under __tests__/)
```

The root `pnpm-workspace.yaml` includes `src/modules/*` so your package is picked up automatically. No registration step needed.

`package.json` essentials:

```jsonc
{
  "name": "@showx/module-<slug>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.22.0"
    // your runtime deps
  },
  "devDependencies": {
    "@showx/types": "workspace:*",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

`tsconfig.json`:

```jsonc
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["./**/*.ts", "./**/*.tsx"]
}
```

## 10. Module SDK — what's NOT yet supported

These are deferred to post-MVP and documented in `docs/specs/module_loader.md` §1 + §8 + §11:

- **Hot upgrade** — replacing module v1.0.3 with v1.0.4 without process restart. MVP requires app restart.
- **Out-of-process modules** — Electron `utilityProcess` sandboxing. All modules run in main process.
- **Community / npm-distributed modules** — only built-in monorepo modules until 1.0.
- **Per-module worker threads** — if a module needs heavy CPU it owns its own threading.

Author your module class so swapping the constructor at runtime would be possible later — no module-level singletons, no file-scoped state, no top-level side effects in `index.ts`. Everything lives on the class instance.

## 11. Further reading

- `src/types/module.ts` — the actual TS contract (binding)
- `docs/specs/module_loader.md` — lifecycle, error semantics, hot-reload constraint (binding)
- `docs/dev/protocol-reference.md` — what events you can publish/subscribe + what to send to OutputDispatcher
- `docs/dev/cuelist-data-model.md` — what Cuelist Core publishes to the EventBus
- `docs/dev/testing-and-ci.md` — vitest patterns, mock ModuleContext, parity harness
- `docs/specs/bridgex_absorption.md` §5 — EventX Bridge module as a worked real-world example (~2 400 LOC)
