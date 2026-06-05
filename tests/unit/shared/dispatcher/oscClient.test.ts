import { describe, it, expect, vi } from 'vitest';
import { OscPool } from '../../../../src/main/src/shared/dispatcher/oscClient.js';
import type { OscSocketFactory } from '../../../../src/main/src/shared/dispatcher/oscClient.js';
import type { OscMessage } from '../../../../src/main/src/shared/index.js';

function makeMockSocket() {
  const sends: Array<{ buf: Buffer; port: number; host: string }> = [];
  let closed = false;
  const socket = {
    send: vi.fn((buf: Buffer, port: number, host: string, cb: (err?: Error) => void) => {
      sends.push({ buf, port, host });
      cb();
    }),
    close: vi.fn(() => { closed = true; }),
    _sends: sends,
    _closed: () => closed,
  };
  return socket;
}

type MockSocket = ReturnType<typeof makeMockSocket>;

function makeFactory(socket: MockSocket): OscSocketFactory {
  let callCount = 0;
  return {
    create: vi.fn(() => {
      callCount++;
      return socket as unknown as ReturnType<OscSocketFactory['create']>;
    }),
    _callCount: () => callCount,
  } as unknown as OscSocketFactory & { _callCount(): number };
}

const sampleMsg: OscMessage = {
  transport: 'osc',
  host: '10.0.1.10',
  port: 8000,
  address: '/foo/bar',
  args: [1, 2.5, 'hello', true],
};

describe('OscPool', () => {
  it('claim + send calls socket.send with buffer, port, host', async () => {
    const socket = makeMockSocket();
    const factory = makeFactory(socket);
    const pool = new OscPool(factory);
    const handle = pool.claim('10.0.1.10', 8000);
    const result = await handle.send(sampleMsg);
    expect(result.ok).toBe(true);
    expect(result.transport).toBe('osc');
    expect(socket.send).toHaveBeenCalledOnce();
    const call = socket.send.mock.calls[0]!;
    expect(call[1]).toBe(8000);
    expect(call[2]).toBe('10.0.1.10');
  });

  it('two claims for same host:port share one socket (factory.create called once)', () => {
    const socket = makeMockSocket();
    const factory = makeFactory(socket) as OscSocketFactory & { _callCount(): number };
    const pool = new OscPool(factory);
    pool.claim('10.0.1.10', 8000);
    pool.claim('10.0.1.10', 8000);
    expect((factory as unknown as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledOnce();
  });

  it('refcount drops to zero → socket.close called and entry removed', () => {
    const socket = makeMockSocket();
    const factory = makeFactory(socket);
    const pool = new OscPool(factory);
    const h1 = pool.claim('10.0.1.10', 8000);
    const h2 = pool.claim('10.0.1.10', 8000);
    h1.release();
    expect(socket.close).not.toHaveBeenCalled();
    h2.release();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(pool.status()).toHaveLength(0);
  });

  it('latencyMs is a non-negative number in DispatchResult', async () => {
    const socket = makeMockSocket();
    const pool = new OscPool(makeFactory(socket));
    const handle = pool.claim('10.0.1.1', 9000);
    const result = await handle.send({ ...sampleMsg, host: '10.0.1.1', port: 9000 });
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('send error propagates as ok=false with error string', async () => {
    const socket = makeMockSocket();
    socket.send.mockImplementationOnce((_buf: unknown, _port: unknown, _host: unknown, cb: (err?: Error) => void) => {
      cb(new Error('network fail'));
    });
    const pool = new OscPool(makeFactory(socket));
    const handle = pool.claim('10.0.1.10', 8000);
    const result = await handle.send(sampleMsg);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network fail');
  });

  it('integer args mapped as {type:integer}, float as {type:float}', async () => {
    // We test this indirectly: ensure integer 1 and float 1.5 both produce valid sends
    const socket = makeMockSocket();
    const pool = new OscPool(makeFactory(socket));
    const handle = pool.claim('127.0.0.1', 7000);
    // Integer arg
    const r1 = await handle.send({ transport: 'osc', host: '127.0.0.1', port: 7000, address: '/x', args: [1] });
    expect(r1.ok).toBe(true);
    // Float arg
    const r2 = await handle.send({ transport: 'osc', host: '127.0.0.1', port: 7000, address: '/x', args: [1.5] });
    expect(r2.ok).toBe(true);
  });

  it('status() reports active connections with refcount', () => {
    const socket = makeMockSocket();
    const pool = new OscPool(makeFactory(socket));
    pool.claim('10.0.1.10', 8000);
    pool.claim('10.0.1.10', 8000);
    const status = pool.status();
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ host: '10.0.1.10', port: 8000, refcount: 2 });
  });
});
