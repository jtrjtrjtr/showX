/**
 * Tests for useClock interpolation math.
 * We test the computeDisplay logic directly by extracting the pure computation
 * rather than mounting a React tree (no DOM/rAF needed for math verification).
 */
import { describe, it, expect } from 'vitest';
import { framesToTc, formatTc } from 'showx-shared';
import type { ClockAnchor } from '../../../pwa/src/lib/sideChannel.js';

// Mirror of the computeDisplay logic in useClock.ts
interface AnchorEntry { anchor: ClockAnchor; receivedAt: number }

function computeDisplay(entry: AnchorEntry | null, now: number) {
  if (!entry) {
    return { totalFrames: 0, formatted: '00:00:00:00', rate: 25, dropFrame: false, running: false, source: 'internal', locked: false };
  }
  const { anchor, receivedAt } = entry;
  let totalFrames: number;
  if (anchor.running) {
    const elapsedMs = now - receivedAt;
    const fps = anchor.rate === 29.97 ? 30000 / 1001 : anchor.rate;
    totalFrames = anchor.totalFrames + Math.floor(elapsedMs * fps / 1000);
  } else {
    totalFrames = anchor.totalFrames;
  }
  const tc = framesToTc(totalFrames, anchor.rate, anchor.dropFrame);
  return {
    totalFrames,
    formatted: formatTc(tc, anchor.dropFrame),
    rate: anchor.rate,
    dropFrame: anchor.dropFrame,
    running: anchor.running,
    source: anchor.source,
    locked: now - receivedAt < 5000,
  };
}

function anchor(overrides: Partial<ClockAnchor> = {}): ClockAnchor {
  return {
    topic: 'clock.anchor',
    totalFrames: 0,
    at_wall_ms: 0,
    rate: 25,
    dropFrame: false,
    running: false,
    source: 'internal',
    ...overrides,
  };
}

describe('useClock interpolation math', () => {
  it('null entry returns default zeros', () => {
    const d = computeDisplay(null, 0);
    expect(d.totalFrames).toBe(0);
    expect(d.formatted).toBe('00:00:00:00');
    expect(d.locked).toBe(false);
  });

  it('stopped clock holds anchor value', () => {
    const entry: AnchorEntry = { anchor: anchor({ totalFrames: 100, running: false }), receivedAt: 0 };
    const d = computeDisplay(entry, 2000); // 2s elapsed — should NOT advance
    expect(d.totalFrames).toBe(100);
    expect(d.running).toBe(false);
  });

  it('running 25fps: 1000ms elapsed → advances by 25 frames', () => {
    const entry: AnchorEntry = { anchor: anchor({ totalFrames: 0, running: true, rate: 25 }), receivedAt: 0 };
    const d = computeDisplay(entry, 1000);
    expect(d.totalFrames).toBe(25);
  });

  it('running 24fps: 1000ms elapsed → advances by 24 frames', () => {
    const entry: AnchorEntry = { anchor: anchor({ totalFrames: 0, running: true, rate: 24 }), receivedAt: 0 };
    const d = computeDisplay(entry, 1000);
    expect(d.totalFrames).toBe(24);
  });

  it('running 29.97fps (30000/1001): 1001ms → 30 frames', () => {
    const entry: AnchorEntry = { anchor: anchor({ totalFrames: 0, running: true, rate: 29.97 }), receivedAt: 0 };
    const d1001 = computeDisplay(entry, 1001);
    expect(d1001.totalFrames).toBe(30);
  });

  it('running 29.97fps: 1000ms → 29 frames (floor of 29.97)', () => {
    const entry: AnchorEntry = { anchor: anchor({ totalFrames: 0, running: true, rate: 29.97 }), receivedAt: 0 };
    const d1000 = computeDisplay(entry, 1000);
    expect(d1000.totalFrames).toBe(29);
  });

  it('non-zero base: F0=500, 25fps, 2000ms → 550 frames', () => {
    const entry: AnchorEntry = { anchor: anchor({ totalFrames: 500, running: true, rate: 25 }), receivedAt: 1000 };
    const d = computeDisplay(entry, 3000); // 2000ms elapsed
    expect(d.totalFrames).toBe(550);
  });

  it('new anchor mid-run re-syncs without large jump', () => {
    // First anchor: F0=0 at t=0, 25fps
    const e1: AnchorEntry = { anchor: anchor({ totalFrames: 0, running: true }), receivedAt: 0 };
    const d1 = computeDisplay(e1, 1000); // should be ~25
    expect(d1.totalFrames).toBe(25);

    // New anchor arrives: F0=26 at t=1100 (slight overshoot, normal jitter)
    const e2: AnchorEntry = { anchor: anchor({ totalFrames: 26, running: true }), receivedAt: 1100 };
    const d2 = computeDisplay(e2, 1100); // no elapsed yet
    expect(d2.totalFrames).toBe(26); // snaps to new anchor, no drift
    const d3 = computeDisplay(e2, 1200); // 100ms after new anchor
    expect(d3.totalFrames).toBe(28); // 26 + floor(100*25/1000)=2
  });

  it('offset handling: uses LOCAL receivedAt, not anchor.at_wall_ms', () => {
    // at_wall_ms from shell is deliberately wrong (simulating clock skew)
    const entry: AnchorEntry = {
      anchor: anchor({ totalFrames: 0, running: true, at_wall_ms: 99999999 }),
      receivedAt: 0,
    };
    // Only local elapsed matters
    const d = computeDisplay(entry, 1000);
    expect(d.totalFrames).toBe(25); // correct, ignores at_wall_ms
  });

  it('locked = true when anchor is fresh (< 5000ms old)', () => {
    const entry: AnchorEntry = { anchor: anchor({ running: false }), receivedAt: 0 };
    expect(computeDisplay(entry, 4999).locked).toBe(true);
  });

  it('locked = false when anchor is stale (≥ 5000ms old)', () => {
    const entry: AnchorEntry = { anchor: anchor({ running: false }), receivedAt: 0 };
    expect(computeDisplay(entry, 5000).locked).toBe(false);
  });

  it('formatTc output is correct for 25fps NDF frame 100', () => {
    // 100 frames at 25fps = 00:00:04:00
    const entry: AnchorEntry = { anchor: anchor({ totalFrames: 100, running: false }), receivedAt: 0 };
    expect(computeDisplay(entry, 0).formatted).toBe('00:00:04:00');
  });

  it('formatTc uses semicolon separator for drop-frame', () => {
    const entry: AnchorEntry = {
      anchor: anchor({ totalFrames: 0, running: false, dropFrame: true, rate: 29.97 }),
      receivedAt: 0,
    };
    expect(computeDisplay(entry, 0).formatted).toBe('00:00:00;00');
  });

  it('source and rate exposed correctly', () => {
    const entry: AnchorEntry = {
      anchor: anchor({ source: 'mtc', rate: 30, running: false }),
      receivedAt: 0,
    };
    const d = computeDisplay(entry, 0);
    expect(d.source).toBe('mtc');
    expect(d.rate).toBe(30);
  });
});
