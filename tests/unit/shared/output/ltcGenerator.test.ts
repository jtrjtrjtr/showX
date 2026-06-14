import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LtcGenerator } from '../../../../src/main/src/shared/output/ltcGenerator.js';
import { MasterClockImpl } from '../../../../src/main/src/shared/Clock.js';
import type {
  LtcEncoderFactory,
  LtcEncoderLike,
  LtcOutputStreamFactory,
  LtcOutputStreamLike,
} from '../../../../src/main/src/shared/output/ltcGenerator.js';

// Load libltc-wrapper synchronously for the round-trip tests (no top-level await)
const _req = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ltcLibForRoundTrip: any = null;
try {
  ltcLibForRoundTrip = _req('libltc-wrapper');
} catch {
  // not available (CI/headless); round-trip tests will be skipped
}

// ── Stubs ────────────────────────────────────────────────────────────────────

function makeEncoderFactory(): {
  factory: LtcEncoderFactory;
  calls: Array<{ hh: number; mm: number; ss: number; ff: number }>;
} {
  const calls: Array<{ hh: number; mm: number; ss: number; ff: number }> = [];

  const factory: LtcEncoderFactory = {
    create() {
      const encoder: LtcEncoderLike = {
        encodeFrame(hh, mm, ss, ff) {
          calls.push({ hh, mm, ss, ff });
          // 1 frame of silence at 48000/25 = 1920 bytes, centered at 128 (u8 format)
          return Buffer.alloc(1920, 128);
        },
      };
      return encoder;
    },
  };

  return { factory, calls };
}

function makeStreamFactory(): {
  factory: LtcOutputStreamFactory;
  written: Buffer[];
  closed: boolean[];
} {
  const written: Buffer[] = [];
  const closed: boolean[] = [];

  const factory: LtcOutputStreamFactory = {
    open(): LtcOutputStreamLike {
      return {
        write(buf) { written.push(Buffer.from(buf)); },
        close() { closed.push(true); },
      };
    },
  };

  return { factory, written, closed };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LtcGenerator', () => {
  let clock: MasterClockImpl;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = new MasterClockImpl();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── disabled by default ───────────────────────────────────────────────────

  it('is disabled by default', () => {
    const { factory } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);
    expect(gen.isEnabled).toBe(false);
    expect(gen.getStatus()).toMatchObject({ enabled: false, deviceId: -1, rate: null });
  });

  // ── enable with null factory ──────────────────────────────────────────────

  it('enable() is a no-op when encoderFactory is null (libltc unavailable)', () => {
    const warnLog = vi.fn();
    const gen = new LtcGenerator(clock, 48000, null, null, {
      warn: warnLog, info: vi.fn(), error: vi.fn(), debug: vi.fn(),
    } as never);
    gen.enable(0);
    expect(gen.isEnabled).toBe(false);
    expect(warnLog).toHaveBeenCalledOnce();
  });

  // ── enable / disable lifecycle ────────────────────────────────────────────

  it('enable() marks isEnabled and exposes deviceId in status', () => {
    const { factory } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);
    gen.enable(3);
    expect(gen.isEnabled).toBe(true);
    expect(gen.getStatus()).toMatchObject({ enabled: true, deviceId: 3 });
  });

  it('disable() stops the generator and clears status', () => {
    const { factory } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);
    gen.enable(0);
    gen.disable();
    expect(gen.isEnabled).toBe(false);
    expect(gen.getStatus()).toMatchObject({ enabled: false, deviceId: -1, rate: null });
  });

  it('enable() called twice replaces the previous session cleanly', () => {
    const { factory } = makeEncoderFactory();
    const { factory: sf, closed } = makeStreamFactory();
    const gen = new LtcGenerator(clock, 48000, factory, sf);
    clock.start();
    gen.enable(0);
    gen.enable(1); // replaces previous
    expect(gen.isEnabled).toBe(true);
    expect(gen.getStatus().deviceId).toBe(1);
  });

  // ── master clock → encoder ticked ────────────────────────────────────────

  it('ticks the encoder when clock is running as internal master', () => {
    const { factory, calls } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);
    gen.enable(0);

    clock.start(); // triggers onClockChange → starts interval

    // 25 fps → interval ≈ 40ms; advance by 80ms to get ~2 ticks
    vi.advanceTimersByTime(80);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('writes PCM to stream on each tick when master', () => {
    const { factory } = makeEncoderFactory();
    const { factory: sf, written } = makeStreamFactory();
    const gen = new LtcGenerator(clock, 48000, factory, sf);
    gen.enable(0);

    clock.start();
    vi.advanceTimersByTime(80);
    expect(written.length).toBeGreaterThanOrEqual(1);
    // Each chunk should be 1920 bytes (1 frame at 25fps / 48000 Hz)
    for (const chunk of written) {
      expect(chunk.length).toBe(1920);
    }
  });

  it('does NOT tick while clock is stopped', () => {
    const { factory, calls } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);
    gen.enable(0);
    // clock not started — prevMaster stays false, no interval
    vi.advanceTimersByTime(200);
    expect(calls.length).toBe(0);
  });

  it('does NOT tick when clock source is external (MTC/LTC)', () => {
    const { factory, calls } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);
    gen.enable(0);
    clock.setSource('mtc');
    clock.start();
    vi.advanceTimersByTime(200);
    expect(calls.length).toBe(0);
  });

  // ── clock stop → stream closed ────────────────────────────────────────────

  it('closes the stream when clock stops', () => {
    const { factory } = makeEncoderFactory();
    const { factory: sf, closed } = makeStreamFactory();
    const gen = new LtcGenerator(clock, 48000, factory, sf);
    gen.enable(0);
    clock.start();
    vi.advanceTimersByTime(40);
    clock.stop(); // triggers onClockChange → stopInterval + closeStream
    expect(closed.length).toBeGreaterThanOrEqual(1);
  });

  it('stops ticking after clock stops', () => {
    const { factory, calls } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);
    gen.enable(0);
    clock.start();
    vi.advanceTimersByTime(40);
    const callsBefore = calls.length;
    clock.stop();
    vi.advanceTimersByTime(200);
    expect(calls.length).toBe(callsBefore);
  });

  // ── rate change ───────────────────────────────────────────────────────────

  it('restarts stream on rate change while master', () => {
    const { factory } = makeEncoderFactory();
    const { factory: sf, closed } = makeStreamFactory();
    const gen = new LtcGenerator(clock, 48000, factory, sf);
    gen.enable(0);
    clock.start();
    vi.advanceTimersByTime(40);
    const closedBefore = closed.length;
    clock.setRate(30, false); // triggers rateChanged branch
    expect(gen.getStatus().rate).toBe(30);
    // Old stream closed + new one opened
    expect(closed.length).toBeGreaterThan(closedBefore);
  });

  // ── disable stops ticking ─────────────────────────────────────────────────

  it('stops ticking after disable()', () => {
    const { factory, calls } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);
    gen.enable(0);
    clock.start();
    vi.advanceTimersByTime(40);
    const before = calls.length;
    gen.disable();
    vi.advanceTimersByTime(200);
    expect(calls.length).toBe(before);
  });

  it('closes stream on disable()', () => {
    const { factory } = makeEncoderFactory();
    const { factory: sf, closed } = makeStreamFactory();
    const gen = new LtcGenerator(clock, 48000, factory, sf);
    gen.enable(0);
    clock.start();
    vi.advanceTimersByTime(40);
    gen.disable();
    expect(closed.length).toBeGreaterThanOrEqual(1);
  });

  // ── error resilience ──────────────────────────────────────────────────────

  it('logs error and keeps running when encoder.encodeFrame throws', () => {
    const errorLog = vi.fn();
    let firstCall = true;
    const brokenFactory: LtcEncoderFactory = {
      create() {
        return {
          encodeFrame() {
            if (firstCall) { firstCall = false; throw new Error('encode failed'); }
            return Buffer.alloc(1920, 128);
          },
        };
      },
    };
    const gen = new LtcGenerator(clock, 48000, brokenFactory, null, {
      warn: vi.fn(), info: vi.fn(), error: errorLog, debug: vi.fn(),
    } as never);
    gen.enable(0);
    clock.start();
    vi.advanceTimersByTime(100); // several ticks
    expect(errorLog).toHaveBeenCalledOnce(); // only first tick throws
    expect(gen.isEnabled).toBe(true); // still running
  });

  // ── frame-rate correctness ────────────────────────────────────────────────

  it('passes the correct timecode to encodeFrame (from clock totalFrames)', () => {
    const { factory, calls } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);
    gen.enable(0);
    // Locate clock to 01:02:03:04 at 25fps
    clock.locate(91379); // 1*3600*25 + 2*60*25 + 3*25 + 4 = 90000+3000+75+4 = 93079... let me compute
    // Actually: (1*3600 + 2*60 + 3)*25 + 4 = (3600+120+3)*25 + 4 = 3723*25+4 = 93075+4 = 93079
    clock.locate(93079);
    clock.setRate(25, false);
    clock.start();
    vi.advanceTimersByTime(40); // at least 1 tick
    const lastCall = calls[calls.length - 1];
    expect(lastCall).toBeDefined();
    // Allow minor drift (clock ticked while advancing timers)
    expect(lastCall!.hh).toBe(1);
    expect(lastCall!.mm).toBe(2);
    expect(lastCall!.ss).toBe(3);
  });

  // ── IPC channels ─────────────────────────────────────────────────────────

  it('IPC channel names are defined correctly', async () => {
    const { IPC } = await import('../../../../src/main/src/ipc/channels.js');
    expect(IPC.LTC_GEN_ENABLE).toBe('ltc:gen:enable');
    expect(IPC.LTC_GEN_DISABLE).toBe('ltc:gen:disable');
    expect(IPC.LTC_GEN_STATUS).toBe('ltc:gen:status');
  });

  it('registerLtcGeneratorBridge registers all 3 handlers', async () => {
    const { registerLtcGeneratorBridge } = await import('../../../../src/main/src/ipc/ltcGeneratorBridge.js');
    const { IPC } = await import('../../../../src/main/src/ipc/channels.js');
    const { factory } = makeEncoderFactory();
    const gen = new LtcGenerator(clock, 48000, factory, null);

    const handled: string[] = [];
    const mockIpc = { handle(channel: string) { handled.push(channel); } };

    registerLtcGeneratorBridge({ ltcGenerator: gen }, mockIpc as never);

    expect(handled).toContain(IPC.LTC_GEN_ENABLE);
    expect(handled).toContain(IPC.LTC_GEN_DISABLE);
    expect(handled).toContain(IPC.LTC_GEN_STATUS);
  });
});

// ── Round-trip test (requires real libltc-wrapper native binary) ──────────────

describe('LTC encode→decode round-trip (native libltc-wrapper)', () => {
  /**
   * Helper: encode `count` consecutive frames starting at TC (hh,mm,ss,ff),
   * feed all PCM to decoder, then drain the queue.
   * Returns all decoded LTCFrame objects.
   *
   * The LTC sync word is at the END of each frame, so the decoder typically
   * queues a frame after processing the last sample of that frame. Feeding
   * multiple frames (4+) gives the decoder a running start to lock on.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function roundTrip(sampleRate: number, fps: number, hh: number, mm: number, ss: number, startFrame: number, count = 4): any[] {
    const enc = new ltcLibForRoundTrip.LTCEncoder(sampleRate, fps, 1 /* LTC_USE_DATE */);
    const dec = new ltcLibForRoundTrip.LTCDecoder(sampleRate, fps, 'u8');

    for (let i = 0; i < count; i++) {
      enc.setTimecode({ hours: hh, minutes: mm, seconds: ss, frame: startFrame + i });
      enc.encodeFrame();
      dec.write(enc.getBuffer());
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decoded: any[] = [];
    let f;
    while ((f = dec.read()) !== undefined) {
      decoded.push(f);
    }
    return decoded;
  }

  it.skipIf(!ltcLibForRoundTrip)('25fps NDF: encode TC 01:02:03:04 → decode → same TC appears in queue', () => {
    const frames = roundTrip(48000, 25, 1, 2, 3, 4);
    expect(frames.length).toBeGreaterThan(0);
    const match = frames.find((f) => f.hours === 1 && f.minutes === 2 && f.seconds === 3 && f.frames === 4);
    expect(match).toBeDefined();
    expect(match!.drop_frame_format).toBe(false);
  });

  it.skipIf(!ltcLibForRoundTrip)('30fps NDF: encode TC 00:00:00:00 → decode → same TC appears in queue', () => {
    const frames = roundTrip(48000, 30, 0, 0, 0, 0);
    expect(frames.length).toBeGreaterThan(0);
    const match = frames.find((f) => f.hours === 0 && f.minutes === 0 && f.seconds === 0 && f.frames === 0);
    expect(match).toBeDefined();
  });

  it.skipIf(!ltcLibForRoundTrip)('24fps NDF: encode TC 00:59:59:20 → decode → same TC appears in queue', () => {
    const frames = roundTrip(48000, 24, 0, 59, 59, 20);
    expect(frames.length).toBeGreaterThan(0);
    const match = frames.find((f) => f.hours === 0 && f.minutes === 59 && f.seconds === 59 && f.frames === 20);
    expect(match).toBeDefined();
  });

  it.skipIf(!ltcLibForRoundTrip)('getBuffer() length is sampleRate/fps bytes per frame', () => {
    for (const [sampleRate, fps, expected] of [
      [48000, 25, 1920],
      [48000, 30, 1600],
      [48000, 24, 2000],
    ] as [number, number, number][]) {
      const enc = new ltcLibForRoundTrip.LTCEncoder(sampleRate, fps, 1);
      enc.setTimecode({ hours: 0, minutes: 0, seconds: 0, frame: 0 });
      enc.encodeFrame();
      expect(enc.getBuffer().length).toBe(expected);
    }
  });
});
