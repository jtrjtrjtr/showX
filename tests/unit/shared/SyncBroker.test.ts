import { describe, it, expect, vi, afterEach } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { SyncBroker } from '../../../src/main/src/shared/SyncBroker.js';
import type { PersistenceHook } from '../../../src/main/src/shared/SyncBroker.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

async function makeTestServer() {
  const broker = new SyncBroker();
  const srv = http.createServer();
  broker.attach(srv);
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address() as AddressInfo;
  const wsUrl = (path: string, token = 'test-tok') =>
    `ws://127.0.0.1:${port}${path}?token=${token}`;
  const stop = () =>
    new Promise<void>(r => {
      srv.closeAllConnections?.();
      srv.close(() => r());
    });
  return { broker, srv, port, wsUrl, stop };
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

describe('SyncBroker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('openDocument returns same YDocHandle (same Y.Doc) for repeat calls', () => {
    const broker = new SyncBroker();
    const h1 = broker.openDocument('doc-a');
    const h2 = broker.openDocument('doc-a');
    expect(h1.doc).toBe(h2.doc);
    expect(h1.name).toBe('doc-a');
  });

  it('client WebSocket syncs content from server-side Y.Doc via handshake', async () => {
    const { broker, wsUrl, stop } = await makeTestServer();

    const handle = broker.openDocument('sync-test');
    (handle.doc as Y.Doc).getMap('root').set('greeting', 'hello');

    const clientDoc = new Y.Doc();
    const ws = new WebSocket(wsUrl('/yjs/sync-test'));
    wireYjsClient(ws, clientDoc);

    await waitUntil(() => clientDoc.getMap('root').get('greeting') === 'hello');

    ws.close();
    handle.destroy();
    await stop();
  });

  it('auth gate: missing token → connection rejected with 401', async () => {
    const { port, stop } = await makeTestServer();
    // no ?token= in URL
    const ws = new WebSocket(`ws://127.0.0.1:${port}/yjs/auth-test`);

    const rejected = await new Promise<boolean>(resolve => {
      ws.on('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(401);
        resolve(true);
      });
      ws.on('error', () => resolve(true));
      ws.on('open', () => resolve(false));
    });

    expect(rejected).toBe(true);
    await stop();
  });

  it('auth gate: valid bearer token → connection accepted', async () => {
    const { wsUrl, stop } = await makeTestServer();
    const ws = new WebSocket(wsUrl('/yjs/auth-ok', 'valid-token'));

    const opened = await new Promise<boolean>(resolve => {
      ws.on('open', () => resolve(true));
      ws.on('error', () => resolve(false));
    });

    expect(opened).toBe(true);
    ws.close();
    await stop();
  });

  it('registerPersistence: load called once on first open; save called within 300ms of update', async () => {
    vi.useFakeTimers();

    const broker = new SyncBroker();
    const loadFn = vi.fn().mockResolvedValue(undefined);
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const hook: PersistenceHook = { load: loadFn, save: saveFn };

    broker.registerPersistence('persist-doc', hook);
    // load is scheduled via Promise.resolve().then() — drain microtask queue
    await Promise.resolve();
    await Promise.resolve();
    expect(loadFn).toHaveBeenCalledOnce();

    // trigger a doc update
    const handle = broker.openDocument('persist-doc');
    (handle.doc as Y.Doc).getMap('data').set('k', 'v');

    // advance past the 250ms throttle window
    await vi.advanceTimersByTimeAsync(300);
    expect(saveFn).toHaveBeenCalled();
  });

  it('subscribeAwareness invoked with clientId + state when client sends awareness update', async () => {
    const { broker, wsUrl, stop } = await makeTestServer();

    const handler = vi.fn();
    const sub = broker.subscribeAwareness('aw-test', handler);

    const ws = new WebSocket(wsUrl('/yjs/aw-test'));
    await new Promise<void>(r => ws.on('open', () => r()));

    // Build a client-side awareness update
    const clientDoc = new Y.Doc();
    const clientAwareness = new awarenessProtocol.Awareness(clientDoc);
    clientAwareness.setLocalState({ cursor: 42 });
    const awarenessBytes = awarenessProtocol.encodeAwarenessUpdate(
      clientAwareness,
      [clientDoc.clientID],
    );
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessBytes);
    ws.send(encoding.toUint8Array(enc));

    await waitUntil(() => handler.mock.calls.length > 0);
    expect(handler).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ cursor: 42 }),
    );

    sub.unsubscribe();
    ws.close();
    await stop();
  });

  it('closeDocument closes all connected client sockets with code 1000', async () => {
    const { broker, wsUrl, stop } = await makeTestServer();

    const ws = new WebSocket(wsUrl('/yjs/close-doc'));
    await new Promise<void>(r => ws.on('open', () => r()));

    const closeCode = new Promise<number>(r => ws.on('close', code => r(code)));

    broker.closeDocument(broker.openDocument('close-doc'));

    expect(await closeCode).toBe(1000);
    await stop();
  });

  it('subscribeAwareness unsubscribe stops further notifications', async () => {
    const { broker, wsUrl, stop } = await makeTestServer();

    const handler = vi.fn();
    const sub = broker.subscribeAwareness('aw-unsub', handler);

    const ws = new WebSocket(wsUrl('/yjs/aw-unsub'));
    await new Promise<void>(r => ws.on('open', () => r()));

    const sendAwareness = (cursor: number) => {
      const d = new Y.Doc();
      const aw = new awarenessProtocol.Awareness(d);
      aw.setLocalState({ cursor });
      const bytes = awarenessProtocol.encodeAwarenessUpdate(aw, [d.clientID]);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, bytes);
      ws.send(encoding.toUint8Array(enc));
    };

    sendAwareness(1);
    await waitUntil(() => handler.mock.calls.length >= 1);

    sub.unsubscribe();
    const callsBefore = handler.mock.calls.length;

    sendAwareness(2);
    await new Promise(r => setTimeout(r, 60));

    expect(handler.mock.calls.length).toBe(callsBefore);

    ws.close();
    await stop();
  });

  it('upgrade to unknown path is not consumed by SyncBroker (passed to other listeners)', async () => {
    const broker = new SyncBroker();
    const srv = http.createServer();
    broker.attach(srv);

    let otherHandlerCalled = false;
    srv.on('upgrade', (_req, socket) => {
      otherHandlerCalled = true;
      try { socket.destroy(); } catch { /* socket may already be consumed for /yjs/ paths */ }
    });

    await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
    const { port } = srv.address() as AddressInfo;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/random-path?token=t`);
    await new Promise<void>(r => {
      ws.on('close', () => r());
      ws.on('error', () => r());
    });

    expect(otherHandlerCalled).toBe(true);
    await new Promise<void>(r => {
      srv.closeAllConnections?.();
      srv.close(() => r());
    });
  });
});
