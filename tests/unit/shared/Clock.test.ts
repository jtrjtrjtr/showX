import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MasterClockImpl } from '../../../src/main/src/shared/Clock.js';
import {
  framesToTc,
  tcToFrames,
  formatTc,
  intFps,
} from 'showx-shared';
import type { FrameRate } from 'showx-shared';

// ── Pure helper tests ─────────────────────────────────────────────────────

describe('intFps', () => {
  it('returns 24 for rate 24', () => expect(intFps(24)).toBe(24));
  it('returns 25 for rate 25', () => expect(intFps(25)).toBe(25));
  it('returns 30 for rate 29.97', () => expect(intFps(29.97)).toBe(30));
  it('returns 30 for rate 30', () => expect(intFps(30)).toBe(30));
});

describe('framesToTc / tcToFrames round-trip', () => {
  function roundTrip(rate: FrameRate, df: boolean, frames: number) {
    const tc = framesToTc(frames, rate, df);
    const back = tcToFrames(tc, rate, df);
    return { tc, back };
  }

  it('24fps NDF: 0 frames → 00:00:00:00', () => {
    const tc = framesToTc(0, 24, false);
    expect(tc).toEqual({ hh: 0, mm: 0, ss: 0, ff: 0 });
  });

  it('24fps NDF: 24 frames = 1 second → 00:00:01:00', () => {
    const tc = framesToTc(24, 24, false);
    expect(tc).toEqual({ hh: 0, mm: 0, ss: 1, ff: 0 });
  });

  it('24fps NDF: round-trip for frame 12345', () => {
    const { back } = roundTrip(24, false, 12345);
    expect(back).toBe(12345);
  });

  it('25fps NDF: 25 frames = 1 second → 00:00:01:00', () => {
    const tc = framesToTc(25, 25, false);
    expect(tc).toEqual({ hh: 0, mm: 0, ss: 1, ff: 0 });
  });

  it('25fps NDF: round-trip for frame 99999', () => {
    const { back } = roundTrip(25, false, 99999);
    expect(back).toBe(99999);
  });

  it('30fps NDF: 30 frames = 1 second → 00:00:01:00', () => {
    const tc = framesToTc(30, 30, false);
    expect(tc).toEqual({ hh: 0, mm: 0, ss: 1, ff: 0 });
  });

  it('30fps NDF: round-trip for frame 54321', () => {
    const { back } = roundTrip(30, false, 54321);
    expect(back).toBe(54321);
  });

  it('29.97DF: 0 frames → 00:00:00:00', () => {
    const tc = framesToTc(0, 29.97, true);
    expect(tc).toEqual({ hh: 0, mm: 0, ss: 0, ff: 0 });
  });

  it('29.97DF: frame 1799 (last frame of minute 0) → 00:00:59:29', () => {
    const tc = framesToTc(1799, 29.97, true);
    expect(tc).toEqual({ hh: 0, mm: 0, ss: 59, ff: 29 });
  });

  it('29.97DF: frame 1800 (first valid frame of minute 1) → 00:01:00:02', () => {
    const tc = framesToTc(1800, 29.97, true);
    expect(tc).toEqual({ hh: 0, mm: 1, ss: 0, ff: 2 });
  });

  it('29.97DF: frame 17982 (first frame of 10th minute) → 00:10:00:00', () => {
    // 10th-minute exception: no drop at 10, 20, 30, etc.
    const tc = framesToTc(17982, 29.97, true);
    expect(tc).toEqual({ hh: 0, mm: 10, ss: 0, ff: 0 });
  });

  it('29.97DF: 00:10:00:00 → frame 17982', () => {
    const frames = tcToFrames({ hh: 0, mm: 10, ss: 0, ff: 0 }, 29.97, true);
    expect(frames).toBe(17982);
  });

  it('29.97DF: 00:01:00:02 → frame 1800', () => {
    const frames = tcToFrames({ hh: 0, mm: 1, ss: 0, ff: 2 }, 29.97, true);
    expect(frames).toBe(1800);
  });

  it('29.97DF: round-trip for frame 1800', () => {
    const { back } = roundTrip(29.97, true, 1800);
    expect(back).toBe(1800);
  });

  it('29.97DF: round-trip for frame 17982 (10-min boundary)', () => {
    const { back } = roundTrip(29.97, true, 17982);
    expect(back).toBe(17982);
  });

  it('29.97DF: round-trip for frame 107892 (1-hour boundary)', () => {
    const { back } = roundTrip(29.97, true, 107892);
    expect(back).toBe(107892);
  });

  it('29.97DF: drop boundary at 9th minute (minute 9, no 10th exception)', () => {
    // minute 9 is NOT a multiple of 10, so drops apply there
    const tc = framesToTc(17982 - 1798, 29.97, true);
    expect(tc.mm).toBe(9);
    expect(tc.ss).toBe(0);
    expect(tc.ff).toBe(2); // first valid frame in minute 9 is :02
  });
});

describe('formatTc', () => {
  it('NDF uses : separator', () => {
    expect(formatTc({ hh: 1, mm: 2, ss: 3, ff: 4 }, false)).toBe('01:02:03:04');
  });

  it('DF uses ; separator between SS and FF', () => {
    expect(formatTc({ hh: 0, mm: 1, ss: 0, ff: 2 }, true)).toBe('00:01:00;02');
  });

  it('pads all fields to 2 digits', () => {
    expect(formatTc({ hh: 0, mm: 0, ss: 0, ff: 0 }, false)).toBe('00:00:00:00');
    expect(formatTc({ hh: 23, mm: 59, ss: 59, ff: 29 }, false)).toBe('23:59:59:29');
  });
});

// ── MasterClockImpl tests ─────────────────────────────────────────────────

describe('MasterClockImpl', () => {
  let nowMs: number;

  beforeEach(() => {
    nowMs = 0;
  });

  function makeClock() {
    return new MasterClockImpl(undefined, () => nowMs);
  }

  function advanceMs(ms: number) {
    nowMs += ms;
  }

  it('initial state: stopped, totalFrames=0, source=internal, 25fps NDF', () => {
    const clock = makeClock();
    const state = clock.getState();
    expect(state).toEqual({
      rate: 25,
      dropFrame: false,
      totalFrames: 0,
      running: false,
      source: 'internal',
    });
  });

  it('start() sets running=true', () => {
    const clock = makeClock();
    clock.start();
    expect(clock.getState().running).toBe(true);
  });

  it('stop() sets running=false', () => {
    const clock = makeClock();
    clock.start();
    clock.stop();
    expect(clock.getState().running).toBe(false);
  });

  it('free-run advances totalFrames at rate (25fps: 1s = 25 frames)', () => {
    const clock = makeClock();
    clock.start();
    advanceMs(1000);
    expect(clock.getState().totalFrames).toBe(25);
  });

  it('free-run advances at 24fps correctly', () => {
    const clock = makeClock();
    clock.setRate(24, false);
    clock.start();
    advanceMs(1000);
    expect(clock.getState().totalFrames).toBe(24);
  });

  it('free-run advances at 30fps correctly', () => {
    const clock = makeClock();
    clock.setRate(30, false);
    clock.start();
    advanceMs(1000);
    expect(clock.getState().totalFrames).toBe(30);
  });

  it('free-run: 29.97DF increments at real 30000/1001 rate (29 frames after 1000 ms)', () => {
    const clock = makeClock();
    clock.setRate(29.97, true);
    clock.start();
    advanceMs(1000);
    // 30000/1001 ≈ 29.97 fps → floor(29.97) = 29 frames in the first second
    expect(clock.getState().totalFrames).toBe(29);
  });

  it('stop() freezes totalFrames', () => {
    const clock = makeClock();
    clock.start();
    advanceMs(2000);
    clock.stop();
    const frozenFrames = clock.getState().totalFrames;
    expect(frozenFrames).toBe(50); // 2s * 25fps
    advanceMs(1000);
    expect(clock.getState().totalFrames).toBe(frozenFrames); // unchanged after stop
  });

  it('locate(frameNumber) sets totalFrames while stopped', () => {
    const clock = makeClock();
    clock.locate(1000);
    expect(clock.getState().totalFrames).toBe(1000);
  });

  it('locate(tc) sets totalFrames correctly for 25fps', () => {
    const clock = makeClock();
    // 00:00:01:00 at 25fps = 25 frames
    clock.locate({ hh: 0, mm: 0, ss: 1, ff: 0 });
    expect(clock.getState().totalFrames).toBe(25);
  });

  it('locate(tc) while running continues from located position', () => {
    const clock = makeClock();
    clock.start();
    clock.locate(1000);
    advanceMs(1000);
    expect(clock.getState().totalFrames).toBe(1025); // 1000 + 25 frames
  });

  it('start() is idempotent — does not reset position', () => {
    const clock = makeClock();
    clock.locate(500);
    clock.start();
    clock.start(); // second call is a no-op
    expect(clock.getState().totalFrames).toBe(500);
  });

  it('stop() is idempotent', () => {
    const clock = makeClock();
    clock.start();
    advanceMs(1000);
    clock.stop();
    clock.stop();
    expect(clock.getState().running).toBe(false);
    expect(clock.getState().totalFrames).toBe(25);
  });

  it('setRate() changes rate and preserves current position', () => {
    const clock = makeClock();
    clock.locate(100);
    clock.setRate(30, false);
    expect(clock.getState().rate).toBe(30);
    expect(clock.getState().totalFrames).toBe(100);
  });

  it('onChange() fires on start()', () => {
    const clock = makeClock();
    const h = vi.fn();
    clock.onChange(h);
    clock.start();
    expect(h).toHaveBeenCalledTimes(1);
    expect(h.mock.calls[0]![0].running).toBe(true);
  });

  it('onChange() fires on stop()', () => {
    const clock = makeClock();
    clock.start();
    const h = vi.fn();
    clock.onChange(h);
    clock.stop();
    expect(h).toHaveBeenCalledOnce();
    expect(h.mock.calls[0]![0].running).toBe(false);
  });

  it('onChange() fires on locate()', () => {
    const clock = makeClock();
    const h = vi.fn();
    clock.onChange(h);
    clock.locate(99);
    expect(h).toHaveBeenCalledOnce();
    expect(h.mock.calls[0]![0].totalFrames).toBe(99);
  });

  it('onChange() fires on setRate()', () => {
    const clock = makeClock();
    const h = vi.fn();
    clock.onChange(h);
    clock.setRate(30, false);
    expect(h).toHaveBeenCalledOnce();
    expect(h.mock.calls[0]![0].rate).toBe(30);
  });

  it('subscription.unsubscribe() stops future notifications', () => {
    const clock = makeClock();
    const h = vi.fn();
    const sub = clock.onChange(h);
    clock.start();
    sub.unsubscribe();
    clock.stop();
    expect(h).toHaveBeenCalledTimes(1); // only start, not stop
  });

  it('setSource("mtc") suspends free-run (position frozen)', () => {
    const clock = makeClock();
    clock.start();
    advanceMs(1000); // advance 25 frames
    clock.setSource('mtc');
    const frozenFrames = clock.getState().totalFrames;
    expect(frozenFrames).toBe(25); // must capture pre-chase accumulated value, not 0
    advanceMs(1000); // time passes but frames should not advance
    expect(clock.getState().totalFrames).toBe(frozenFrames);
    expect(clock.getState().source).toBe('mtc');
  });

  it('setSource("internal") resumes free-run from frozen position', () => {
    const clock = makeClock();
    clock.start();
    advanceMs(1000); // 25 frames
    clock.setSource('mtc');
    const frozenFrames = clock.getState().totalFrames;
    expect(frozenFrames).toBe(25); // must capture pre-chase value
    clock.setSource('internal');
    advanceMs(1000); // 25 more frames
    expect(clock.getState().totalFrames).toBe(frozenFrames + 25);
  });

  it('external feed can drive position via locate() in chase mode', () => {
    const clock = makeClock();
    clock.start();
    clock.setSource('mtc');
    clock.locate(9000);
    expect(clock.getState().totalFrames).toBe(9000);
    advanceMs(1000); // free-run still suspended
    expect(clock.getState().totalFrames).toBe(9000);
  });

  it('setSource("mtc") captures accumulated free-run, not 0 (issue A regression)', () => {
    const clock = makeClock();
    clock.start();
    advanceMs(2000); // 50 frames at 25fps
    clock.setSource('mtc');
    expect(clock.getState().totalFrames).toBe(50);
  });

  it('setSource("internal") resumes without jump-forward after elapsed chase time (issue C regression)', () => {
    const clock = makeClock();
    clock.start();
    advanceMs(1000); // 25 frames
    clock.setSource('mtc'); // freeze at 25
    advanceMs(5000); // 5 s elapsed during chase — must not be retroactively counted
    clock.setSource('internal');
    advanceMs(1000); // 25 more frames
    expect(clock.getState().totalFrames).toBe(50); // 25 + 25, not 25 + 150
  });

  it('29.97 free-run precision: 1001 ms → 30 frames; 1000 ms → 29 frames (issue B regression)', () => {
    const clock29 = makeClock();
    clock29.setRate(29.97, true);
    clock29.start();
    advanceMs(1001);
    expect(clock29.getState().totalFrames).toBe(30); // floor(1001 * 30000/1001 / 1000) = 30

    const clock29b = makeClock();
    clock29b.setRate(29.97, true);
    clock29b.start();
    advanceMs(1000);
    expect(clock29b.getState().totalFrames).toBe(29); // floor(1000 * 30000/1001 / 1000) = 29
  });

  it('formatTc integration: 25fps 1000 frames → 00:00:40:00', () => {
    // 1000 frames at 25fps = 40s
    const tc = framesToTc(1000, 25, false);
    expect(formatTc(tc, false)).toBe('00:00:40:00');
  });
});
