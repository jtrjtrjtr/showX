import type { MasterClock } from 'showx-shared';
import { framesToTc, formatTc } from 'showx-shared';
import type { OscPool } from '../dispatcher/oscClient.js';
import type { Logger } from '../Logger.js';

const MAX_RATE_HZ = 10;

export interface ShowTimeOscConfig {
  host: string;
  port: number;
  /** OSC address string. Default: '/showx/time'. */
  address?: string;
  /** Broadcast rate in Hz. Capped at 10 Hz. Default: 10. */
  rateHz?: number;
}

/**
 * Broadcasts show time from the MasterClock as OSC messages at a configurable
 * rate (default 10 Hz) to an external host.
 *
 * OSC address: configurable (default /showx/time)
 * OSC args: HH (int), MM (int), SS (int), FF (int), 'HH:MM:SS[:;]FF' (string), running (bool)
 *
 * When the clock is stopped, broadcasts continue with running=false so external
 * displays can show the frozen position and know playback has halted.
 *
 * Default: disabled. Call enable(config) to start; disable() to stop.
 */
export class ShowTimeOscBroadcaster {
  private enabled = false;
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private activeCfg: Required<ShowTimeOscConfig> | null = null;
  private activeClaim: ReturnType<OscPool['claim']> | null = null;

  constructor(
    private readonly clock: MasterClock,
    private readonly pool: OscPool,
    private readonly log?: Logger,
  ) {}

  enable(cfg: ShowTimeOscConfig): void {
    if (this.enabled) this.disable();

    const rateHz = Math.min(cfg.rateHz ?? MAX_RATE_HZ, MAX_RATE_HZ);
    this.activeCfg = {
      host: cfg.host,
      port: cfg.port,
      address: cfg.address ?? '/showx/time',
      rateHz,
    };

    this.activeClaim = this.pool.claim(cfg.host, cfg.port);
    this.enabled = true;

    const intervalMs = Math.round(1000 / rateHz);
    this.intervalId = setInterval(() => { void this._tick(); }, intervalMs);
    // Immediate first broadcast so external displays update without waiting one interval
    void this._tick();
  }

  disable(): void {
    if (!this.enabled) return;

    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.activeClaim?.release();
    this.activeClaim = null;
    this.activeCfg = null;
    this.enabled = false;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  private async _tick(): Promise<void> {
    const cfg = this.activeCfg;
    const conn = this.activeClaim;
    if (!cfg || !conn) return;

    const state = this.clock.getState();
    const tc = framesToTc(state.totalFrames, state.rate, state.dropFrame);
    const tcStr = formatTc(tc, state.dropFrame);

    try {
      await conn.send({
        transport: 'osc',
        host: cfg.host,
        port: cfg.port,
        address: cfg.address,
        args: [tc.hh, tc.mm, tc.ss, tc.ff, tcStr, state.running],
      });
    } catch (err) {
      this.log?.error('showtime-osc: send failed', { error: String(err) });
    }
  }
}
