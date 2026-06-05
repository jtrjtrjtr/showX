---
id: "B001-011"
title: "Electron main entry + shell skeleton"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
depends_on: ["B001-005", "B001-006", "B001-009", "B001-010"]
target_files:
  - "src/main/src/index.ts"
  - "src/main/src/Shell.ts"
  - "src/main/src/ipc/index.ts"
  - "src/main/src/ipc/channels.ts"
  - "src/main/src/ui/preload.ts"
  - "src/main/src/ui/window.ts"
  - "src/main/package.json"
  - "tests/unit/Shell.test.ts"
acceptance_criteria:
  - "src/main/src/index.ts is the Electron app entry — calls Shell.boot() inside app.whenReady()"
  - "Shell orchestrates the 11 services in the correct order documented below"
  - "Shell exposes shutdown() that tears down services in REVERSE order"
  - "BrowserWindow loads the PWA-built bundle (file:// in prod, http://localhost:5174 in dev) at route '/shell' (mode flag in URL)"
  - "preload.ts exposes a typed window.showxApi via contextBridge — query module list, get health snapshot, send config update, get pairing PIN, list devices"
  - "IPC handlers in src/main/src/ipc/ wire each window.showxApi method to a Shell-level service call; all return Promises"
  - "Shell can be instantiated with test doubles for every service (DI-friendly); Shell.test.ts spins one up with mocks and asserts boot/shutdown order"
  - "Vitest tests pass: boot sequence + shutdown sequence + crash during one service does NOT prevent shutdown of already-booted services"
---

## Context

This task wires every piece of ShowX-1 infrastructure into a runnable Electron app. The Shell is the conductor: it constructs services in dependency order, calls their `init`/`start` methods, hands the resulting services to the ModuleLoader, opens a BrowserWindow that loads the PWA build, and exposes IPC for the renderer to query state.

This is the integration task for the bundle. Most acceptance criteria here become true only AFTER B001-003..010 are accepted. Forge should not start B001-011 until its dependencies are accepted; if it picks this up early, fail fast and report blocked.

The PWA renderer-side code is largely from B001-012 — this task only consumes its build output (Vite produces `pwa/dist/index.html` + assets). The Shell serves that bundle via the AssetServer (B001-005) AND opens an Electron BrowserWindow pointed at it.

## Implementation notes

### Electron dependency

Add to `src/main/package.json`:
```
"electron": "^29.0.0"
```
Add devDependency `@electron/notarize` (used by ShowX-6 packaging — not now; declare so future tasks don't churn).

### `src/main/src/index.ts`

```ts
import { app } from 'electron';
import { Shell } from './Shell.js';

const shell = new Shell();

app.whenReady().then(async () => {
  try {
    await shell.boot();
  } catch (err) {
    console.error('Shell boot failed', err);
    app.exit(1);
  }
});

app.on('window-all-closed', async () => {
  await shell.shutdown();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (e) => {
  if (!shell.isShutDown()) {
    e.preventDefault();
    await shell.shutdown();
    app.quit();
  }
});

process.on('SIGTERM', () => app.quit());
process.on('SIGINT', () => app.quit());
```

### `src/main/src/Shell.ts`

```ts
export class Shell {
  private logger!: Logger;
  private persisted!: PersistedStore;
  private secrets!: SecretStore;
  private events!: EventBus;
  private health!: HealthBus;
  private assets!: AssetServer;
  private mdns!: MdnsService;
  private sync!: SyncBroker;
  private pairing!: PairingStore;
  private pinManager!: PinManager;
  private tokenManager!: TokenManager;
  private output!: OutputDispatcher;
  private input!: InputRegistrar;
  private modules!: ModuleLoader;
  private window!: BrowserWindow;
  private state: 'cold' | 'booting' | 'running' | 'shutting_down' | 'shut_down' = 'cold';

  constructor(private deps: ShellDeps = {}) {}

  async boot(): Promise<void> {
    if (this.state !== 'cold') throw new Error(`Shell.boot called in state ${this.state}`);
    this.state = 'booting';

    // 1. Logger
    this.logger = this.deps.logger ?? new LoggerImpl({ /* config from env */ });
    await this.logger.init();

    // 2. PersistedStore
    this.persisted = this.deps.persisted ?? new PersistedStoreImpl({ dir: appDataDir() });
    await this.persisted.init();

    // 3. SecretStore
    this.secrets = this.deps.secrets ?? new SecretStoreImpl({ service: 'cz.xlab.showx' });
    await this.secrets.init();

    // 4. EventBus + HealthBus (eager, no async init needed but call init() anyway for symmetry)
    this.events = this.deps.events ?? new EventBusImpl(this.logger);
    this.health = this.deps.health ?? new HealthBusImpl(this.logger);
    await this.events.init?.();
    await this.health.init?.();

    // 5. AssetServer
    this.assets = this.deps.assets ?? new AssetServerImpl({ logger: this.logger });
    await this.assets.start({ pwaDistDir: pwaDistPath(), port: 0 /* OS-assigned */ });

    // 6. mDNS
    this.mdns = this.deps.mdns ?? new MdnsServiceImpl({ logger: this.logger });
    await this.mdns.start({ serviceType: '_showx._tcp.local', port: this.assets.port, host: localHostname() });

    // 7. SyncBroker
    this.sync = this.deps.sync ?? new SyncBrokerImpl({ logger: this.logger });
    await this.sync.start({ httpServer: this.assets.httpServer /* upgrade route */ });

    // 8. Pairing stack
    this.tokenManager = this.deps.tokens ?? new TokenManagerImpl(this.secrets);
    await this.tokenManager.init();
    this.pinManager = this.deps.pins ?? new PinManagerImpl();
    this.pairing = this.deps.pairing ?? new PairingStoreImpl(this.persisted, this.tokenManager);
    await this.pairing.init();
    mountPairingRoutes(this.assets.router, {
      pairing: this.pairing,
      pins: this.pinManager,
      tokens: this.tokenManager,
      hostInfo: { host: localHostname(), port: this.assets.port },
      logger: this.logger,
    });

    // 9. OutputDispatcher
    this.output = this.deps.output ?? new OutputDispatcherImpl({ logger: this.logger });
    await this.output.init();

    // 10. InputRegistrar
    this.input = this.deps.input ?? new InputRegistrarImpl({ logger: this.logger });
    await this.input.init();

    // 11. ModuleLoader — discover + prepare + init + start
    const userConfig = (await this.persisted.get('modules.disabled')) ?? { disabledSlugs: [] };
    this.modules = new ModuleLoader({
      modulesRoot: modulesRootPath(),
      shared: this.sharedServices(),
      installedTier: 'free',           // ShowX-2 will read real license
      userConfig,
    });
    await this.modules.discoverAndPrepare();
    await this.modules.initAll();
    await this.modules.startAll();

    // 12. Window
    if (!this.deps.skipWindow) {
      this.window = await createMainWindow({ pwaUrl: this.shellUiUrl(), preloadPath: preloadFilePath() });
      registerIpcHandlers({
        modules: this.modules, health: this.health, pairing: this.pairing,
        pins: this.pinManager, persisted: this.persisted, logger: this.logger,
      });
    }

    this.state = 'running';
    this.logger.info('shell.boot.complete', { port: this.assets.port });
  }

  async shutdown(): Promise<void> {
    if (this.state === 'shut_down' || this.state === 'shutting_down') return;
    this.state = 'shutting_down';
    // Reverse order, best-effort. Wrap each in try/catch.
    await safeCall(() => this.modules?.stopAll());
    await safeCall(() => this.modules?.teardownAll());
    await safeCall(() => this.input?.shutdown());
    await safeCall(() => this.output?.shutdown());
    // pairing has no shutdown beyond persisted flush
    await safeCall(() => this.sync?.stop());
    await safeCall(() => this.mdns?.stop());
    await safeCall(() => this.assets?.stop());
    await safeCall(() => this.persisted?.flush());
    await safeCall(() => this.logger?.flush());
    this.state = 'shut_down';
  }

  isShutDown() { return this.state === 'shut_down'; }

  /** Public accessor — exposed for tests + ModuleLoader. */
  sharedServices(): SharedServices { return { logger: this.logger, events: this.events, health: this.health,
    persisted: this.persisted, secrets: this.secrets, output: this.output, input: this.input,
    sync: this.sync, assets: this.assets, mdns: this.mdns, pairing: this.pairing }; }

  private shellUiUrl(): string {
    if (process.env.SHOWX_DEV === '1') return `http://localhost:5174/?mode=shell`;
    return `http://localhost:${this.assets.port}/?mode=shell`;
  }
}

interface ShellDeps {
  logger?: Logger; persisted?: PersistedStore; secrets?: SecretStore;
  events?: EventBus; health?: HealthBus; assets?: AssetServer; mdns?: MdnsService;
  sync?: SyncBroker; tokens?: TokenManager; pins?: PinManager; pairing?: PairingStore;
  output?: OutputDispatcher; input?: InputRegistrar;
  skipWindow?: boolean;            // tests pass true so no BrowserWindow is created
}
```

`safeCall` is a 3-line helper that swallows + logs errors:
```ts
async function safeCall(fn: () => Promise<unknown> | undefined) {
  try { await fn(); } catch (e) { console.error('shutdown step failed', e); }
}
```

### `src/main/src/ui/window.ts`

```ts
export interface MainWindowOpts { pwaUrl: string; preloadPath: string; }

export async function createMainWindow(opts: MainWindowOpts): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 700,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadURL(opts.pwaUrl);
  if (process.env.SHOWX_DEV === '1') win.webContents.openDevTools({ mode: 'detach' });
  return win;
}
```

### `src/main/src/ui/preload.ts`

```ts
import { contextBridge, ipcRenderer } from 'electron';

const showxApi = {
  modules: {
    list: () => ipcRenderer.invoke('modules:list'),
    setDisabled: (slug: string, disabled: boolean) => ipcRenderer.invoke('modules:setDisabled', slug, disabled),
  },
  health: {
    snapshot: () => ipcRenderer.invoke('health:snapshot'),
    onChange: (cb: (snap: unknown) => void) => {
      const listener = (_e: unknown, snap: unknown) => cb(snap);
      ipcRenderer.on('health:change', listener);
      return () => ipcRenderer.off('health:change', listener);
    },
  },
  pairing: {
    initiate: () => ipcRenderer.invoke('pairing:initiate'),
    listDevices: () => ipcRenderer.invoke('pairing:listDevices'),
    revokeDevice: (id: string) => ipcRenderer.invoke('pairing:revokeDevice', id),
  },
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  },
};

contextBridge.exposeInMainWorld('showxApi', showxApi);
export type ShowxApi = typeof showxApi;
```

Re-export `ShowxApi` from `src/shared/index.ts` so the PWA can `import type { ShowxApi } from 'showx-shared'` and `declare global { interface Window { showxApi: ShowxApi } }`.

### `src/main/src/ipc/channels.ts`

A single source of truth for IPC channel names (strings), referenced by both preload and handlers. Constants:
```ts
export const IPC = {
  MODULES_LIST: 'modules:list',
  MODULES_SET_DISABLED: 'modules:setDisabled',
  HEALTH_SNAPSHOT: 'health:snapshot',
  HEALTH_CHANGE: 'health:change',
  PAIRING_INITIATE: 'pairing:initiate',
  PAIRING_LIST_DEVICES: 'pairing:listDevices',
  PAIRING_REVOKE_DEVICE: 'pairing:revokeDevice',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
} as const;
```

### `src/main/src/ipc/index.ts`

```ts
export interface IpcDeps {
  modules: ModuleLoader; health: HealthBus; pairing: PairingStore;
  pins: PinManager; persisted: PersistedStore; logger: Logger;
}

export function registerIpcHandlers(deps: IpcDeps) {
  ipcMain.handle(IPC.MODULES_LIST, async () => deps.modules.listLoaded().map(m => ({
    slug: m.slug, name: m.manifest.name, version: m.manifest.version, tier: m.manifest.tier, state: m.state,
  })));

  ipcMain.handle(IPC.MODULES_SET_DISABLED, async (_e, slug: string, disabled: boolean) => {
    const cur = (await deps.persisted.get('modules.disabled')) ?? { disabledSlugs: [] };
    const set = new Set<string>(cur.disabledSlugs);
    if (disabled) set.add(slug); else set.delete(slug);
    await deps.persisted.set('modules.disabled', { disabledSlugs: [...set] });
    return { ok: true, requiresRestart: true };
  });

  ipcMain.handle(IPC.HEALTH_SNAPSHOT, async () => deps.health.snapshot());
  // broadcast on every health change:
  deps.health.subscribe((snap) => BrowserWindow.getAllWindows().forEach(w => w.webContents.send(IPC.HEALTH_CHANGE, snap)));

  ipcMain.handle(IPC.PAIRING_INITIATE, async () => {
    const rec = deps.pins.generate();
    // QR generation handled by HTTP route; IPC returns the same envelope for in-app display
    return { pin: rec.pin, expires_at: rec.expires_at };
  });
  ipcMain.handle(IPC.PAIRING_LIST_DEVICES, async () => deps.pairing.listDevices());
  ipcMain.handle(IPC.PAIRING_REVOKE_DEVICE, async (_e, id: string) => { await deps.pairing.revokeDevice(id); return { ok: true }; });

  ipcMain.handle(IPC.CONFIG_GET, async (_e, key: string) => deps.persisted.get(key));
  ipcMain.handle(IPC.CONFIG_SET, async (_e, key: string, value: unknown) => { await deps.persisted.set(key, value); return { ok: true }; });
}
```

### Path helpers (small utilities, inline or in `src/main/src/util/paths.ts`)

```ts
function appDataDir(): string { return path.join(app.getPath('userData'), 'persisted'); }
function pwaDistPath(): string { return path.resolve(__dirname, '../../../pwa/dist'); }
function modulesRootPath(): string { return path.resolve(__dirname, '../../modules'); }
function preloadFilePath(): string { return path.resolve(__dirname, 'ui/preload.js'); }
function localHostname(): string { return os.hostname(); }
```

Use `import.meta.url` + `fileURLToPath` instead of `__dirname` for ESM. Or set `"type": "commonjs"` in main if simpler — Electron supports both, decide based on what B001-001 chose. Keep consistent with rest of the codebase; if a conflict, raise in done report.

### Dev mode

`SHOWX_DEV=1 pnpm dev` should:
1. Start Vite dev server for PWA (`pnpm --filter showx-pwa dev`) — separate terminal or via concurrently
2. Start Electron pointing at http://localhost:5174 for hot reload
3. Open devtools by default

Add npm script in `src/main/package.json`:
```
"dev": "SHOWX_DEV=1 electron .",
"start": "electron ."
```

Add root-level script in repo `package.json`:
```
"dev": "concurrently 'pnpm --filter showx-pwa dev' 'pnpm --filter showx-main dev'"
```

## Refer to specs

- `docs/specs/module_loader.md` — Shell satisfies `ModuleLoaderOpts` shape from this spec.
- `docs/specs/pairing_auth.md` — IPC `pairing:*` channels mirror the HTTP route surface.
- `docs/specs/data_model.md` — config keys (`modules.disabled`, etc.) per spec.

## Test plan

`tests/unit/Shell.test.ts` — runs in Vitest under Node, NOT under Electron. Mock electron module via Vitest's module mock:

```ts
vi.mock('electron', () => ({
  app: { whenReady: vi.fn(), getPath: () => os.tmpdir(), on: vi.fn(), exit: vi.fn(), quit: vi.fn() },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
}));
```

Tests:
- Shell.boot() with all dep services mocked + `skipWindow: true` → asserts each service's init/start was called in the documented order. Use a `callOrder: string[]` array fed by each mock.
- Shell.shutdown() called after successful boot → asserts reverse order; each service stop/shutdown called once.
- Service-N init throws → Shell.boot rejects; subsequent Shell.shutdown() still tears down services 1..N-1 cleanly (no double-shutdown of N+).
- Shell.boot() called twice → second call rejects with "Shell.boot called in state running".
- IPC handler registration: with `skipWindow: false` and a mocked `BrowserWindow`, assert `ipcMain.handle` called for each of the 8 channels in IPC constants.

## Out of scope

- Actual Shell UI (React components in PWA) — B001-012 owns the skeleton; ShowX-3 owns the cuelist
- Module sidebar enable/disable visual — IPC is wired; React UI later
- App auto-update flow (electron-updater) — ShowX-6
- Code signing / notarization config — ShowX-6
- macOS menu bar customization beyond default
- Multi-window support (status display on second monitor, etc.) — future
- Crash reporter wiring
- License gating (installedTier stays 'free' hardcoded — ShowX-2 owns license)

## Notes for Critic

- Boot order is THE most important thing to verify. Walk it step by step against the dependency graph in the bundle definition. A single out-of-order step (e.g. AssetServer before Logger) will manifest as cryptic test failures.
- `safeCall` wrapping in shutdown is non-negotiable. Confirm there's no `await this.X.stop()` without a try/catch around it.
- preload.ts MUST be built to `.js` before Electron can load it. Confirm tsconfig includes `src/main/src/ui/preload.ts` in compilation output, and the path helper points at the compiled `.js` file, not the source `.ts`.
- contextBridge.exposeInMainWorld is the ONLY safe way to expose APIs from preload — no `window.foo = ...`. Verify Forge didn't shortcut.
- BrowserWindow webPreferences: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` are all mandatory. Anything weaker is a security hole.
- `installedTier: 'free'` hardcoded is acceptable for ShowX-1 but MUST be flagged with a `TODO(ShowX-2)` comment.
- Tests under Vitest + mocked electron — confirm the mocks cover all electron surface the Shell touches. Missing mock → boot will explode on real electron import.
- Confirm the dev URL (`SHOWX_DEV=1`) really hits the Vite dev server. Forge may inadvertently point at the served bundle in both modes.
