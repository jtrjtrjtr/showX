import { createRequire } from 'node:module';
import type { FrameRate, MasterClock } from 'showx-shared';
import type { Logger } from '../Logger.js';

const _require = createRequire(import.meta.url);

// ── Decoded frame shape ───────────────────────────────────────────────────────

export interface LtcDecodedFrame {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  drop_frame_format: boolean;
}

// ── libltc-wrapper abstraction (decoder side) ────────────────────────────────

export interface LtcDecoderLike {
  write(buf: Buffer): void;
  read(): LtcDecodedFrame | undefined;
}

export interface LtcDecoderFactory {
  create(sampleRate: number, fps: FrameRate): LtcDecoderLike;
}

// ── audify input stream abstraction ──────────────────────────────────────────

export interface LtcInputStreamLike {
  close(): void;
}

export interface LtcInputStreamFactory {
  open(
    deviceId: number,
    sampleRate: number,
    fps: FrameRate,
    onData: (buf: Buffer) => void,
  ): LtcInputStreamLike | null;
}

// ── Status shape ─────────────────────────────────────────────────────────────

export interface LtcDecoderStatus {
  enabled: boolean;
  deviceId: number;
  locked: boolean;
  rate: FrameRate | null;
  dropFrame: boolean;
}

// ── Default decoder factory (real libltc-wrapper) ────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LtcLib = any;

export function defaultDecoderFactory(): LtcDecoderFactory | null {
  try {
    const mod: LtcLib = _require('libltc-wrapper');
    const Ctor = (mod.LTCDecoder ?? mod.LtcDecoder) as
      | (new (sr: number, fps: number, fmt: string) => LtcLib)
      | undefined;
    if (typeof Ctor !== 'function') return null;

    return {
      create(sampleRate: number, fps: FrameRate): LtcDecoderLike {
        // 29.97 → pass integer 30 to libltc; drop-frame detected from the stream's DF bit
        const ltcFps = fps === 29.97 ? 30 : (fps as number);
        const dec: LtcLib = new Ctor(sampleRate, ltcFps, 'u8');
        return {
          write(buf: Buffer): void {
            dec.write(buf);
          },
          read(): LtcDecodedFrame | undefined {
            const f: LtcLib = dec.read();
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
  } catch {
    return null;
  }
}

// ── Default input stream factory (real audify) ────────────────────────────────

// RTAUDIO_SINT8 = 0x1 — matches the constant used on the output side (LtcGenerator)
const RTAUDIO_SINT8 = 0x1;

export function defaultInputStreamFactory(): LtcInputStreamFactory | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = _require('audify') as { RtAudio: new () => any };
    return {
      open(
        deviceId: number,
        sampleRate: number,
        fps: FrameRate,
        onData: (buf: Buffer) => void,
      ): LtcInputStreamLike | null {
        try {
          const rt = new mod.RtAudio();
          const ltcFps = fps === 29.97 ? 30 : (fps as number);
          const framesPerBuffer = Math.round(sampleRate / ltcFps);
          rt.openStream(
            null,
            { deviceId, nChannels: 1 },
            RTAUDIO_SINT8,
            sampleRate,
            framesPerBuffer,
            'ShowX-LTC-in',
            (pcm: Buffer) => {
              // audify delivers SINT8 (signed, center=0); libltc 'u8' expects unsigned (center=128).
              // XOR 0x80 is the same inverse operation used on the output side.
              const u8 = Buffer.alloc(pcm.length);
              for (let i = 0; i < pcm.length; i++) u8[i] = (pcm[i]! ^ 0x80) & 0xff;
              onData(u8);
            },
            null,
          );
          rt.start();
          return {
            close(): void {
              try { rt.stop(); } catch { /* ignore */ }
              try { rt.closeStream(); } catch { /* ignore */ }
            },
          };
        } catch {
          return null;
        }
      },
    };
  } catch {
    return null;
  }
}

// ── LtcFrameDecoder ───────────────────────────────────────────────────────────

/**
 * Pure PCM → timecode event emitter. Wraps a libltc-wrapper LTCDecoder instance.
 * Feed u8 PCM buffers via write(); registered handlers receive each decoded frame.
 * No audio I/O dependency — factory is injected for testability.
 */
export class LtcFrameDecoder {
  private readonly decoderInst: LtcDecoderLike | null;
  private handlers: Array<(frame: LtcDecodedFrame) => void> = [];

  constructor(
    sampleRate: number,
    fps: FrameRate,
    factory: LtcDecoderFactory | null,
  ) {
    this.decoderInst = factory ? factory.create(sampleRate, fps) : null;
  }

  get isReady(): boolean {
    return this.decoderInst !== null;
  }

  onFrame(handler: (frame: LtcDecodedFrame) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  write(buf: Buffer): void {
    if (!this.decoderInst) return;
    this.decoderInst.write(buf);
    this._drainFrames();
  }

  private _drainFrames(): void {
    if (!this.decoderInst) return;
    let f: LtcDecodedFrame | undefined;
    while ((f = this.decoderInst.read()) !== undefined) {
      for (const h of this.handlers) {
        try { h(f); } catch { /* ignore handler errors */ }
      }
    }
  }
}

// ── LtcChaser ─────────────────────────────────────────────────────────────────

/**
 * Drives a MasterClock to chase external LTC audio.
 * On lock (LOCK_GATE_FRAMES consecutive frames received): setSource('ltc') + locate() per frame.
 * On lock-loss (timeout after last frame): setSource('internal'), hold last position (no jump).
 *
 * Mirror of MtcChaser (B005-005) for audio LTC vs MIDI MTC.
 */
const LOCK_GATE_FRAMES = 2;

export class LtcChaser {
  private locked = false;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private removeListener: (() => void) | null = null;
  private gateCount = 0;
  private detectedDropFrame = false;

  constructor(
    private readonly decoder: LtcFrameDecoder,
    private readonly clock: MasterClock,
    private readonly fps: FrameRate = 25,
    readonly lockTimeoutMs: number = 200,
  ) {}

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.gateCount = 0;
    this.removeListener = this.decoder.onFrame((frame) => { this._onFrame(frame); });
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.removeListener?.();
    this.removeListener = null;
    this._clearTimer();
    this.gateCount = 0;
    if (this.locked) {
      this.locked = false;
      this.clock.setSource('internal');
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get detectedRate(): { fps: FrameRate; dropFrame: boolean } {
    return { fps: this.fps, dropFrame: this.detectedDropFrame };
  }

  private _onFrame(frame: LtcDecodedFrame): void {
    const dropFrame = frame.drop_frame_format;
    const state = this.clock.getState();

    // Detect DF from the LTC stream; nominal fps is fixed at construction
    if (state.rate !== this.fps || state.dropFrame !== dropFrame) {
      this.detectedDropFrame = dropFrame;
      this.clock.setRate(this.fps, dropFrame);
    }

    if (!this.locked) {
      this.gateCount++;
      if (this.gateCount < LOCK_GATE_FRAMES) {
        // Not yet at gate threshold; reset gate counter if no further frames arrive in time
        this._clearTimer();
        this.lockTimer = setTimeout(() => {
          this.gateCount = 0;
        }, this.lockTimeoutMs);
        return;
      }
      // Gate satisfied — declare lock
      this.locked = true;
      this.clock.setSource('ltc');
      if (!this.clock.getState().running) {
        this.clock.start();
      }
    }

    this.clock.locate({ hh: frame.hours, mm: frame.minutes, ss: frame.seconds, ff: frame.frames });

    this._clearTimer();
    this.lockTimer = setTimeout(() => {
      if (this.locked) {
        this.locked = false;
        this.gateCount = 0;
        this.clock.setSource('internal');
      }
    }, this.lockTimeoutMs);
  }

  private _clearTimer(): void {
    if (this.lockTimer !== null) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
  }
}

// ── LtcReceiver ───────────────────────────────────────────────────────────────

/**
 * Top-level LTC-in coordinator: wires an audify input device to LtcFrameDecoder + LtcChaser.
 * Default: disabled (internal free-run). Call enable(deviceId) to start chasing LTC.
 * Mirrors MtcReceiver (B005-005) for audio LTC vs MIDI MTC.
 */
export class LtcReceiver {
  readonly frameDecoder: LtcFrameDecoder;
  readonly chaser: LtcChaser;
  private stream: LtcInputStreamLike | null = null;
  private enabled = false;
  private deviceId = -1;
  private readonly _streamFactory: LtcInputStreamFactory | null;
  private readonly _sampleRate: number;
  private readonly _fps: FrameRate;

  constructor(
    clock: MasterClock,
    sampleRate = 48000,
    fps: FrameRate = 25,
    lockTimeoutMs?: number,
    decoderFactory?: LtcDecoderFactory | null,
    streamFactory?: LtcInputStreamFactory | null,
    private readonly log?: Logger,
  ) {
    this._sampleRate = sampleRate;
    this._fps = fps;
    const resolvedDecFac = decoderFactory !== undefined ? decoderFactory : defaultDecoderFactory();
    this._streamFactory = streamFactory !== undefined ? streamFactory : defaultInputStreamFactory();
    this.frameDecoder = new LtcFrameDecoder(sampleRate, fps, resolvedDecFac);
    this.chaser = new LtcChaser(this.frameDecoder, clock, fps, lockTimeoutMs);
  }

  enable(deviceId: number): void {
    this.disable();

    if (!this.frameDecoder.isReady) {
      this.log?.warn('LtcReceiver: libltc-wrapper unavailable — LTC in disabled');
      return;
    }

    this.deviceId = deviceId;
    this.enabled = true;

    if (this._streamFactory) {
      this.stream = this._streamFactory.open(
        deviceId,
        this._sampleRate,
        this._fps,
        (pcm) => { this.frameDecoder.write(pcm); },
      );
      if (!this.stream) {
        this.log?.warn('LtcReceiver: audio input unavailable (headless/CI) — decoder only');
      }
    }

    this.chaser.enable();
    this.log?.info('LtcReceiver: enabled', { deviceId, fps: this._fps, sampleRate: this._sampleRate });
  }

  disable(): void {
    if (!this.enabled) return;
    this.chaser.disable();
    try { this.stream?.close(); } catch { /* ignore */ }
    this.stream = null;
    this.enabled = false;
    this.deviceId = -1;
    this.log?.info('LtcReceiver: disabled');
  }

  get isEnabled(): boolean { return this.enabled; }
  get isLocked(): boolean { return this.chaser.isLocked; }

  getStatus(): LtcDecoderStatus {
    const { fps, dropFrame } = this.chaser.detectedRate;
    return {
      enabled: this.enabled,
      deviceId: this.deviceId,
      locked: this.chaser.isLocked,
      rate: this.enabled ? fps : null,
      dropFrame,
    };
  }
}
