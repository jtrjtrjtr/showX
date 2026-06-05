import type { Logger, HealthBus } from 'showx-shared';
import type { LoadedModule } from './types.js';

const HOOK_TIMEOUT_MS: Record<string, number> = {
  init: 10_000,
  start: 5_000,
  stop: 5_000,
  teardown: 5_000,
};

function withTimeout(ms: number): Promise<never> {
  return new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`hook timed out after ${ms}ms`)), ms),
  );
}

export class LifecycleOrchestrator {
  private readonly slugToModule: Map<string, LoadedModule>;
  private initLayers: LoadedModule[][] = [];

  constructor(
    private readonly modules: LoadedModule[],
    private readonly logger: Logger,
    private readonly health: HealthBus,
  ) {
    this.slugToModule = new Map(modules.map((m) => [m.slug, m]));
  }

  async initAll(): Promise<void> {
    this.initLayers = this.topoLayers();
    for (const layer of this.initLayers) {
      // Cascade-quarantine modules in this layer whose deps failed in a prior layer.
      for (const m of layer) {
        if (m.state !== 'init_pending') continue;
        for (const depSlug of m.manifest.depends_on) {
          const dep = this.slugToModule.get(depSlug);
          if (dep && (dep.state === 'init_failed' || dep.state === 'quarantined')) {
            this.quarantineModule(m, 'dep_failed', `dep ${depSlug} not available`);
            break;
          }
        }
      }
      await Promise.allSettled(layer.map((m) => this.initOne(m)));
    }
  }

  async startAll(): Promise<void> {
    for (const layer of this.initLayers) {
      for (const m of layer) {
        if (m.state !== 'inited') continue;
        for (const depSlug of m.manifest.depends_on) {
          const dep = this.slugToModule.get(depSlug);
          if (dep && dep.state !== 'started') {
            this.quarantineModule(m, 'dep_start_failed', `dep ${depSlug} not started`);
            break;
          }
        }
      }
      await Promise.allSettled(layer.filter((m) => m.state === 'inited').map((m) => this.startOne(m)));
    }
  }

  async stopAll(): Promise<void> {
    const reversedLayers = [...this.initLayers].reverse().map((l) => [...l].reverse());
    for (const layer of reversedLayers) {
      await Promise.allSettled(layer.filter((m) => m.state === 'started').map((m) => this.stopOne(m)));
    }
  }

  async teardownAll(): Promise<void> {
    const reversedLayers = [...this.initLayers].reverse().map((l) => [...l].reverse());
    for (const layer of reversedLayers) {
      const toTeardown = layer.filter((m) =>
        m.state === 'stopped' || m.state === 'inited' || m.state === 'init_failed' || m.state === 'start_failed',
      );
      await Promise.allSettled(toTeardown.map((m) => this.teardownOne(m)));
    }
  }

  private async initOne(m: LoadedModule): Promise<void> {
    if (m.state !== 'init_pending') return;
    m.state = 'init_running';
    try {
      await Promise.race([m.module.init(m.context), withTimeout(HOOK_TIMEOUT_MS['init']!)]);
      m.state = 'inited';
    } catch (err) {
      m.state = 'init_failed';
      m.lastError = { stage: 'init', error: err as Error, at: Date.now() };
      this.health.report(`module.${m.slug}`, 'error', `init_failed: ${(err as Error).message}`);
      this.logger.error('module.init.failed', { slug: m.slug, error: String(err) });
    }
  }

  private async startOne(m: LoadedModule): Promise<void> {
    if (m.state !== 'inited') return;
    m.state = 'start_running';
    try {
      await Promise.race([m.module.start(), withTimeout(HOOK_TIMEOUT_MS['start']!)]);
      m.state = 'started';
    } catch (err) {
      m.state = 'start_failed';
      m.lastError = { stage: 'start', error: err as Error, at: Date.now() };
      this.health.report(`module.${m.slug}`, 'error', `start_failed: ${(err as Error).message}`);
      this.logger.error('module.start.failed', { slug: m.slug, error: String(err) });
    }
  }

  private async stopOne(m: LoadedModule): Promise<void> {
    if (m.state !== 'started') return;
    m.state = 'stop_running';
    m.abortController.abort();
    try {
      await Promise.race([m.module.stop(), withTimeout(HOOK_TIMEOUT_MS['stop']!)]);
    } catch (err) {
      // Per spec §3.6: stop errors are logged at WARN; module still transitions to stopped.
      m.lastError = { stage: 'stop', error: err as Error, at: Date.now() };
      this.logger.warn('module.stop.failed', { slug: m.slug, error: String(err) });
    }
    m.state = 'stopped';
  }

  private async teardownOne(m: LoadedModule): Promise<void> {
    m.state = 'teardown_running';
    try {
      await Promise.race([m.module.teardown(), withTimeout(HOOK_TIMEOUT_MS['teardown']!)]);
    } catch (err) {
      // Per spec §3.6: teardown errors are logged at WARN; module still transitions to torn_down.
      m.lastError = { stage: 'teardown', error: err as Error, at: Date.now() };
      this.logger.warn('module.teardown.failed', { slug: m.slug, error: String(err) });
    }
    m.state = 'torn_down';
  }

  private quarantineModule(m: LoadedModule, stage: string, reason: string): void {
    m.state = 'quarantined';
    m.lastError = { stage, error: new Error(reason), at: Date.now() };
    this.health.report(`module.${m.slug}`, 'error', `quarantined: ${reason}`);
    this.logger.error('module.quarantined', { slug: m.slug, stage, reason });
  }

  // Kahn-style topological sort. Returns layers of init_pending modules.
  // Modules with deps on quarantined/failed/missing modules are quarantined immediately.
  // Cyclic dependencies are detected and all members of the cycle are quarantined.
  private topoLayers(): LoadedModule[][] {
    // Propagate quarantine for modules whose deps are already in a bad state.
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of this.modules) {
        if (m.state !== 'init_pending') continue;
        for (const depSlug of m.manifest.depends_on) {
          const dep = this.slugToModule.get(depSlug);
          const depBad = !dep || dep.state === 'quarantined' || dep.state === 'manifest_invalid';
          if (depBad) {
            this.quarantineModule(m, 'dep_failed', `dep ${depSlug} not available`);
            changed = true;
            break;
          }
        }
      }
    }

    const active = this.modules.filter((m) => m.state === 'init_pending');
    const activeSet = new Set(active.map((m) => m.slug));

    // inDegree: how many of this module's deps are still in `active` (unprocessed).
    const inDegree = new Map<string, number>();
    // dependents: for each slug, which slugs depend on it.
    const dependents = new Map<string, string[]>();

    for (const m of active) {
      const activeDeps = m.manifest.depends_on.filter((d) => activeSet.has(d));
      inDegree.set(m.slug, activeDeps.length);
      for (const dep of activeDeps) {
        const list = dependents.get(dep) ?? [];
        list.push(m.slug);
        dependents.set(dep, list);
      }
    }

    const layers: LoadedModule[][] = [];
    const remaining = new Set(active.map((m) => m.slug));

    while (remaining.size > 0) {
      const layer: LoadedModule[] = [];
      for (const slug of remaining) {
        if ((inDegree.get(slug) ?? 0) === 0) {
          layer.push(this.slugToModule.get(slug)!);
        }
      }

      if (layer.length === 0) {
        // Cycle detected — quarantine all remaining modules.
        for (const slug of remaining) {
          const m = this.slugToModule.get(slug)!;
          this.quarantineModule(m, 'cycle', `cyclic dependency involving ${slug}`);
        }
        break;
      }

      layers.push(layer);
      for (const m of layer) {
        remaining.delete(m.slug);
        for (const dependentSlug of dependents.get(m.slug) ?? []) {
          inDegree.set(dependentSlug, (inDegree.get(dependentSlug) ?? 1) - 1);
        }
      }
    }

    return layers;
  }
}
