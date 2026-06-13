import { describe, it, expect, vi } from 'vitest';
import type { DmxPayload } from 'showx-shared';
import { dispatchDmx, buildDmxData } from '../../../../../../src/modules/cuelist-core/src/dispatch/transports/dmx.js';
import { validatePayload, ValidationError } from '../../../../../../src/modules/cuelist-core/src/document/payload.js';
import type { RoutingEntry } from '../../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';
import { initShowDoc, setMode } from '../../../../../../src/modules/cuelist-core/src/document/show.js';
import { addDevice } from '../../../../../../src/modules/cuelist-core/src/document/devices.js';
import type { DispatchDeps } from '../../../../../../src/modules/cuelist-core/src/dispatch/types.js';

function makeDeps(sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'dmx-artnet', latencyMs: 0 })): DispatchDeps {
  const doc = initShowDoc({ title: 'DMX Test', venue: null, date: null, created_by: 'test' });
  setMode(doc, 'rehearsal');
  return {
    doc,
    show_id: 'show-1',
    cuelist_id: 'cl-1',
    output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: { publish: vi.fn(), subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }) },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
  };
}

function makeDmxRouting(universe = 1): Record<string, RoutingEntry> {
  return {
    r1: { id: 'r1', match: { device_id: 'dmx-1' }, transport: { kind: 'dmx', universe }, enabled: true, notes: '' },
  };
}

function makePayload(overrides: Partial<DmxPayload> = {}): DmxPayload {
  return {
    id: 'p1',
    type: 'dmx',
    tag: null,
    note: '',
    device_id: 'dmx-1',
    universe: 1,
    channels: [{ channel: 1, value: 200 }],
    ...overrides,
  };
}

// ── buildDmxData ──────────────────────────────────────────────────────────────

describe('buildDmxData', () => {
  it('builds 512-element array with zeros for unspecified channels', () => {
    const data = buildDmxData([{ channel: 1, value: 255 }]);
    expect(data).toHaveLength(512);
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(0);
    expect(data[511]).toBe(0);
  });

  it('places channel values at correct 0-based index', () => {
    const data = buildDmxData([
      { channel: 1, value: 100 },
      { channel: 512, value: 200 },
    ]);
    expect(data[0]).toBe(100);
    expect(data[511]).toBe(200);
  });

  it('handles multi-channel set', () => {
    const channels = Array.from({ length: 5 }, (_, i) => ({ channel: i + 1, value: (i + 1) * 10 }));
    const data = buildDmxData(channels);
    expect(data[0]).toBe(10);
    expect(data[4]).toBe(50);
    expect(data[5]).toBe(0);
  });
});

// ── validatePayload (dmx) ──────────────────────────────────────────────────────

describe('validatePayload — dmx', () => {
  it('valid payload passes', () => {
    expect(() => validatePayload({ type: 'dmx', device_id: 'dmx-1', universe: 0, channels: [{ channel: 1, value: 0 }] })).not.toThrow();
  });

  it('rejects universe < 0', () => {
    expect(() => validatePayload({ type: 'dmx', device_id: 'd', universe: -1, channels: [{ channel: 1, value: 0 }] }))
      .toThrow(ValidationError);
  });

  it('rejects empty channels', () => {
    expect(() => validatePayload({ type: 'dmx', device_id: 'd', universe: 1, channels: [] }))
      .toThrow(ValidationError);
  });

  it('rejects channels.length > 512', () => {
    const channels = Array.from({ length: 513 }, (_, i) => ({ channel: (i % 512) + 1, value: 0 }));
    expect(() => validatePayload({ type: 'dmx', device_id: 'd', universe: 1, channels }))
      .toThrow(ValidationError);
  });

  it('rejects channel 0', () => {
    expect(() => validatePayload({ type: 'dmx', device_id: 'd', universe: 1, channels: [{ channel: 0, value: 0 }] }))
      .toThrow(ValidationError);
  });

  it('rejects channel 513', () => {
    expect(() => validatePayload({ type: 'dmx', device_id: 'd', universe: 1, channels: [{ channel: 513, value: 0 }] }))
      .toThrow(ValidationError);
  });

  it('rejects value 256', () => {
    expect(() => validatePayload({ type: 'dmx', device_id: 'd', universe: 1, channels: [{ channel: 1, value: 256 }] }))
      .toThrow(ValidationError);
  });

  it('rejects negative value', () => {
    expect(() => validatePayload({ type: 'dmx', device_id: 'd', universe: 1, channels: [{ channel: 1, value: -1 }] }))
      .toThrow(ValidationError);
  });

  it('accepts channel 512 with value 255', () => {
    expect(() => validatePayload({ type: 'dmx', device_id: 'd', universe: 1, channels: [{ channel: 512, value: 255 }] })).not.toThrow();
  });
});

// ── dispatchDmx ────────────────────────────────────────────────────────────────

describe('dispatchDmx', () => {
  it('calls output.send with dmx-artnet transport and correct universe', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'dmx-artnet', latencyMs: 1 });
    const deps = makeDeps(sendFn);
    const routing = makeDmxRouting(5);

    const result = await dispatchDmx(makePayload({ universe: 5 }), routing, deps);

    expect(result.ok).toBe(true);
    expect(sendFn).toHaveBeenCalledOnce();
    const msg = sendFn.mock.calls[0][0];
    expect(msg.transport).toBe('dmx-artnet');
    expect(msg.universe).toBe(5);
    expect(msg.data).toHaveLength(512);
  });

  it('places channel values at correct positions in data array', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'dmx-artnet', latencyMs: 1 });
    const deps = makeDeps(sendFn);

    await dispatchDmx(
      makePayload({ channels: [{ channel: 1, value: 128 }, { channel: 100, value: 255 }] }),
      makeDmxRouting(1),
      deps,
    );

    const data: number[] = sendFn.mock.calls[0][0].data;
    expect(data[0]).toBe(128);   // channel 1
    expect(data[99]).toBe(255);  // channel 100
    expect(data[1]).toBe(0);
  });

  it('returns no_route when device has no routing entry', async () => {
    const deps = makeDeps();
    const result = await dispatchDmx(makePayload(), {}, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no_route');
  });

  it('returns no_route when routing entry is for wrong transport kind', async () => {
    const routing: Record<string, RoutingEntry> = {
      r1: { id: 'r1', match: { device_id: 'dmx-1' }, transport: { kind: 'osc', host: '10.0.0.1', port: 53000 }, enabled: true, notes: '' },
    };
    const deps = makeDeps();
    const result = await dispatchDmx(makePayload(), routing, deps);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not mapped to dmx/);
  });

  it('uses sacn when target device has dmx_protocol=sacn', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'dmx-sacn', latencyMs: 1 });
    const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
    setMode(doc, 'rehearsal');

    // Add a DMX device with dmx_protocol=sacn
    addDevice(doc, {
      device_id: 'dmx-sacn-1',
      label: 'sACN Fixture',
      transport: 'dmx',
      dmx_universe: 2,
    }, { actorId: 'test' });

    // Manually set dmx_protocol on the device map
    doc.transact(() => {
      const deviceMap = doc.getMap('devices').get('dmx-sacn-1') as import('yjs').Map<unknown>;
      deviceMap.set('dmx_protocol', 'sacn');
    });

    const deps: DispatchDeps = {
      doc,
      show_id: 'show-1',
      cuelist_id: 'cl-1',
      output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
      events: { publish: vi.fn(), subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }) },
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
      abortSignal: new AbortController().signal,
    };

    const routing: Record<string, RoutingEntry> = {
      r1: { id: 'r1', match: { device_id: 'dmx-sacn-1' }, transport: { kind: 'dmx', universe: 2 }, enabled: true, notes: '' },
    };

    const payload: DmxPayload = {
      id: 'p1', type: 'dmx', tag: null, note: '',
      device_id: 'dmx-sacn-1', universe: 2,
      channels: [{ channel: 1, value: 100 }],
    };

    const result = await dispatchDmx(payload, routing, deps);
    expect(result.ok).toBe(true);
    const msg = sendFn.mock.calls[0][0];
    expect(msg.transport).toBe('dmx-sacn');
    expect(msg.universe).toBe(2);
  });

  it('propagates send error from OutputDispatcher', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: false, transport: 'dmx-artnet', latencyMs: 1, error: 'adapter_closed' });
    const deps = makeDeps(sendFn);
    const result = await dispatchDmx(makePayload(), makeDmxRouting(), deps);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('adapter_closed');
  });
});
