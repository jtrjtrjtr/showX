import { describe, it, expect, vi, afterEach } from 'vitest';
import * as dgram from 'node:dgram';
import { createRequire } from 'node:module';
import { OscPortListener } from '../../../../src/main/src/shared/input/oscListener.js';
import { Logger } from '../../../../src/main/src/shared/Logger.js';

const _require = createRequire(import.meta.url);
type OscMinModule = {
  toBuffer(msg: Record<string, unknown>): Buffer;
  fromBuffer(buf: Buffer): unknown;
};
function getOscMin(): OscMinModule { return _require('osc-min') as OscMinModule; }

function makeOscBuf(address: string, args: Array<{ type: string; value?: unknown }> = []): Buffer {
  return getOscMin().toBuffer({ oscType: 'message', address, args });
}

function makeBundleBuf(messages: Array<{ address: string }>): Buffer {
  return getOscMin().toBuffer({
    oscType: 'bundle',
    timetag: [0, 1],
    elements: messages.map((m) => ({ oscType: 'message', address: m.address, args: [] })),
  });
}

async function sendUdp(port: number, buf: Buffer): Promise<void> {
  const sender = dgram.createSocket('udp4');
  await new Promise<void>((resolve, reject) => {
    sender.send(buf, port, '127.0.0.1', (err) => {
      sender.close();
      err ? reject(err) : resolve();
    });
  });
}

const logSink = new Logger({ output: { write: () => true } as unknown as NodeJS.WritableStream });

describe('OscPortListener', () => {
  const listeners: OscPortListener[] = [];

  afterEach(async () => {
    for (const l of listeners) await l.stop().catch(() => {});
    listeners.length = 0;
  });

  it('parses a single OSC message and delivers to handler with correct fields', async () => {
    const listener = new OscPortListener(0, logSink);
    listeners.push(listener);
    await listener.start();
    const port = listener.boundPort;

    const received: Array<{ address: string; args: unknown[]; fromHost: string }> = [];
    listener.addHandler((msg) => received.push({ address: msg.address, args: msg.args, fromHost: msg.fromHost }));

    await sendUdp(port, makeOscBuf('/foo/bar', [{ type: 'integer', value: 42 }, { type: 'string', value: 'hello' }]));
    await new Promise((r) => setTimeout(r, 60));

    expect(received).toHaveLength(1);
    expect(received[0]!.address).toBe('/foo/bar');
    expect(received[0]!.args).toContain(42);
    expect(received[0]!.args).toContain('hello');
    expect(received[0]!.fromHost).toBe('127.0.0.1');
  });

  it('unpacks an OSC bundle into individual messages — both handlers fire', async () => {
    const listener = new OscPortListener(0, logSink);
    listeners.push(listener);
    await listener.start();
    const port = listener.boundPort;

    const addresses: string[] = [];
    listener.addHandler((msg) => addresses.push(msg.address));

    await sendUdp(port, makeBundleBuf([{ address: '/a' }, { address: '/b' }]));
    await new Promise((r) => setTimeout(r, 60));

    expect(addresses).toContain('/a');
    expect(addresses).toContain('/b');
    expect(addresses).toHaveLength(2);
  });

  it('malformed bytes → no handler called, warn logged', async () => {
    const warnSpy = vi.spyOn(logSink, 'warn');
    const listener = new OscPortListener(0, logSink);
    listeners.push(listener);
    await listener.start();
    const port = listener.boundPort;

    const called: number[] = [];
    listener.addHandler(() => called.push(1));

    await sendUdp(port, Buffer.from([0xff, 0xfe, 0x00, 0x01]));
    await new Promise((r) => setTimeout(r, 60));

    expect(called).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('after stop(), incoming packets have no effect', async () => {
    const listener = new OscPortListener(0, logSink);
    listeners.push(listener);
    await listener.start();
    const port = listener.boundPort;

    const called: number[] = [];
    listener.addHandler(() => called.push(1));

    await listener.stop();

    // Try to send — port is now unbound so packet is silently dropped
    const sender = dgram.createSocket('udp4');
    await new Promise<void>((resolve) => {
      sender.send(makeOscBuf('/test'), port, '127.0.0.1', () => {
        sender.close();
        resolve();
      });
    });
    await new Promise((r) => setTimeout(r, 60));

    expect(called).toHaveLength(0);
  });

  it('handler throw does not kill listener — next message still delivered', async () => {
    const listener = new OscPortListener(0, logSink);
    listeners.push(listener);
    await listener.start();
    const port = listener.boundPort;

    const addresses: string[] = [];
    listener.addHandler((msg) => {
      addresses.push(msg.address);
      if (msg.address === '/fail') throw new Error('boom');
    });

    await sendUdp(port, makeOscBuf('/fail'));
    await sendUdp(port, makeOscBuf('/ok'));
    await new Promise((r) => setTimeout(r, 100));

    expect(addresses).toContain('/fail');
    expect(addresses).toContain('/ok');
  });

  it('handlerCount tracks additions and removals', async () => {
    const listener = new OscPortListener(0, logSink);
    listeners.push(listener);
    await listener.start();

    const h1 = (): void => { /* noop */ };
    const h2 = (): void => { /* noop */ };

    expect(listener.handlerCount).toBe(0);
    listener.addHandler(h1);
    expect(listener.handlerCount).toBe(1);
    listener.addHandler(h2);
    expect(listener.handlerCount).toBe(2);
    listener.removeHandler(h1);
    expect(listener.handlerCount).toBe(1);
  });
});
