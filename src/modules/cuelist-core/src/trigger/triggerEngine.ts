import type { CueFireEvent, CueCompleteEvent, Cue, FrameRate } from 'showx-shared';
import { getCuelist, getCues, getCuelists, getCuesSorted } from '../document/cuelist.js';
import { schedule } from './scheduler.js';
import type { ScheduledFire, TriggerEngineDeps } from './types.js';

const MAX_AUTO_CHAIN = 1000;

export class TriggerEngine {
  private pending = new Map<string, ScheduledFire>();
  private chainDepth = new Map<string, number>();
  private unsubs: Array<() => void> = [];

  /** cueId → cuelistId for all timecode cues armed to fire this pass. */
  private armedTimecode = new Map<string, string>();
  private clockInterval?: ReturnType<typeof setInterval>;
  private lastClockMs = 0;

  constructor(private deps: TriggerEngineDeps) {}

  start(): void {
    const fireSub = this.deps.events.subscribe('cue-fire', (e: CueFireEvent) =>
      this.onCueFire(e),
    );
    const completeSub = this.deps.events.subscribe(
      'cue-complete',
      (e: CueCompleteEvent) => this.onCueComplete(e),
    );
    this.unsubs.push(() => fireSub.unsubscribe(), () => completeSub.unsubscribe());
    this.deps.abortSignal.addEventListener('abort', () => this.cancelAll());

    if (this.deps.clock) {
      const clockSub = this.deps.clock.onChange(state => this.onClockChange(state));
      this.unsubs.push(() => clockSub.unsubscribe());
      // Initialize armed set from current clock position
      this.onClockChange(this.deps.clock.getState());
    }
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.clockInterval !== undefined) {
      clearInterval(this.clockInterval);
      this.clockInterval = undefined;
    }
    this.cancelAll();
  }

  private onCueFire(e: CueFireEvent): void {
    // Cancel stale pending fires for this cuelist (SM may have skipped ahead)
    this.cancelAllForCuelist(e.cuelist_id);

    const cue = this.lookupCue(e.cuelist_id, e.cue_id);
    if (!cue) return;

    if (cue.trigger.kind === 'manual' || cue.trigger.kind === 'hotkey') {
      this.chainDepth.set(e.cuelist_id, 0);
    } else {
      const depth = (this.chainDepth.get(e.cuelist_id) ?? 0) + 1;
      this.chainDepth.set(e.cuelist_id, depth);
      if (depth >= MAX_AUTO_CHAIN) {
        this.deps.log.info('trigger-chain-runaway', { cuelist_id: e.cuelist_id, depth });
        this.deps.events.publish({
          type: 'system-error',
          seq: 0,
          ts: Date.now(),
          source: 'cuelist-core',
          module: 'cuelist-core',
          severity: 'error',
          code: 'trigger-chain-runaway',
          message: `auto-trigger chain exceeded ${MAX_AUTO_CHAIN} fires; breaking chain on cuelist ${e.cuelist_id}`,
        });
        return;
      }
    }

    const next = this.findNextCue(e.cuelist_id, e.cue_id);
    if (!next) return;

    const fireEvent = { cuelist_id: e.cuelist_id, cue_id: e.cue_id, ts: e.ts };
    const scheduled = schedule(next, fireEvent, this.deps.doc);
    if (!scheduled) return;

    this.pending.set(next.id, scheduled);
    const delay = Math.max(0, scheduled.fire_at - Date.now());
    scheduled.timer_id = setTimeout(() => {
      this.pending.delete(next.id);
      // Lazy deletion guard: skip if cue was deleted while timer was pending
      if (!this.lookupCue(e.cuelist_id, next.id)) return;
      this.deps.events.publish({
        type: 'cuelist-go',
        seq: 0,
        ts: Date.now(),
        source: 'cuelist-core',
        show_id: this.showId(),
        cuelist_id: e.cuelist_id,
        next_cue_id: next.id,
        by_operator_id: scheduled.trigger_mode,
      });
    }, delay);
  }

  private onCueComplete(e: CueCompleteEvent): void {
    const next = this.findNextCue(e.cuelist_id, e.cue_id);
    if (!next) return;
    if (next.trigger.kind !== 'auto_follow') return;
    if (next.trigger.prev_cue_id !== e.cue_id) return;
    // Guard 1: timer still pending (Q5 path set it, hasn't fired yet)
    if (this.pending.has(next.id)) return;
    // Guard 2: null duration_hint_ms means Q5 path already fired on cue-fire event
    const prevCue = this.lookupCue(e.cuelist_id, e.cue_id);
    if (prevCue?.duration_hint_ms === null) return;
    this.deps.events.publish({
      type: 'cuelist-go',
      seq: 0,
      ts: Date.now(),
      source: 'cuelist-core',
      show_id: this.showId(),
      cuelist_id: e.cuelist_id,
      next_cue_id: next.id,
      by_operator_id: 'auto_follow',
    });
  }

  /** Cancel a specific pending fire by cue ID (e.g. when a cue is explicitly skipped). */
  cancel(cueId: string): void {
    const p = this.pending.get(cueId);
    if (p?.timer_id !== undefined) clearTimeout(p.timer_id);
    this.pending.delete(cueId);
  }

  /** Cancel all pending fires (e.g. REHEARSAL→SHOW transition or abort signal). */
  cancelAll(): void {
    for (const p of this.pending.values()) {
      if (p.timer_id !== undefined) clearTimeout(p.timer_id);
    }
    this.pending.clear();
    this.chainDepth.clear();
    this.armedTimecode.clear();
  }

  private cancelAllForCuelist(cuelistId: string): void {
    const toCancel = [...this.pending.entries()].filter(([, p]) => p.cuelist_id === cuelistId);
    for (const [cueId, p] of toCancel) {
      if (p.timer_id !== undefined) clearTimeout(p.timer_id);
      this.pending.delete(cueId);
    }
  }

  private findNextCue(cuelistId: string, prevCueId: string): Cue | null {
    const cl = getCuelist(this.deps.doc, cuelistId);
    if (!cl) return null;
    const arr = getCuesSorted(cl).map((m) => m.toJSON() as Cue);
    const idx = arr.findIndex((c) => c.id === prevCueId);
    if (idx === -1 || idx === arr.length - 1) return null;
    return arr[idx + 1];
  }

  private lookupCue(cuelistId: string, cueId: string): Cue | null {
    const cl = getCuelist(this.deps.doc, cuelistId);
    if (!cl) return null;
    const found = getCues(cl).toArray().find((m) => m.get('id') === cueId);
    return found ? (found.toJSON() as Cue) : null;
  }

  // ── Clock-driven timecode trigger ─────────────────────────────────────────

  /**
   * Called on every MasterClock state change (start/stop/locate/rate/source).
   * Re-arms timecode cues from the new clock position and manages the polling interval.
   */
  private onClockChange(state: { totalFrames: number; rate: FrameRate; running: boolean }): void {
    const currentMs = this.framesToMs(state.totalFrames, state.rate);
    this.rearmTimecode(currentMs);
    this.lastClockMs = currentMs;

    if (state.running) {
      if (this.clockInterval === undefined) {
        this.clockInterval = setInterval(() => this.tickTimecode(), 40);
      }
    } else {
      if (this.clockInterval !== undefined) {
        clearInterval(this.clockInterval);
        this.clockInterval = undefined;
      }
    }
  }

  /** Polling tick (~25fps) — fires any armed timecode cues the clock has crossed. */
  private tickTimecode(): void {
    if (!this.deps.clock) return;
    const state = this.deps.clock.getState();
    if (!state.running) {
      clearInterval(this.clockInterval);
      this.clockInterval = undefined;
      return;
    }
    const currentMs = this.framesToMs(state.totalFrames, state.rate);
    if (currentMs <= this.lastClockMs) return;
    this.fireArmedTimecode(this.lastClockMs, currentMs);
    this.lastClockMs = currentMs;
  }

  /**
   * Fires all armed timecode cues whose time_ms falls in (fromMs, toMs].
   * Fires in cuelist order then sort_key order within each cuelist.
   */
  private fireArmedTimecode(fromMs: number, toMs: number): void {
    const toFire: Array<{ cuelistId: string; cueId: string }> = [];

    for (const clMap of getCuelists(this.deps.doc).toArray()) {
      const cuelistId = clMap.get('id') as string;
      for (const cueMap of getCuesSorted(clMap)) {
        const cueId = cueMap.get('id') as string;
        if (!this.armedTimecode.has(cueId)) continue;
        const cue = cueMap.toJSON() as Cue;
        if (cue.trigger.kind !== 'timecode') continue;
        if (cue.trigger.source === 'ltc') continue;
        if (cue.trigger.time_ms > fromMs && cue.trigger.time_ms <= toMs) {
          toFire.push({ cuelistId, cueId });
        }
      }
    }

    for (const { cuelistId, cueId } of toFire) {
      this.armedTimecode.delete(cueId);
      this.deps.events.publish({
        type: 'cuelist-go',
        seq: 0,
        ts: Date.now(),
        source: 'cuelist-core',
        show_id: this.showId(),
        cuelist_id: cuelistId,
        next_cue_id: cueId,
        by_operator_id: 'timecode',
      });
    }
  }

  /**
   * Rebuilds the armed set: all non-ltc timecode cues with time_ms > currentMs.
   * Called on every clock state change (start/stop/locate/rate/source).
   */
  private rearmTimecode(currentMs: number): void {
    this.armedTimecode.clear();
    for (const clMap of getCuelists(this.deps.doc).toArray()) {
      const cuelistId = clMap.get('id') as string;
      for (const cueMap of getCues(clMap).toArray()) {
        const cue = cueMap.toJSON() as Cue;
        if (cue.trigger.kind !== 'timecode') continue;
        if (cue.trigger.source === 'ltc') {
          this.deps.log.info('timecode: ltc source not available', { cue_id: cue.id, cuelist_id: cuelistId });
          continue;
        }
        if (cue.trigger.time_ms > currentMs) {
          this.armedTimecode.set(cue.id, cuelistId);
        }
      }
    }
  }

  private framesToMs(totalFrames: number, rate: FrameRate): number {
    const fps = rate === 29.97 ? 30000 / 1001 : rate;
    return (totalFrames * 1000) / fps;
  }

  private showId(): string {
    return this.deps.doc.getMap('meta').get('show_id') as string;
  }
}
