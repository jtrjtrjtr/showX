import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MasterClockImpl, ClockBroadcaster } from '../../../src/main/src/shared/Clock.js';
import type { SideChannelMessage } from 'showx-shared';

// ── ClockBroadcaster tests ────────────────────────────────────────────────────

describe('ClockBroadcaster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makePublish() {
    const calls: Array<{ showId: string; msg: SideChannelMessage }> = [];
    return {
      calls,
      fn: (showId: string, msg: SideChannelMessage) => calls.push({ showId, msg }),
    };
  }

  it('broadcasts immediately on start()', () => {
    const clock = new MasterClockImpl();
    const p = makePublish();
    const b = new ClockBroadcaster(clock, p.fn);
    b.start('show-1');
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0].showId).toBe('show-1');
    expect(p.calls[0].msg.topic).toBe('clock.anchor');
    b.stop();
  });

  it('periodic tick fires at configured interval', () => {
    const clock = new MasterClockImpl();
    const p = makePublish();
    const b = new ClockBroadcaster(clock, p.fn, 500);
    b.start('show-1');
    const initialCount = p.calls.length; // 1 (immediate)
    vi.advanceTimersByTime(1500);
    // 3 periodic ticks (at 500, 1000, 1500ms) + 1 immediate
    expect(p.calls.length).toBe(initialCount + 3);
    b.stop();
  });

  it('cadence ≤4Hz (interval ≥250ms)', () => {
    // Default 500ms = 2Hz, well under 4Hz limit
    const b = new ClockBroadcaster(new MasterClockImpl(), () => {}, 500);
    // Inspect internal interval by counting calls over 1 second
    const p = makePublish();
    const b2 = new ClockBroadcaster(new MasterClockImpl(), p.fn, 500);
    b2.start('show-1');
    vi.advanceTimersByTime(1000);
    // 1 immediate + 2 ticks (at 500ms, 1000ms)
    expect(p.calls.length).toBeLessThanOrEqual(1 + 4); // never exceeds 4Hz
    b2.stop();
    b.stop();
  });

  it('broadcasts immediately on state change (start/stop/locate)', () => {
    const clock = new MasterClockImpl();
    const p = makePublish();
    const b = new ClockBroadcaster(clock, p.fn, 60000); // very long interval — no periodic noise
    b.start('show-1');
    const after_start = p.calls.length; // 1
    clock.start();
    expect(p.calls.length).toBe(after_start + 1); // onChange fires
    clock.stop();
    expect(p.calls.length).toBe(after_start + 2);
    clock.locate(100);
    expect(p.calls.length).toBe(after_start + 3);
    b.stop();
  });

  it('anchor payload contains correct fields', () => {
    let nowMs = 1000;
    const clock = new MasterClockImpl(undefined, () => nowMs);
    clock.locate(50);
    const p = makePublish();
    const b = new ClockBroadcaster(clock, p.fn);
    b.start('show-abc');
    const msg = p.calls[0].msg;
    expect(msg.topic).toBe('clock.anchor');
    expect(msg.payload['totalFrames']).toBe(50);
    expect(msg.payload['rate']).toBe(25);
    expect(msg.payload['dropFrame']).toBe(false);
    expect(msg.payload['running']).toBe(false);
    expect(msg.payload['source']).toBe('internal');
    expect(typeof msg.payload['at_wall_ms']).toBe('number');
    b.stop();
  });

  it('stop() halts periodic ticks and onChange callbacks', () => {
    const clock = new MasterClockImpl();
    const p = makePublish();
    const b = new ClockBroadcaster(clock, p.fn, 500);
    b.start('show-1');
    b.stop();
    const countAfterStop = p.calls.length;
    vi.advanceTimersByTime(2000);
    clock.start(); // should NOT trigger broadcast
    expect(p.calls.length).toBe(countAfterStop);
  });

  it('stop() then start() with new showId is clean', () => {
    const clock = new MasterClockImpl();
    const p = makePublish();
    const b = new ClockBroadcaster(clock, p.fn);
    b.start('show-1');
    b.stop();
    b.start('show-2');
    const last = p.calls[p.calls.length - 1];
    expect(last.showId).toBe('show-2');
    b.stop();
  });

  it('does not broadcast when no showId (before start)', () => {
    const p = makePublish();
    const b = new ClockBroadcaster(new MasterClockImpl(), p.fn);
    // b.start() never called
    expect(p.calls).toHaveLength(0);
    b.stop(); // safe to call without start
  });
});

// ── Anchor serialization / payload shape tests ────────────────────────────────

describe('clock.anchor payload serialization', () => {
  it('round-trips through JSON.stringify / JSON.parse', () => {
    const payload = {
      totalFrames: 1234,
      at_wall_ms: 999000,
      rate: 29.97,
      dropFrame: true,
      running: true,
      source: 'mtc',
    };
    const msg: SideChannelMessage = { topic: 'clock.anchor', payload };
    const rt = JSON.parse(JSON.stringify(msg)) as typeof msg;
    expect(rt.topic).toBe('clock.anchor');
    expect(rt.payload['totalFrames']).toBe(1234);
    expect(rt.payload['rate']).toBe(29.97);
    expect(rt.payload['dropFrame']).toBe(true);
    expect(rt.payload['running']).toBe(true);
    expect(rt.payload['source']).toBe('mtc');
  });
});
