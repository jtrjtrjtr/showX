import type { MasterClock, ClockState, FrameRate, Subscription } from 'showx-shared';
import { framesToTc, intFps } from 'showx-shared';
import type { MidiMessage, DispatchResult } from 'showx-shared';
import type { MidiOutPool } from '../dispatcher/midiOut.js';
import type { Logger } from '../Logger.js';

type ActiveClaim = {
  release(): void;
  send(m: MidiMessage): Promise<DispatchResult>;
};

function rateCode(rate: FrameRate, dropFrame: boolean): 0 | 1 | 2 | 3 {
  if (rate === 24) return 0;
  if (rate === 25) return 1;
  if (rate === 29.97 && dropFrame) return 2;
  return 3;
}

/**
 * Drives an external MIDI port as a MTC master, emitting quarter-frame
 * messages and full-frame SysEx anchors from the ShowX MasterClock.
 *
 * Default: disabled. Call enable(portName) to start; disable() to stop and
 * release the port.
 */
export class MtcGenerator {
  private enabled = false;
  private portName = '';
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private changeSub: Subscription | undefined;
  private claim: ActiveClaim | undefined;
  private pieceIdx = 0;
  private pieceNibbles: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private prevMaster = false;
  private currentRate: FrameRate = 25;
  private currentDropFrame = false;

  constructor(
    private readonly clock: MasterClock,
    private readonly pool: MidiOutPool,
    private readonly log?: Logger,
  ) {}

  enable(portName: string): void {
    if (this.enabled) this.disable();

    const result = this.pool.claim(portName, 'time-layer');
    if (!result.ok) {
      this.log?.warn('MtcGenerator: port conflict — another owner holds this port', {
        portName,
        owner: result.ownerSlug,
      });
      return;
    }

    this.claim = result;
    this.enabled = true;
    this.portName = portName;
    this.changeSub = this.clock.onChange((state) => { this._onClockChange(state); });
    // Apply current clock state immediately (e.g. clock already running)
    this._onClockChange(this.clock.getState());
  }

  disable(): void {
    if (!this.enabled) return;
    this._stopInterval();
    this.changeSub?.unsubscribe();
    this.changeSub = undefined;
    this.claim?.release();
    this.claim = undefined;
    this.enabled = false;
    this.portName = '';
    this.prevMaster = false;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  private _onClockChange(state: ClockState): void {
    const isMaster = state.running && state.source === 'internal';
    const rateChanged =
      state.rate !== this.currentRate || state.dropFrame !== this.currentDropFrame;

    if (isMaster && !this.prevMaster) {
      // Clock just became active master (start, or source flipped to internal while running)
      this.currentRate = state.rate;
      this.currentDropFrame = state.dropFrame;
      this.pieceIdx = 0;
      this._sendFullFrame(state);
      this._startInterval(state.rate);
    } else if (isMaster && rateChanged) {
      // Rate changed while already master — restart interval at new cadence
      this.currentRate = state.rate;
      this.currentDropFrame = state.dropFrame;
      this._stopInterval();
      this.pieceIdx = 0;
      this._sendFullFrame(state);
      this._startInterval(state.rate);
    } else if (isMaster) {
      // Still master, same rate — must be a locate/seek event
      this._sendFullFrame(state);
    } else if (this.prevMaster) {
      // Just stopped being master (stop or source changed away from internal)
      this._stopInterval();
    }

    this.prevMaster = isMaster;
  }

  private _startInterval(rate: FrameRate): void {
    this._stopInterval();
    const fps = intFps(rate);
    // 8 quarter-frames span 2 video frames → one QF per (2000 / (fps*8)) ms = 250/fps ms
    const intervalMs = Math.round(250 / fps);
    this.intervalId = setInterval(() => { this._tick(); }, intervalMs);
  }

  private _stopInterval(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private _tick(): void {
    if (!this.claim) return;

    // At the start of each 2-frame block, snapshot TC with 1-frame lookahead so
    // receivers lock to the position the clock will be at when piece 7 arrives.
    if (this.pieceIdx === 0) {
      const state = this.clock.getState();
      this._updateNibbles(state.totalFrames + 1, state.rate, state.dropFrame);
    }

    const nibble = this.pieceNibbles[this.pieceIdx]!;
    const dataByte = (this.pieceIdx << 4) | nibble;
    void this.claim.send({
      transport: 'midi',
      midiPortName: this.portName,
      bytes: [0xf1, dataByte],
    });
    this.pieceIdx = (this.pieceIdx + 1) % 8;
  }

  private _updateNibbles(
    totalFrames: number,
    rate: FrameRate,
    dropFrame: boolean,
  ): void {
    const tc = framesToTc(totalFrames, rate, dropFrame);
    const rc = rateCode(rate, dropFrame);
    this.pieceNibbles = [
      tc.ff & 0x0f,
      (tc.ff >> 4) & 0x01,
      tc.ss & 0x0f,
      (tc.ss >> 4) & 0x03,
      tc.mm & 0x0f,
      (tc.mm >> 4) & 0x03,
      tc.hh & 0x0f,
      ((tc.hh >> 4) & 0x01) | (rc << 1),
    ];
  }

  private _sendFullFrame(state: ClockState): void {
    if (!this.claim) return;
    const tc = framesToTc(state.totalFrames, state.rate, state.dropFrame);
    const rc = rateCode(state.rate, state.dropFrame);
    const hhByte = (rc << 5) | (tc.hh & 0x1f);
    void this.claim.send({
      transport: 'midi',
      midiPortName: this.portName,
      bytes: [0xf0, 0x7f, 0x7f, 0x01, 0x01, hhByte, tc.mm & 0x3f, tc.ss & 0x3f, tc.ff & 0x1f, 0xf7],
    });
  }
}
