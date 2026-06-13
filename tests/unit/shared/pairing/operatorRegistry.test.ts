import { describe, it, expect, beforeEach } from 'vitest';
import { PairingStoreImpl } from '../../../../src/main/src/shared/PairingStore.js';
import type { PersistedStore } from '../../../../src/shared/src/types/services.js';
import type { TokenManager } from '../../../../src/main/src/shared/pairing/tokenManager.js';
import type { DeviceRecord } from '../../../../src/main/src/shared/pairing/types.js';

// Minimal in-memory stubs

function makePersistedStore(): PersistedStore {
  let stored: unknown = null;
  return {
    load: async (schema: { defaults: unknown }) => (stored ?? schema.defaults),
    save: async (data: unknown) => { stored = data; },
  } as unknown as PersistedStore;
}

function makeTokenManager(): TokenManager {
  const revoked = new Set<string>();
  return {
    validate: (token: string) => ({ device_id: token, display_name: '', owned_departments: [], tier: 'free' as const, iat: 0 }),
    sign: () => 'tok',
    revoke: async (id: string) => { revoked.add(id); },
    isRevoked: (id: string) => revoked.has(id),
  } as unknown as TokenManager;
}

async function makeStore() {
  const store = new PairingStoreImpl(makePersistedStore(), makeTokenManager());
  await store.init();
  return store;
}

describe('PairingStore.listOperatorRecords', () => {
  it('returns empty list when no devices are paired', async () => {
    const store = await makeStore();
    expect(store.listOperatorRecords()).toEqual([]);
  });

  it('maps SM-department device to role "sm" with status "active"', async () => {
    const store = await makeStore();
    await store.addDevice({
      device_id: 'dev-sm',
      display_name: 'SM Station',
      owned_departments: ['SM'],
      tier: 'pro',
      token_hash: 'h1',
    });
    const records = store.listOperatorRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      device_id: 'dev-sm',
      display_name: 'SM Station',
      owned_departments: ['SM'],
      role: 'sm',
      status: 'active',
    });
  });

  it('maps non-SM device to role "operator"', async () => {
    const store = await makeStore();
    await store.addDevice({
      device_id: 'dev-lx',
      display_name: 'LX Station',
      owned_departments: ['LX'],
      tier: 'free',
      token_hash: 'h2',
    });
    const records = store.listOperatorRecords();
    expect(records[0]).toMatchObject({ role: 'operator', status: 'active' });
  });

  it('marks revoked device with status "revoked"', async () => {
    const store = await makeStore();
    await store.addDevice({
      device_id: 'dev-rev',
      display_name: 'Revoked',
      owned_departments: ['SM'],
      tier: 'free',
      token_hash: 'h3',
    });
    await store.revokeDevice('dev-rev');
    const records = store.listOperatorRecords();
    expect(records[0]).toMatchObject({ status: 'revoked' });
  });

  it('tracks last_seen_at from updateLastSeen', async () => {
    const store = await makeStore();
    await store.addDevice({
      device_id: 'dev-seen',
      display_name: 'Seen',
      owned_departments: ['SX'],
      tier: 'free',
      token_hash: 'h4',
    });
    await store.updateLastSeen('dev-seen', 1000);
    const records = store.listOperatorRecords();
    expect(records[0]?.last_seen_at).toBe(1000);
  });

  it('resolves token to the underlying device record', async () => {
    const tm = makeTokenManager();
    const ps = makePersistedStore();
    // Override validate to return known payload
    (tm as unknown as Record<string, unknown>)['validate'] = (_tok: string) => ({
      device_id: 'dev-tok',
      display_name: 'TokenDev',
      owned_departments: ['LX'],
      tier: 'free',
      iat: 0,
    });
    const store = new PairingStoreImpl(ps, tm);
    await store.init();
    await store.addDevice({
      device_id: 'dev-tok',
      display_name: 'TokenDev',
      owned_departments: ['LX'],
      tier: 'free',
      token_hash: 'ht',
    });
    const resolved = store.resolveToken('any-token');
    expect(resolved.device_id).toBe('dev-tok');
    expect(resolved.owned_departments).toEqual(['LX']);
  });
});
