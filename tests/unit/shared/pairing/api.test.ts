import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mountPairingRoutes } from '../../../../src/main/src/shared/pairing/api.js';
import { PairingStoreImpl } from '../../../../src/main/src/shared/PairingStore.js';
import { TokenManagerImpl } from '../../../../src/main/src/shared/pairing/tokenManager.js';
import { PinManagerImpl } from '../../../../src/main/src/shared/pairing/pinManager.js';
import { PersistedStore } from '../../../../src/main/src/shared/PersistedStore.js';
import { resolvePaths } from '../../../../src/main/src/shared/paths.js';

function makeNullLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => makeNullLogger(),
  };
}

function makeSecretStore() {
  const map = new Map<string, string>();
  return {
    async get(key: string) { return map.get(key); },
    async set(key: string, value: string) { map.set(key, value); },
    async delete(key: string) { map.delete(key); },
    async list() { return [...map.keys()]; },
  };
}

async function makeApp() {
  const tmpDir = await mkdtemp(join(tmpdir(), 'showx-api-test-'));
  const layout = resolvePaths({ override: tmpDir });
  const persisted = new PersistedStore('pairing', layout);
  const secretStore = makeSecretStore();
  const tokens = new TokenManagerImpl(secretStore);
  await tokens.init();
  const pairingStore = new PairingStoreImpl(persisted, tokens);
  await pairingStore.init();
  const pins = new PinManagerImpl();

  const app = express();
  app.use(express.json());
  const router = express.Router();
  mountPairingRoutes(router, {
    pairing: pairingStore,
    pins,
    tokens,
    hostInfo: { host: 'localhost', port: 5300 },
    logger: makeNullLogger(),
  });
  app.use(router);

  return { app, pairingStore, tokens, pins };
}

describe('Pairing HTTP API', () => {
  it('POST /pairing/initiate → 200 with valid PIN format and qr_data_url', async () => {
    const { app } = await makeApp();
    const res = await request(app).post('/pairing/initiate').send({});
    expect(res.status).toBe(200);
    expect(res.body.pin).toMatch(/^\d{6}$/);
    expect(typeof res.body.expires_at).toBe('number');
    expect(res.body.qr_data_url).toMatch(/^data:image\/png;base64,/);
    expect(res.body.pair_url).toMatch(/^showx:\/\/pair\?pin=/);
  });

  it('POST /pairing/claim with valid PIN → 200 with token and device record', async () => {
    const { app } = await makeApp();
    const initRes = await request(app).post('/pairing/initiate').send({});
    const { pin } = initRes.body;

    const claimRes = await request(app)
      .post('/pairing/claim')
      .send({ pin, display_name: 'LX iPad', owned_departments: ['LX'] });

    expect(claimRes.status).toBe(200);
    expect(typeof claimRes.body.token).toBe('string');
    expect(claimRes.body.device.display_name).toBe('LX iPad');
    expect(claimRes.body.device.owned_departments).toEqual(['LX']);
    expect(claimRes.body.device.tier).toBe('free');
  });

  it('POST /pairing/claim same PIN twice → 401 already_claimed', async () => {
    const { app } = await makeApp();
    const initRes = await request(app).post('/pairing/initiate').send({});
    const { pin } = initRes.body;
    const body = { pin, display_name: 'Dev A' };

    await request(app).post('/pairing/claim').send(body);
    const res2 = await request(app).post('/pairing/claim').send(body);
    expect(res2.status).toBe(401);
    expect(res2.body.error).toBe('already_claimed');
  });

  it('POST /pairing/claim with wrong PIN → 401 wrong', async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post('/pairing/claim')
      .send({ pin: '000000', display_name: 'Bad Actor' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('wrong');
  });

  it('GET /pairing/devices without auth → 401', async () => {
    const { app } = await makeApp();
    const res = await request(app).get('/pairing/devices');
    expect(res.status).toBe(401);
  });

  it('GET /pairing/devices with admin token → 200 array', async () => {
    const { app, tokens } = await makeApp();

    // Initiate + claim a device first
    const initRes = await request(app).post('/pairing/initiate').send({});
    await request(app)
      .post('/pairing/claim')
      .send({ pin: initRes.body.pin, display_name: 'SM iPad', owned_departments: [] });

    // Sign an admin token (owned_departments: [])
    const adminToken = tokens.sign({
      device_id: 'admin-virtual',
      display_name: 'Admin',
      owned_departments: [],
      tier: 'free',
    });

    const res = await request(app)
      .get('/pairing/devices')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('DELETE /pairing/devices/:id with admin token → 200; subsequent token validate → revoked', async () => {
    const { app, tokens } = await makeApp();

    // Pair a device
    const initRes = await request(app).post('/pairing/initiate').send({});
    const claimRes = await request(app)
      .post('/pairing/claim')
      .send({ pin: initRes.body.pin, display_name: 'LX iPad', owned_departments: ['LX'] });

    const { device, token } = claimRes.body;

    // Admin deletes the device
    const adminToken = tokens.sign({
      device_id: 'admin-virtual',
      display_name: 'Admin',
      owned_departments: [],
      tier: 'free',
    });

    const deleteRes = await request(app)
      .delete(`/pairing/devices/${device.device_id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ok).toBe(true);

    // Token for the revoked device should now be invalid
    expect(() => tokens.validate(token)).toThrow('revoked');
  });

  it('GET /pairing/devices with non-admin token (has departments) → 401', async () => {
    const { app, tokens } = await makeApp();
    const nonAdminToken = tokens.sign({
      device_id: 'dev-lx',
      display_name: 'LX',
      owned_departments: ['LX'],
      tier: 'free',
    });
    const res = await request(app)
      .get('/pairing/devices')
      .set('Authorization', `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(401);
  });

  it('GET /pairing/devices with local-secret header → 200 (admin bypass)', async () => {
    const { app: appBase, pairingStore, tokens, pins } = await makeApp();

    // Rebuild app with localSecret
    const app2 = express();
    app2.use(express.json());
    const router2 = express.Router();
    mountPairingRoutes(router2, {
      pairing: pairingStore,
      pins,
      tokens,
      hostInfo: { host: 'localhost', port: 5300 },
      logger: makeNullLogger(),
      localSecret: 'test-local-secret-xyz',
    });
    app2.use(router2);

    const res = await request(app2)
      .get('/pairing/devices')
      .set('x-showx-local-secret', 'test-local-secret-xyz');
    expect(res.status).toBe(200);
  });
});
