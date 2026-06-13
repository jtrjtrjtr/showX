import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MtcGenerator } from '../../../../src/main/src/shared/output/mtcGenerator.js';
import { MasterClockImpl } from '../../../../src/main/src/shared/Clock.js';
import type { MidiOutPool, MidiOutLike, MidiFactory } from '../../../../src/main/src/shared/dispatcher/midiOut.js';
import { MidiOutPool as MidiOutPoolImpl } from '../../../../src/main/src/shared/dispatcher/midiOut.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMockPool(portExists = true): {
  pool: MidiOutPool;
  sent: number[][];
  released: boolean[];
} {
  const sent: number[][] = [];
  const released: boolean[] = [];
  let claimed = false;

  const pool: MidiOutPool = {
    claim: vi.fn((portName: string, ownerSlug: string) => {
      if (!portExists || claimed) {
        return { ok: false as const, reason: 'exclusive_owned' as const, ownerSlug: 'other-owner' };
      }
      claimed = true;
      return {
        ok: true as const,
        release: () => {
          claimed = false;
          released.push(true);
        },
        send: async (m: { bytes: number[] }) => {
          sent.push([...m.bytes]);
          return { ok: true, transport: 'midi' as const, latencyMs: 0 };
        },
      };
    }),
    status: vi.fn(() => []),
  } as unknown as MidiOutPool;

  return { pool, sent, released };
}

/** Decode a QF byte pair [0xF1, dataByte] → { pieceIdx, nibble } */
function decodeQF(bytes: number[]): { pieceIdx: number; nibble: number } {
  const data = bytes[1]!;
  return { pieceIdx: (data >> 4) & 0x07, nibble: data & 0x0f };
}

function isFullFrame(bytes: number[]): boolean {
  return (
    bytes.length === 10 &&
    bytes[0] === 0xf0 &&
    bytes[1] === 0x7f &&
    bytes[3] === 0x01 &&
    bytes[4] === 0x01 &&
    bytes[9] === 0xf7
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('MtcGenerator', () => {
  let clock: MasterClockImpl;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = new MasterClockImpl();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── enable / disable basics ───────────────────────────────────────────────

  it('default: disabled, no port claimed', () => {
    const { pool } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    expect(gen.isEnabled).toBe(false);
    expect(pool.claim).not.toHaveBeenCalled();
  });

  it('enable() claims port with slug "time-layer"', () => {
    const { pool } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    expect(pool.claim).toHaveBeenCalledWith('IAC Bus 1', 'time-layer');
    expect(gen.isEnabled).toBe(true);
  });

  it('disable() releases port and stops emitting', () => {
    const { pool, sent, released } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.start();
    vi.advanceTimersByTime(50); // some QF ticks
    const beforeDisable = sent.length;
    gen.disable();
    vi.advanceTimersByTime(100); // no more ticks after disable
    expect(sent.length).toBe(beforeDisable);
    expect(released).toHaveLength(1);
    expect(gen.isEnabled).toBe(false);
  });

  it('ClaimConflict: enable logs and stays disabled', () => {
    const { pool } = makeMockPool();
    const warn = vi.fn();
    const log = { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const gen = new MtcGenerator(clock, pool as unknown as MidiOutPool, log as never);

    // Pre-claim the port so the second claim conflicts
    pool.claim('IAC', 'someone-else');
    gen.enable('IAC');

    expect(gen.isEnabled).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  // ── full-frame SysEx on start ─────────────────────────────────────────────

  it('full-frame SysEx is sent when clock starts', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    expect(sent.filter(isFullFrame)).toHaveLength(0); // not started yet
    clock.start();
    expect(sent.filter(isFullFrame)).toHaveLength(1);
  });

  it('full-frame on start encodes TC 00:00:00:00 @25fps correctly', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.start(); // totalFrames=0, rate=25, df=false → rateCode=1
    const ff = sent.find(isFullFrame)!;
    // hhByte = (1 << 5) | 0 = 0x20; mm=0; ss=0; ff=0
    expect(ff).toEqual([0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x20, 0x00, 0x00, 0x00, 0xf7]);
  });

  // ── quarter-frame sequence ────────────────────────────────────────────────

  it('QF pieces cycle 0→7 at 25fps (10ms interval)', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.start();
    const sentBefore = sent.length; // may include full-frame
    vi.advanceTimersByTime(80); // 8 × 10ms = 8 QF ticks
    const qfMessages = sent.slice(sentBefore).filter((b) => b[0] === 0xf1);
    expect(qfMessages).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(decodeQF(qfMessages[i]!).pieceIdx).toBe(i);
    }
  });

  it('QF pieces continue cycling 0→7→0→7 across blocks', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.start();
    const sentBefore = sent.length;
    vi.advanceTimersByTime(160); // 16 QF ticks = 2 complete 8-piece blocks
    const qfs = sent.slice(sentBefore).filter((b) => b[0] === 0xf1);
    expect(qfs).toHaveLength(16);
    // Pieces should repeat: 0-7, 0-7
    for (let i = 0; i < 16; i++) {
      expect(decodeQF(qfs[i]!).pieceIdx).toBe(i % 8);
    }
  });

  it('rate bits in piece 7 match 25fps (rateCode 1)', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.setRate(25, false);
    clock.start();
    const sentBefore = sent.length;
    vi.advanceTimersByTime(80);
    const piece7 = sent.slice(sentBefore).filter((b) => b[0] === 0xf1 && decodeQF(b).pieceIdx === 7);
    expect(piece7.length).toBeGreaterThan(0);
    // nibble for piece 7 = ((hh>>4 & 1) | (rateCode << 1)) ; hh=0, rateCode=1 → nibble=0b0010=2
    const nibble = decodeQF(piece7[0]!).nibble;
    const decodedRateCode = (nibble >> 1) & 0x03;
    expect(decodedRateCode).toBe(1); // 25fps
  });

  it('rate bits in piece 7 match 24fps (rateCode 0)', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.setRate(24, false);
    clock.start();
    const sentBefore = sent.length;
    vi.advanceTimersByTime(80);
    const piece7 = sent.slice(sentBefore).filter((b) => b[0] === 0xf1 && decodeQF(b).pieceIdx === 7);
    expect(piece7.length).toBeGreaterThan(0);
    const nibble = decodeQF(piece7[0]!).nibble;
    expect((nibble >> 1) & 0x03).toBe(0); // 24fps
  });

  it('rate bits in piece 7 match 29.97df (rateCode 2)', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.setRate(29.97, true);
    clock.start();
    const sentBefore = sent.length;
    vi.advanceTimersByTime(80);
    const piece7 = sent.slice(sentBefore).filter((b) => b[0] === 0xf1 && decodeQF(b).pieceIdx === 7);
    expect(piece7.length).toBeGreaterThan(0);
    const nibble = decodeQF(piece7[0]!).nibble;
    expect((nibble >> 1) & 0x03).toBe(2); // 29.97df
  });

  it('rate bits in piece 7 match 30fps (rateCode 3)', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.setRate(30, false);
    clock.start();
    const sentBefore = sent.length;
    vi.advanceTimersByTime(80);
    const piece7 = sent.slice(sentBefore).filter((b) => b[0] === 0xf1 && decodeQF(b).pieceIdx === 7);
    expect(piece7.length).toBeGreaterThan(0);
    const nibble = decodeQF(piece7[0]!).nibble;
    expect((nibble >> 1) & 0x03).toBe(3); // 30fps
  });

  // ── QF encoding roundtrip ─────────────────────────────────────────────────

  it('QF 8-piece set for 01:02:03:04 @25fps roundtrips through decoder logic', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    // Locate to 01:02:03:04 @25fps = 1*90000 + 2*1500 + 3*25 + 4 = 90000+3000+75+4=93079 + 1-frame lookahead
    // Actually position the clock at 93079 frames
    clock.locate(93079);
    clock.start();
    const sentBefore = sent.length;
    vi.advanceTimersByTime(80); // 8 QF at 10ms each
    const qfs = sent.slice(sentBefore).filter((b) => b[0] === 0xf1);
    expect(qfs).toHaveLength(8);

    // Decode the 8 pieces (as a receiver would)
    const pieces = new Uint8Array(8);
    for (const qf of qfs) {
      const { pieceIdx, nibble } = decodeQF(qf);
      pieces[pieceIdx] = nibble;
    }
    const ff = ((pieces[1]! & 0x01) << 4) | (pieces[0]! & 0x0f);
    const ss = ((pieces[3]! & 0x03) << 4) | (pieces[2]! & 0x0f);
    const mm = ((pieces[5]! & 0x03) << 4) | (pieces[4]! & 0x0f);
    const hh = ((pieces[7]! & 0x01) << 4) | (pieces[6]! & 0x0f);
    const decodedRateCode = (pieces[7]! >> 1) & 0x03;

    // 93079 + 1 (lookahead) = 93080 frames @25fps = 01:02:03:05
    expect(decodedRateCode).toBe(1); // 25fps
    expect(hh).toBe(1);
    expect(mm).toBe(2);
    expect(ss).toBe(3);
    expect(ff).toBe(5); // 04 + 1 lookahead
  });

  // ── full-frame on locate ──────────────────────────────────────────────────

  it('full-frame SysEx sent when clock.locate() called while running', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.start();
    const ffBeforeLocate = sent.filter(isFullFrame).length;
    clock.locate(90_000); // 01:00:00:00 @25fps
    expect(sent.filter(isFullFrame).length).toBe(ffBeforeLocate + 1);
  });

  it('full-frame on locate encodes the located position @25fps', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.start();
    clock.locate(90_000); // 01:00:00:00 @25fps
    const ff = sent.filter(isFullFrame).at(-1)!;
    // rateCode=1, hh=1, mm=0, ss=0, ff=0
    // hhByte = (1<<5)|1 = 0x21
    expect(ff).toEqual([0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x21, 0x00, 0x00, 0x00, 0xf7]);
  });

  // ── stop halts QF stream ─────────────────────────────────────────────────

  it('QF stream stops when clock stops', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.start();
    vi.advanceTimersByTime(50);
    clock.stop();
    const countAfterStop = sent.length;
    vi.advanceTimersByTime(200); // advance further — no more ticks
    expect(sent.length).toBe(countAfterStop);
  });

  it('QF resumes when clock restarts after stop', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    clock.start();
    vi.advanceTimersByTime(30);
    clock.stop();
    const countAfterStop = sent.length;
    clock.start();
    vi.advanceTimersByTime(30);
    expect(sent.length).toBeGreaterThan(countAfterStop);
  });

  // ── no emission before clock start ───────────────────────────────────────

  it('no QF emitted while clock is stopped', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC Bus 1');
    vi.advanceTimersByTime(500); // clock never started
    expect(sent.filter((b) => b[0] === 0xf1)).toHaveLength(0);
  });

  // ── port conflict handled gracefully ─────────────────────────────────────

  it('port already claimed: enable() is a no-op, no crash', () => {
    const { pool } = makeMockPool();
    // Claim the port first
    pool.claim('IAC', 'cue-dispatch');
    const gen = new MtcGenerator(clock, pool);
    expect(() => gen.enable('IAC')).not.toThrow();
    expect(gen.isEnabled).toBe(false);
  });

  it('QF not emitted when port conflict prevented enable', () => {
    const { pool, sent } = makeMockPool();
    pool.claim('IAC', 'cue-dispatch');
    const gen = new MtcGenerator(clock, pool);
    gen.enable('IAC');
    clock.start();
    vi.advanceTimersByTime(200);
    expect(sent).toHaveLength(0); // pool.claim was already used for the conflict claim above
  });

  // ── enable while clock already running ───────────────────────────────────

  it('enable() while clock already running immediately starts emitting', () => {
    const { pool, sent } = makeMockPool();
    const gen = new MtcGenerator(clock, pool);
    clock.start();
    gen.enable('IAC Bus 1');
    // full-frame should be sent immediately
    expect(sent.filter(isFullFrame)).toHaveLength(1);
    vi.advanceTimersByTime(80);
    expect(sent.filter((b) => b[0] === 0xf1)).toHaveLength(8);
  });
});
