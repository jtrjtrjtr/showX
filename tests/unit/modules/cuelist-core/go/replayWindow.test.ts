import { describe, it, expect } from 'vitest';
import { isHistoricReplay, RingBuffer } from '../../../../../src/modules/cuelist-core/src/go/replayWindow.js';

describe('isHistoricReplay', () => {
  const now = 1_700_000_000_000;

  it('returns false for a timestamp at now', () => {
    expect(isHistoricReplay(new Date(now).toISOString(), now)).toBe(false);
  });

  it('returns true for a timestamp older than 5s', () => {
    expect(isHistoricReplay(new Date(now - 6000).toISOString(), now)).toBe(true);
  });

  it('returns false for a timestamp 4999ms ago (under 5s boundary)', () => {
    expect(isHistoricReplay(new Date(now - 4999).toISOString(), now)).toBe(false);
  });

  it('returns false for an invalid timestamp string', () => {
    expect(isHistoricReplay('not-a-date', now)).toBe(false);
  });

  it('returns false for exactly 5000ms ago (boundary is exclusive)', () => {
    // tsMs < now - 5000 → 5000ms ago is NOT historic
    expect(isHistoricReplay(new Date(now - 5000).toISOString(), now)).toBe(false);
  });
});

describe('RingBuffer', () => {
  it('starts empty', () => {
    const buf = new RingBuffer<number>(5);
    expect(buf.size()).toBe(0);
  });

  it('accepts items up to capacity', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size()).toBe(3);
  });

  it('evicts oldest item on overflow', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4);
    expect(buf.size()).toBe(3);
    expect(buf.all()).toEqual([2, 3, 4]);
  });

  it('evicts multiple items when filled past capacity', () => {
    const buf = new RingBuffer<number>(3);
    for (let i = 1; i <= 8; i++) buf.push(i);
    expect(buf.size()).toBe(3);
    expect(buf.all()).toEqual([6, 7, 8]);
  });

  it('since returns only items with seq > threshold', () => {
    const buf = new RingBuffer<{ _seq: number; label: string }>(10);
    buf.push({ _seq: 1, label: 'a' });
    buf.push({ _seq: 2, label: 'b' });
    buf.push({ _seq: 3, label: 'c' });
    const result = buf.since(1, (item) => item._seq);
    expect(result.map((r) => r.label)).toEqual(['b', 'c']);
  });

  it('since returns empty when all items are at or before seq', () => {
    const buf = new RingBuffer<{ _seq: number }>(10);
    buf.push({ _seq: 1 });
    buf.push({ _seq: 2 });
    expect(buf.since(5, (i) => i._seq)).toHaveLength(0);
  });

  it('all returns items in insertion order', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(10);
    buf.push(20);
    buf.push(30);
    expect(buf.all()).toEqual([10, 20, 30]);
  });
});
