# ShowX Module Loader Specification

> **Status:** Draft v0.1 (Architect-locked contract, awaiting Forge implementation)
> **Date:** 2026-06-05
> **Authors:** Architect (ShowX hub)
> **Implements:** the contract in `src/types/module.ts`
> **Companion docs:**
> - `../../../xlab-strategy/docs/showx_module_architecture.md` (high-level module architecture)
> - `../../../xlab-strategy/docs/showx_mvp_scope.md` (MVP scope)
> - `data_model.md` (show document data shapes — consumed by modules)
> - `protocol_dictionary.md` (semantic events fed to OutputDispatcher)
> - `pairing_auth.md` (PairingStore + SecretStore semantics)
> - `bridgex_absorption.md` (EventX Bridge module migration story)
> **Binding strategy decision:** `../../../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`
> **Dependencies:** Electron main process bootstrap (`src/main/index.ts`), shared services in `src/main/shared/*`. Forge implements `src/main/module_loader.ts` against this spec.

---

## 1. Goals

The module loader is the **heart of the ShowX shell**. It must:

1. **Host N modules in one Electron main process** without process-per-module overhead. EventX Bridge, Cuelist Core, SHOW mode, Custom Router, Cloud Sync — all in-proc, sharing one OutputDispatcher, one Yjs broker, one mDNS namespace, one signed binary.
2. **Gate modules per pricing tier.** Free tier loads `tier: 'free'` modules only; Pro tier unlocks `tier: 'pro'` modules. Tier is read from a license check (out of scope of this spec; loader exposes a hook).
3. **Run lifecycle hooks (init → start → stop → teardown) in correct order** with dependency awareness. Modules with declared `depends_on` start after their dependencies; parallel-eligible modules start in parallel.
4. **Isolate module failures.** A crash, throw, or hang in one module MUST NOT take down the shell or other modules. Failed modules are marked `error` in the HealthBus + UI; remaining modules keep running.
5. **Allow hot enable/disable via UI** without app restart. Toggling a module from the sidebar runs its `stop()` + `teardown()` (disable) or `init()` + `start()` (enable). Upgrade-in-place is **NOT** in scope for MVP (full app restart for new version).
6. **Provide shared infrastructure access** via a single typed `ModuleContext` injected into `init()`. Modules NEVER reach across process for shared resources — they go through the context.

Non-goals for MVP (0.5–0.3):

- Hot **upgrade** (replace module v1.0.3 with v1.0.4 without process restart). Restart-required.
- Out-of-process / sandboxed modules (Electron utilityProcess, vm.Context). All modules run in main process with full Node API.
- Community module loading from npm. Built-in monorepo modules only until 1.0.
- Per-module worker threads. If a module needs heavy CPU it owns the threading; loader stays single-threaded scheduler.

---

## 2. Module manifest

Every module exports a single `manifest: ModuleManifest` constant from its `index.ts`. The manifest is the **only** thing the loader reads at discovery time — class instantiation happens later, after gating.

### 2.1 Manifest fields

| Field | Type | Required | Purpose |
|---|---|---|---|
| `slug` | `string` (kebab-case, `[a-z0-9-]{2,40}`) | yes | Stable identity; used as PersistedStore key, SecretStore namespace, logger prefix, telemetry tag. Forge **must** validate format. |
| `name` | `string` (human-readable, ≤40 chars) | yes | UI display name. e.g. `"EventX Bridge"`. |
| `version` | `string` (semver) | yes | Module version. Used for config migration + telemetry. |
| `description` | `string` (≤200 chars) | yes | UI subtitle. |
| `tier` | `'free' \| 'pro'` | yes | Required pricing tier. Loader refuses to load a `'pro'` module on a Free license. |
| `requires` | `ModuleRequirements` | yes | Capability declarations (transports, OS permissions, depends_on). See §2.2. |
| `default_enabled` | `boolean` | no (default `false`) | If true, module is enabled on first install when tier allows. EventX Bridge + Cuelist Core are `true`. |
| `persistedConfigSchemaVersion` | `number` (integer ≥1) | yes | Used by PersistedStore for migrations. Increment when schema breaks. |
| `entry` | `Module` (class constructor) | yes | The default export class. Loader does `new entry()` to instantiate. |
| `uiPanel` | `() => Promise<ReactComponentModule>` | no | Lazy import of UI tab. Renderer-side, not main. Loader passes the import token to renderer via IPC. |
| `statusBadge` | `() => Promise<ReactComponentModule>` | no | Optional status-bar badge component. Capped at **1 per module**. |
| `menuItem` | `MenuItemSpec` | no | Optional app menu entry. Capped at **1 per module**. |

### 2.2 Requirements declaration

```ts
interface ModuleRequirements {
  transports: TransportRequirement[];   // e.g. [{ kind: 'osc-out' }, { kind: 'midi-in' }]
  permissions: OSPermission[];          // e.g. ['network.lan', 'fs.readwrite.userdata']
  depends_on: string[];                 // slugs of other modules that must init first
  conflicts_with?: string[];            // slugs of modules that cannot coexist (rare)
  min_shell_version: string;            // semver of ShowX shell needed
}
```

Transport declarations drive (a) startup OS permission prompts on macOS (Network, Bonjour, Bluetooth if ever), (b) OutputDispatcher pool warm-up, (c) UI display ("this module uses OSC out + MIDI in").

`depends_on` examples:
- SHOW mode `depends_on: ['cuelist-core']` — cannot start without cuelist data layer.
- Cloud Sync `depends_on: ['cuelist-core']` — second Yjs provider attaches to Cuelist Core's document.
- EventX Bridge `depends_on: []` — fully standalone, ported from BridgeX 0.3.x.

### 2.3 Manifest validation

At load time, the loader validates each manifest:

- `slug` matches `^[a-z][a-z0-9-]{1,39}$`. Reject otherwise.
- `version` is valid semver. Reject otherwise.
- `tier` is one of `'free' | 'pro'`. Reject otherwise.
- `depends_on` entries reference real, discoverable slugs. Reject otherwise.
- `conflicts_with` does not overlap with `depends_on`. Reject otherwise.
- `min_shell_version` is satisfiable by current shell version. Reject otherwise.

Rejected modules are flagged `unloadable` in the registry with a structured reason; UI shows them grayed out with a tooltip. **They do not crash the loader.**

---

## 3. Module lifecycle

### 3.1 Lifecycle states

```
discovered → validated → gated (waiting for tier/enable)
   → init → started → (running) → stopping → stopped → torn_down
                       ↓ error
                     failed (retains diagnostic; UI shows red badge)
```

States are observable via the HealthBus and the loader's `ModuleRegistry.list()` API.

### 3.2 Discovery

On Electron main process boot, the loader runs `discover()`:

1. Scans `src/modules/*/` looking for `index.ts` (or compiled `index.js` in production builds).
2. Dynamic-imports each `index.{ts,js}` via ESM `import()`.
3. Reads the `manifest` export. Validates per §2.3.
4. Stores `{ slug, manifest, status: 'discovered' }` in the in-memory `ModuleRegistry`.

If a discovery import throws (syntax error, missing export, manifest validation fails), the slug is logged as `discovery_failed` with the error and skipped. **The loader continues with other modules.**

Discovery is **synchronous** from the user's perspective (one pass, log progress). Target: <200ms for built-in modules.

### 3.3 Activation criteria

A module becomes **activatable** when:

1. `manifest.tier` is allowed by current license (Free license blocks Pro modules).
2. User setting `modules.<slug>.enabled === true`. Default: `manifest.default_enabled`.
3. All `depends_on` slugs are also activatable.
4. No `conflicts_with` slug is enabled.
5. `manifest.min_shell_version` ≤ current ShowX version.

If ANY criterion fails, module stays in `gated` state. UI shows reason in tooltip.

### 3.4 Activation order

For all activatable modules, the loader runs `init()` in **topological order** by `depends_on`:

- Modules with no deps: parallel init.
- Modules depending on others: wait for deps to reach `started` state, then init.
- Cycles in `depends_on` are detected at validation time → all members of cycle are rejected.

After `init()` succeeds, the loader immediately calls `start()`. Modules are not held in a parked `inited` state. This keeps the model simple: init is "construct + register", start is "open listeners + begin operation". Failure semantics differ between the two (see §3.6).

### 3.5 Deactivation order

When user disables a module (or shell shutting down):

- `stop()` runs in **reverse topological order** of `depends_on`.
- `teardown()` runs after `stop()` for the same module — not blocked by other modules' stop.
- During shell shutdown, the loader gives each module up to **5 seconds** to complete `stop()` before forcibly proceeding to `teardown()`. If `teardown()` also exceeds 5 seconds, it is abandoned (logged as `teardown_timeout`); resource leak is accepted because the process is about to exit anyway.

### 3.6 Error semantics

| Hook | Error behavior |
|---|---|
| `init()` throws | Module marked `failed`. Dependent modules cascade-fail with reason `dependency_failed`. Independent modules continue normally. UI shows red badge + error tooltip. |
| `start()` throws | Module marked `failed`. Loader calls `teardown()` to free partial state. Dependent modules cascade-fail. |
| `stop()` throws | Logged at WARN level; loader proceeds to `teardown()` regardless. Module ends in `stopped` state with `last_error` recorded. |
| `teardown()` throws | Logged at WARN level; loader marks module `torn_down` regardless and discards instance. |
| `onConfigChange()` throws | Logged at ERROR level; PersistedStore rolls back to last-good config; module receives next change attempt fresh. Does NOT fail the module. |
| `onHealthCheck()` throws | Treated as `health: 'error'` with the error message. Module not failed; just unhealthy. |

**Crash recovery (post-MVP):** if a module fails `start()`, the loader MAY retry with exponential backoff (1s, 5s, 30s, 5m, give up) controlled by a `manifest.retry_policy?: 'none' \| 'backoff'`. MVP ships `'none'` only (manual user re-enable to retry).

---

## 4. ModuleContext API

`ModuleContext` is the **only** way a module touches shared infrastructure. The loader constructs a fresh context per module instance — sandboxed by slug — and passes it to `init()`. The module stores a reference and uses it for the lifetime of the instance.

### 4.1 Sandboxing rules

- `PersistedStore` reads/writes are namespaced under the module's `slug`. Module cannot read another module's persisted blob.
- `SecretStore` keys are namespaced under the module's `slug`. Cross-module secret read is forbidden.
- `Logger` automatically prefixes every line with `[<slug>]`.
- `EventBus` topics emitted BY a module are tagged with origin slug for tracing; topics SUBSCRIBED to are open (any module can listen to any topic, per §9).
- `OutputDispatcher` and `InputRegistrar` are shared across modules but track refcounts and ownership per slug (see §4.4).

### 4.2 Services exposed

```ts
interface ModuleContext {
  // identity
  slug: string;
  shellVersion: string;
  tier: 'free' | 'pro';

  // shared services
  output: OutputDispatcher;
  input: InputRegistrar;
  sync: SyncBroker;
  assets: AssetServer;
  mdns: mDNSService;
  pairing: PairingStore;
  secrets: SecretStore;
  health: HealthBus;
  persisted: PersistedStore;
  log: Logger;
  events: EventBus;

  // UI registration (no-op until uiPanel is wired)
  ui: ModuleUIRegistrar;

  // lifecycle introspection
  state(): ModuleState;
  abortSignal: AbortSignal;  // fires on disable/shutdown; modules SHOULD listen
}
```

### 4.3 Method signatures

Full signatures live in `src/types/module.ts`. Highlights:

**OutputDispatcher**
```ts
send(msg: TransportMessage): Promise<DispatchResult>;
claim(destination: TransportDestination): ClaimToken;     // refcount++; required before send for some transports
release(token: ClaimToken): void;                          // refcount--; closes socket at 0
poolStatus(): PoolStatus;
```

**InputRegistrar**
```ts
listen(spec: InputSpec, handler: InputHandler): Subscription;
unlisten(sub: Subscription): void;
```

**SyncBroker**
```ts
openDocument(name: string): YDocHandle;
closeDocument(handle: YDocHandle): void;
subscribeAwareness(name: string, handler: AwarenessHandler): Subscription;
```

**PersistedStore**
```ts
load<T>(schema: ConfigSchemaDescriptor<T>): Promise<T>;
save<T>(value: T): Promise<void>;
onChange<T>(handler: (next: T) => void): Subscription;
```

**SecretStore**
```ts
get(key: string): Promise<string | undefined>;
set(key: string, value: string): Promise<void>;
delete(key: string): Promise<void>;
list(): Promise<string[]>;     // returns keys, not values
```

**HealthBus**
```ts
report(status: HealthStatus, detail?: string): void;       // module's own health
observe(slug: string, handler: HealthHandler): Subscription;  // observe peer
```

**EventBus**
```ts
publish<T extends ShowxEvent>(event: T): void;
subscribe<T extends ShowxEvent>(type: T['type'], handler: (e: T) => void): Subscription;
```

### 4.4 OutputDispatcher contention

Multiple modules wanting the same physical destination (e.g. EventX Bridge + Cuelist Core both targeting OSC `10.0.1.10:8000`) share one underlying socket via the dispatcher's refcounted pool. Both modules call `claim()`, get separate tokens, share one socket. Last `release()` closes the socket.

Hard constraints (MIDI input port, single OS handle):

- First module to `claim()` an exclusive resource wins.
- Subsequent claims for the same exclusive resource get `ClaimResult.conflict` with the winning slug.
- UI displays ownership: "MIDI Port 1 IN — owned by `cuelist-core`".
- Conflicting module is marked `health: 'warning'` with the conflict detail; module decides whether to fail-start or run degraded.

### 4.5 abortSignal

Every context exposes an `AbortSignal` that fires when the module is being torn down. Modules SHOULD pass this to long-running async work (fetch, setTimeout chains, Yjs awaiting). The loader uses this to bound `stop()` duration.

---

## 5. Module discovery + loading

### 5.1 File layout

```
src/modules/<slug>/
├── index.ts            ← exports `manifest: ModuleManifest` + `default class XModule implements Module`
├── package.json        ← module-local deps (only for monorepo bookkeeping; loader does NOT read at runtime)
├── ui/
│   ├── Panel.tsx       ← main tab UI
│   ├── StatusBadge.tsx ← optional status bar item
│   └── menu.ts         ← optional menu items
├── config/
│   └── schema.ts       ← Zod schema for persistedConfig + migrations
└── (module internals)
```

### 5.2 Dynamic import

Loader uses ESM `import()` with a path computed relative to the compiled main bundle:

```ts
const mod = await import(`./modules/${slug}/index.js`);
const manifest = mod.manifest as ModuleManifest;
const ModuleCtor = manifest.entry;
```

ESM imports are cached by the runtime, so re-import after `teardown()` returns the same module class instance. **For MVP this is acceptable** — disable/enable cycles re-instantiate `new ModuleCtor()` without reloading code. Hot upgrade (different code) requires full app restart.

### 5.3 Malformed manifest handling

If `manifest` export is missing, malformed, or fails §2.3 validation:

- Log structured error: `{ slug, error_type, error_message, file_path }`.
- Mark in registry as `unloadable`.
- UI shows entry with red disabled state + tooltip.
- Other modules continue normally.

### 5.4 Registry singleton

```ts
class ModuleRegistry {
  list(): ModuleEntry[];
  get(slug: string): ModuleEntry | undefined;
  enable(slug: string): Promise<void>;
  disable(slug: string): Promise<void>;
  subscribe(handler: (event: RegistryEvent) => void): Subscription;
}
```

The registry is a singleton in Electron main, exposed to renderer via typed IPC (out of scope of this spec — see `src/main/ipc/` once written).

---

## 6. UI integration

### 6.1 Module tabs

Each module with `uiPanel` declared gets a tab in the ShowX shell's top tab bar. Activation:

- User clicks tab → renderer dynamic-imports `uiPanel()` and mounts the React component.
- The mounted component receives `ModuleUIContext` (renderer-side typed handle) for IPC back to module main-process instance.
- Renderer-side context is **not** the same object as main-process `ModuleContext`. It exposes typed RPC calls to the module + Yjs document handles via IPC.

### 6.2 Sidebar toggle

Sidebar entry per discovered module:

- ✓ checkbox if `manifest.tier` allowed by license.
- Greyed out (with lock icon) if `manifest.tier: 'pro'` on Free.
- Click toggles enabled state; loader runs lifecycle.
- Visual feedback: spinner during init/start, green dot when running, red when failed.

### 6.3 Status badge

If `manifest.statusBadge` declared, the badge component is rendered in the right-side status bar. Each module may register **at most 1 badge** (enforced at manifest validation). Badge component receives a small typed prop bag (`{ health, lastUpdated, slug }`).

### 6.4 Menu items

If `manifest.menuItem` declared, one menu entry is added to the "Module" submenu of the application menu. Cap: **1 per module**. Specs:

```ts
interface MenuItemSpec {
  label: string;
  accelerator?: string;     // Electron accelerator string, e.g. 'CmdOrCtrl+Shift+R'
  action: 'open-panel' | 'invoke-rpc';
  rpcName?: string;         // only if action === 'invoke-rpc'
}
```

---

## 7. Persisted configuration

### 7.1 Schema + persistence

Each module declares its config schema via a `ConfigSchemaDescriptor` exported by `config/schema.ts`. Shape:

```ts
interface ConfigSchemaDescriptor<T> {
  schemaVersion: number;
  zodSchema: ZodSchema;   // runtime validation; typed as opaque here
  defaults: T;
  migrate?(prevVersion: number, prevValue: unknown): T;
}
```

The PersistedStore:

1. Loads JSON blob from `<userData>/modules/<slug>.json`.
2. Compares `__schemaVersion` field with current `schemaVersion`.
3. If older, calls `migrate(prevVersion, prevValue)` → returns new shape.
4. Validates via `zodSchema.parse(value)`.
5. Returns typed value.

If load fails (corrupt JSON, validation, migration throws), PersistedStore returns `defaults` and quarantines the corrupt file to `<userData>/modules/<slug>.json.corrupt-<timestamp>`.

### 7.2 Per-module sandbox

PersistedStore enforces sandbox at API level: `module.persisted.save(value)` writes only to that module's slug-keyed file. There is no `save(otherSlug, value)` form. Files for other modules are not enumerable via this API (use admin tools instead).

### 7.3 onConfigChange

If a module exports `onConfigChange?(newConfig)`, the loader subscribes:

- User edits config in UI → IPC → main-process module instance receives new config → loader calls `module.onConfigChange(newConfig)`.
- Module applies new config live (no restart required).
- If `onConfigChange()` throws, PersistedStore rolls back; module receives the next attempt fresh (see §3.6).

---

## 8. Hot reload (POST-MVP — design constraint only)

Hot reload is explicitly out of scope for MVP. We document it here to constrain the interface design:

- Module interface stays narrow (one class, lifecycle methods only, no global state outside class instance) so swapping the class constructor at runtime remains feasible later.
- ESM import cache will need busting for true code reload — punted to 1.0.
- Disable→enable cycle is the **only** runtime lifecycle change available in MVP. New code requires app restart.

Constraint enforced on Forge: do NOT introduce module-level singletons, file-scoped state, or top-level side effects in module `index.ts`. Everything lives on the class instance.

---

## 9. Inter-module communication

### 9.1 EventBus

Loose coupling via typed events. Example flow:

- Cuelist Core publishes `'cue-catalog-updated'` event with payload `{ show_id, catalog: CueCatalog }` whenever the cue catalog changes.
- Custom Router subscribes and refreshes its routing UI.
- Neither module imports the other.

Events live in `src/types/events.ts` as a discriminated union (see types skeleton). All event types are versioned implicitly by the shell version; breaking changes require shell major bump.

### 9.2 Direct module references

**Discouraged**. The loader does not expose `getModule(slug)`. If a module needs another module's data, it should consume via:

- EventBus (broadcast events)
- SyncBroker (shared Yjs documents)
- OutputDispatcher (semantic transports)

Exception: tightly coupled module pairs (Cuelist Core + SHOW mode) MAY share a typed in-module API surface via a `src/shared/<feature>/` re-export. Cross-module imports are linted to that path only.

### 9.3 Event types declaration

All EventBus event types are declared in `src/types/events.ts` (Forge writes this when ratifying event shapes). Modules import and use; loader does NOT generate or validate event shapes at runtime — TypeScript handles it.

---

## 10. Error isolation patterns

### 10.1 Wrapped calls

Every loader → module call is wrapped:

```ts
async function safeCall<T>(slug: string, hook: string, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const value = await Promise.race([fn(), timeout(HOOK_TIMEOUT_MS[hook])]);
    return { ok: true, value };
  } catch (err) {
    logError(slug, hook, err);
    return { ok: false, error: err };
  }
}
```

`HOOK_TIMEOUT_MS`:
- `init`: 10000 (10s — module setup, may include file IO)
- `start`: 5000
- `stop`: 5000
- `teardown`: 5000
- `onConfigChange`: 2000

Timeouts result in `failed` state with `timeout` reason.

### 10.2 Health monitoring

HealthBus aggregates per-module health into a single shell-wide status. Reduction rule:

- ANY module `error` → shell `error`.
- ANY module `warning` (no errors) → shell `warning`.
- All `healthy` → shell `healthy`.
- All `unknown` → shell `unknown`.

Shell health drives the global status indicator in the UI and is the signal exported to the optional telemetry hook.

### 10.3 Crash recovery (MVP shape)

MVP: no automatic restart of failed modules. User must manually disable + re-enable to retry. Loader records `failure_count` and `last_failure_at` for telemetry / future backoff logic.

---

## 11. Module SDK packaging (POST-MVP)

For 0.1 – 0.6 (mid-2027):

- All modules live in `src/modules/<slug>/` within the monorepo.
- Module dependencies in `package.json` are workspace-resolved.
- No npm publish for any module.
- No "load this URL" community module mechanism.

For 1.0+ (2028):

- Module SDK packaged as `@xlab/showx-sdk`.
- Community modules installable from a curated registry.
- Code signing / review process for community modules (deferred design).
- Sandboxing model for community code (Electron utilityProcess) — re-evaluate.

The module interface (`ModuleManifest`, `Module`, `ModuleContext`) is the public contract. It MUST remain backward compatible across minor versions starting 1.0.

---

## 12. Test patterns

### 12.1 Unit test (per module)

Modules are tested in isolation by mocking `ModuleContext`:

```ts
import { makeMockContext } from '../../tests/helpers/mock_context';

const ctx = makeMockContext({ slug: 'eventx-bridge' });
const mod = new EventxBridgeModule();
await mod.init(ctx);
await mod.start();

ctx.input.simulateOscReceive('/foo', [1, 2, 3]);
expect(ctx.output.sentMessages).toContainEqual({ transport: 'osc', address: '/bar', args: [1,2,3] });
```

`makeMockContext` ships in `tests/helpers/mock_context.ts` (Forge writes; not in scope of this spec). Mock services record interactions; `ctx.output.sentMessages` is the captured queue.

### 12.2 Integration test (shell + module)

```ts
const shell = await bootTestShell({ enabledModules: ['eventx-bridge'] });
await shell.waitForReady();
// drive a real Supabase change → assert OSC sent
```

`bootTestShell` boots a real loader against an in-memory PersistedStore + an OSC-loopback OutputDispatcher. Used for end-to-end module behaviors without full Electron renderer.

### 12.3 Parity test (EventX Bridge specifically)

The EventX Bridge module ships with a **parity harness** that replays BridgeX 0.3.x test fixtures through the new module and asserts byte-identical OSC/MIDI/DMX output + p95 latency within `BridgeX_0.3.x_p95 + 5ms`. This is the hard gate for ShowX 0.5 ship. Details in `bridgex_absorption.md`.

---

## 13. Open questions

1. **License gating signal source.** Where does the loader read current tier from? Local cache of cloud license check? Pairing token claims? Out-of-band SecretStore key? Needs a decision before SHOW mode module ships (Q2 2027).
2. **Module debug tools UX.** Should there be a hidden "Module Inspector" panel showing init order, lifecycle states, HealthBus events, OutputDispatcher pool? Useful for support. Probably yes — track for 0.2.
3. **Strict mode vs lenient mode for malformed modules.** Production: skip and warn (current spec). Dev: throw and halt (better DX). Add a `SHOWX_STRICT_MODULES=1` env var?
4. **Telemetry hook shape.** ModuleContext §4 lists no telemetry. Module architecture doc proposes opt-in per-module telemetry. Defer to a separate spec; loader stays neutral for MVP.
5. **mDNS namespace per module.** Currently mDNS service is shared (single `_showx._tcp.local` advertisement). Will any module want its own service type? Probably not for MVP. Future Companion bridge module might. Revisit at 0.3.
6. **`onCueCatalog` hook from architecture sketch.** Architecture doc lists `onCueCatalog?(catalog): void` as a module hook. This spec subsumes it into EventBus (`'cue-catalog-updated'` event). Forge: prefer EventBus subscription. The hook is **NOT** part of the Module interface contract.

---

## References

- Strategy architecture sketch: `../../../xlab-strategy/docs/showx_module_architecture.md`
- MVP scope: `../../../xlab-strategy/docs/showx_mvp_scope.md`
- Binding decision: `../../../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`
- Companion specs (this directory): `data_model.md`, `protocol_dictionary.md`, `pairing_auth.md`, `bridgex_absorption.md`
- Contract source: `../../src/types/module.ts`
- Predecessor: `../../../bridgeX/` (BridgeX 0.3.x, source migrated to `src/modules/eventx-bridge/` in July 2026)
- Aggregation vs parameters split rule: `~/.claude/projects/-Users-machintoshhd-Daniel-local/memory/feedback_aggregation_vs_parameters_split.md`
