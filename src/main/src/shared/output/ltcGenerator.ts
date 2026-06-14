import { createRequire } from 'node:module';
import type { MasterClock, ClockState, FrameRate, Subscription } from 'showx-shared';
import { framesToTc } from 'showx-shared';
import type { Logger } from '../Logger.js';

const _require = createRequire(import.meta.url);

// ── libltc-wrapper abstraction ───────────────────────────────────────────────

/**
 * Wraps one LTCEncoder instance.
 * encodeFrame() encodes the given timecode and returns the u8 PCM buffer
 * (sampleRate/fps bytes, unsigned 8-bit centered at 128).
 */
export interface LtcEncoderLike {
  encodeFrame(hh: number, mm: number, ss: number, ff: number): Buffer;
}

export interface LtcEncoderFactory {
  /** Create one encoder per encode session (rate/sampleRate). */
  create(sampleRate: number, fps: number): LtcEncoderLike;
}

// ── audify output stream abstraction ─────────────────────────────────────────

export interface LtcOutputStreamLike {
  write(buf: Buffer): void;
  close(): void;
}

export interface LtcOutputStreamFactory {
  /** Opens an audio output stream. Returns null if unavailable (headless/CI). */
  open(deviceId: number, sampleRate: number, fps: number): LtcOutputStreamLike | null;
}

// ── Status shape ─────────────────────────────────────────────────────────────

export interface LtcGeneratorStatus {
  enabled: boolean;
  deviceId: number;
  rate: FrameRate | null;
  dropFrame: boolean;
}

// ── Default encoder factory (real libltc-wrapper) ────────────────────────────

/**
 * libltc-wrapper v1.1.x API:
 *   new LTCEncoder(sampleRate, fps, flags)
 *   enc.setTimecode({ hours, minutes, seconds, frame })  // ← `frame`, not `frames`
 *   enc.encodeFrame()                                    // → writes to internal buffer
 *   enc.getBuffer()                                      // → Buffer (u8 PCM)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LtcLib = any;

export function defaultEncoderFactory(): LtcEncoderFactory | null {
  try {
    const mod: LtcLib = _require('libltc-wrapper');
    const Ctor = (mod.LTCEncoder ?? mod.LtcEncoder) as (new (sr: number, fps: number, flags?: number) => LtcLib) | undefined;
    if (typeof Ctor !== 'function') return null;

    const LTC_USE_DATE = 1; // BGF bits; standard for clocks

    return {
      create(sampleRate: number, fps: number): LtcEncoderLike {
        const enc: LtcLib = new Ctor(sampleRate, fps, LTC_USE_DATE);
        return {
          encodeFrame(hh: number, mm: number, ss: number, ff: number): Buffer {
            // Runtime field is `frame` not `frames`; cast bypasses wrong TS types in the package
            enc.setTimecode({ hours: hh, minutes: mm, seconds: ss, frame: ff } as LtcLib);
            enc.encodeFrame();
            return enc.getBuffer() as Buffer;
          },
        };
      },
    };
  } catch {
    return null;
  }
}

// ── Default stream factory (real audify) ─────────────────────────────────────

// RTAUDIO_SINT8 = 0x1 (audify RtAudioFormat const enum, numeric literal used to avoid const-enum import issues)
const RTAUDIO_SINT8 = 0x1;

export function defaultOutputStreamFactory(): LtcOutputStreamFactory | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = _require('audify') as { RtAudio: new () => any };
    return {
      open(deviceId: number, sampleRate: number, fps: number): LtcOutputStreamLike | null {
        try {
          const rt = new mod.RtAudio();
          const framesPerBuffer = Math.round(sampleRate / fps);
          rt.openStream(
            { deviceId, nChannels: 1 },
            null,
            RTAUDIO_SINT8,
            sampleRate,
            framesPerBuffer,
            'ShowX-LTC-out',
            null,
            null,
          );
          rt.start();
          return {
            write(buf: Buffer): void {
              // libltc generates u8 PCM (unsigned, center=128); RTAUDIO_SINT8 expects signed (center=0).
              // XOR 0x80 maps: 0→−128, 128→0, 255→127 — correct polarity for hardware playback.
              const s8 = Buffer.alloc(buf.length);
              for (let i = 0; i < buf.length; i++) {
                s8[i] = (buf[i]! ^ 0x80) & 0xff;
              }
              try { rt.write(s8); } catch { /* ignore write failures; logged at higher level if stream fails */ }
            },
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

// ── LtcGenerator ─────────────────────────────────────────────────────────────

/**
 * Encodes the ShowX master clock into SMPTE LTC PCM and streams it to a
 * selected audio output device (audify/CoreAudio).
 *
 * Default: disabled. Call enable(deviceId) to start; disable() to stop.
 * Activates only when clock source is 'internal' and clock is running
 * (i.e., ShowX is timecode master). Failures are logged; never throws.
 */
export class LtcGenerator {
  private enabled = false;
  private deviceId = -1;
  private encoder: LtcEncoderLike | null = null;
  private stream: LtcOutputStreamLike | null = null;
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private changeSub: Subscription | undefined;
  private prevMaster = false;
  private currentRate: FrameRate = 25;
  private currentDropFrame = false;
  private readonly _encoderFactory: LtcEncoderFactory | null;
  private readonly _streamFactory: LtcOutputStreamFactory | null;

  constructor(
    private readonly clock: MasterClock,
    private readonly sampleRate = 48000,
    encoderFactory?: LtcEncoderFactory | null,
    streamFactory?: LtcOutputStreamFactory | null,
    private readonly log?: Logger,
  ) {
    this._encoderFactory = encoderFactory !== undefined ? encoderFactory : defaultEncoderFactory();
    this._streamFactory = streamFactory !== undefined ? streamFactory : defaultOutputStreamFactory();
  }

  enable(deviceId: number): void {
    if (this.enabled) this.disable();

    if (!this._encoderFactory) {
      this.log?.warn('LtcGenerator: libltc-wrapper unavailable — LTC out disabled');
      return;
    }

    this.deviceId = deviceId;
    this.enabled = true;
    this.changeSub = this.clock.onChange((state) => { this._onClockChange(state); });
    // Apply current state immediately (clock might already be running)
    this._onClockChange(this.clock.getState());
    this.log?.info('LtcGenerator: enabled', { deviceId });
  }

  disable(): void {
    if (!this.enabled) return;
    this._stopInterval();
    this._closeStream();
    this.changeSub?.unsubscribe();
    this.changeSub = undefined;
    this.enabled = false;
    this.deviceId = -1;
    this.prevMaster = false;
    this.log?.info('LtcGenerator: disabled');
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  getStatus(): LtcGeneratorStatus {
    return {
      enabled: this.enabled,
      deviceId: this.deviceId,
      rate: this.enabled ? this.currentRate : null,
      dropFrame: this.currentDropFrame,
    };
  }

  private _onClockChange(state: ClockState): void {
    const isMaster = state.running && state.source === 'internal';
    const rateChanged =
      state.rate !== this.currentRate || state.dropFrame !== this.currentDropFrame;

    if (isMaster && !this.prevMaster) {
      this.currentRate = state.rate;
      this.currentDropFrame = state.dropFrame;
      this._startInterval();
    } else if (isMaster && rateChanged) {
      this.currentRate = state.rate;
      this.currentDropFrame = state.dropFrame;
      this._stopInterval();
      this._closeStream();
      this._startInterval();
    } else if (!isMaster && this.prevMaster) {
      this._stopInterval();
      this._closeStream();
    }

    this.prevMaster = isMaster;
  }

  private _startInterval(): void {
    if (!this._encoderFactory) return;

    try {
      this.encoder = this._encoderFactory.create(this.sampleRate, this.currentRate);
    } catch (err) {
      this.log?.error('LtcGenerator: encoder init failed', { err: String(err) });
      return;
    }

    if (this._streamFactory && this.deviceId >= 0) {
      try {
        this.stream = this._streamFactory.open(this.deviceId, this.sampleRate, this.currentRate);
        if (!this.stream) {
          this.log?.warn('LtcGenerator: audio output unavailable (headless/CI) — encoding only');
        }
      } catch (err) {
        this.log?.warn('LtcGenerator: stream open failed', { err: String(err) });
      }
    }

    // Emit one LTC frame per video frame interval.
    // Real rate used for 29.97 to match clock's floating-point fps (avoids 0.1% drift).
    const fps = this.currentRate === 29.97 ? 30000 / 1001 : (this.currentRate as number);
    const intervalMs = 1000 / fps;
    this.intervalId = setInterval(() => { this._tick(); }, intervalMs);

    this.log?.info('LtcGenerator: stream started', {
      deviceId: this.deviceId,
      rate: this.currentRate,
      dropFrame: this.currentDropFrame,
      sampleRate: this.sampleRate,
    });
  }

  private _stopInterval(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.encoder = null;
  }

  private _closeStream(): void {
    try { this.stream?.close(); } catch { /* ignore */ }
    this.stream = null;
  }

  private _tick(): void {
    if (!this.encoder) return;

    const state = this.clock.getState();
    const tc = framesToTc(state.totalFrames, state.rate, state.dropFrame);

    try {
      const samples = this.encoder.encodeFrame(tc.hh, tc.mm, tc.ss, tc.ff);
      this.stream?.write(samples);
    } catch (err) {
      this.log?.error('LtcGenerator: encode/write error (tick skipped)', { err: String(err) });
    }
  }
}
