import { describe, it, expect, vi, afterEach } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { YWebsocketAdapter } from '../../../../src/main/src/shared/syncBroker/yWebsocketAdapter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MSG_SYNC = 0;

async function makeTestServer(adapter: YWebsocketAdapter) {
  const srv = http.createServer();
  srv.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    const m = url.match(/^\/yjs\/([A-Za-z0-9_-]+)/);
    if (!m) return;
    adapter.handleUpgrade(req, socket, head as Buffer, m[1]);
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address() as AddressInfo;
  const wsUrl = (room: string) => `ws://127.0.0.1:${port}/yjs/${room}`;
  const stop = () => new Promise<void>(r => {
    srv.closeAllConnections?.();
    srv.close(() => r());
  });
  return { srv, port, wsUrl, stop };
}

function wireYjsClient(ws: WebSocket, doc: Y.Doc): void {
  ws.on('message', (data: Buffer) => {
    try {
      const dec = decoding.createDecoder(new Uint8Array(data));
      const type = decoding.readVarUint(dec);
      if (type === MSG_SYNC) {
        const reply = encoding.createEncoder();
        encoding.writeVarUint(reply, MSG_SYNC);
        syncProtocol.readSyncMessage(dec, reply, doc, null);
        if (encoding.length(reply) > 1) ws.send(encoding.toUint8Array(reply));
      }
    } catch { /* ignore */ }
  });
  ws.on('open', () => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, doc);
    ws.send(encoding.toUint8Array(enc));
  });
}

function waitUntil(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = (): void => {
      if (predicate()) { resolve(); return; }
      if (Date.now() > deadline) { reject(new Error('waitUntil timeout')); return; }
      setImmediate(tick);
    };
    tick();
  });
}

// ── Unit tests (no network) ───────────────────────────────────────────────────

describe('YWebsocketAdapter.attachDoc', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates entry with external doc', () => {
    const adapter = new YWebsocketAdapter();
    const extDoc = new Y.Doc();
    extDoc.getMap('test').set('hello', 'world');

    adapter.attachDoc('room1', extDoc);

    const entry = adapter['docs'].get('room1');
    expect(entry?.doc).toBe(extDoc);
    expect(entry?.doc.getMap('test').get('hello')).toBe('world');
  });

  it('is idempotent — same name + same doc is a no-op', () => {
    const adapter = new YWebsocketAdapter();
    const extDoc = new Y.Doc();

    adapter.attachDoc('room1', extDoc);
    const entry1 = adapter['docs'].get('room1');

    adapter.attachDoc('room1', extDoc);
    const entry2 = adapter['docs'].get('room1');

    expect(entry1).toBe(entry2);
    expect(entry1?.doc).toBe(extDoc);
  });

  it('replaces entry when called with same name but different doc', () => {
    const adapter = new YWebsocketAdapter();
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    doc2.getMap('meta').set('show_id', 'new-show');

    adapter.attachDoc('room1', doc1);
    adapter.attachDoc('room1', doc2);

    const entry = adapter['docs'].get('room1');
    expect(entry?.doc).toBe(doc2);
    expect(entry?.doc.getMap('meta').get('show_id')).toBe('new-show');
  });

  it('replaces entry created by getOrCreateDoc with external doc', () => {
    const adapter = new YWebsocketAdapter();
    // Simulate lazy-created internal doc
    const internalEntry = adapter.openDocument('room1');
    const internalDoc = internalEntry.doc;

    const extDoc = new Y.Doc();
    extDoc.getMap('data').set('key', 'value');

    adapter.attachDoc('room1', extDoc);

    const entry = adapter['docs'].get('room1');
    expect(entry?.doc).toBe(extDoc);
    expect(entry?.doc).not.toBe(internalDoc);
  });

  it('logs y-doc.attached', () => {
    const log = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    const adapter = new YWebsocketAdapter(log as never);
    const extDoc = new Y.Doc();

    adapter.attachDoc('room1', extDoc);

    expect(log.info).toHaveBeenCalledWith('y-doc.attached', { name: 'room1' });
  });
});

describe('YWebsocketAdapter.detachDoc', () => {
  it('removes entry from docs map', () => {
    const adapter = new YWebsocketAdapter();
    const extDoc = new Y.Doc();

    adapter.attachDoc('room1', extDoc);
    expect(adapter['docs'].has('room1')).toBe(true);

    adapter.detachDoc('room1');
    expect(adapter['docs'].has('room1')).toBe(false);
  });

  it('does not destroy external doc', () => {
    const adapter = new YWebsocketAdapter();
    const extDoc = new Y.Doc();
    extDoc.getMap('meta').set('show_id', 'abc');

    adapter.attachDoc('room1', extDoc);
    adapter.detachDoc('room1');

    // External doc should still be readable
    expect(extDoc.getMap('meta').get('show_id')).toBe('abc');
    expect(extDoc.isDestroyed).toBe(false);
  });

  it('is a no-op when name not found', () => {
    const adapter = new YWebsocketAdapter();
    expect(() => adapter.detachDoc('nonexistent')).not.toThrow();
  });

  it('logs y-doc.detached', () => {
    const log = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    const adapter = new YWebsocketAdapter(log as never);
    const extDoc = new Y.Doc();

    adapter.attachDoc('room1', extDoc);
    log.info.mockClear();
    adapter.detachDoc('room1');

    expect(log.info).toHaveBeenCalledWith('y-doc.detached', { name: 'room1' });
  });
});

// ── Network tests ─────────────────────────────────────────────────────────────

describe('YWebsocketAdapter network — attachDoc', () => {
  it('WS connection after attachDoc syncs from external doc state', async () => {
    const adapter = new YWebsocketAdapter();
    const { wsUrl, stop } = await makeTestServer(adapter);

    const extDoc = new Y.Doc();
    extDoc.getMap('show').set('title', 'Grand Finale');
    adapter.attachDoc('show-abc', extDoc);

    const clientDoc = new Y.Doc();
    const ws = new WebSocket(wsUrl('show-abc'));
    wireYjsClient(ws, clientDoc);

    await waitUntil(() => clientDoc.getMap('show').get('title') === 'Grand Finale');
    expect(clientDoc.getMap('show').get('title')).toBe('Grand Finale');

    ws.close();
    await stop();
  });

  it('replaceDoc closes old connections with 1000 doc_replaced', async () => {
    const adapter = new YWebsocketAdapter();
    const { wsUrl, stop } = await makeTestServer(adapter);

    const doc1 = new Y.Doc();
    adapter.attachDoc('replace-room', doc1);

    const ws = new WebSocket(wsUrl('replace-room'));
    await new Promise<void>(r => ws.on('open', () => r()));

    const closeInfo = new Promise<{ code: number; reason: string }>(r =>
      ws.on('close', (code, reason) => r({ code, reason: reason.toString() })),
    );

    const doc2 = new Y.Doc();
    adapter.attachDoc('replace-room', doc2);

    const { code, reason } = await closeInfo;
    expect(code).toBe(1000);
    expect(reason).toBe('doc_replaced');

    await stop();
  });
});

describe('YWebsocketAdapter network — detachDoc', () => {
  it('closes connected WS with 1000 doc_detached', async () => {
    const adapter = new YWebsocketAdapter();
    const { wsUrl, stop } = await makeTestServer(adapter);

    const extDoc = new Y.Doc();
    adapter.attachDoc('detach-room', extDoc);

    const ws = new WebSocket(wsUrl('detach-room'));
    await new Promise<void>(r => ws.on('open', () => r()));

    const closeInfo = new Promise<{ code: number; reason: string }>(r =>
      ws.on('close', (code, reason) => r({ code, reason: reason.toString() })),
    );

    adapter.detachDoc('detach-room');

    const { code, reason } = await closeInfo;
    expect(code).toBe(1000);
    expect(reason).toBe('doc_detached');

    await stop();
  });

  it('does not destroy external doc after detach with active WS', async () => {
    const adapter = new YWebsocketAdapter();
    const { wsUrl, stop } = await makeTestServer(adapter);

    const extDoc = new Y.Doc();
    extDoc.getMap('meta').set('show_id', 'keep-alive');
    adapter.attachDoc('keep-room', extDoc);

    const ws = new WebSocket(wsUrl('keep-room'));
    await new Promise<void>(r => ws.on('open', () => r()));

    const closePromise = new Promise<void>(r => ws.on('close', () => r()));
    adapter.detachDoc('keep-room');
    await closePromise;

    expect(extDoc.isDestroyed).toBe(false);
    expect(extDoc.getMap('meta').get('show_id')).toBe('keep-alive');

    await stop();
  });
});
