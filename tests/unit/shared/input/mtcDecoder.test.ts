import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MtcDecoder, MtcChaser, type MtcTimecode, type MtcRateCode } from '../../../../src/main/src/shared/input/mtcDecoder.js';
import { MasterClockImpl } from '../../../../src/main/src/shared/Clock.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the 8 quarter-frame byte pairs for a given TC and rate code.
 * Returns an array of [0xF1, dataByte] pairs in piece order 0..7.
 */
function makeQFBytes(
  tc: { hh: number; mm: number; ss: number; ff: number },
  rateCode: MtcRateCode,
): number[][] {
  const framesLow = tc.ff & 0x0f;
  const framesHigh = (tc.ff >> 4) & 0x01;
  const secLow = tc.ss & 0x0f;
  const secHigh = (tc.ss >> 4) & 0x03;
  const minLow = tc.mm & 0x0f;
  const minHigh = (tc.mm >> 4) & 0x03;
  const hourLow = tc.hh & 0x0f;
  const hourHighNibble = ((rateCode << 1) | ((tc.hh >> 4) & 0x01)) & 0x0f;

  return [
    [0xf1, (0 << 4) | framesLow],
    [0xf1, (1 << 4) | framesHigh],
    [0xf1, (2 << 4) | secLow],
    [0xf1, (3 << 4) | secHigh],
    [0xf1, (4 << 4) | minLow],
    [0xf1, (5 << 4) | minHigh],
    [0xf1, (6 << 4) | hourLow],
    [0xf1, (7 << 4) | hourHighNibble],
  ];
}

function feedQF(decoder: MtcDecoder, pairs: number[][]): void {
  for (const pair of pairs) decoder.feedBytes(pair);
}

// ── MtcDecoder ────────────────────────────────────────────────────────────────

describe('MtcDecoder', () => {
  let decoder: MtcDecoder;
  let events: MtcTimecode[];

  beforeEach(() => {
    decoder = new MtcDecoder();
    events = [];
    decoder.onTimecode((tc) => events.push({ ...tc }));
  });

  it('8 QF messages reassemble to correct TC — 01:00:00:00 @25fps (rateCode 1)', () => {
    feedQF(decoder, makeQFBytes({ hh: 1, mm: 0, ss: 0, ff: 0 }, 1));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ hh: 1, mm: 0, ss: 0, ff: 0, rateCode: 1 });
  });

  it('8 QF messages reassemble to correct TC — 01:02:03:04 @24fps (rateCode 0)', () => {
    feedQF(decoder, makeQFBytes({ hh: 1, mm: 2, ss: 3, ff: 4 }, 0));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ hh: 1, mm: 2, ss: 3, ff: 4, rateCode: 0 });
  });

  it('frame-rate detection — rateCode 2 (29.97 df) decoded correctly', () => {
    feedQF(decoder, makeQFBytes({ hh: 0, mm: 5, ss: 10, ff: 15 }, 2));
    expect(events[0]?.rateCode).toBe(2);
  });

  it('frame-rate detection — rateCode 3 (30fps) decoded correctly', () => {
    feedQF(decoder, makeQFBytes({ hh: 0, mm: 0, ss: 0, ff: 0 }, 3));
    expect(events[0]?.rateCode).toBe(3);
  });

  it('mid-sequence start — partial set (pieces 4-7) does not emit', () => {
    const bytes = makeQFBytes({ hh: 1, mm: 0, ss: 0, ff: 0 }, 1);
    feedQF(decoder, bytes.slice(4)); // pieces 4..7 only
    expect(events).toHaveLength(0);
  });

  it('mid-sequence start — emits after first complete 8-piece pass following partial start', () => {
    const bytes = makeQFBytes({ hh: 1, mm: 0, ss: 0, ff: 0 }, 1);
    feedQF(decoder, bytes.slice(4)); // pieces 4..7 — no emit yet
    expect(events).toHaveLength(0);
    feedQF(decoder, bytes); // full pass 0..7 — all pieces now seen, emit on piece 7
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ hh: 1, mm: 0, ss: 0, ff: 0, rateCode: 1 });
  });

  it('subsequent complete passes each emit one event', () => {
    const bytes = makeQFBytes({ hh: 0, mm: 10, ss: 0, ff: 0 }, 1);
    feedQF(decoder, bytes); // pass 1
    feedQF(decoder, bytes); // pass 2
    feedQF(decoder, bytes); // pass 3
    expect(events).toHaveLength(3);
  });

  it('full-frame SysEx — F0 7F <dev> 01 01 hh mm ss ff F7 parsed correctly', () => {
    // TC 01:23:45:12 @25fps (rateCode 1)
    // hhByte = (1 << 5) | 1 = 0x21; mm=23=0x17; ss=45=0x2d; ff=12=0x0c
    const raw = [0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x21, 0x17, 0x2d, 0x0c, 0xf7];
    decoder.feedBytes(raw);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ hh: 1, mm: 23, ss: 45, ff: 12, rateCode: 1 });
  });

  it('full-frame SysEx @24fps (rateCode 0) — rate decoded correctly', () => {
    // hhByte = (0 << 5) | 2 = 0x02; TC = 00:00:00:00
    const raw = [0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x02, 0x00, 0x00, 0x00, 0xf7];
    decoder.feedBytes(raw);
    expect(events[0]?.rateCode).toBe(0);
    expect(events[0]?.hh).toBe(2);
  });

  it('full-frame SysEx — wrong MTC subtype → no emit', () => {
    const raw = [0xf0, 0x7f, 0x7f, 0x01, 0x02, 0x21, 0x17, 0x2d, 0x0c, 0xf7];
    decoder.feedBytes(raw);
    expect(events).toHaveLength(0);
  });

  it('full-frame SysEx — too short → no emit', () => {
    decoder.feedBytes([0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x21]);
    expect(events).toHaveLength(0);
  });

  it('non-MTC bytes (0x90) → no emit', () => {
    decoder.feedBytes([0x90, 60, 100]);
    expect(events).toHaveLength(0);
  });

  it('onTimecode — unsubscribe stops delivery', () => {
    const bytes = makeQFBytes({ hh: 0, mm: 0, ss: 0, ff: 0 }, 0);
    const extra: number[] = [];
    const unsub = decoder.onTimecode(() => extra.push(1));
    feedQF(decoder, bytes);
    expect(extra).toHaveLength(1);
    unsub();
    feedQF(decoder, bytes);
    expect(extra).toHaveLength(1); // no more deliveries after unsub
  });

  it('handler throw is swallowed — sibling handler still fires', () => {
    const bytes = makeQFBytes({ hh: 0, mm: 0, ss: 0, ff: 0 }, 0);
    const good: number[] = [];
    decoder.onTimecode(() => { throw new Error('boom'); });
    decoder.onTimecode(() => good.push(1));
    feedQF(decoder, bytes);
    expect(good).toHaveLength(1);
  });
});

// ── MtcChaser ─────────────────────────────────────────────────────────────────

describe('MtcChaser', () => {
  let decoder: MtcDecoder;
  let clock: MasterClockImpl;

  function sendQF(tc: { hh: number; mm: number; ss: number; ff: number }, rateCode: MtcRateCode = 1): void {
    feedQF(decoder, makeQFBytes(tc, rateCode));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    decoder = new MtcDecoder();
    clock = new MasterClockImpl();
    clock.start();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clock source switches to mtc on first lock', () => {
    const chaser = new MtcChaser(decoder, clock);
    chaser.enable();
    sendQF({ hh: 0, mm: 0, ss: 0, ff: 0 });
    expect(clock.getState().source).toBe('mtc');
    expect(chaser.isLocked).toBe(true);
  });

  it('clock locates to decoded TC — 01:00:00:00 @25fps = 90000 frames', () => {
    const chaser = new MtcChaser(decoder, clock);
    chaser.enable();
    sendQF({ hh: 1, mm: 0, ss: 0, ff: 0 }, 1);
    expect(clock.getState().totalFrames).toBe(90_000);
  });

  it('clock locates to decoded TC — 00:30:00:00 @25fps = 45000 frames', () => {
    const chaser = new MtcChaser(decoder, clock);
    chaser.enable();
    sendQF({ hh: 0, mm: 30, ss: 0, ff: 0 }, 1);
    expect(clock.getState().totalFrames).toBe(45_000);
  });

  it('clock rate set from rateCode 0 → 24fps no-DF', () => {
    const chaser = new MtcChaser(decoder, clock);
    chaser.enable();
    sendQF({ hh: 0, mm: 0, ss: 0, ff: 0 }, 0);
    expect(clock.getState().rate).toBe(24);
    expect(clock.getState().dropFrame).toBe(false);
  });

  it('clock rate set from rateCode 2 → 29.97 drop-frame', () => {
    const chaser = new MtcChaser(decoder, clock);
    chaser.enable();
    sendQF({ hh: 0, mm: 0, ss: 0, ff: 0 }, 2);
    expect(clock.getState().rate).toBe(29.97);
    expect(clock.getState().dropFrame).toBe(true);
  });

  it('lock-loss timeout → source returns to internal, locked=false', () => {
    const chaser = new MtcChaser(decoder, clock, 200);
    chaser.enable();
    sendQF({ hh: 0, mm: 30, ss: 0, ff: 0 }, 1); // lock at 45000 frames
    expect(chaser.isLocked).toBe(true);

    vi.advanceTimersByTime(201);

    expect(chaser.isLocked).toBe(false);
    expect(clock.getState().source).toBe('internal');
  });

  it('lock-loss — value held (no jump to 0)', () => {
    const chaser = new MtcChaser(decoder, clock, 200);
    chaser.enable();
    sendQF({ hh: 0, mm: 30, ss: 0, ff: 0 }, 1); // 45000 frames
    vi.advanceTimersByTime(201);
    // internal clock re-anchors at 45000; with fake timers no elapsed time passes
    expect(clock.getState().totalFrames).toBe(45_000);
  });

  it('receiving TC before timeout resets lock-loss timer', () => {
    const chaser = new MtcChaser(decoder, clock, 200);
    chaser.enable();
    sendQF({ hh: 0, mm: 0, ss: 0, ff: 0 }, 1);
    vi.advanceTimersByTime(150);
    sendQF({ hh: 0, mm: 0, ss: 0, ff: 1 }, 1); // refresh
    vi.advanceTimersByTime(150);
    expect(chaser.isLocked).toBe(true); // timer was reset, so still within window
  });

  it('disable before lock-loss timeout — source returns to internal immediately', () => {
    const chaser = new MtcChaser(decoder, clock);
    chaser.enable();
    sendQF({ hh: 1, mm: 0, ss: 0, ff: 0 });
    expect(chaser.isLocked).toBe(true);
    chaser.disable();
    expect(chaser.isLocked).toBe(false);
    expect(clock.getState().source).toBe('internal');
  });

  it('chaser disabled — TC events do not affect clock', () => {
    const chaser = new MtcChaser(decoder, clock);
    // Do NOT call enable
    sendQF({ hh: 1, mm: 0, ss: 0, ff: 0 });
    expect(clock.getState().source).toBe('internal');
    expect(chaser.isLocked).toBe(false);
  });

  it('enable after disable re-subscribes correctly', () => {
    const chaser = new MtcChaser(decoder, clock);
    chaser.enable();
    sendQF({ hh: 0, mm: 1, ss: 0, ff: 0 });
    expect(chaser.isLocked).toBe(true);
    chaser.disable();
    chaser.enable();
    sendQF({ hh: 0, mm: 2, ss: 0, ff: 0 }); // re-lock
    expect(chaser.isLocked).toBe(true);
    expect(clock.getState().source).toBe('mtc');
  });
});
