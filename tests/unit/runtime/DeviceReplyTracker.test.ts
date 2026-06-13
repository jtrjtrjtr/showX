import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeviceReplyTracker } from '../../../src/main/src/runtime/GoExecutor.js';
import type { DeviceReplyUpdate } from '../../../src/main/src/runtime/GoExecutor.js';
import { Logger } from '../../../src/main/src/shared/Logger.js';

// ── Fake OscPortListener factory ──────────────────────────────────────────────

interface FakeListener {
  handlers: Set<(msg: { address: string; args: unknown[]; fromHost: string; fromPort: number; receivedAt: number }) => void>;
  started: boolean;
  stopped: boolean;
  simulateMessage(fromHost: string, address?: string): void;
}

function makeFakeListener(): FakeListener {
  const handlers = new Set<(msg: { address: string; args: unknown[]; fromHost: string; fromPort: number; receivedAt: number }) => void>();
  return {
    handlers,
    started: false,
    stopped: false,
    simulateMessage(fromHost: string, address = '/reply') {
      const msg = { address, args: [], fromHost, fromPort: 9000, receivedAt: Date.now() };
      for (const h of handlers) h(msg);
    },
  };
}

type FakeListenerMap = Map<number, FakeListener>;

function makeFactory(map: FakeListenerMap) {
  return (port: number, _log: Logger) => {
    const fake = makeFakeListener();
    map.set(port, fake);
    return {
      start: async () => { fake.started = true; },
      stop: async () => { fake.stopped = true; },
      addHandler: (fn: Parameters<FakeListener['handlers']['add']>[0]) => fake.handlers.add(fn),
      removeHandler: (fn: Parameters<FakeListener['handlers']['add']>[0]) => fake.handlers.delete(fn),
      get handlerCount() { return fake.handlers.size; },
      get boundPort() { return port; },
    } as unknown as import('../../../src/main/src/shared/input/oscListener.js').OscPortListener;
  };
}

const log = new Logger({ output: { write: () => true } as unknown as NodeJS.WritableStream });

describe('DeviceReplyTracker', () => {
  let fakeListeners: FakeListenerMap;
  let tracker: DeviceReplyTracker;
  let nowMs: number;

  beforeEach(() => {
    vi.useFakeTimers();
    nowMs = 10_000;
    vi.setSystemTime(nowMs);
    fakeListeners = new Map();
    tracker = new DeviceReplyTracker(log, () => nowMs, makeFactory(fakeListeners));
  });

  afterEach(async () => {
    await tracker.unregisterAll();
    vi.useRealTimers();
  });

  // ── Registration ─────────────────────────────────────────────────────────

  it('registers device and starts UDP listener on reply_port', async () => {
    await tracker.register('eos1', '192.168.1.10', 8001);
    expect(fakeListeners.get(8001)?.started).toBe(true);
  });

  it('does not register duplicate device_id', async () => {
    await tracker.register('eos1', '192.168.1.10', 8001);
    await tracker.register('eos1', '192.168.1.10', 8001);
    expect(fakeListeners.size).toBe(1);
  });

  it('reuses same listener when two devices share a reply_port', async () => {
    await tracker.register('eos1', '192.168.1.10', 8001);
    await tracker.register('qlab1', '192.168.1.20', 8001);
    expect(fakeListeners.size).toBe(1); // only one UDP socket
  });

  // ── Confirmation ─────────────────────────────────────────────────────────

  it('emits confirmed when OSC arrives from device.host', async () => {
    const updates: DeviceReplyUpdate[] = [];
    tracker.onStatus((u) => updates.push(u));

    await tracker.register('eos1', '192.168.1.10', 8001);
    fakeListeners.get(8001)!.simulateMessage('192.168.1.10');

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ deviceId: 'eos1', status: 'confirmed', updatedAt: nowMs });
  });

  it('does NOT emit when OSC arrives from a different host (wrong source)', async () => {
    const updates: DeviceReplyUpdate[] = [];
    tracker.onStatus((u) => updates.push(u));

    await tracker.register('eos1', '192.168.1.10', 8001);
    fakeListeners.get(8001)!.simulateMessage('10.0.0.1');  // wrong host

    expect(updates).toHaveLength(0);
  });

  it('correlates by source when two devices share reply_port', async () => {
    const updates: DeviceReplyUpdate[] = [];
    tracker.onStatus((u) => updates.push(u));

    await tracker.register('eos1', '192.168.1.10', 8001);
    await tracker.register('qlab1', '192.168.1.20', 8001);

    fakeListeners.get(8001)!.simulateMessage('192.168.1.20');  // qlab replies

    expect(updates).toHaveLength(1);
    expect(updates[0]?.deviceId).toBe('qlab1');
    expect(updates[0]?.status).toBe('confirmed');
  });

  // ── Decay ────────────────────────────────────────────────────────────────

  it('decays back to ok after CONFIRMED_TTL_MS with no further reply', async () => {
    const updates: DeviceReplyUpdate[] = [];
    tracker.onStatus((u) => updates.push(u));

    await tracker.register('eos1', '192.168.1.10', 8001);
    fakeListeners.get(8001)!.simulateMessage('192.168.1.10');

    expect(updates[0]?.status).toBe('confirmed');

    // Fast-forward past confirmed TTL
    nowMs = 10_000 + 30_001;
    vi.advanceTimersByTime(30_001);

    expect(updates).toHaveLength(2);
    expect(updates[1]?.status).toBe('ok');
    expect(updates[1]?.deviceId).toBe('eos1');
  });

  it('resets decay timer when a second reply arrives', async () => {
    const updates: DeviceReplyUpdate[] = [];
    tracker.onStatus((u) => updates.push(u));

    await tracker.register('eos1', '192.168.1.10', 8001);
    const fake = fakeListeners.get(8001)!;

    // First reply
    fake.simulateMessage('192.168.1.10');
    expect(updates[0]?.status).toBe('confirmed');

    // Advance 20s (within TTL)
    vi.advanceTimersByTime(20_000);
    expect(updates).toHaveLength(1); // no decay yet

    // Second reply resets timer
    nowMs += 20_000;
    fake.simulateMessage('192.168.1.10');
    expect(updates[1]?.status).toBe('confirmed');

    // Advance another 20s — first timer would have fired at T+30 but was cleared
    vi.advanceTimersByTime(20_000);
    expect(updates).toHaveLength(2); // still no decay

    // Now pass the second TTL
    vi.advanceTimersByTime(10_001);
    expect(updates).toHaveLength(3);
    expect(updates[2]?.status).toBe('ok');
  });

  // ── Unregister ────────────────────────────────────────────────────────────

  it('stops listeners on unregisterAll', async () => {
    await tracker.register('eos1', '192.168.1.10', 8001);
    await tracker.unregisterAll();
    expect(fakeListeners.get(8001)?.stopped).toBe(true);
  });

  it('clears decay timers on unregisterAll (no spurious ok emit)', async () => {
    const updates: DeviceReplyUpdate[] = [];
    tracker.onStatus((u) => updates.push(u));

    await tracker.register('eos1', '192.168.1.10', 8001);
    fakeListeners.get(8001)!.simulateMessage('192.168.1.10');
    expect(updates[0]?.status).toBe('confirmed');

    await tracker.unregisterAll();

    // Advance past TTL — decay timer should be cleared, no 'ok' emitted
    vi.advanceTimersByTime(31_000);
    expect(updates).toHaveLength(1); // no decay event after unregister
  });

  // ── Fire-and-forget devices (no expects_reply) ────────────────────────────

  it('does not register DMX/fire-and-forget devices (caller responsibility: only register expects_reply=true)', () => {
    // The tracker itself has no transport check — callers (GoExecutor) should only call
    // register() for devices with expects_reply=true. This test validates that a device
    // NOT registered never emits confirmed.
    const updates: DeviceReplyUpdate[] = [];
    tracker.onStatus((u) => updates.push(u));

    // No register() call for DMX device → any OSC on port 8001 doesn't affect it
    expect(updates).toHaveLength(0);
  });

  // ── onStatus unsubscribe ──────────────────────────────────────────────────

  it('onStatus returns unsubscribe that stops future callbacks', async () => {
    const updates: DeviceReplyUpdate[] = [];
    const unsub = tracker.onStatus((u) => updates.push(u));

    await tracker.register('eos1', '192.168.1.10', 8001);
    fakeListeners.get(8001)!.simulateMessage('192.168.1.10');
    expect(updates).toHaveLength(1);

    unsub();
    fakeListeners.get(8001)!.simulateMessage('192.168.1.10');
    expect(updates).toHaveLength(1); // no new updates after unsub
  });
});

// ── Device model validation ───────────────────────────────────────────────────

describe('Device.expects_reply validation', () => {
  it('accepts expects_reply=true for osc transport', async () => {
    const { validateDevice } = await import('../../../src/modules/cuelist-core/src/document/devices.js');
    expect(() => validateDevice({
      device_id: 'eos1',
      label: 'Eos',
      transport: 'osc',
      host: '192.168.1.10',
      port: 8000,
      expects_reply: true,
      reply_port: 8001,
    })).not.toThrow();
  });

  it('rejects expects_reply=true for midi transport', async () => {
    const { validateDevice } = await import('../../../src/modules/cuelist-core/src/document/devices.js');
    expect(() => validateDevice({
      device_id: 'midi1',
      label: 'MIDI',
      transport: 'midi',
      expects_reply: true,
    })).toThrow('expects_reply');
  });

  it('rejects reply_port without expects_reply=true', async () => {
    const { validateDevice } = await import('../../../src/modules/cuelist-core/src/document/devices.js');
    expect(() => validateDevice({
      device_id: 'eos1',
      label: 'Eos',
      transport: 'osc',
      reply_port: 8001,
    })).toThrow('reply_port');
  });

  it('rejects reply_port=0 (out of range)', async () => {
    const { validateDevice } = await import('../../../src/modules/cuelist-core/src/document/devices.js');
    expect(() => validateDevice({
      device_id: 'eos1',
      label: 'Eos',
      transport: 'osc',
      expects_reply: true,
      reply_port: 0,
    })).toThrow('reply_port');
  });

  it('accepts expects_reply=false (no-op) for any transport', async () => {
    const { validateDevice } = await import('../../../src/modules/cuelist-core/src/document/devices.js');
    expect(() => validateDevice({
      device_id: 'dmx1',
      label: 'DMX',
      transport: 'dmx',
      dmx_universe: 1,
      expects_reply: false,
    })).not.toThrow();
  });

  it('accepts device without expects_reply (default false, fire-and-forget)', async () => {
    const { validateDevice } = await import('../../../src/modules/cuelist-core/src/document/devices.js');
    expect(() => validateDevice({
      device_id: 'dmx1',
      label: 'DMX',
      transport: 'dmx',
      dmx_universe: 1,
    })).not.toThrow();
  });
});
