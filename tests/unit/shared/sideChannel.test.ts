import { describe, it, expect, vi } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { SideChannel } from '../../../src/main/src/shared/syncBroker/sideChannel.js';
import type { SideChannelMessage } from 'showx-shared';

const GO_MSG: SideChannelMessage = { topic: 'go', payload: { cue: 1 } };

async function makeSideChannelServer() {
  const ch = new SideChannel();
  const wss = new (await import('ws')).WebSocketServer({ noServer: true });
  const srv = http.createServer();

  srv.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const showId = url.pathname.replace(/^\//, '') || 'default';
    ch.handleUpgrade(req, socket, head, showId);
  });

  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address() as AddressInfo;

  const wsUrl = (showId: string) => `ws://127.0.0.1:${port}/${showId}`;
  const stop = () =>
    new Promise<void>(r => {
      srv.closeAllConnections?.();
      srv.close(() => r());
    });
  return { ch, srv, port, wsUrl, stop };
}

function connectAndWait(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data: Buffer) => {
      try { resolve(JSON.parse(data.toString('utf8'))); }
      catch (e) { reject(e); }
    });
    ws.once('error', reject);
  });
}

function waitUntil(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = (): void => {
      if (pred()) { resolve(); return; }
      if (Date.now() > deadline) { reject(new Error('waitUntil timeout')); return; }
      setImmediate(tick);
    };
    tick();
  });
}

describe('SideChannel', () => {
  it('publish broadcasts to all WS subscribers of the same showId', async () => {
    const { ch, wsUrl, stop } = await makeSideChannelServer();

    const ws1 = await connectAndWait(wsUrl('show-1'));
    const ws2 = await connectAndWait(wsUrl('show-1'));

    const [msg1, msg2] = await Promise.all([
      nextMessage(ws1),
      nextMessage(ws2),
      ch.publish('show-1', GO_MSG),
    ]);

    expect((msg1 as SideChannelMessage).topic).toBe('go');
    expect((msg2 as SideChannelMessage).topic).toBe('go');

    ws1.close(); ws2.close();
    await stop();
  });

  it('publish does NOT reach subscribers of a different showId', async () => {
    const { ch, wsUrl, stop } = await makeSideChannelServer();

    const ws1 = await connectAndWait(wsUrl('show-A'));
    const ws2 = await connectAndWait(wsUrl('show-B'));

    const received: string[] = [];
    ws1.on('message', (d: Buffer) => received.push('A:' + d.toString()));
    ws2.on('message', (d: Buffer) => received.push('B:' + d.toString()));

    ch.publish('show-A', GO_MSG);

    await new Promise(r => setTimeout(r, 50));

    const fromA = received.filter(s => s.startsWith('A:'));
    const fromB = received.filter(s => s.startsWith('B:'));
    expect(fromA.length).toBe(1);
    expect(fromB.length).toBe(0);

    ws1.close(); ws2.close();
    await stop();
  });

  it('subscribeServer receives published messages', () => {
    const ch = new SideChannel();
    const received: SideChannelMessage[] = [];
    ch.subscribeServer('show-s', m => received.push(m));
    ch.publish('show-s', GO_MSG);
    expect(received).toHaveLength(1);
    expect(received[0].topic).toBe('go');
  });

  it('subscribeServer unsubscribe stops further notifications', () => {
    const ch = new SideChannel();
    const fn = vi.fn();
    const sub = ch.subscribeServer('show-u', fn);
    ch.publish('show-u', GO_MSG);
    sub.unsubscribe();
    ch.publish('show-u', GO_MSG);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('late joiner receives recent buffer (5 messages → joiner sees 5)', async () => {
    const { ch, wsUrl, stop } = await makeSideChannelServer();

    // Push 5 messages before connecting
    for (let i = 0; i < 5; i++) {
      ch.publish('show-late', { topic: 'go', payload: { seq: i } });
    }

    const ws = await connectAndWait(wsUrl('show-late'));
    const replayed: unknown[] = [];
    const done = new Promise<void>(r => {
      ws.on('message', (d: Buffer) => {
        const m = JSON.parse(d.toString('utf8'));
        if (m._replay) replayed.push(m);
        if (replayed.length >= 5) r();
      });
    });

    await done;
    expect(replayed).toHaveLength(5);

    ws.close();
    await stop();
  });

  it('buffer caps at 100: push 150, late joiner sees last 100', async () => {
    const { ch, wsUrl, stop } = await makeSideChannelServer();

    for (let i = 0; i < 150; i++) {
      ch.publish('show-cap', { topic: 'go', payload: { seq: i } });
    }

    const ws = await connectAndWait(wsUrl('show-cap'));
    const replayed: unknown[] = [];
    const settled = new Promise<void>(r => {
      // wait a bit after connection to collect all replayed messages
      ws.on('message', (d: Buffer) => {
        const m = JSON.parse(d.toString('utf8'));
        if (m._replay) replayed.push(m);
      });
      setTimeout(r, 100);
    });
    await settled;

    expect(replayed).toHaveLength(100);
    // First replayed should be seq=50 (150 - 100)
    expect((replayed[0] as { payload: { seq: number } }).payload.seq).toBe(50);

    ws.close();
    await stop();
  });

  it('WS client message is re-broadcast to other subscribers in same showId', async () => {
    const { wsUrl, stop } = await makeSideChannelServer();

    const ws1 = await connectAndWait(wsUrl('show-relay'));
    const ws2 = await connectAndWait(wsUrl('show-relay'));

    const msgFromWs1 = nextMessage(ws2);

    ws1.send(JSON.stringify({ topic: 'go', payload: { from: 'client1' } }));

    const received = await msgFromWs1;
    expect((received as SideChannelMessage).topic).toBe('go');
    expect((received as { payload: { from: string } }).payload.from).toBe('client1');

    ws1.close(); ws2.close();
    await stop();
  });

  it('bad JSON from client is logged and ignored (no crash)', async () => {
    const { wsUrl, stop } = await makeSideChannelServer();

    const ws = await connectAndWait(wsUrl('show-badjson'));

    // No crash expected — send garbage
    ws.send('not-json-{[');
    await new Promise(r => setTimeout(r, 50));

    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.close();
    await stop();
  });
});
