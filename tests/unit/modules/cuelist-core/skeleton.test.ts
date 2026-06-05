import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModuleContext } from 'showx-shared';

import { manifest } from '../../../../src/modules/cuelist-core/src/manifest.js';
import CuelistCore from '../../../../src/modules/cuelist-core/src/index.js';
import { configSchema } from '../../../../src/modules/cuelist-core/src/config/schema.js';

function makeMockContext(overrides: { slug?: string } = {}): ModuleContext {
  const slug = overrides.slug ?? 'cuelist-core';
  return {
    slug,
    shellVersion: '0.1.0',
    tier: 'free',
    abortSignal: new AbortController().signal,
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
    health: {
      report: vi.fn(),
      observe: vi.fn().mockReturnValue({ id: 'obs', unsubscribe: vi.fn() }),
      aggregate: vi.fn().mockReturnValue('healthy'),
      snapshot: vi.fn().mockReturnValue([]),
    },
    persisted: {
      load: vi.fn().mockResolvedValue(configSchema.defaults),
      save: vi.fn().mockResolvedValue(undefined),
      onChange: vi.fn().mockReturnValue({ id: 'pc', unsubscribe: vi.fn() }),
    },
    secrets: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
    },
    output: {} as ModuleContext['output'],
    input: {} as ModuleContext['input'],
    sync: {} as ModuleContext['sync'],
    assets: {} as ModuleContext['assets'],
    mdns: {} as ModuleContext['mdns'],
    pairing: {} as ModuleContext['pairing'],
    events: {
      publish: vi.fn(),
      subscribe: vi.fn().mockReturnValue({ id: 'ev', unsubscribe: vi.fn() }),
      subscribePattern: vi.fn().mockReturnValue({ id: 'evp', unsubscribe: vi.fn() }),
    },
    ui: {
      registerStatusBadge: vi.fn().mockReturnValue({ id: 'sb', unsubscribe: vi.fn() }),
      registerMenuItem: vi.fn().mockReturnValue({ id: 'mi', unsubscribe: vi.fn() }),
    },
    state: vi.fn().mockReturnValue('started' as const),
  } as unknown as ModuleContext;
}

describe('B003-001 Cuelist Core module skeleton', () => {
  describe('manifest shape', () => {
    it('has correct slug', () => {
      expect(manifest.slug).toBe('cuelist-core');
    });

    it('has correct tier', () => {
      expect(manifest.tier).toBe('free');
    });

    it('has default_enabled === true', () => {
      expect(manifest.default_enabled).toBe(true);
    });

    it('has persistedConfigSchemaVersion === 1', () => {
      expect(manifest.persistedConfigSchemaVersion).toBe(1);
    });

    it('requires.depends_on is an empty array', () => {
      expect(manifest.requires.depends_on).toEqual([]);
    });

    it('slug matches kebab-case pattern', () => {
      expect(manifest.slug).toMatch(/^[a-z][a-z0-9-]{1,39}$/);
    });

    it('requires transports include osc-out, midi-out, msc-out, webhook-out', () => {
      const kinds = manifest.requires.transports.map((t) => t.kind);
      expect(kinds).toContain('osc-out');
      expect(kinds).toContain('midi-out');
      expect(kinds).toContain('msc-out');
      expect(kinds).toContain('webhook-out');
    });

    it('entry is a constructor (class)', () => {
      expect(typeof manifest.entry).toBe('function');
      const inst = new manifest.entry();
      expect(inst).toBeDefined();
    });
  });

  describe('class lifecycle', () => {
    let ctx: ModuleContext;
    let module: InstanceType<typeof CuelistCore>;

    beforeEach(() => {
      ctx = makeMockContext({ slug: 'cuelist-core' });
      module = new CuelistCore();
    });

    it('init calls persisted.load with configSchema', async () => {
      await module.init(ctx);
      expect(ctx.persisted.load).toHaveBeenCalledWith(configSchema);
    });

    it('init calls log.info with init message', async () => {
      await module.init(ctx);
      expect(ctx.log.info).toHaveBeenCalledWith(expect.stringContaining('init'));
    });

    it('start reports healthy to HealthBus', async () => {
      await module.init(ctx);
      await module.start();
      expect(ctx.health.report).toHaveBeenCalledWith('cuelist-core', 'healthy', expect.any(String));
    });

    it('start throws if init was not called', async () => {
      await expect(module.start()).rejects.toThrow('init() must precede start()');
    });

    it('onHealthCheck returns healthy after start', async () => {
      await module.init(ctx);
      await module.start();
      expect(module.onHealthCheck?.()).toBe('healthy');
    });

    it('onHealthCheck returns unknown before start', async () => {
      await module.init(ctx);
      expect(module.onHealthCheck?.()).toBe('unknown');
    });

    it('stop does not throw (idempotent — two calls)', async () => {
      await module.init(ctx);
      await module.start();
      await expect(module.stop()).resolves.toBeUndefined();
      await expect(module.stop()).resolves.toBeUndefined();
    });

    it('teardown releases ctx — subsequent start throws', async () => {
      await module.init(ctx);
      await module.start();
      await module.stop();
      await module.teardown();
      await expect(module.start()).rejects.toThrow('init() must precede start()');
    });

    it('getConfigSchema returns the configSchema descriptor', () => {
      const schema = module.getConfigSchema();
      expect(schema.schemaVersion).toBe(1);
      expect(schema.defaults).toBeDefined();
    });
  });

  describe('config defaults', () => {
    it('autosave_interval_ms defaults to 30000', () => {
      expect(configSchema.defaults.autosave_interval_ms).toBe(30000);
    });

    it('history_rotation_size_bytes defaults to 50_000_000', () => {
      expect(configSchema.defaults.history_rotation_size_bytes).toBe(50_000_000);
    });

    it('history_rotation_max_age_days defaults to 10', () => {
      expect(configSchema.defaults.history_rotation_max_age_days).toBe(10);
    });

    it('presence_color_palette defaults to null', () => {
      expect(configSchema.defaults.presence_color_palette).toBeNull();
    });

    it('schemaVersion is 1', () => {
      expect(configSchema.schemaVersion).toBe(1);
    });
  });
});
