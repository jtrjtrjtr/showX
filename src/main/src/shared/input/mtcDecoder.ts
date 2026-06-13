import type { FrameRate, MasterClock, Timecode } from 'showx-shared';
import type { InputRegistrar } from '../InputRegistrar.js';
import type { Subscription } from './types.js';

export type MtcRateCode = 0 | 1 | 2 | 3;

export interface MtcTimecode extends Timecode {
  rateCode: MtcRateCode;
}

function rateFromCode(code: MtcRateCode): { rate: FrameRate; dropFrame: boolean } {
  switch (code) {
    case 0: return { rate: 24, dropFrame: false };
    case 1: return { rate: 25, dropFrame: false };
    case 2: return { rate: 29.97, dropFrame: true };
    case 3: return { rate: 30, dropFrame: false };
  }
}

/**
 * Decodes MIDI Time Code messages into timecode events.
 * Handles quarter-frame (0xF1) and full-frame SysEx (F0 7F … F7).
 * Pure, stateful, unit-testable — no MIDI I/O dependency.
 */
export class MtcDecoder {
  private readonly pieces = new Uint8Array(8);
  private readonly pieceSeen = new Uint8Array(8);
  private cleanSetReceived = false;
  private handlers: Array<(tc: MtcTimecode) => void> = [];

  /**
   * Register a handler called when a complete TC is decoded.
   * Returns an unsubscribe function.
   */
  onTimecode(handler: (tc: MtcTimecode) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /** Feed raw MIDI bytes. Recognizes 0xF1 QF and 0xF0 full-frame SysEx. */
  feedBytes(raw: number[]): void {
    if (raw.length === 0) return;
    if (raw[0] === 0xf1 && raw.length >= 2) {
      this._handleQF(raw[1]!);
    } else if (raw[0] === 0xf0) {
      this._handleFullFrame(raw);
    }
  }

  /** @internal — exposed for testing */
  _handleQF(dataByte: number): void {
    const pieceIdx = (dataByte >> 4) & 0x07;
    const nibble = dataByte & 0x0f;

    this.pieces[pieceIdx] = nibble;
    this.pieceSeen[pieceIdx] = 1;

    // Only assemble and emit on piece 7 (last piece of a QF sequence)
    if (pieceIdx !== 7) return;

    if (!this.cleanSetReceived) {
      // Wait until all 8 pieces have been seen at least once (tolerates mid-sequence start)
      for (let i = 0; i < 8; i++) {
        if (!this.pieceSeen[i]) return;
      }
      this.cleanSetReceived = true;
    }

    this._emitFromPieces();
  }

  /** @internal — exposed for testing */
  _handleFullFrame(raw: number[]): void {
    // F0 7F <dev> 01 01 hh mm ss ff F7
    if (raw.length < 10) return;
    if (raw[3] !== 0x01 || raw[4] !== 0x01) return;
    const hhByte = raw[5]!;
    const rateCode = ((hhByte >> 5) & 0x03) as MtcRateCode;
    const hh = hhByte & 0x1f;
    const mm = raw[6]! & 0x3f;
    const ss = raw[7]! & 0x3f;
    const ff = raw[8]! & 0x1f;
    this._emit({ hh, mm, ss, ff, rateCode });
  }

  private _emitFromPieces(): void {
    const p = this.pieces;
    const ff = ((p[1]! & 0x01) << 4) | (p[0]! & 0x0f);
    const ss = ((p[3]! & 0x03) << 4) | (p[2]! & 0x0f);
    const mm = ((p[5]! & 0x03) << 4) | (p[4]! & 0x0f);
    const hh = ((p[7]! & 0x01) << 4) | (p[6]! & 0x0f);
    const rateCode = ((p[7]! >> 1) & 0x03) as MtcRateCode;
    this._emit({ hh, mm, ss, ff, rateCode });
  }

  private _emit(tc: MtcTimecode): void {
    for (const h of this.handlers) {
      try {
        h(tc);
      } catch {
        // ignore handler errors
      }
    }
  }
}

/**
 * Drives a MasterClock to chase external MTC.
 * On lock: clock.setSource('mtc') + clock.locate() on each TC event.
 * On lock-loss (timeout): clock.setSource('internal'), hold last position.
 */
export class MtcChaser {
  private locked = false;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private removeListener: (() => void) | null = null;

  constructor(
    private readonly decoder: MtcDecoder,
    private readonly clock: MasterClock,
    /** Timeout (ms) before declaring lock lost. Default ~5 frames at 25fps. */
    readonly lockTimeoutMs: number = 200,
  ) {}

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.removeListener = this.decoder.onTimecode((tc) => this._onTc(tc));
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.removeListener?.();
    this.removeListener = null;
    this._clearTimer();
    if (this.locked) {
      this.locked = false;
      this.clock.setSource('internal');
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }

  private _onTc(tc: MtcTimecode): void {
    const { rate, dropFrame } = rateFromCode(tc.rateCode);
    const state = this.clock.getState();

    if (state.rate !== rate || state.dropFrame !== dropFrame) {
      this.clock.setRate(rate, dropFrame);
    }

    if (!this.locked) {
      this.locked = true;
      this.clock.setSource('mtc');
      if (!this.clock.getState().running) {
        this.clock.start();
      }
    }

    this.clock.locate({ hh: tc.hh, mm: tc.mm, ss: tc.ss, ff: tc.ff });

    this._clearTimer();
    this.lockTimer = setTimeout(() => {
      if (this.locked) {
        this.locked = false;
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

/**
 * Subscribes to a MIDI input port via InputRegistrar and feeds raw bytes to MtcDecoder.
 * Default: disabled (internal free-run). Call enable(portName) to start chasing MTC.
 */
export class MtcReceiver {
  readonly decoder: MtcDecoder;
  readonly chaser: MtcChaser;
  private midiSub: Subscription | null = null;

  constructor(
    private readonly registrar: InputRegistrar,
    clock: MasterClock,
    lockTimeoutMs?: number,
  ) {
    this.decoder = new MtcDecoder();
    this.chaser = new MtcChaser(this.decoder, clock, lockTimeoutMs);
  }

  /** Open MIDI port and start chasing. Idempotent — disables previous port first. */
  async enable(portName: string): Promise<void> {
    await this.disable();
    this.midiSub = await this.registrar.subscribeMidi(
      { type: 'any' },
      (msg) => {
        // 0xF1 = QF (now emitted as sysex by parseMidi), 0xF0 = full-frame SysEx
        if (msg.raw[0] === 0xf1 || msg.raw[0] === 0xf0) {
          this.decoder.feedBytes(msg.raw);
        }
      },
      { portName },
    );
    this.chaser.enable();
  }

  /** Stop chasing and release MIDI subscription. */
  async disable(): Promise<void> {
    this.chaser.disable();
    if (this.midiSub) {
      await this.midiSub.unsubscribe();
      this.midiSub = null;
    }
  }

  get isLocked(): boolean {
    return this.chaser.isLocked;
  }
}
