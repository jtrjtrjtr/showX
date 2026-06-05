import { describe, it, expect, vi } from 'vitest';
import { DmxPool } from '../../../../src/main/src/shared/dispatcher/dmxOut.js';
import type { DmxAdapter, DmxFactories } from '../../../../src/main/src/shared/dispatcher/dmxOut.js';

function makeMockAdapter(): DmxAdapter & { _calls: Array<{ universe: number; data: number[]; opts: { priority?: number; host?: string } }> } {
  const calls: Array<{ universe: number; data: number[]; opts: { priority?: number; host?: string } }> = [];
  return {
    send: vi.fn(async (universe, data, opts) => { calls.push({ universe, data: [...data], opts }); }),
    close: vi.fn(async () => { /* noop */ }),
    _calls: calls,
  };
}

function makeFactories(artnet?: DmxAdapter, sacn?: DmxAdapter): DmxFactories {
  return {
    artnet: artnet ? () => artnet : undefined,
    sacn: sacn ? () => sacn : undefined,
  };
}

describe('DmxPool', () => {
  it('ArtNet claim: send routes to adapter with correct universe', async () => {
    const adapter = makeMockAdapter();
    const pool = new DmxPool(makeFactories(adapter, undefined));
    const claim = pool.claim('artnet', 1, 'mod1');
    expect(claim.ok).toBe(true);
    if (!claim.ok) throw new Error('expected ok');
    const result = await claim.send({ transport: 'dmx-artnet', host: '255.255.255.255', universe: 1, data: [1, 2, 3] });
    expect(result.ok).toBe(true);
    expect(adapter._calls).toHaveLength(1);
    expect(adapter._calls[0]?.universe).toBe(1);
    expect(adapter._calls[0]?.data).toEqual([1, 2, 3]);
  });

  it('second claim same universe returns ClaimConflict', () => {
    const adapter = makeMockAdapter();
    const pool = new DmxPool(makeFactories(adapter, undefined));
    pool.claim('artnet', 1, 'mod1');
    const result = pool.claim('artnet', 1, 'mod2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.ownerSlug).toBe('mod1');
  });

  it('two claims on different universes both succeed', () => {
    const adapter1 = makeMockAdapter();
    const adapter2 = makeMockAdapter();
    let callIdx = 0;
    const factories: DmxFactories = { artnet: () => callIdx++ === 0 ? adapter1 : adapter2 };
    const pool = new DmxPool(factories);
    const r1 = pool.claim('artnet', 1, 'mod1');
    const r2 = pool.claim('artnet', 2, 'mod2');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('artnet universe 1 and sacn universe 1 are separate exclusivity keys', () => {
    const artAdapter = makeMockAdapter();
    const sacnAdapter = makeMockAdapter();
    const pool = new DmxPool(makeFactories(artAdapter, sacnAdapter));
    const r1 = pool.claim('artnet', 1, 'mod1');
    const r2 = pool.claim('sacn', 1, 'mod2');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('release() calls adapter.close and removes from map', async () => {
    const adapter = makeMockAdapter();
    const pool = new DmxPool(makeFactories(adapter, undefined));
    const claim = pool.claim('artnet', 1, 'mod1');
    expect(claim.ok).toBe(true);
    if (!claim.ok) throw new Error();
    claim.release();
    // Give the async release a tick to complete
    await new Promise((r) => setTimeout(r, 0));
    expect(adapter.close).toHaveBeenCalledOnce();
    expect(pool.status()).toHaveLength(0);
  });

  it('sACN priority passthrough: priority reaches adapter.send opts', async () => {
    const sacnAdapter = makeMockAdapter();
    const pool = new DmxPool(makeFactories(undefined, sacnAdapter));
    const claim = pool.claim('sacn', 1, 'mod1');
    expect(claim.ok).toBe(true);
    if (!claim.ok) throw new Error();
    await claim.send({ transport: 'dmx-sacn', universe: 1, priority: 150, data: [255, 0, 127] });
    expect(sacnAdapter._calls[0]?.opts.priority).toBe(150);
  });

  it('status() reflects current universe owners', () => {
    const adapter = makeMockAdapter();
    const pool = new DmxPool(makeFactories(adapter, undefined));
    pool.claim('artnet', 3, 'mod3');
    const status = pool.status();
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ universe: 3, protocol: 'artnet', ownerSlug: 'mod3' });
  });
});
