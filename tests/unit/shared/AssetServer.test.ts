import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AssetServer, defaultCorsOrigin } from '../../../src/main/src/shared/AssetServer.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'assetserver-test-'));
}

describe('AssetServer', () => {
  let tmpDir: string;
  let server: AssetServer;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    server = new AssetServer({ port: 0, mode: { kind: 'prod', pwaDir: tmpDir } });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /system/health returns {status:ok} with version', async () => {
    const res = await request(server.httpServer()).get('/system/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.version).toBe('string');
    expect(typeof res.body.uptimeMs).toBe('number');
  });

  it('GET /system/version returns version + build + electron + node', async () => {
    const res = await request(server.httpServer()).get('/system/version').expect(200);
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('build');
    expect(res.body).toHaveProperty('electron');
    expect(res.body).toHaveProperty('node');
  });

  it('registerStaticRoute serves a file from the given dir', async () => {
    const staticDir = makeTmpDir();
    try {
      writeFileSync(join(staticDir, 'hello.txt'), 'world');
      server.registerStaticRoute('module-a', staticDir);
      const res = await request(server.httpServer()).get('/modules/module-a/hello.txt').expect(200);
      expect(res.text).toBe('world');
    } finally {
      rmSync(staticDir, { recursive: true, force: true });
    }
  });

  it('registerApiRoute GET returns handler return value as JSON', async () => {
    server.registerApiRoute('GET', '/foo', () => ({ hello: 'world' }));
    const res = await request(server.httpServer()).get('/api/foo').expect(200);
    expect(res.body).toEqual({ hello: 'world' });
  });

  it('registerApiRoute POST receives JSON body', async () => {
    server.registerApiRoute('POST', '/echo', (req) => req.body);
    const res = await request(server.httpServer())
      .post('/api/echo')
      .send({ data: 42 })
      .expect(200);
    expect(res.body).toEqual({ data: 42 });
  });

  it('registerApiRoute handler throw returns 500 without crashing', async () => {
    server.registerApiRoute('GET', '/boom', () => { throw new Error('test error'); });
    const res = await request(server.httpServer()).get('/api/boom').expect(500);
    expect(res.body).toEqual({ error: 'internal_error' });
  });

  it('unsubscribe on static route causes subsequent request to not find file', async () => {
    const staticDir = makeTmpDir();
    try {
      writeFileSync(join(staticDir, 'file.txt'), 'content');
      const sub = server.registerStaticRoute('mod-b', staticDir);
      await request(server.httpServer()).get('/modules/mod-b/file.txt').expect(200);
      sub.unsubscribe();
      // After unsubscribe, the route is gone — falls through to no handler → 404
      await request(server.httpServer()).get('/modules/mod-b/file.txt').expect(404);
    } finally {
      rmSync(staticDir, { recursive: true, force: true });
    }
  });

  it('unsubscribe on api route causes subsequent request to return 404', async () => {
    const sub = server.registerApiRoute('GET', '/removeme', () => ({ ok: true }));
    await request(server.httpServer()).get('/api/removeme').expect(200);
    sub.unsubscribe();
    const res = await request(server.httpServer()).get('/api/removeme');
    expect(res.status).toBe(404);
  });

  it('port() returns OS-assigned port after start', () => {
    expect(server.port()).toBeGreaterThan(0);
  });

  it('start() → stop() → start() cycle re-binds cleanly', async () => {
    const server2 = new AssetServer({ port: 0, mode: { kind: 'prod', pwaDir: tmpDir } });
    await server2.start();
    const port1 = server2.port();
    expect(port1).toBeGreaterThan(0);
    await server2.stop();
    expect(server2.port()).toBe(-1);
    await server2.start();
    const port2 = server2.port();
    expect(port2).toBeGreaterThan(0);
    await server2.stop();
  });

  it('stop() is idempotent — calling twice does not throw', async () => {
    const server3 = new AssetServer({ port: 0, mode: { kind: 'prod', pwaDir: tmpDir } });
    await server3.start();
    await server3.stop();
    await expect(server3.stop()).resolves.toBeUndefined();
  });

  it('CORS: LAN origin 192.168.x allowed, external origin rejected', async () => {
    const allowed = await request(server.httpServer())
      .get('/system/health')
      .set('Origin', 'http://192.168.1.20');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://192.168.1.20');

    const rejected = await request(server.httpServer())
      .get('/system/health')
      .set('Origin', 'http://malicious.example');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('dev mode: non-api requests proxied; /api/* not proxied', async () => {
    const stub = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stub: true }));
    });
    await new Promise<void>(r => stub.listen(0, r));
    const stubPort = (stub.address() as AddressInfo).port;

    const devServer = new AssetServer({
      port: 0,
      mode: { kind: 'dev', viteUrl: `http://localhost:${stubPort}` },
    });
    await devServer.start();
    try {
      // / should be proxied to stub
      const r1 = await request(devServer.httpServer()).get('/');
      expect(r1.status).toBe(200);
      expect(r1.body).toMatchObject({ stub: true });

      // /api/* not proxied — no route registered → 404
      const r2 = await request(devServer.httpServer()).get('/api/unknown');
      expect(r2.status).toBe(404);
    } finally {
      await devServer.stop();
      stub.close();
    }
  });
});

describe('defaultCorsOrigin', () => {
  it('allows no origin (same-origin/non-browser)', () => {
    expect(defaultCorsOrigin(undefined)).toBe(true);
  });

  it('allows localhost', () => {
    expect(defaultCorsOrigin('http://localhost:3000')).toBe(true);
  });

  it('allows 127.0.0.1', () => {
    expect(defaultCorsOrigin('http://127.0.0.1:5000')).toBe(true);
  });

  it('allows 10.x RFC1918', () => {
    expect(defaultCorsOrigin('http://10.0.0.5')).toBe(true);
  });

  it('allows 192.168.x RFC1918', () => {
    expect(defaultCorsOrigin('http://192.168.100.1')).toBe(true);
  });

  it('allows 172.16.x RFC1918', () => {
    expect(defaultCorsOrigin('http://172.16.0.1')).toBe(true);
  });

  it('allows 172.31.x RFC1918', () => {
    expect(defaultCorsOrigin('http://172.31.255.255')).toBe(true);
  });

  it('rejects 172.32.x (not RFC1918)', () => {
    expect(defaultCorsOrigin('http://172.32.0.1')).toBe(false);
  });

  it('rejects external domain', () => {
    expect(defaultCorsOrigin('http://malicious.example')).toBe(false);
  });
});
