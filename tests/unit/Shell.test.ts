import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest';
import type { Subscription } from 'showx-shared';

// ── Mock electron before any imports that transitively touch it ───────────────

vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn().mockResolvedValue(undefined),
    getPath: vi.fn(() => '/tmp'),
    isPackaged: false,
    on: vi.fn(),
    exit: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: { getAllWindows: vi.fn().mockReturnValue([]), getFocusedWindow: vi.fn(() => null) },
  Menu: { buildFromTemplate: vi.fn(() => ({})), setApplicationMenu: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
}));

vi.mock('../../src/main/src/ui/window.js', () => ({
  createMainWindow: vi.fn().mockResolvedValue({
    loadURL: vi.fn().mockResolvedValue(undefined),
    webContents: { openDevTools: vi.fn(), send: vi.fn() },
  }),
}));

// ── Now import the code under test ────────────────────────────────────────────

import { Shell, type ShellDeps, type ShellConfigStore } from '../../src/main/src/Shell.js';
import { IPC } from '../../src/main/src/ipc/channels.js';

// ── Mock factories ────────────────────────────────────────────────────────────

function noopSub(): Subscription {
  return { id: 'noop', unsubscribe: () => {} };
}

function makeMocks(callOrder: string[]): ShellDeps & { callOrder: string[] } {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    close: vi.fn(() => { callOrder.push('logger.close'); }),
  } as unknown as ShellDeps['logger'] & { close: MockInstance };

  const shellConfig: ShellConfigStore = {
    init: vi.fn(async () => { callOrder.push('shellConfig.init'); }),
    getDisabledSlugs: vi.fn(() => [] as string[]),
    setDisabledSlugs: vi.fn(async () => {}),
    get: vi.fn((_key: string) => undefined as unknown),
    set: vi.fn(async () => {}),
  };

  const shellSecrets = {
    get: vi.fn(async () => undefined as string | undefined),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => [] as string[]),
  };

  const events = {
    publish: vi.fn(),
    subscribe: vi.fn(() => noopSub()),
    subscribePattern: vi.fn(() => noopSub()),
  };

  const health = {
    report: vi.fn(),
    observe: vi.fn(() => noopSub()),
    aggregate: vi.fn(() => 'healthy' as const),
    snapshot: vi.fn(() => []),
    observeAggregate: vi.fn(() => noopSub()),
  };

  const assets = {
    start: vi.fn(async () => { callOrder.push('assets.start'); }),
    stop: vi.fn(async () => { callOrder.push('assets.stop'); }),
    port: vi.fn(() => 5300),
    baseUrl: vi.fn(() => 'http://localhost:5300'),
    httpServer: vi.fn(() => ({ on: vi.fn() } as unknown as import('node:http').Server)),
    expressApiRouter: { post: vi.fn(), get: vi.fn(), delete: vi.fn(), put: vi.fn(), use: vi.fn() } as unknown,
    registerStaticRoute: vi.fn(() => noopSub()),
    registerApiRoute: vi.fn(() => noopSub()),
  };

  const mdns = {
    advertise: vi.fn((..._args: unknown[]) => {
      callOrder.push('mdns.advertise');
      return noopSub();
    }),
    browse: vi.fn(() => noopSub()),
    stop: vi.fn(async () => { callOrder.push('mdns.stop'); }),
  };

  const sync = {
    attach: vi.fn((..._args: unknown[]) => { callOrder.push('sync.attach'); }),
    stop: vi.fn(async () => { callOrder.push('sync.stop'); }),
    setValidator: vi.fn(),
    openDocument: vi.fn(() => ({ name: '', doc: null, destroy: vi.fn() })),
    closeDocument: vi.fn(),
    subscribeAwareness: vi.fn(() => noopSub()),
    publishSideChannel: vi.fn(),
    subscribeSideChannel: vi.fn(() => noopSub()),
  };

  const tokenManager = {
    init: vi.fn(async () => { callOrder.push('tokenManager.init'); }),
    sign: vi.fn(() => 'tok'),
    validate: vi.fn(() => ({ device_id: 'd', display_name: 'n', owned_departments: [], tier: 'free' as const, iat: 0 })),
    revoke: vi.fn(async () => {}),
    isRevoked: vi.fn(() => false),
    hashToken: vi.fn(() => 'hash'),
  };

  const pinManager = {
    generate: vi.fn(() => ({
      pin: '000000',
      expires_at: Date.now() + 300_000,
      claimed_at: null as number | null,
      attempts: 0,
    })),
    claim: vi.fn(),
    cleanupExpired: vi.fn(),
    activePinCount: vi.fn(() => 0),
    registerTestPin: vi.fn(),
  };

  const pairing = {
    init: vi.fn(async () => { callOrder.push('pairing.init'); }),
    listDevices: vi.fn(() => []),
    getDevice: vi.fn(() => null),
    addDevice: vi.fn(async (d: unknown) => d),
    updateLastSeen: vi.fn(async () => {}),
    revokeDevice: vi.fn(async () => {}),
    resolveToken: vi.fn(() => ({ device_id: 'd', display_name: 'n', owned_departments: [], tier: 'free' as const, last_seen: null, token_hash: 'h', created_at: 0 })),
  };

  const output = {
    send: vi.fn(async () => ({ ok: true, transport: 'osc' as const, latencyMs: 0 })),
    claim: vi.fn(async () => ({ id: 'c', slug: 's', destination: {} as unknown as import('showx-shared').TransportDestination })),
    release: vi.fn(async () => {}),
    poolStatus: vi.fn(() => ({ oscConnections: [], midiOutputs: [], dmxUniverses: [] })),
  };

  const input = {
    init: vi.fn(async () => { callOrder.push('input.init'); }),
    shutdown: vi.fn(async () => { callOrder.push('input.shutdown'); }),
    subscribeOsc: vi.fn(async () => noopSub()),
    subscribeMidi: vi.fn(async () => noopSub()),
    listActiveListeners: vi.fn(() => []),
  };

  const modules = {
    discoverAndPrepare: vi.fn(async () => { callOrder.push('modules.discoverAndPrepare'); }),
    initAll: vi.fn(async () => { callOrder.push('modules.initAll'); }),
    startAll: vi.fn(async () => { callOrder.push('modules.startAll'); }),
    stopAll: vi.fn(async () => { callOrder.push('modules.stopAll'); }),
    teardownAll: vi.fn(async () => { callOrder.push('modules.teardownAll'); }),
    listLoaded: vi.fn(() => []),
  };

  return {
    callOrder,
    logger: logger as unknown as ShellDeps['logger'],
    shellConfig,
    shellSecrets: shellSecrets as unknown as ShellDeps['shellSecrets'],
    events: events as unknown as ShellDeps['events'],
    health: health as unknown as ShellDeps['health'],
    assets: assets as unknown as ShellDeps['assets'],
    mdns: mdns as unknown as ShellDeps['mdns'],
    sync: sync as unknown as ShellDeps['sync'],
    tokenManager: tokenManager as unknown as ShellDeps['tokenManager'],
    pinManager: pinManager as unknown as ShellDeps['pinManager'],
    pairing: pairing as unknown as ShellDeps['pairing'],
    output: output as unknown as ShellDeps['output'],
    input: input as unknown as ShellDeps['input'],
    modules: modules as unknown as ShellDeps['modules'],
    skipWindow: true,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Shell', () => {
  let callOrder: string[];
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    callOrder = [];
    mocks = makeMocks(callOrder);
  });

  it('boot() — correct service init order', async () => {
    const shell = new Shell(mocks);
    await shell.boot();

    expect(callOrder).toEqual([
      'shellConfig.init',
      'assets.start',
      'mdns.advertise',
      'sync.attach',
      'tokenManager.init',
      'pairing.init',
      'input.init',
      'modules.discoverAndPrepare',
      'modules.initAll',
      'modules.startAll',
    ]);
  });

  it('shutdown() — reverse order after successful boot', async () => {
    const shell = new Shell(mocks);
    await shell.boot();
    callOrder.length = 0; // reset — only track shutdown calls

    await shell.shutdown();

    expect(callOrder).toEqual([
      'modules.stopAll',
      'modules.teardownAll',
      'input.shutdown',
      'sync.stop',
      'mdns.stop',
      'assets.stop',
      'logger.close',
    ]);
  });

  it('shutdown() is idempotent — second call is a no-op', async () => {
    const shell = new Shell(mocks);
    await shell.boot();
    await shell.shutdown();
    await shell.shutdown();

    expect(mocks.modules!.stopAll).toHaveBeenCalledTimes(1);
  });

  it('boot() called twice → second call rejects with state error', async () => {
    const shell = new Shell(mocks);
    await shell.boot();

    await expect(shell.boot()).rejects.toThrow('Shell.boot called in state running');
  });

  it('service init failure → boot rejects; prior services still shut down', async () => {
    (mocks.input!.init as unknown as MockInstance).mockRejectedValue(
      new Error('input init failed'),
    );
    const shell = new Shell(mocks);

    await expect(shell.boot()).rejects.toThrow('input init failed');

    callOrder.length = 0;
    await shell.shutdown();

    // modules were never started, so stopAll/teardownAll should NOT be called
    expect(callOrder).not.toContain('modules.stopAll');
    expect(callOrder).not.toContain('modules.teardownAll');

    // services that booted before the failure must be shut down
    expect(callOrder).toContain('assets.stop');
    expect(callOrder).toContain('sync.stop');
    expect(callOrder).toContain('mdns.stop');
  });

  it('isShutDown() reflects lifecycle state', async () => {
    const shell = new Shell(mocks);
    expect(shell.isShutDown()).toBe(false);
    await shell.boot();
    expect(shell.isShutDown()).toBe(false);
    await shell.shutdown();
    expect(shell.isShutDown()).toBe(true);
  });

  it('IPC handlers registered for all 8 invoke channels when skipWindow=false', async () => {
    const ipcBridge = { handle: vi.fn() };
    const shell = new Shell({ ...mocks, skipWindow: false, ipcBridge });
    await shell.boot();

    const registered = (ipcBridge.handle as unknown as MockInstance).mock.calls.map(
      (c: unknown[]) => c[0],
    ) as string[];

    const invokeChannels = Object.values(IPC).filter((ch) => ch !== IPC.HEALTH_CHANGE);
    for (const ch of invokeChannels) {
      expect(registered).toContain(ch);
    }
  });
});
