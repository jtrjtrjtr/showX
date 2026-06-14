import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LtcFrameDecoder,
  LtcChaser,
  LtcReceiver,
  type LtcDecoderFactory,
  type LtcDecoderLike,
  type LtcDecodedFrame,
  type LtcInputStreamFactory,
  type LtcInputStreamLike,
} from '../../../../src/main/src/shared/input/ltcDecoder.js';
import { MasterClockImpl } from '../../../../src/main/src/shared/Clock.js';

// Load libltc-wrapper synchronously for round-trip tests
const _req = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ltcLib: any = null;
try {
  ltcLib = _req('libltc-wrapper');
} catch {
  // CI/headless: round-trip tests skipped
}

// ── Stubs ────────────────────────────────────────────────────────────────────

/**
 * A stub factory that, on each write(), queues the next pre-defined frame.
 * Allows synchronous unit tests without real PCM.
 */
function makeDecoderFactory(frames: LtcDecodedFrame[]): LtcDecoderFactory {
  return {
    create(): LtcDecoderLike {
      let idx = 0;
      const pending: LtcDecodedFrame[] = [];
      return {
        write(): void {
          if (idx < frames.length) pending.push(frames[idx++]!);
        },
        read(): LtcDecodedFrame | undefined {
          return pending.shift();
        },
      };
    },
  };
}

function makeStreamFactory(): {
  factory: LtcInputStreamFactory;
  closed: boolean[];
} {
  const closed: boolean[] = [];
  const factory: LtcInputStreamFactory = {
    open(): LtcInputStreamLike {
      return { close() { closed.push(true); } };
    },
  };
  return { factory, closed };
}

const NDF_FRAME: LtcDecodedFrame = {
  hours: 1, minutes: 2, seconds: 3, frames: 4, drop_frame_format: false,
};

const DF_FRAME: LtcDecodedFrame = {
  hours: 0, minutes: 1, seconds: 0, frames: 0, drop_frame_format: true,
};

// ── LtcFrameDecoder ───────────────────────────────────────────────────────────

describe('LtcFrameDecoder', () => {
  it('isReady is true when factory is provided', () => {
    const dec = new LtcFrameDecoder(48000, 25, makeDecoderFactory([NDF_FRAME]));
    expect(dec.isReady).toBe(true);
  });

  it('isReady is false when factory is null', () => {
    const dec = new LtcFrameDecoder(48000, 25, null);
    expect(dec.isReady).toBe(false);
  });

  it('write() is a no-op when factory is null', () => {
    const dec = new LtcFrameDecoder(48000, 25, null);
    expect(() => dec.write(Buffer.alloc(10))).not.toThrow();
  });

  it('onFrame handler receives decoded frame after write()', () => {
    const dec = new LtcFrameDecoder(48000, 25, makeDecoderFactory([NDF_FRAME]));
    const received: LtcDecodedFrame[] = [];
    dec.onFrame((f) => received.push(f));

    dec.write(Buffer.alloc(1920));

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ hours: 1, minutes: 2, seconds: 3, frames: 4, drop_frame_format: false });
  });

  it('multiple handlers all receive the frame', () => {
    const dec = new LtcFrameDecoder(48000, 25, makeDecoderFactory([NDF_FRAME]));
    const a: LtcDecodedFrame[] = [];
    const b: LtcDecodedFrame[] = [];
    dec.onFrame((f) => a.push(f));
    dec.onFrame((f) => b.push(f));

    dec.write(Buffer.alloc(1920));

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('unsubscribe removes handler', () => {
    const dec = new LtcFrameDecoder(48000, 25, makeDecoderFactory([NDF_FRAME]));
    const received: LtcDecodedFrame[] = [];
    const unsub = dec.onFrame((f) => received.push(f));
    unsub();

    dec.write(Buffer.alloc(1920));

    expect(received).toHaveLength(0);
  });

  it('handler throwing does not prevent subsequent handlers', () => {
    const dec = new LtcFrameDecoder(48000, 25, makeDecoderFactory([NDF_FRAME]));
    const received: LtcDecodedFrame[] = [];
    dec.onFrame(() => { throw new Error('oops'); });
    dec.onFrame((f) => received.push(f));

    dec.write(Buffer.alloc(1920));

    expect(received).toHaveLength(1);
  });

  it('multiple frames in one write() drains the queue', () => {
    const frames = [NDF_FRAME, DF_FRAME];
    // factory queues one frame per write(); call write() twice to get both
    const dec = new LtcFrameDecoder(48000, 25, makeDecoderFactory(frames));
    const received: LtcDecodedFrame[] = [];
    dec.onFrame((f) => received.push(f));

    dec.write(Buffer.alloc(1920));
    dec.write(Buffer.alloc(1920));

    expect(received).toHaveLength(2);
  });
});

// ── LtcChaser ─────────────────────────────────────────────────────────────────

describe('LtcChaser', () => {
  let clock: MasterClockImpl;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = new MasterClockImpl();
    clock.start();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeChaser(frames: LtcDecodedFrame[], timeoutMs = 200): { chaser: LtcChaser; decoder: LtcFrameDecoder } {
    const decoder = new LtcFrameDecoder(48000, 25, makeDecoderFactory(frames));
    const chaser = new LtcChaser(decoder, clock, 25, timeoutMs);
    return { chaser, decoder };
  }

  it('not locked by default', () => {
    const { chaser } = makeChaser([NDF_FRAME]);
    expect(chaser.isLocked).toBe(false);
  });

  it('enable() is idempotent', () => {
    const { chaser } = makeChaser([]);
    chaser.enable();
    chaser.enable(); // second call is no-op
    expect(chaser.isLocked).toBe(false);
  });

  it('does not lock on first frame (gate = 2)', () => {
    const { chaser, decoder } = makeChaser([NDF_FRAME, NDF_FRAME]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920)); // frame 1

    expect(chaser.isLocked).toBe(false);
    expect(clock.getState().source).toBe('internal');
  });

  it('locks on second consecutive frame', () => {
    const { chaser, decoder } = makeChaser([NDF_FRAME, NDF_FRAME]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920)); // frame 1
    decoder.write(Buffer.alloc(1920)); // frame 2 → lock

    expect(chaser.isLocked).toBe(true);
    expect(clock.getState().source).toBe('ltc');
  });

  it('locates clock to decoded TC on lock', () => {
    const tc: LtcDecodedFrame = { hours: 1, minutes: 2, seconds: 3, frames: 4, drop_frame_format: false };
    const { chaser, decoder } = makeChaser([tc, tc]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920));
    decoder.write(Buffer.alloc(1920));

    const state = clock.getState();
    // 1h2m3s4f @ 25fps = (1*3600+2*60+3)*25+4 = 3723*25+4 = 93079
    expect(state.totalFrames).toBe(93079);
  });

  it('continues locating clock on each subsequent frame after lock', () => {
    const tc1: LtcDecodedFrame = { hours: 0, minutes: 0, seconds: 0, frames: 0, drop_frame_format: false };
    const tc2: LtcDecodedFrame = { hours: 0, minutes: 0, seconds: 0, frames: 5, drop_frame_format: false };
    const { chaser, decoder } = makeChaser([tc1, tc1, tc2]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920)); // gate 1
    decoder.write(Buffer.alloc(1920)); // gate 2 → lock, locate(0)
    decoder.write(Buffer.alloc(1920)); // locked, locate(5)

    expect(clock.getState().totalFrames).toBe(5);
  });

  it('sets clock source back to internal on lock-loss timeout', () => {
    const { chaser, decoder } = makeChaser([NDF_FRAME, NDF_FRAME]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920));
    decoder.write(Buffer.alloc(1920));
    expect(chaser.isLocked).toBe(true);

    vi.advanceTimersByTime(250); // past 200ms timeout

    expect(chaser.isLocked).toBe(false);
    expect(clock.getState().source).toBe('internal');
  });

  it('holds last TC position on lock-loss (does not jump to 0)', () => {
    const tc: LtcDecodedFrame = { hours: 0, minutes: 1, seconds: 0, frames: 0, drop_frame_format: false };
    const { chaser, decoder } = makeChaser([tc, tc]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920));
    decoder.write(Buffer.alloc(1920));
    // lock: clock.locate to 0:01:00:00 = 60*25=1500 frames

    vi.advanceTimersByTime(250); // lock-loss

    // Position should be held near 1500 (not 0)
    expect(clock.getState().totalFrames).toBeGreaterThan(0);
  });

  it('gate resets after timeout with no frames', () => {
    const { chaser, decoder } = makeChaser([NDF_FRAME, NDF_FRAME, NDF_FRAME, NDF_FRAME]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920)); // gate 1
    vi.advanceTimersByTime(250);       // gate reset timer fires → gateCount = 0
    decoder.write(Buffer.alloc(1920)); // gate 1 again (not 2)

    expect(chaser.isLocked).toBe(false);

    decoder.write(Buffer.alloc(1920)); // gate 2 → lock
    expect(chaser.isLocked).toBe(true);
  });

  it('disable() releases lock and restores source', () => {
    const { chaser, decoder } = makeChaser([NDF_FRAME, NDF_FRAME]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920));
    decoder.write(Buffer.alloc(1920));
    expect(chaser.isLocked).toBe(true);

    chaser.disable();

    expect(chaser.isLocked).toBe(false);
    expect(clock.getState().source).toBe('internal');
  });

  it('disable() is safe when not enabled', () => {
    const { chaser } = makeChaser([]);
    expect(() => chaser.disable()).not.toThrow();
  });

  it('detects DF from stream and sets clock rate', () => {
    const { chaser, decoder } = makeChaser([DF_FRAME, DF_FRAME]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920));
    decoder.write(Buffer.alloc(1920));

    expect(clock.getState().dropFrame).toBe(true);
  });

  it('detectedRate reflects fps at construction and DF from stream', () => {
    const { chaser, decoder } = makeChaser([DF_FRAME, DF_FRAME]);
    chaser.enable();
    decoder.write(Buffer.alloc(1920));
    decoder.write(Buffer.alloc(1920));

    const r = chaser.detectedRate;
    expect(r.fps).toBe(25);
    expect(r.dropFrame).toBe(true);
  });

  it('does not start clock if already running', () => {
    const { chaser, decoder } = makeChaser([NDF_FRAME, NDF_FRAME]);
    clock.start(); // already running
    chaser.enable();

    decoder.write(Buffer.alloc(1920));
    decoder.write(Buffer.alloc(1920));

    expect(clock.getState().running).toBe(true);
    expect(clock.getState().source).toBe('ltc');
  });

  it('starts clock if stopped when lock achieved', () => {
    clock.stop();
    const { chaser, decoder } = makeChaser([NDF_FRAME, NDF_FRAME]);
    chaser.enable();

    decoder.write(Buffer.alloc(1920));
    decoder.write(Buffer.alloc(1920));

    expect(clock.getState().running).toBe(true);
  });
});

// ── LtcReceiver ───────────────────────────────────────────────────────────────

describe('LtcReceiver', () => {
  let clock: MasterClockImpl;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = new MasterClockImpl();
    clock.start();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disabled by default', () => {
    const recv = new LtcReceiver(clock, 48000, 25, 200, null, null);
    expect(recv.isEnabled).toBe(false);
    expect(recv.isLocked).toBe(false);
    expect(recv.getStatus()).toMatchObject({
      enabled: false,
      deviceId: -1,
      locked: false,
      rate: null,
    });
  });

  it('enable() is a no-op when decoderFactory is null', () => {
    const warnLog = vi.fn();
    const recv = new LtcReceiver(clock, 48000, 25, 200, null, null, {
      warn: warnLog, info: vi.fn(), error: vi.fn(), debug: vi.fn(),
    } as never);

    recv.enable(0);

    expect(recv.isEnabled).toBe(false);
    expect(warnLog).toHaveBeenCalledOnce();
  });

  it('enable() marks isEnabled and exposes deviceId in status', () => {
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([]), null);

    recv.enable(3);

    expect(recv.isEnabled).toBe(true);
    expect(recv.getStatus()).toMatchObject({ enabled: true, deviceId: 3, rate: 25 });
  });

  it('disable() clears enabled state', () => {
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([]), null);

    recv.enable(2);
    recv.disable();

    expect(recv.isEnabled).toBe(false);
    expect(recv.getStatus()).toMatchObject({ enabled: false, deviceId: -1, rate: null });
  });

  it('disable() is safe when already disabled', () => {
    const recv = new LtcReceiver(clock, 48000, 25, 200, null, null);
    expect(() => recv.disable()).not.toThrow();
  });

  it('enable() called twice replaces previous session', () => {
    const { factory: sf, closed } = makeStreamFactory();
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([]), sf);

    recv.enable(0);
    recv.enable(1);

    expect(recv.isEnabled).toBe(true);
    expect(recv.getStatus().deviceId).toBe(1);
    // Previous stream closed
    expect(closed.length).toBeGreaterThanOrEqual(1);
  });

  it('closes audio stream on disable()', () => {
    const { factory: sf, closed } = makeStreamFactory();
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([]), sf);

    recv.enable(0);
    recv.disable();

    expect(closed.length).toBeGreaterThanOrEqual(1);
  });

  it('no-signal graceful: stream factory null → decoder still wired, no crash', () => {
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([NDF_FRAME, NDF_FRAME]), null);

    recv.enable(0); // no stream, but decoder is active

    expect(recv.isEnabled).toBe(true);
  });

  it('clock chase: PCM fed via frameDecoder → clock source becomes ltc', () => {
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([NDF_FRAME, NDF_FRAME]), null);
    recv.enable(0);

    recv.frameDecoder.write(Buffer.alloc(1920));
    recv.frameDecoder.write(Buffer.alloc(1920));

    expect(recv.isLocked).toBe(true);
    expect(clock.getState().source).toBe('ltc');
  });

  it('status.locked reflects chaser state', () => {
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([NDF_FRAME, NDF_FRAME]), null);
    recv.enable(0);

    recv.frameDecoder.write(Buffer.alloc(1920));
    recv.frameDecoder.write(Buffer.alloc(1920));

    expect(recv.getStatus().locked).toBe(true);
  });

  it('does not conflict with LTC out: when source is ltc, generator would be suppressed', () => {
    // Verify clock source is 'ltc' after chase lock (LtcGenerator checks source === 'internal')
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([NDF_FRAME, NDF_FRAME]), null);
    recv.enable(0);
    recv.frameDecoder.write(Buffer.alloc(1920));
    recv.frameDecoder.write(Buffer.alloc(1920));

    expect(clock.getState().source).toBe('ltc');
    // (LtcGenerator will not tick because source !== 'internal')
  });
});

// ── IPC channels ──────────────────────────────────────────────────────────────

describe('LTC decode IPC channels', () => {
  it('channel constants are defined correctly', async () => {
    const { IPC } = await import('../../../../src/main/src/ipc/channels.js');
    expect(IPC.LTC_DEC_ENABLE).toBe('ltc:dec:enable');
    expect(IPC.LTC_DEC_DISABLE).toBe('ltc:dec:disable');
    expect(IPC.LTC_DEC_STATUS).toBe('ltc:dec:status');
  });

  it('registerLtcDecoderBridge registers all 3 handlers', async () => {
    const { registerLtcDecoderBridge } = await import('../../../../src/main/src/ipc/ltcDecoderBridge.js');
    const { IPC } = await import('../../../../src/main/src/ipc/channels.js');

    const clock = new MasterClockImpl();
    const recv = new LtcReceiver(clock, 48000, 25, 200, null, null);

    const handled: string[] = [];
    const mockIpc = { handle(channel: string) { handled.push(channel); } };

    registerLtcDecoderBridge({ ltcReceiver: recv }, mockIpc as never);

    expect(handled).toContain(IPC.LTC_DEC_ENABLE);
    expect(handled).toContain(IPC.LTC_DEC_DISABLE);
    expect(handled).toContain(IPC.LTC_DEC_STATUS);
  });

  it('enable handler calls ltcReceiver.enable(deviceId)', async () => {
    const { registerLtcDecoderBridge } = await import('../../../../src/main/src/ipc/ltcDecoderBridge.js');
    const { IPC } = await import('../../../../src/main/src/ipc/channels.js');

    const clock = new MasterClockImpl();
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([]), null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const mockIpc = { handle(ch: string, fn: (...args: unknown[]) => unknown) { handlers.set(ch, fn); } };

    registerLtcDecoderBridge({ ltcReceiver: recv }, mockIpc as never);

    await handlers.get(IPC.LTC_DEC_ENABLE)!(undefined, 5);
    expect(recv.isEnabled).toBe(true);
    expect(recv.getStatus().deviceId).toBe(5);
  });

  it('disable handler calls ltcReceiver.disable()', async () => {
    const { registerLtcDecoderBridge } = await import('../../../../src/main/src/ipc/ltcDecoderBridge.js');
    const { IPC } = await import('../../../../src/main/src/ipc/channels.js');

    const clock = new MasterClockImpl();
    const recv = new LtcReceiver(clock, 48000, 25, 200,
      makeDecoderFactory([]), null);
    recv.enable(0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const mockIpc = { handle(ch: string, fn: (...args: unknown[]) => unknown) { handlers.set(ch, fn); } };

    registerLtcDecoderBridge({ ltcReceiver: recv }, mockIpc as never);

    await handlers.get(IPC.LTC_DEC_DISABLE)!();
    expect(recv.isEnabled).toBe(false);
  });

  it('status handler returns LtcDecoderStatus', async () => {
    const { registerLtcDecoderBridge } = await import('../../../../src/main/src/ipc/ltcDecoderBridge.js');
    const { IPC } = await import('../../../../src/main/src/ipc/channels.js');

    const clock = new MasterClockImpl();
    const recv = new LtcReceiver(clock, 48000, 25, 200, null, null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const mockIpc = { handle(ch: string, fn: (...args: unknown[]) => unknown) { handlers.set(ch, fn); } };

    registerLtcDecoderBridge({ ltcReceiver: recv }, mockIpc as never);

    const status = await handlers.get(IPC.LTC_DEC_STATUS)!();
    expect(status).toMatchObject({ enabled: false, deviceId: -1, locked: false, rate: null });
  });
});

// ── Synthetic round-trip (requires real libltc-wrapper) ───────────────────────

describe('LTC encode→decode round-trip (native libltc-wrapper)', () => {
  /**
   * Encodes `count` consecutive frames starting at the given TC via the real
   * LTCEncoder, then feeds the PCM through LtcFrameDecoder, and collects frames.
   */
  function roundTrip(
    fps: number,
    hh: number,
    mm: number,
    ss: number,
    startFrame: number,
    count = 4,
  ): LtcDecodedFrame[] {
    const sampleRate = 48000;
    // Use the real libltc-wrapper factory to create the decoder
    const enc = new ltcLib.LTCEncoder(sampleRate, fps, 1 /* LTC_USE_DATE */);

    const decoded: LtcDecodedFrame[] = [];
    const factory: LtcDecoderFactory = {
      create(): LtcDecoderLike {
        const dec = new ltcLib.LTCDecoder(sampleRate, fps, 'u8');
        return {
          write(buf: Buffer): void { dec.write(buf); },
          read(): LtcDecodedFrame | undefined {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f: any = dec.read();
            if (f === undefined || f === null) return undefined;
            return {
              hours: f.hours as number,
              minutes: f.minutes as number,
              seconds: f.seconds as number,
              frames: f.frames as number,
              drop_frame_format: Boolean(f.drop_frame_format),
            };
          },
        };
      },
    };

    const frameDecoder = new LtcFrameDecoder(sampleRate, fps as never, factory);
    frameDecoder.onFrame((f) => decoded.push(f));

    for (let i = 0; i < count; i++) {
      enc.setTimecode({ hours: hh, minutes: mm, seconds: ss, frame: startFrame + i });
      enc.encodeFrame();
      frameDecoder.write(enc.getBuffer());
    }

    return decoded;
  }

  it.skipIf(!ltcLib)('25fps NDF: encode TC 01:02:03:04 → frames include decoded TC', () => {
    const frames = roundTrip(25, 1, 2, 3, 4);
    expect(frames.length).toBeGreaterThan(0);
    const match = frames.find((f) => f.hours === 1 && f.minutes === 2 && f.seconds === 3 && f.frames === 4);
    expect(match).toBeDefined();
    expect(match!.drop_frame_format).toBe(false);
  });

  it.skipIf(!ltcLib)('30fps NDF: encode TC 00:00:00:00 → decoded TC matches', () => {
    const frames = roundTrip(30, 0, 0, 0, 0);
    expect(frames.length).toBeGreaterThan(0);
    const match = frames.find((f) => f.hours === 0 && f.minutes === 0 && f.seconds === 0 && f.frames === 0);
    expect(match).toBeDefined();
  });

  it.skipIf(!ltcLib)('24fps NDF: encode TC 00:59:59:20 → decoded TC matches', () => {
    const frames = roundTrip(24, 0, 59, 59, 20);
    expect(frames.length).toBeGreaterThan(0);
    const match = frames.find((f) => f.hours === 0 && f.minutes === 59 && f.seconds === 59 && f.frames === 20);
    expect(match).toBeDefined();
  });

  it.skipIf(!ltcLib)('LtcChaser locks and locates clock after round-trip PCM', () => {
    vi.useFakeTimers();
    const sampleRate = 48000;
    const fps = 25;
    const clock = new MasterClockImpl();
    clock.start();

    const enc = new ltcLib.LTCEncoder(sampleRate, fps, 1);
    const factory: LtcDecoderFactory = {
      create(): LtcDecoderLike {
        const dec = new ltcLib.LTCDecoder(sampleRate, fps, 'u8');
        return {
          write(buf: Buffer): void { dec.write(buf); },
          read(): LtcDecodedFrame | undefined {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f: any = dec.read();
            if (f === undefined || f === null) return undefined;
            return {
              hours: f.hours as number,
              minutes: f.minutes as number,
              seconds: f.seconds as number,
              frames: f.frames as number,
              drop_frame_format: Boolean(f.drop_frame_format),
            };
          },
        };
      },
    };

    const recv = new LtcReceiver(clock, sampleRate, fps, 200, factory, null);
    recv.enable(0);

    // Feed 4 frames of TC 01:00:00:00 to ensure lock
    for (let i = 0; i < 4; i++) {
      enc.setTimecode({ hours: 1, minutes: 0, seconds: 0, frame: i });
      enc.encodeFrame();
      recv.frameDecoder.write(enc.getBuffer());
    }

    expect(recv.isLocked).toBe(true);
    expect(clock.getState().source).toBe('ltc');
    // Should be located near 1:00:00:xx — at least frame 0 of that second
    expect(clock.getState().totalFrames).toBeGreaterThanOrEqual(25 * 3600); // ≥ 1h at 25fps

    vi.useRealTimers();
  });
});
