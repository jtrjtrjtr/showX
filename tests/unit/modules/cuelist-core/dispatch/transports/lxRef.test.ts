import { describe, it, expect, vi } from 'vitest';
import type { LxRefPayload } from 'showx-shared';
import { dispatchLxRef } from '../../../../../../src/modules/cuelist-core/src/dispatch/transports/lxRef.js';
import type { RoutingEntry } from '../../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';
import { initShowDoc } from '../../../../../../src/modules/cuelist-core/src/document/show.js';
import type { DispatchDeps } from '../../../../../../src/modules/cuelist-core/src/dispatch/types.js';

type LxEncoding = 'plain' | 'eos' | 'ma3' | 'chamsys' | 'hog' | 'qlab';

function makeDeps(sendFn = vi.fn().mockResolvedValue({ ok: true })): DispatchDeps {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
  return {
    doc, show_id: 'show-1', cuelist_id: 'cl-1',
    output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: { publish: vi.fn(), subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }) },
    log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
  };
}

function makeLxPayload(overrides: Partial<LxRefPayload> = {}): LxRefPayload {
  return { id: 'p1', type: 'lx_ref', tag: null, note: '', device_id: 'eos', cue_list: 1, cue_number: 47, ...overrides };
}

function makeRouting(encoding?: LxEncoding): Record<string, RoutingEntry> {
  const transport: RoutingEntry['transport'] = { kind: 'osc', host: '10.0.0.5', port: 3032, ...(encoding ? { encoding } : {}) };
  return { r1: { id: 'r1', match: { device_id: 'eos' }, transport, enabled: true, notes: '' } };
}

describe('dispatchLxRef', () => {
  it('Eos: address is /eos/cue/1/47/fire with no args', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps(sendFn);
    await dispatchLxRef(makeLxPayload(), makeRouting('eos'), deps);
    const msg = sendFn.mock.calls[0][0];
    expect(msg.address).toBe('/eos/cue/1/47/fire');
    expect(msg.args).toEqual([]);
  });

  it('MA3: address is /cmd with string arg GO Cue 47 List 1', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps(sendFn);
    await dispatchLxRef(makeLxPayload(), makeRouting('ma3'), deps);
    const msg = sendFn.mock.calls[0][0];
    expect(msg.address).toBe('/cmd');
    expect(msg.args).toEqual(['GO Cue 47 List 1']);
  });

  it('Hog4: address is /hog/playback/go/1.47', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps(sendFn);
    await dispatchLxRef(makeLxPayload(), makeRouting('hog'), deps);
    const msg = sendFn.mock.calls[0][0];
    expect(msg.address).toBe('/hog/playback/go/1.47');
  });

  it('unknown encoding returns error', async () => {
    const routing: Record<string, RoutingEntry> = {
      r1: { id: 'r1', match: { device_id: 'eos' }, transport: { kind: 'osc', host: '10.0.0.5', port: 3032, encoding: 'plain' as LxEncoding }, enabled: true, notes: '' },
    };
    const deps = makeDeps();
    const r = await dispatchLxRef(makeLxPayload(), routing, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unsupported lx encoding/);
  });

  it('returns error when no routing', async () => {
    const deps = makeDeps();
    const r = await dispatchLxRef(makeLxPayload({ device_id: 'unknown' }), makeRouting('eos'), deps);
    expect(r.ok).toBe(false);
  });
});
