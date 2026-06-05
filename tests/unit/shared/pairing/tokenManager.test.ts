import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenManagerImpl } from '../../../../src/main/src/shared/pairing/tokenManager.js';
import { TokenInvalidError } from '../../../../src/main/src/shared/pairing/types.js';

function makeSecretStore(initialSecret?: string) {
  let stored: string | undefined = initialSecret;
  return {
    async get(_key: string) { return stored; },
    async set(_key: string, value: string) { stored = value; },
    async delete(_key: string) { stored = undefined; },
    async list() { return stored ? ['pairing.hmac_secret'] : []; },
  };
}

describe('TokenManagerImpl', () => {
  let store: ReturnType<typeof makeSecretStore>;
  let tm: TokenManagerImpl;

  beforeEach(async () => {
    store = makeSecretStore();
    tm = new TokenManagerImpl(store);
    await tm.init();
  });

  it('sign then validate returns identical payload (minus added iat)', async () => {
    const payload = {
      device_id: 'dev-1',
      display_name: 'Test Device',
      owned_departments: ['LX'],
      tier: 'free' as const,
    };
    const token = tm.sign(payload);
    const decoded = tm.validate(token);
    expect(decoded.device_id).toBe('dev-1');
    expect(decoded.display_name).toBe('Test Device');
    expect(decoded.owned_departments).toEqual(['LX']);
    expect(decoded.tier).toBe('free');
    expect(typeof decoded.iat).toBe('number');
  });

  it('tamper with payload base64 → bad_sig', () => {
    const token = tm.sign({ device_id: 'dev-2', display_name: 'D', owned_departments: [], tier: 'free' });
    const [h, _p, s] = token.split('.');
    // Replace payload with something else
    const fakeP = Buffer.from(JSON.stringify({ device_id: 'evil', iat: 9999 })).toString('base64url');
    const tampered = `${h}.${fakeP}.${s}`;
    expect(() => tm.validate(tampered)).toThrow(TokenInvalidError);
    expect(() => tm.validate(tampered)).toThrow('bad_sig');
  });

  it('tamper with sig → bad_sig', () => {
    const token = tm.sign({ device_id: 'dev-3', display_name: 'D', owned_departments: [], tier: 'free' });
    const [h, p, sig] = token.split('.');
    const badSig = sig.slice(0, -4) + 'AAAA';
    expect(() => tm.validate(`${h}.${p}.${badSig}`)).toThrow(TokenInvalidError);
  });

  it('truncate to 2 parts → malformed', () => {
    expect(() => tm.validate('header.payload')).toThrow(TokenInvalidError);
    try { tm.validate('header.payload'); } catch (e) {
      expect((e as TokenInvalidError).reason).toBe('malformed');
    }
  });

  it('payload with exp in past → expired', () => {
    const payload = {
      device_id: 'dev-exp',
      display_name: 'D',
      owned_departments: [],
      tier: 'free' as const,
      exp: Math.floor(Date.now() / 1000) - 3600,
    };
    const token = tm.sign(payload);
    try {
      tm.validate(token);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as TokenInvalidError).reason).toBe('expired');
    }
  });

  it('revoke(deviceId) then validate token for that device → revoked', async () => {
    const token = tm.sign({ device_id: 'dev-rev', display_name: 'D', owned_departments: [], tier: 'free' });
    await tm.revoke('dev-rev');
    try {
      tm.validate(token);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as TokenInvalidError).reason).toBe('revoked');
    }
  });

  it('hashToken is deterministic and 64 hex chars', () => {
    const token = tm.sign({ device_id: 'dev-hash', display_name: 'D', owned_departments: [], tier: 'free' });
    const h1 = tm.hashToken(token);
    const h2 = tm.hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(h1)).toBe(true);
  });

  it('two TokenManagers with the same secret produce inter-validatable tokens', async () => {
    // First TM generates a token
    const token = tm.sign({ device_id: 'dev-cross', display_name: 'D', owned_departments: [], tier: 'free' });

    // Get the stored secret and create a second TM with the same store
    const store2 = makeSecretStore(await store.get('pairing.hmac_secret'));
    const tm2 = new TokenManagerImpl(store2);
    await tm2.init();

    // TM2 should validate a token signed by TM
    const decoded = tm2.validate(token);
    expect(decoded.device_id).toBe('dev-cross');
  });

  it('auto-generates secret on first init when absent', async () => {
    const freshStore = makeSecretStore(undefined);
    const freshTm = new TokenManagerImpl(freshStore);
    await freshTm.init();
    // Secret was created
    const s = await freshStore.get('pairing.hmac_secret');
    expect(s).toBeTruthy();
    expect(typeof s).toBe('string');
    // Should be able to sign and validate
    const token = freshTm.sign({ device_id: 'x', display_name: 'X', owned_departments: [], tier: 'free' });
    expect(() => freshTm.validate(token)).not.toThrow();
  });

  it('isRevoked returns true after revoke', async () => {
    await tm.revoke('dev-chk');
    expect(tm.isRevoked('dev-chk')).toBe(true);
    expect(tm.isRevoked('other-dev')).toBe(false);
  });
});
