import { performance } from 'node:perf_hooks';
import type {
  MasterClock,
  ClockState,
  ClockSource,
  FrameRate,
  Timecode,
  SideChannelMessage,
} from 'showx-shared';
import { tcToFrames } from 'showx-shared';
import type { Subscription } from 'showx-shared';
import type { Logger } from './Logger.js';

type ChangeHandler = (state: ClockState) => void;

interface Anchor {
  perfMs: number;
  totalFrames: number;
}

export class MasterClockImpl implements MasterClock {
  private rate: FrameRate = 25;
  private dropFrame = false;
  private running = false;
  private source: ClockSource = 'internal';
  private anchor: Anchor = { perfMs: 0, totalFrames: 0 };

  private readonly handlers = new Map<string, ChangeHandler>();
  private nextId = 0;
  private readonly nowFn: () => number;
  private readonly log: Logger | undefined;

  constructor(log?: Logger, now?: () => number) {
    this.log = log;
    this.nowFn = now ?? (() => performance.now());
  }

  start(): void {
    if (this.running) return;
    this.anchor = { perfMs: this.nowFn(), totalFrames: this.anchor.totalFrames };
    this.running = true;
    this.log?.info('master-clock: start', { rate: this.rate, df: this.dropFrame });
    this.emit();
  }

  stop(): void {
    if (!this.running) return;
    // Freeze totalFrames at current value before stopping
    this.anchor = { perfMs: this.nowFn(), totalFrames: this.currentTotalFrames() };
    this.running = false;
    this.log?.info('master-clock: stop', { totalFrames: this.anchor.totalFrames });
    this.emit();
  }

  locate(target: number | Timecode): void {
    const frames = typeof target === 'number' ? target : tcToFrames(target, this.rate, this.dropFrame);
    this.anchor = { perfMs: this.nowFn(), totalFrames: frames };
    this.log?.info('master-clock: locate', { totalFrames: frames });
    this.emit();
  }

  setRate(rate: FrameRate, dropFrame: boolean): void {
    // Re-anchor at current computed position to avoid jump
    const frames = this.currentTotalFrames();
    this.rate = rate;
    this.dropFrame = dropFrame;
    this.anchor = { perfMs: this.nowFn(), totalFrames: frames };
    this.log?.info('master-clock: setRate', { rate, dropFrame });
    this.emit();
  }

  setSource(source: ClockSource): void {
    if (this.source === source) return;
    // Capture position BEFORE mutating source so currentTotalFrames() reads correctly.
    // Re-anchor on every transition (not just to external) so no jump-forward on
    // setSource('internal') after wall-clock elapsed during chase (Issue A+C).
    const frozenAt = this.currentTotalFrames();
    this.source = source;
    if (this.running) {
      this.anchor = { perfMs: this.nowFn(), totalFrames: frozenAt };
    }
    this.log?.info('master-clock: setSource', { source });
    this.emit();
  }

  getState(): ClockState {
    return {
      rate: this.rate,
      dropFrame: this.dropFrame,
      totalFrames: this.currentTotalFrames(),
      running: this.running,
      source: this.source,
    };
  }

  onChange(handler: ChangeHandler): Subscription {
    const id = String(this.nextId++);
    this.handlers.set(id, handler);
    return { id, unsubscribe: () => { this.handlers.delete(id); } };
  }

  private currentTotalFrames(): number {
    if (!this.running || this.source !== 'internal') {
      return this.anchor.totalFrames;
    }
    const elapsedMs = this.nowFn() - this.anchor.perfMs;
    // Use real rate for 29.97 to avoid 0.1% drift (~3.6 s/hr). Keep intFps() only for DF label math.
    const fps = this.rate === 29.97 ? 30000 / 1001 : this.rate;
    return this.anchor.totalFrames + Math.floor(elapsedMs * fps / 1000);
  }

  private emit(): void {
    const state = this.getState();
    for (const h of this.handlers.values()) {
      try {
        h(state);
      } catch (err) {
        this.log?.error('master-clock: onChange handler threw', { err: String(err) });
      }
    }
  }
}

/**
 * Broadcasts low-rate clock anchors (~2 Hz) over the side-channel so PWA stations
 * can interpolate smooth 60fps locally without flooding the network.
 *
 * Cadence: 500 ms periodic tick (≤2 Hz) + immediate publish on any state change
 * (start/stop/locate/rate/source). The PWA uses LOCAL performance.now() elapsed
 * since receipt for interpolation — NOT the anchor's at_wall_ms.
 */
export class ClockBroadcaster {
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private changeSub: Subscription | undefined;
  private showId: string | null = null;

  constructor(
    private readonly clock: MasterClock,
    private readonly publish: (showId: string, msg: SideChannelMessage) => void,
    /** Broadcast interval in ms (default 500 = 2 Hz; Critic-verified ≤4 Hz i.e. ≥250 ms). */
    private readonly intervalMs: number = 500,
  ) {}

  start(showId: string): void {
    this.stop();
    this.showId = showId;
    // Immediate anchor on every state change (start/stop/locate/rate/source)
    this.changeSub = this.clock.onChange(() => this.broadcast());
    // Periodic anchor so running clocks stay interpolatable
    this.intervalId = setInterval(() => this.broadcast(), this.intervalMs);
    // Fire once now so late-joining PWA gets an anchor immediately
    this.broadcast();
  }

  stop(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.changeSub?.unsubscribe();
    this.changeSub = undefined;
    this.showId = null;
  }

  private broadcast(): void {
    if (!this.showId) return;
    const state = this.clock.getState();
    this.publish(this.showId, {
      topic: 'clock.anchor',
      payload: {
        totalFrames: state.totalFrames,
        at_wall_ms: performance.now(),
        rate: state.rate,
        dropFrame: state.dropFrame,
        running: state.running,
        source: state.source,
      },
    });
  }
}
