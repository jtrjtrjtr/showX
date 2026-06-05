import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SecretStore } from '../../../src/main/src/shared/SecretStore.js';
import { resolvePaths } from '../../../src/main/src/shared/paths.js';
import type { SecretStoreOptions } from '../../../src/main/src/shared/SecretStore.js';

function makeMockKeytar() {
  const store = new Map<string, Map<string, string>>();
  return {
    async getPassword(service: string, account: string): Promise<string | null> {
      return store.get(service)?.get(account) ?? null;
    },
    async setPassword(service: string, account: string, value: string): Promise<void> {
      if (!store.has(service)) store.set(service, new Map());
      store.get(service)!.set(account, value);
    },
    async deletePassword(service: string, account: string): Promise<boolean> {
      return store.get(service)?.delete(account) ?? false;
    },
    async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
      const svc = store.get(service);
      if (!svc) return [];
      return Array.from(svc.entries()).map(([account, password]) => ({ account, password }));
    },
  };
}

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'showx-ss-test-'));
}

function makeOpts(tmpDir: string, keytar = makeMockKeytar()): { opts: SecretStoreOptions; kt: ReturnType<typeof makeMockKeytar> } {
  return { opts: { keytarLoader: async () => keytar }, kt: keytar };
}

describe('SecretStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmp();
  });

  it('set + get round-trip via mocked keytar', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const { opts } = makeOpts(tmpDir);
    const store = new SecretStore('test-slug', layout, opts);
    await store.set('my-key', 'my-value');
    const val = await store.get('my-key');
    expect(val).toBe('my-value');
  });

  it('get missing key returns undefined', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const { opts } = makeOpts(tmpDir);
    const store = new SecretStore('test-slug', layout, opts);
    const val = await store.get('nonexistent');
    expect(val).toBeUndefined();
  });

  it('list() returns all keys for the slug', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const { opts } = makeOpts(tmpDir);
    const store = new SecretStore('test-slug', layout, opts);
    await store.set('key-a', 'val-a');
    await store.set('key-b', 'val-b');
    await store.set('key-c', 'val-c');
    const keys = await store.list();
    expect(keys.sort()).toEqual(['key-a', 'key-b', 'key-c']);
  });

  it('delete() removes a key', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const { opts } = makeOpts(tmpDir);
    const store = new SecretStore('test-slug', layout, opts);
    await store.set('to-delete', 'value');
    await store.delete('to-delete');
    expect(await store.get('to-delete')).toBeUndefined();
    expect(await store.list()).not.toContain('to-delete');
  });

  it('keytar throws → fallback file used; round-trip still works', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const throwingKt = {
      getPassword: async () => { throw new Error('keytar unavailable'); },
      setPassword: async () => { throw new Error('keytar unavailable'); },
      deletePassword: async () => { throw new Error('keytar unavailable'); },
      findCredentials: async () => { throw new Error('keytar unavailable'); },
    };
    const opts: SecretStoreOptions = { keytarLoader: async () => throwingKt };
    const store = new SecretStore('fallback-slug', layout, opts);
    await store.set('secret-key', 'secret-value');
    const val = await store.get('secret-key');
    expect(val).toBe('secret-value');
  });

  it('fallback file persists across two SecretStore instances', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const throwingKt = {
      getPassword: async () => { throw new Error('no keytar'); },
      setPassword: async () => { throw new Error('no keytar'); },
      deletePassword: async () => { throw new Error('no keytar'); },
      findCredentials: async () => { throw new Error('no keytar'); },
    };
    const opts: SecretStoreOptions = { keytarLoader: async () => throwingKt };

    const store1 = new SecretStore('persist-slug', layout, opts);
    await store1.set('persistent', 'hello');

    const store2 = new SecretStore('persist-slug', layout, opts);
    expect(await store2.get('persistent')).toBe('hello');
  });

  it('local secret is reused: same file used by second instance', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const throwingKt = {
      getPassword: async () => { throw new Error('no keytar'); },
      setPassword: async () => { throw new Error('no keytar'); },
      deletePassword: async () => { throw new Error('no keytar'); },
      findCredentials: async () => { throw new Error('no keytar'); },
    };
    const opts: SecretStoreOptions = { keytarLoader: async () => throwingKt };

    const store1 = new SecretStore('reuse-slug', layout, opts);
    await store1.set('x', '1');

    const info1 = await stat(layout.localSecretFile);
    const mtime1 = info1.mtimeMs;

    // wait a bit to ensure mtime would differ if regenerated
    await new Promise((r) => setTimeout(r, 50));

    const store2 = new SecretStore('reuse-slug', layout, opts);
    await store2.get('x');

    const info2 = await stat(layout.localSecretFile);
    expect(info2.mtimeMs).toBe(mtime1);
    expect((await readFile(layout.localSecretFile)).length).toBe(32);
  });

  it('encrypted file is not human-readable: secret string not in raw bytes', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const slug = `enc-test-${randomUUID()}`;
    const throwingKt = {
      getPassword: async () => { throw new Error('no keytar'); },
      setPassword: async () => { throw new Error('no keytar'); },
      deletePassword: async () => { throw new Error('no keytar'); },
      findCredentials: async () => { throw new Error('no keytar'); },
    };
    const opts: SecretStoreOptions = { keytarLoader: async () => throwingKt };
    const store = new SecretStore(slug, layout, opts);
    const secret = 'supersecret-plaintext-value-12345';
    await store.set('api-token', secret);

    const encPath = join(layout.secretsDir, `${slug}.enc`);
    const raw = await readFile(encPath);
    expect(raw.toString('utf8')).not.toContain(secret);
  });

  it('slug namespace: keytar service includes slug', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const calls: Array<{ service: string; account: string }> = [];
    const spyKt = {
      getPassword: async (s: string, a: string) => { calls.push({ service: s, account: a }); return null; },
      setPassword: async (s: string, a: string, _v: string) => { calls.push({ service: s, account: a }); },
      deletePassword: async (s: string, a: string) => { calls.push({ service: s, account: a }); return true; },
      findCredentials: async (s: string) => { calls.push({ service: s, account: '' }); return []; },
    };
    const opts: SecretStoreOptions = { keytarLoader: async () => spyKt };
    const store = new SecretStore('eventx-bridge', layout, opts);
    await store.set('token', 'val');
    expect(calls.some((c) => c.service === 'showx:eventx-bridge')).toBe(true);
  });

  it('local_secret.bin file mode is 0600', async () => {
    const layout = resolvePaths({ override: tmpDir });
    const throwingKt = {
      getPassword: async () => { throw new Error('no keytar'); },
      setPassword: async () => { throw new Error('no keytar'); },
      deletePassword: async () => { throw new Error('no keytar'); },
      findCredentials: async () => { throw new Error('no keytar'); },
    };
    const opts: SecretStoreOptions = { keytarLoader: async () => throwingKt };
    const store = new SecretStore('mode-test', layout, opts);
    await store.set('k', 'v');
    const info = await stat(layout.localSecretFile);
    expect(info.mode & 0o777).toBe(0o600);
  });
});
