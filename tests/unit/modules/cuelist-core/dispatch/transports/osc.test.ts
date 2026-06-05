import { describe, it, expect, vi } from 'vitest';
import type { OscPayload } from 'showx-shared';
import { dispatchOsc, buildOscArgs } from '../../../../../../src/modules/cuelist-core/src/dispatch/transports/osc.js';
import type { RoutingEntry } from '../../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';
import { initShowDoc } from '../../../../../../src/modules/cuelist-core/src/document/show.js';
import type { DispatchDeps } from '../../../../../../src/modules/cuelist-core/src/dispatch/types.js';

function makeDeps(sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'osc', latencyMs: 0 })): DispatchDeps {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
  return {
    doc, show_id: 'show-1', cuelist_id: 'cl-1',
    output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: { publish: vi.fn(), subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }), subscribePattern: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }) },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
  };
}

function makeOscPayload(overrides: Partial<OscPayload> = {}): OscPayload {
  return { id: 'p1', type: 'osc', tag: null, note: '', device_id: 'QLab', address: '/cue/1/start', args: [], ...overrides };
}

function makeRouting(host = '10.0.0.1', port = 53000): Record<string, RoutingEntry> {
  return { r1: { id: 'r1', match: { device_id: 'QLab' }, transport: { kind: 'osc', host, port }, enabled: true, notes: '' } };
}

describe('dispatchOsc', () => {
  it('calls output.send with osc transport, correct host/port, address, args + trailing sourceURI', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'osc', latencyMs: 0 });
    const deps = makeDeps(sendFn);
    const p = makeOscPayload({ args: [{ type: 'int', value: 42 }] });

    await dispatchOsc(p, makeRouting(), deps);

    expect(sendFn).toHaveBeenCalledOnce();
    const msg = sendFn.mock.calls[0][0];
    expect(msg.transport).toBe('osc');
    expect(msg.host).toBe('10.0.0.1');
    expect(msg.port).toBe(53000);
    expect(msg.address).toBe('/cue/1/start');
    // First arg = 42 (int), last arg = sourceURI string
    expect(msg.args[0]).toBe(42);
    expect(typeof msg.args[msg.args.length - 1]).toBe('string');
    expect((msg.args[msg.args.length - 1] as string)).toMatch(/^showx:\/\//);
  });

  it('returns error when no routing for device', async () => {
    const deps = makeDeps();
    const r = await dispatchOsc(makeOscPayload({ device_id: 'unknown-dev' }), makeRouting(), deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no routing for device/);
  });

  it('returns error when routing transport kind is not osc', async () => {
    const routing: Record<string, RoutingEntry> = {
      r1: { id: 'r1', match: { device_id: 'QLab' }, transport: { kind: 'midi', port_name: 'IAC' }, enabled: true, notes: '' },
    };
    const deps = makeDeps();
    const r = await dispatchOsc(makeOscPayload(), routing, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not mapped to osc/);
  });

  it('dispatches payload with empty args (only sourceURI appended)', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'osc', latencyMs: 0 });
    const deps = makeDeps(sendFn);
    await dispatchOsc(makeOscPayload({ args: [] }), makeRouting(), deps);
    const msg = sendFn.mock.calls[0][0];
    expect(msg.args).toHaveLength(1);
    expect((msg.args[0] as string)).toMatch(/^showx:\/\//);
  });

  it('preserves mixed-type args in order before sourceURI', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'osc', latencyMs: 0 });
    const deps = makeDeps(sendFn);
    const args = [{ type: 'int' as const, value: 1 }, { type: 'string' as const, value: 'hello' }, { type: 'float' as const, value: 3.14 }];
    await dispatchOsc(makeOscPayload({ args }), makeRouting(), deps);
    const msg = sendFn.mock.calls[0][0];
    expect(msg.args[0]).toBe(1);
    expect(msg.args[1]).toBe('hello');
    expect(Math.abs((msg.args[2] as number) - 3.14)).toBeLessThan(0.001);
    expect((msg.args[3] as string)).toMatch(/^showx:\/\//);
  });
});

describe('buildOscArgs', () => {
  it('converts nil args by skipping them', () => {
    const out = buildOscArgs([{ type: 'nil' }], 'showx://host/show1');
    expect(out).toEqual(['showx://host/show1']);
  });

  it('converts bool args', () => {
    const out = buildOscArgs([{ type: 'bool', value: true }], 'uri');
    expect(out[0]).toBe(true);
  });
});
