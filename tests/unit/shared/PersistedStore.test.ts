import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PersistedStore } from '../../../src/main/src/shared/PersistedStore.js';
import { resolvePaths } from '../../../src/main/src/shared/paths.js';

const schema1 = {
  schemaVersion: 1,
  zodSchema: z.object({ name: z.string(), count: z.number() }),
  defaults: { name: 'default', count: 0 },
} as const;

type Config1 = { name: string; count: number };

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'showx-ps-test-'));
}

describe('PersistedStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmp();
  });

  it('first load (no file) returns defaults and writes them', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const store = new PersistedStore('test-module', layout);
    const val = await store.load(schema1);
    expect(val).toEqual({ name: 'default', count: 0 });
    // file should now exist
    const raw = await readFile(join(layout.modulesDir, 'test-module', 'config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { __schemaVersion: number; value: Config1 };
    expect(parsed.__schemaVersion).toBe(1);
    expect(parsed.value).toEqual({ name: 'default', count: 0 });
  });

  it('round-trip: save then load returns saved value', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const store = new PersistedStore('round-trip', layout);
    await store.load(schema1);
    await store.save({ name: 'hello', count: 42 });
    const store2 = new PersistedStore('round-trip', layout);
    const val = await store2.load(schema1);
    expect(val).toEqual({ name: 'hello', count: 42 });
  });

  it('save validates: invalid shape throws and file unchanged', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const store = new PersistedStore('validate-test', layout);
    await store.load(schema1);
    await expect(store.save({ name: 42, count: 'bad' } as unknown as Config1)).rejects.toThrow();
    const store2 = new PersistedStore('validate-test', layout);
    const val = await store2.load(schema1);
    expect(val).toEqual({ name: 'default', count: 0 });
  });

  it('migration: stored v1 with migrate fn → returns migrated shape', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const slug = `migrate-${randomUUID()}`;
    // write a v1 file manually
    const v1Data = JSON.stringify({ __schemaVersion: 1, value: { old: 'value' } });
    const { promises: fs } = await import('node:fs');
    const dir = join(layout.modulesDir, slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'config.json'), v1Data, 'utf8');

    const schema2 = {
      schemaVersion: 2,
      zodSchema: z.object({ name: z.string() }),
      defaults: { name: 'migrated-default' },
      migrate: (_version: number, prev: unknown) => {
        const p = prev as { old?: string };
        return { name: p.old ?? 'unknown' };
      },
    };

    const store = new PersistedStore(slug, layout);
    const val = await store.load(schema2);
    expect(val).toEqual({ name: 'value' });
  });

  it('migration missing: older version without migrate fn → quarantine + defaults', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const slug = `no-migrate-${randomUUID()}`;
    const v1Data = JSON.stringify({ __schemaVersion: 1, value: { name: 'old' } });
    const { promises: fs } = await import('node:fs');
    const dir = join(layout.modulesDir, slug);
    await fs.mkdir(dir, { recursive: true });
    const configPath = join(dir, 'config.json');
    await fs.writeFile(configPath, v1Data, 'utf8');

    const schema2 = {
      schemaVersion: 2,
      zodSchema: z.object({ name: z.string() }),
      defaults: { name: 'default-v2' },
    };

    const store = new PersistedStore(slug, layout);
    const val = await store.load(schema2);
    expect(val).toEqual({ name: 'default-v2' });

    const files = await fs.readdir(dir);
    const quarantine = files.filter((f) => f.includes('.corrupt-'));
    expect(quarantine.length).toBeGreaterThan(0);
  });

  it('migration throws → quarantine + defaults', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const slug = `migrate-throw-${randomUUID()}`;
    const v1Data = JSON.stringify({ __schemaVersion: 1, value: { name: 'original' } });
    const { promises: fs } = await import('node:fs');
    const dir = join(layout.modulesDir, slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'config.json'), v1Data, 'utf8');

    const schema2 = {
      schemaVersion: 2,
      zodSchema: z.object({ name: z.string() }),
      defaults: { name: 'migrated-default' },
      migrate: () => { throw new Error('migration error'); },
    };

    const store = new PersistedStore(slug, layout);
    const val = await store.load(schema2);
    expect(val).toEqual({ name: 'migrated-default' });
    const files = await fs.readdir(dir);
    expect(files.some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('corrupt JSON → quarantine + defaults', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const slug = `corrupt-json-${randomUUID()}`;
    const { promises: fs } = await import('node:fs');
    const dir = join(layout.modulesDir, slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'config.json'), 'NOT-VALID-JSON', 'utf8');

    const store = new PersistedStore(slug, layout);
    const val = await store.load(schema1);
    expect(val).toEqual({ name: 'default', count: 0 });
    const files = await fs.readdir(dir);
    expect(files.some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('validation fail after parse → quarantine + defaults', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const slug = `validation-fail-${randomUUID()}`;
    const { promises: fs } = await import('node:fs');
    const dir = join(layout.modulesDir, slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ __schemaVersion: 1, value: { name: 123, count: 'wrong' } }),
      'utf8',
    );

    const store = new PersistedStore(slug, layout);
    const val = await store.load(schema1);
    expect(val).toEqual({ name: 'default', count: 0 });
    const files = await fs.readdir(dir);
    expect(files.some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('onChange fires after save with new value', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const store = new PersistedStore('onchange-test', layout);
    await store.load(schema1);
    const received: Config1[] = [];
    store.onChange<Config1>((val) => received.push(val));
    await store.save({ name: 'updated', count: 99 });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ name: 'updated', count: 99 });
  });

  it('unsubscribe stops onChange from firing', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const store = new PersistedStore('unsub-test', layout);
    await store.load(schema1);
    const received: Config1[] = [];
    const sub = store.onChange<Config1>((val) => received.push(val));
    await store.save({ name: 'first', count: 1 });
    sub.unsubscribe();
    await store.save({ name: 'second', count: 2 });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ name: 'first', count: 1 });
  });

  it('atomic write: concurrent saves both complete, final value is consistent', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const store = new PersistedStore('atomic-test', layout);
    await store.load(schema1);
    const a = store.save({ name: 'A', count: 1 });
    const b = store.save({ name: 'B', count: 2 });
    await Promise.all([a, b]);
    // file should be valid JSON containing one of the two values
    const raw = await readFile(
      join(layout.modulesDir, 'atomic-test', 'config.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw) as { value: Config1 };
    expect(['A', 'B']).toContain(parsed.value.name);
    // no tmp files should remain
    const { promises: fs2 } = await import('node:fs');
    const files = await fs2.readdir(join(layout.modulesDir, 'atomic-test'));
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('slug-bound: two slugs are independent', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const storeA = new PersistedStore('slug-a', layout);
    const storeB = new PersistedStore('slug-b', layout);
    await storeA.load(schema1);
    await storeB.load(schema1);
    await storeA.save({ name: 'from-a', count: 10 });
    await storeB.save({ name: 'from-b', count: 20 });
    const a2 = new PersistedStore('slug-a', layout);
    const b2 = new PersistedStore('slug-b', layout);
    expect(await a2.load(schema1)).toEqual({ name: 'from-a', count: 10 });
    expect(await b2.load(schema1)).toEqual({ name: 'from-b', count: 20 });
  });

  it('file mode 0o600 on written config', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const store = new PersistedStore('mode-test', layout);
    await store.load(schema1);
    const info = await stat(join(layout.modulesDir, 'mode-test', 'config.json'));
    expect(info.mode & 0o777).toBe(0o600);
  });
});
