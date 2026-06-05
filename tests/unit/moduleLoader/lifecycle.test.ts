import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LifecycleOrchestrator } from '../../../src/main/src/moduleLoader/lifecycle.js';
import { HealthBus } from '../../../src/main/src/shared/HealthBus.js';
import { Logger } from '../../../src/main/src/shared/Logger.js';
import type { LoadedModule } from '../../../src/main/src/moduleLoader/types.js';
import type { Module, ModuleContext } from 'showx-shared';

function makeLogger() {
  return new Logger({ output: { write: () => true } as unknown as NodeJS.WritableStream });
}

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    init: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    teardown: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeLoadedModule(slug: string, dependsOn: string[], moduleImpl?: Module): LoadedModule {
  return {
    slug,
    manifest: {
      name: slug,
      slug,
      version: '0.0.1',
      description: '',
      tier: 'free',
      depends_on: dependsOn,
    },
    module: moduleImpl ?? makeModule(),
    context: { slug } as unknown as ModuleContext,
    abortController: new AbortController(),
    state: 'init_pending',
  };
}

describe('LifecycleOrchestrator', () => {
  let logger: Logger;
  let health: HealthBus;

  beforeEach(() => {
    logger = makeLogger();
    health = new HealthBus();
  });

  describe('initAll', () => {
    it('calls init in topological order: A, B(depA), C(depB)', async () => {
      const order: string[] = [];
      const modA = makeModule({ init: vi.fn(async () => { order.push('A'); }) });
      const modB = makeModule({ init: vi.fn(async () => { order.push('B'); }) });
      const modC = makeModule({ init: vi.fn(async () => { order.push('C'); }) });

      const a = makeLoadedModule('a', [], modA);
      const b = makeLoadedModule('b', ['a'], modB);
      const c = makeLoadedModule('c', ['b'], modC);

      const orch = new LifecycleOrchestrator([a, b, c], logger, health);
      await orch.initAll();

      expect(order).toEqual(['A', 'B', 'C']);
      expect(a.state).toBe('inited');
      expect(b.state).toBe('inited');
      expect(c.state).toBe('inited');
    });

    it('cascade-quarantines B and C when A fails init', async () => {
      const modA = makeModule({ init: vi.fn(async () => { throw new Error('A failed'); }) });
      const a = makeLoadedModule('a', [], modA);
      const b = makeLoadedModule('b', ['a']);
      const c = makeLoadedModule('c', ['b']);

      const orch = new LifecycleOrchestrator([a, b, c], logger, health);
      await orch.initAll();

      expect(a.state).toBe('init_failed');
      expect(b.state).toBe('quarantined');
      expect(c.state).toBe('quarantined');
    });

    it('quarantines both modules in a cycle', async () => {
      // A depends on B, B depends on A → cycle
      const a = makeLoadedModule('a', ['b']);
      const b = makeLoadedModule('b', ['a']);

      const reports: string[] = [];
      health.observe('module.a', (snap) => reports.push(`a:${snap.status}`));
      health.observe('module.b', (snap) => reports.push(`b:${snap.status}`));

      const orch = new LifecycleOrchestrator([a, b], logger, health);
      await orch.initAll();

      expect(a.state).toBe('quarantined');
      expect(b.state).toBe('quarantined');
    });

    it('second call to initAll is a no-op (idempotent)', async () => {
      const modA = makeModule();
      const a = makeLoadedModule('a', [], modA);

      const orch = new LifecycleOrchestrator([a], logger, health);
      await orch.initAll();
      await orch.initAll(); // second call

      expect(modA.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('startAll / stopAll / teardownAll ordering', () => {
    it('start order same as init order, stop/teardown is reversed', async () => {
      const order: string[] = [];

      const modA = makeModule({
        init: vi.fn(async () => { order.push('init:a'); }),
        start: vi.fn(async () => { order.push('start:a'); }),
        stop: vi.fn(async () => { order.push('stop:a'); }),
        teardown: vi.fn(async () => { order.push('teardown:a'); }),
      });
      const modB = makeModule({
        init: vi.fn(async () => { order.push('init:b'); }),
        start: vi.fn(async () => { order.push('start:b'); }),
        stop: vi.fn(async () => { order.push('stop:b'); }),
        teardown: vi.fn(async () => { order.push('teardown:b'); }),
      });
      const modC = makeModule({
        init: vi.fn(async () => { order.push('init:c'); }),
        start: vi.fn(async () => { order.push('start:c'); }),
        stop: vi.fn(async () => { order.push('stop:c'); }),
        teardown: vi.fn(async () => { order.push('teardown:c'); }),
      });

      const a = makeLoadedModule('a', [], modA);
      const b = makeLoadedModule('b', ['a'], modB);
      const c = makeLoadedModule('c', ['b'], modC);

      const orch = new LifecycleOrchestrator([a, b, c], logger, health);
      await orch.initAll();
      await orch.startAll();
      await orch.stopAll();
      await orch.teardownAll();

      const initOrder = order.filter((x) => x.startsWith('init'));
      const startOrder = order.filter((x) => x.startsWith('start'));
      const stopOrder = order.filter((x) => x.startsWith('stop'));
      const teardownOrder = order.filter((x) => x.startsWith('teardown'));

      expect(initOrder).toEqual(['init:a', 'init:b', 'init:c']);
      expect(startOrder).toEqual(['start:a', 'start:b', 'start:c']);
      expect(stopOrder).toEqual(['stop:c', 'stop:b', 'stop:a']);
      expect(teardownOrder).toEqual(['teardown:c', 'teardown:b', 'teardown:a']);
    });

    it('stop errors are logged but module still transitions to stopped', async () => {
      const modA = makeModule({
        stop: vi.fn(async () => { throw new Error('stop boom'); }),
      });
      const a = makeLoadedModule('a', [], modA);

      const orch = new LifecycleOrchestrator([a], logger, health);
      await orch.initAll();
      await orch.startAll();
      await orch.stopAll();

      expect(a.state).toBe('stopped');
      expect(a.lastError?.stage).toBe('stop');
    });

    it('teardown errors are logged but module still transitions to torn_down', async () => {
      const modA = makeModule({
        teardown: vi.fn(async () => { throw new Error('teardown boom'); }),
      });
      const a = makeLoadedModule('a', [], modA);

      const orch = new LifecycleOrchestrator([a], logger, health);
      await orch.initAll();
      await orch.startAll();
      await orch.stopAll();
      await orch.teardownAll();

      expect(a.state).toBe('torn_down');
    });
  });

  describe('health reporting', () => {
    it('reports error on HealthBus when init fails', async () => {
      const modA = makeModule({ init: vi.fn(async () => { throw new Error('oops'); }) });
      const a = makeLoadedModule('a', [], modA);

      const reports: Array<{ status: string; detail?: string }> = [];
      health.observe('module.a', (snap) => reports.push({ status: snap.status, detail: snap.detail }));

      const orch = new LifecycleOrchestrator([a], logger, health);
      await orch.initAll();

      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0].status).toBe('error');
    });
  });
});
