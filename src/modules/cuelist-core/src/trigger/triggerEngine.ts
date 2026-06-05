import type { CueFireEvent, CueCompleteEvent, Cue } from 'showx-shared';
import { getCuelist, getCues, getCuesSorted } from '../document/cuelist.js';
import { schedule } from './scheduler.js';
import type { ScheduledFire, TriggerEngineDeps } from './types.js';

const MAX_AUTO_CHAIN = 1000;

export class TriggerEngine {
  private pending = new Map<string, ScheduledFire>();
  private chainDepth = new Map<string, number>();
  private unsubs: Array<() => void> = [];

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
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.cancelAll();
  }

  private onCueFire(e: CueFireEvent): void {
    // Cancel stale pending fires for this cuelist (SM may have skipped ahead)
    this.cancelAllForCuelist(e.cuelist_id);

    const cue = this.lookupCue(e.cuelist_id, e.cue_id);
    if (!cue) return;

    if (cue.trigger.kind === 'manual') {
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

    if (next.trigger.kind === 'timecode') {
      this.deps.log.info('timecode trigger deferred to 0.2', {
        cuelist_id: e.cuelist_id,
        cue_id: next.id,
      });
    }

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

  private showId(): string {
    return this.deps.doc.getMap('meta').get('show_id') as string;
  }
}
