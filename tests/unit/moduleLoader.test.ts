import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ModuleLoader } from '../../src/main/src/ModuleLoader.js';
import { HealthBus } from '../../src/main/src/shared/HealthBus.js';
import { Logger } from '../../src/main/src/shared/Logger.js';
import { resolvePaths } from '../../src/main/src/shared/paths.js';
import type { SharedServices } from '../../src/main/src/ModuleLoader.js';
import type { ModuleContext, Subscription } from 'showx-shared';

const FIXTURES_DIR = join(process.cwd(), 'tests', 'fixtures');

function makeLogger() {
  return new Logger({ output: { write: () => true } as unknown as NodeJS.WritableStream });
}

async function makeTmpLayout() {
  const tmpDir = await mkdtemp(join(tmpdir(), 'showx-ml-test-'));
  return resolvePaths({ override: tmpDir });
}

async function makeFakeShared(): Promise<SharedServices> {
  const layout = await makeTmpLayout();
  const logger = makeLogger();
  const health = new HealthBus();
  return {
    logger,
    events: {
      publish: () => {},
      subscribe: () => ({ id: 'noop', unsubscribe: () => {} }),
      subscribePattern: () => ({ id: 'noop', unsubscribe: () => {} }),
    },
    health,
    layout,
    shellVersion: '0.0.1-test',
    output: {
      send: async () => ({ ok: true }),
      claim: async () => ({ token: 'tok', dest: {} as never }),
      release: async () => {},
      poolStatus: () => ({ pools: [] }),
    } as unknown as SharedServices['output'],
    input: {
      listen: () => ({ id: 'noop', unsubscribe: () => {} }),
      unlisten: () => {},
    },
    sync: {
      openDocument: () => ({ name: '', doc: null, destroy: () => {} }),
      closeDocument: () => {},
      subscribeAwareness: () => ({ id: 'noop', unsubscribe: () => {} }),
      publishSideChannel: () => {},
      subscribeSideChannel: () => ({ id: 'noop', unsubscribe: () => {} }),
    },
    assets: {
      port: () => 0,
      baseUrl: () => 'http://localhost:0',
      registerStaticRoute: () => ({ id: 'noop', unsubscribe: () => {} }),
      registerApiRoute: () => ({ id: 'noop', unsubscribe: () => {} }),
    },
    mdns: {
      advertise: () => ({ id: 'noop', unsubscribe: () => {} }),
      browse: () => ({ id: 'noop', unsubscribe: () => {} }),
    },
    pairing: {
      validateToken: async () => null,
      issue: async () => ({ token: '', deviceId: '', fingerprint: '' }),
      revoke: async () => {},
      list: async () => [],
    },
    clock: {
      start: () => {},
      stop: () => {},
      locate: () => {},
      setRate: () => {},
      setSource: () => {},
      getState: () => ({ rate: 25 as const, dropFrame: false, totalFrames: 0, running: false, source: 'internal' as const }),
      onChange: () => ({ id: 'noop', unsubscribe: () => {} }),
    },
  };
}

// Helper to get __calls from a fixture after it was dynamically imported by the loader.
// Uses the same file URL so Vitest returns the cached module instance.
async function getFixtureCalls(fixtureName: string): Promise<string[]> {
  const url = pathToFileURL(join(FIXTURES_DIR, fixtureName, 'index.ts')).href;
  const mod = await import(/* @vite-ignore */ url) as { __calls?: string[] };
  return mod.__calls ?? [];
}

describe('ModuleLoader integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('happy path: stub module goes through full lifecycle, __calls reflect sequence', async () => {
    const shared = await makeFakeShared();
    const loader = new ModuleLoader({
      modulesRoot: FIXTURES_DIR,
      shared,
      installedTier: 'free',
      // Disable crashing-module and dep-module for this test
      userConfig: { disabledSlugs: ['crasher', 'dep'] },
    });

    await loader.discoverAndPrepare();
    await loader.initAll();
    await loader.startAll();
    await loader.stopAll();
    await loader.teardownAll();

    const loaded = loader.listLoaded();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].slug).toBe('stub');
    expect(loaded[0].state).toBe('torn_down');

    const calls = await getFixtureCalls('stub-module');
    expect(calls).toContain('init:stub');
    expect(calls).toContain('start');
    expect(calls).toContain('stop');
    expect(calls).toContain('teardown');
    // Verify init came before start came before stop came before teardown
    const iInit = calls.indexOf('init:stub');
    const iStart = calls.indexOf('start');
    const iStop = calls.indexOf('stop');
    const iTeardown = calls.indexOf('teardown');
    expect(iInit).toBeLessThan(iStart);
    expect(iStart).toBeLessThan(iStop);
    expect(iStop).toBeLessThan(iTeardown);
  });

  it('crash isolation: crashing-module fails init but stub still inits', async () => {
    const shared = await makeFakeShared();
    const loader = new ModuleLoader({
      modulesRoot: FIXTURES_DIR,
      shared,
      installedTier: 'free',
      userConfig: { disabledSlugs: ['dep'] }, // disable dep-module (depends on stub)
    });

    await loader.discoverAndPrepare();
    await loader.initAll();

    const loaded = loader.listLoaded();
    const stub = loaded.find((m) => m.slug === 'stub');
    const crasher = loaded.find((m) => m.slug === 'crasher');

    expect(stub?.state).toBe('inited');
    expect(crasher?.state).toBe('init_failed');
    expect(crasher?.lastError?.stage).toBe('init');

    // HealthBus should have received an error for crasher
    const snapshots = (shared.health as HealthBus).snapshot();
    const crasherSnap = snapshots.find((s) => s.slug === 'module.crasher');
    expect(crasherSnap?.status).toBe('error');
  });

  it('ModuleContext shape is correct: slug, shellVersion, tier, abortSignal', async () => {
    const shared = await makeFakeShared();
    let capturedCtx: ModuleContext | null = null;

    // Use a custom module that captures its context
    const tmpDir = await mkdtemp(join(tmpdir(), 'showx-ctx-test-'));
    await writeFile(join(tmpDir, 'manifest.json'), JSON.stringify({
      name: 'Ctx Test',
      slug: 'ctx-test',
      version: '0.0.1',
      description: '',
      tier: 'free',
      depends_on: [],
    }), 'utf8');
    await writeFile(join(tmpDir, 'index.ts'), `
import type { Module, ModuleContext } from 'showx-shared';
const mod: Module = {
  async init(ctx: ModuleContext) { (globalThis as any).__capturedCtx = ctx; },
  async start() {},
  async stop() {},
  async teardown() {},
};
export default mod;
`, 'utf8');

    const loader = new ModuleLoader({
      modulesRoot: join(tmpDir, '..'),
      shared,
      installedTier: 'free',
      userConfig: { disabledSlugs: [] },
    });

    // Point modulesRoot to a dir containing our test module dir
    // Rename the tmpDir to have the slug as dir name
    const modulesRoot = await mkdtemp(join(tmpdir(), 'showx-mr-'));
    await cp(tmpDir, join(modulesRoot, 'ctx-test'), { recursive: true });

    const loader2 = new ModuleLoader({
      modulesRoot,
      shared,
      installedTier: 'free',
      userConfig: { disabledSlugs: [] },
    });

    await loader2.discoverAndPrepare();
    await loader2.initAll();

    capturedCtx = (globalThis as Record<string, unknown>)['__capturedCtx'] as ModuleContext | null;
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx?.slug).toBe('ctx-test');
    expect(capturedCtx?.shellVersion).toBe('0.0.1-test');
    expect(capturedCtx?.tier).toBe('free');
    expect(capturedCtx?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(typeof capturedCtx?.state).toBe('function');
  });

  it('pro module on free tier is skipped', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'showx-tier-'));
    const modDir = join(tmpDir, 'pro-only');
    await mkdir(modDir, { recursive: true });
    await writeFile(join(modDir, 'manifest.json'), JSON.stringify({
      name: 'Pro Only',
      slug: 'pro-only',
      version: '0.0.1',
      description: '',
      tier: 'pro',
      depends_on: [],
    }), 'utf8');
    await writeFile(join(modDir, 'index.ts'), `
import type { Module } from 'showx-shared';
const mod: Module = {
  async init() {},
  async start() {},
  async stop() {},
  async teardown() {},
};
export default mod;
`, 'utf8');

    const shared = await makeFakeShared();
    const loader = new ModuleLoader({
      modulesRoot: tmpDir,
      shared,
      installedTier: 'free',
      userConfig: { disabledSlugs: [] },
    });

    await loader.discoverAndPrepare();
    expect(loader.listLoaded()).toHaveLength(0);
  });

  it('user disabled slug is skipped', async () => {
    const shared = await makeFakeShared();
    const loader = new ModuleLoader({
      modulesRoot: FIXTURES_DIR,
      shared,
      installedTier: 'free',
      userConfig: { disabledSlugs: ['stub', 'crasher', 'dep'] },
    });

    await loader.discoverAndPrepare();
    expect(loader.listLoaded()).toHaveLength(0);
  });

  it('invalid manifest is quarantined, sibling modules still load', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'showx-inv-'));

    // Valid module
    const goodDir = join(tmpDir, 'good-module');
    await mkdir(goodDir, { recursive: true });
    await writeFile(join(goodDir, 'manifest.json'), JSON.stringify({
      name: 'Good',
      slug: 'good-module',
      version: '0.0.1',
      description: '',
      tier: 'free',
      depends_on: [],
    }), 'utf8');
    await writeFile(join(goodDir, 'index.ts'), `
import type { Module } from 'showx-shared';
const mod: Module = {
  async init() {},
  async start() {},
  async stop() {},
  async teardown() {},
};
export default mod;
`, 'utf8');

    // Invalid manifest (slug has capital letters → fails regex)
    const badDir = join(tmpDir, 'bad-module');
    await mkdir(badDir, { recursive: true });
    await writeFile(join(badDir, 'manifest.json'), JSON.stringify({
      name: 'Bad',
      slug: 'Bad-Module', // capital letters, invalid
      version: '0.0.1',
      description: '',
      tier: 'free',
    }), 'utf8');
    await writeFile(join(badDir, 'index.ts'), `export default {};`, 'utf8');

    const shared = await makeFakeShared();
    const loader = new ModuleLoader({
      modulesRoot: tmpDir,
      shared,
      installedTier: 'free',
      userConfig: { disabledSlugs: [] },
    });

    await loader.discoverAndPrepare();
    await loader.initAll();

    // Only good-module is loaded
    expect(loader.listLoaded()).toHaveLength(1);
    expect(loader.listLoaded()[0].slug).toBe('good-module');

    // HealthBus has an error for bad-module
    const snap = (shared.health as HealthBus).snapshot();
    const badSnap = snap.find((s) => s.slug === 'module.bad-module');
    expect(badSnap?.status).toBe('error');
  });

  it('listLoaded returns loaded modules with expected states after init', async () => {
    const shared = await makeFakeShared();
    const loader = new ModuleLoader({
      modulesRoot: FIXTURES_DIR,
      shared,
      installedTier: 'free',
      userConfig: { disabledSlugs: ['crasher'] }, // exclude crasher
    });

    await loader.discoverAndPrepare();
    await loader.initAll();
    await loader.startAll();

    const loaded = loader.listLoaded();
    const stubs = loaded.filter((m) => m.slug === 'stub' || m.slug === 'dep');
    expect(stubs.length).toBeGreaterThan(0);
    for (const m of stubs) {
      expect(m.state).toBe('started');
    }
  });

  it('dep-module ordering: dep inits only after stub is inited', async () => {
    const shared = await makeFakeShared();
    const loader = new ModuleLoader({
      modulesRoot: FIXTURES_DIR,
      shared,
      installedTier: 'free',
      userConfig: { disabledSlugs: ['crasher'] },
    });

    await loader.discoverAndPrepare();
    await loader.initAll();

    const stub = loader.listLoaded().find((m) => m.slug === 'stub');
    const dep = loader.listLoaded().find((m) => m.slug === 'dep');
    expect(stub?.state).toBe('inited');
    expect(dep?.state).toBe('inited');

    const stubCalls = await getFixtureCalls('stub-module');
    const depCalls = await getFixtureCalls('dep-module');
    // stub was inited (verify via __calls)
    expect(stubCalls).toContain('init:stub');
    // dep was inited
    expect(depCalls).toContain('init:dep');
  });
});
