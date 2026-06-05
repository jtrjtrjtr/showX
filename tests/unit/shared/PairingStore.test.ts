import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PairingStoreImpl } from '../../../src/main/src/shared/PairingStore.js';
import { TokenManagerImpl } from '../../../src/main/src/shared/pairing/tokenManager.js';
import { TokenInvalidError } from '../../../src/main/src/shared/pairing/types.js';
import { PersistedStore } from '../../../src/main/src/shared/PersistedStore.js';
import { resolvePaths } from '../../../src/main/src/shared/paths.js';

function makeSecretStore(initialSecret?: string) {
  let stored: string | undefined = initialSecret;
  return {
    async get(_key: string) { return stored; },
    async set(_key: string, value: string) { stored = value; },
    async delete(_key: string) { stored = undefined; },
    async list() { return stored ? ['pairing.hmac_secret'] : []; },
  };
}

async function makeStore() {
  const tmpDir = await mkdtemp(join(tmpdir(), 'showx-pairing-test-'));
  const layout = resolvePaths({ override: tmpDir });
  const persisted = new PersistedStore('pairing', layout);
  const secretStore = makeSecretStore();
  const tokens = new TokenManagerImpl(secretStore);
  await tokens.init();
  const pairing = new PairingStoreImpl(persisted, tokens);
  return { pairing, tokens, persisted, layout, tmpDir };
}

describe('PairingStoreImpl', () => {
  it('init with empty PersistedStore → 0 devices', async () => {
    const { pairing } = await makeStore();
    await pairing.init();
    expect(pairing.listDevices()).toHaveLength(0);
  });

  it('addDevice → listDevices returns 1; device has created_at and null last_seen', async () => {
    const { pairing } = await makeStore();
    await pairing.init();
    const before = Date.now();
    const device = await pairing.addDevice({
      device_id: 'dev-001',
      display_name: 'LX iPad',
      owned_departments: ['LX'],
      tier: 'free',
      token_hash: 'abc123',
    });
    expect(device.device_id).toBe('dev-001');
    expect(device.last_seen).toBeNull();
    expect(device.created_at).toBeGreaterThanOrEqual(before);
    const list = pairing.listDevices();
    expect(list).toHaveLength(1);
    expect(list[0]!.device_id).toBe('dev-001');
  });

  it('updateLastSeen → device.last_seen updated', async () => {
    const { pairing } = await makeStore();
    await pairing.init();
    await pairing.addDevice({
      device_id: 'dev-002',
      display_name: 'SM iPad',
      owned_departments: [],
      tier: 'free',
      token_hash: 'def456',
    });
    const ts = Date.now();
    await pairing.updateLastSeen('dev-002', ts);
    const dev = pairing.getDevice('dev-002');
    expect(dev?.last_seen).toBe(ts);
  });

  it('updateLastSeen on unknown device is a no-op', async () => {
    const { pairing } = await makeStore();
    await pairing.init();
    await expect(pairing.updateLastSeen('nonexistent')).resolves.not.toThrow();
  });

  it('revokeDevice → device.revoked_at set + tokenManager.revoke called', async () => {
    const { pairing, tokens } = await makeStore();
    await pairing.init();
    await pairing.addDevice({
      device_id: 'dev-rev',
      display_name: 'VID rack',
      owned_departments: ['VIDEO'],
      tier: 'free',
      token_hash: 'xyz',
    });

    const revokeSpy = vi.spyOn(tokens, 'revoke');
    await pairing.revokeDevice('dev-rev');

    expect(revokeSpy).toHaveBeenCalledWith('dev-rev');
    const dev = pairing.getDevice('dev-rev');
    expect(typeof dev?.revoked_at).toBe('number');
  });

  it('resolveToken(validToken) → returns device', async () => {
    const { pairing, tokens } = await makeStore();
    await pairing.init();
    await pairing.addDevice({
      device_id: 'dev-resolve',
      display_name: 'Test',
      owned_departments: [],
      tier: 'free',
      token_hash: 'h',
    });
    const token = tokens.sign({
      device_id: 'dev-resolve',
      display_name: 'Test',
      owned_departments: [],
      tier: 'free',
    });
    const dev = pairing.resolveToken(token);
    expect(dev.device_id).toBe('dev-resolve');
  });

  it('resolveToken(revokedToken) → throws revoked', async () => {
    const { pairing, tokens } = await makeStore();
    await pairing.init();
    await pairing.addDevice({
      device_id: 'dev-rvk2',
      display_name: 'Test',
      owned_departments: [],
      tier: 'free',
      token_hash: 'h',
    });
    const token = tokens.sign({
      device_id: 'dev-rvk2',
      display_name: 'Test',
      owned_departments: [],
      tier: 'free',
    });
    await pairing.revokeDevice('dev-rvk2');
    try {
      pairing.resolveToken(token);
      expect.fail('should throw');
    } catch (e) {
      expect((e as TokenInvalidError).reason).toBe('revoked');
    }
  });

  it('revoked devices are reloaded on init (restart persistence)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'showx-pairing-persist-'));
    const layout = resolvePaths({ override: tmpDir });
    const secretStore = makeSecretStore();
    const tokens1 = new TokenManagerImpl(secretStore);
    await tokens1.init();
    const persisted1 = new PersistedStore('pairing', layout);
    const pairing1 = new PairingStoreImpl(persisted1, tokens1);
    await pairing1.init();
    await pairing1.addDevice({ device_id: 'dev-persist', display_name: 'D', owned_departments: [], tier: 'free', token_hash: 'h' });
    await pairing1.revokeDevice('dev-persist');

    // Simulate restart: new instances, same storage
    const tokens2 = new TokenManagerImpl(secretStore);
    await tokens2.init();
    const persisted2 = new PersistedStore('pairing', layout);
    const pairing2 = new PairingStoreImpl(persisted2, tokens2);
    await pairing2.init();

    // The device should still be revoked in the new instance
    expect(tokens2.isRevoked('dev-persist')).toBe(true);
  });
});
