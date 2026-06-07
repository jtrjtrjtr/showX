import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type {
  PairingStore as ShowxPairingStore,
  PairingClaims,
  PairingToken,
  PairedDevice,
  ModuleTier,
  Subscription,
  InputRegistrar as ShowxInputRegistrar,
  InputSpec,
  InputHandler,
} from 'showx-shared';
import { Logger } from './shared/Logger.js';
import { EventBus } from './shared/EventBus.js';
import { HealthBus } from './shared/HealthBus.js';
import { PersistedStore } from './shared/PersistedStore.js';
import { SecretStore } from './shared/SecretStore.js';
import { AssetServer } from './shared/AssetServer.js';
import { MdnsService } from './shared/MdnsService.js';
import { SyncBroker } from './shared/SyncBroker.js';
import { PairingStoreImpl, type PairingStore } from './shared/PairingStore.js';
import { TokenManagerImpl, type TokenManager } from './shared/pairing/tokenManager.js';
import { PinManagerImpl, type PinManager } from './shared/pairing/pinManager.js';
import { mountPairingRoutes } from './shared/pairing/api.js';
import { OutputDispatcher } from './shared/OutputDispatcher.js';
import { InputRegistrarImpl } from './shared/InputRegistrar.js';
import { ModuleLoader, type SharedServices } from './ModuleLoader.js';
import { resolvePaths, type PathLayout } from './shared/paths.js';
import { shellVersion } from './shared/version.js';
import { createMainWindow } from './ui/window.js';
import { registerIpcHandlers, type IpcMainBridge } from './ipc/index.js';
import { registerUiPanelBridge } from './ipc/uiPanelBridge.js';

// ── Shell config store ──────────────────────────────────────────────────────

const ShellConfigZ = z.object({
  disabledSlugs: z.array(z.string()),
  kv: z.record(z.string(), z.unknown()),
});
type ShellConfigData = z.infer<typeof ShellConfigZ>;

const SHELL_CONFIG_SCHEMA = {
  schemaVersion: 1,
  zodSchema: ShellConfigZ,
  defaults: { disabledSlugs: [], kv: {} } satisfies ShellConfigData,
};

export interface ShellConfigStore {
  init(): Promise<void>;
  getDisabledSlugs(): string[];
  setDisabledSlugs(slugs: string[]): Promise<void>;
  get(key: string): unknown;
  set(key: string, value: unknown): Promise<void>;
}

class ShellConfigStoreImpl implements ShellConfigStore {
  private data: ShellConfigData | null = null;

  constructor(private readonly store: PersistedStore) {}

  async init(): Promise<void> {
    this.data = await this.store.load(SHELL_CONFIG_SCHEMA);
  }

  getDisabledSlugs(): string[] {
    return this.data?.disabledSlugs ?? [];
  }

  async setDisabledSlugs(slugs: string[]): Promise<void> {
    if (!this.data) throw new Error('ShellConfigStore not initialized');
    this.data.disabledSlugs = slugs;
    await this.store.save(this.data);
  }

  get(key: string): unknown {
    return this.data?.kv[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    if (!this.data) throw new Error('ShellConfigStore not initialized');
    this.data.kv = { ...this.data.kv, [key]: value };
    await this.store.save(this.data);
  }
}

// ── PairingStore adapter (showx-shared interface) ───────────────────────────

class PairingStoreAdapter implements ShowxPairingStore {
  constructor(
    private readonly store: PairingStore,
  ) {}

  async validateToken(token: string): Promise<PairingClaims | null> {
    try {
      const device = this.store.resolveToken(token);
      return {
        deviceId: device.device_id,
        roles: device.owned_departments,
        tier: device.tier as ModuleTier,
        expiresAt: 0,
      };
    } catch {
      return null;
    }
  }

  async issue(
    deviceLabel: string,
    roles: string[],
    tier: ModuleTier,
  ): Promise<PairingToken> {
    // Module-level token issuance uses the PIN flow (HTTP /api/pairing/claim).
    // Direct issuance via module API is not supported in ShowX-1.
    throw new Error(
      `Module-level token issuance not supported in ShowX-1; use /api/pairing/claim. label=${deviceLabel} roles=${roles.join()} tier=${tier}`,
    );
  }

  async revoke(deviceId: string): Promise<void> {
    await this.store.revokeDevice(deviceId);
  }

  async list(): Promise<PairedDevice[]> {
    return this.store.listDevices().map((d) => ({
      deviceId: d.device_id,
      label: d.display_name,
      roles: d.owned_departments,
      tier: d.tier as ModuleTier,
      pairedAt: d.created_at,
      lastSeenAt: d.last_seen ?? undefined,
    }));
  }
}

// ── InputRegistrar stub (showx-shared interface) ────────────────────────────
// No modules in ShowX-1 use input routing; stub satisfies the interface.

class InputRegistrarStub implements ShowxInputRegistrar {
  listen(_spec: InputSpec, _handler: InputHandler): Subscription {
    return { id: 'noop-input', unsubscribe: () => {} };
  }
  unlisten(_sub: Subscription): void {}
}

// ── Path helpers ─────────────────────────────────────────────────────────────

function pwaDistPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Packed (in app.asar): pwa flattened to <asar>/pwa per electron-builder files map
  // Dev: pwa is at <repo>/pwa/dist, __dirname is <repo>/src/main/dist/
  const packed = __dirname.includes('.asar');
  return packed
    ? resolve(__dirname, 'pwa')
    : resolve(__dirname, '../../../pwa/dist');
}

function modulesRootPath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Packed: modules bundled to <asar>/modules via electron-builder files map
  // Dev: modules at <repo>/src/modules; __dirname is <repo>/src/main/dist/
  const packed = __dirname.includes('.asar');
  return packed
    ? resolve(__dirname, 'modules')
    : resolve(__dirname, '../../modules');
}

function preloadFilePath(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return resolve(__dirname, 'ui/preload.js');
}

// ── safeCall ─────────────────────────────────────────────────────────────────

async function safeCall(fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error('shutdown step failed', e);
  }
}

// ── ShellState ────────────────────────────────────────────────────────────────

type ShellState = 'cold' | 'booting' | 'running' | 'boot_failed' | 'shutting_down' | 'shut_down';

// ── ShellDeps (DI interface for testing) ─────────────────────────────────────

export interface ShellDeps {
  layout?: PathLayout;
  logger?: Logger;
  shellConfig?: ShellConfigStore;
  shellSecrets?: SecretStore;
  events?: EventBus;
  health?: HealthBus;
  assets?: AssetServer;
  mdns?: MdnsService;
  sync?: SyncBroker;
  tokenManager?: TokenManager;
  pinManager?: PinManager;
  pairing?: PairingStoreImpl;
  pairingPersisted?: PersistedStore;
  output?: OutputDispatcher;
  input?: InputRegistrarImpl;
  modules?: ModuleLoader;
  ipcBridge?: IpcMainBridge;
  skipWindow?: boolean;
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export class Shell {
  private state: ShellState = 'cold';

  private layout!: PathLayout;
  private logger!: Logger;
  private shellConfig!: ShellConfigStore;
  private shellSecrets!: SecretStore;
  private events!: EventBus;
  private health!: HealthBus;
  private assets!: AssetServer;
  private mdns!: MdnsService;
  private sync!: SyncBroker;
  private tokenManager!: TokenManager;
  private pinManager!: PinManager;
  private pairing!: PairingStoreImpl;
  private output!: OutputDispatcher;
  private input: InputRegistrarImpl | null = null;
  private modules: ModuleLoader | null = null;

  constructor(private readonly deps: ShellDeps = {}) {}

  async boot(): Promise<void> {
    if (this.state !== 'cold') {
      throw new Error(`Shell.boot called in state ${this.state}`);
    }
    this.state = 'booting';

    try {
      await this.doBoot();
      this.state = 'running';
    } catch (err) {
      this.state = 'boot_failed';
      throw err;
    }
  }

  private async doBoot(): Promise<void> {
    // 1. Layout
    this.layout = this.deps.layout ?? resolvePaths();

    // 2. Logger
    this.logger = this.deps.logger ?? new Logger();

    // 3. Shell config store (PersistedStore-backed, slug='shell')
    this.shellConfig =
      this.deps.shellConfig ??
      new ShellConfigStoreImpl(new PersistedStore('shell', this.layout, this.logger));
    await this.shellConfig.init();

    // 4. SecretStore for shell (holds HMAC secret for TokenManager)
    this.shellSecrets = this.deps.shellSecrets ?? new SecretStore('shell', this.layout);

    // 5. EventBus + HealthBus (no async init)
    this.events = this.deps.events ?? new EventBus(this.logger);
    this.health = this.deps.health ?? new HealthBus(this.events, this.logger);

    // 6. AssetServer
    const isProd = process.env['SHOWX_DEV'] !== '1';
    const explicitPort = process.env['SHOWX_PORT'] ? Number(process.env['SHOWX_PORT']) : undefined;
    this.assets =
      this.deps.assets ??
      new AssetServer({
        port: explicitPort,
        mode: isProd
          ? { kind: 'prod', pwaDir: pwaDistPath() }
          : { kind: 'dev', viteUrl: 'http://localhost:5174' },
      });
    await this.assets.start();

    // 7. mDNS — advertise ShowX service on LAN
    this.mdns = this.deps.mdns ?? new MdnsService({ log: this.logger });
    this.mdns.advertise(`ShowX-${os.hostname()}`, this.assets.port(), {
      role: 'foh',
      tier: 'free',
      version: shellVersion().version,
      hostname: os.hostname(),
      fingerprint: '', // TODO(ShowX-2): derive from local secret
    });

    // 8. SyncBroker — attach to AssetServer's HTTP server for WebSocket upgrades
    this.sync = this.deps.sync ?? new SyncBroker({ log: this.logger });
    this.sync.attach(this.assets.httpServer());

    // 9. Pairing stack
    this.tokenManager =
      this.deps.tokenManager ?? new TokenManagerImpl(this.shellSecrets);
    await this.tokenManager.init();

    this.pinManager = this.deps.pinManager ?? new PinManagerImpl();

    // Test-mode: pre-register a known PIN so tests can pair without UI
    const testPin = process.env['SHOWX_PAIRING_TEST_PIN'];
    if (testPin) {
      this.pinManager.registerTestPin(testPin);
      this.logger.info('test-mode: registered test pairing PIN', { pin: testPin });
    }

    const pairingPersisted =
      this.deps.pairingPersisted ?? new PersistedStore('pairing', this.layout, this.logger);
    this.pairing =
      this.deps.pairing ?? new PairingStoreImpl(pairingPersisted, this.tokenManager);
    await this.pairing.init();

    mountPairingRoutes(this.assets.expressApiRouter, {
      pairing: this.pairing,
      pins: this.pinManager,
      tokens: this.tokenManager,
      hostInfo: { host: os.hostname(), port: this.assets.port() },
      logger: this.logger,
    });

    // 10. OutputDispatcher
    this.output = this.deps.output ?? new OutputDispatcher('shell');

    // 11. InputRegistrar
    this.input = this.deps.input ?? new InputRegistrarImpl(this.logger);
    await this.input.init();

    // 12. ModuleLoader
    const disabledSlugs = this.shellConfig.getDisabledSlugs();
    const loaderShared: SharedServices = {
      logger: this.logger,
      events: this.events,
      health: this.health,
      layout: this.layout,
      shellVersion: shellVersion().version,
      output: this.output,
      input: new InputRegistrarStub(),
      sync: this.sync,
      assets: this.assets as unknown as SharedServices['assets'],
      mdns: this.mdns,
      pairing: new PairingStoreAdapter(this.pairing),
    };
    this.modules =
      this.deps.modules ??
      new ModuleLoader({
        modulesRoot: modulesRootPath(),
        shared: loaderShared,
        installedTier: 'free', // TODO(ShowX-2): read real license
        userConfig: { disabledSlugs },
      });
    await this.modules.discoverAndPrepare();
    await this.modules.initAll();
    await this.modules.startAll();

    // 13. Browser window + IPC
    if (!this.deps.skipWindow) {
      const pwaUrl =
        process.env['SHOWX_DEV'] === '1'
          ? `http://localhost:5174/?mode=shell`
          : `http://localhost:${this.assets.port()}/?mode=shell`;
      await createMainWindow({
        pwaUrl,
        preloadPath: preloadFilePath(),
      });
      registerIpcHandlers({
        modules: this.modules,
        health: this.health,
        pairing: this.pairing,
        pins: this.pinManager,
        shellConfig: this.shellConfig,
        logger: this.logger,
      }, this.deps.ipcBridge);
      registerUiPanelBridge(this.shellConfig, this.deps.ipcBridge);
    }
  }

  async shutdown(): Promise<void> {
    if (this.state === 'shut_down' || this.state === 'shutting_down') return;
    this.state = 'shutting_down';

    // Reverse boot order, best-effort
    await safeCall(() => this.modules?.stopAll());
    await safeCall(() => this.modules?.teardownAll());
    await safeCall(() => this.input?.shutdown());
    // OutputDispatcher has no stop — pools release resources on GC
    await safeCall(() => (this.sync as unknown as { stop?: () => Promise<void> })?.stop?.());
    await safeCall(() => this.mdns?.stop());
    await safeCall(() => this.assets?.stop());
    // PersistedStore writes are atomic on each save — no explicit flush needed
    await safeCall(() => this.logger?.close());

    this.state = 'shut_down';
  }

  isShutDown(): boolean {
    return this.state === 'shut_down';
  }

  /** Shared services passed to module contexts. Only valid after boot(). */
  sharedServices(): SharedServices {
    if (this.state !== 'running') {
      throw new Error('sharedServices() called before boot() completed');
    }
    return {
      logger: this.logger,
      events: this.events,
      health: this.health,
      layout: this.layout,
      shellVersion: shellVersion().version,
      output: this.output,
      input: new InputRegistrarStub(),
      sync: this.sync,
      assets: this.assets as unknown as SharedServices['assets'],
      mdns: this.mdns,
      pairing: new PairingStoreAdapter(this.pairing),
    };
  }
}
