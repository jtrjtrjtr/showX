---
id: "B003-007"
title: "Trigger taxonomy — manual / auto_follow / auto_continue scheduler"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
depends_on: ["B003-002"]
target_files:
  - "src/modules/cuelist-core/src/trigger/triggerEngine.ts"
  - "src/modules/cuelist-core/src/trigger/scheduler.ts"
  - "src/modules/cuelist-core/src/trigger/types.ts"
  - "tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts"
  - "tests/unit/modules/cuelist-core/trigger/scheduler.test.ts"
acceptance_criteria:
  - "Trigger discriminated union from data_model.md §4.2 supported: `{kind:'manual'}`, `{kind:'auto_follow', prev_cue_id}`, `{kind:'auto_continue', delay_ms}`, `{kind:'timecode', ...}` (timecode parsed but NOT scheduled in MVP — logged as 'deferred to 0.2')"
  - "Q5 default ratified: when `auto_follow` chains a cue with `prev_cue.duration_hint_ms === null`, the follow fires immediately on prev start (equivalent to `auto_continue(0)`); test verifies"
  - "`TriggerEngine` class: holds active cue context per cuelist; observes `cue-fire` events from B003-008; schedules follow-on cues; emits synthesized `cue-fire` events for auto-triggered cues"
  - "`schedule(cue, prevFiredAt: number, doc): ScheduledFire | null` returns a scheduled fire when cue should auto-fire after prevFire, else null for manual cues"
  - "`auto_follow`: triggers when previous cue's `cue-complete` event arrives OR (if `prev.duration_hint_ms === null`) immediately upon prev `cue-fire` (Q5 default)"
  - "`auto_continue`: triggers `delay_ms` after previous cue's `cue-fire` regardless of completion"
  - "Scheduler uses `setTimeout` (Node-native) — cancels pending timers via abortSignal when REHEARSAL→SHOW transitions or when prev cue is skipped"
  - "Loop guard: max 1000 consecutive auto-triggered fires in a single chain (detect runaway auto_continue cascades from authoring error); on exceed, emit `system-error` and break chain"
  - "Timecode triggers: parsed and stored in cue, but TriggerEngine MUST NOT schedule them in MVP — only logs an info-level message 'timecode trigger deferred to 0.2'; downstream LTC/MTC infra arrives in ShowX-4"
  - "`isAutoTriggered(cue): boolean` and `getFollowSource(cue): string | null` helpers for UI to indicate chain dependencies"
  - "TriggerEngine integrates with ModuleContext.events EventBus — subscribes to `cue-fire` + `cue-complete` topics; emits synthesized fires via `cuelist-go` topic"
  - "25+ vitest tests covering manual, auto_follow happy path, auto_follow with null duration, auto_continue with delay, chained auto_continues, loop guard, cancellation on skip, timecode no-op"
---

## Context

Triggers are how cues fire without a human pressing GO each time. `auto_follow` chains crossfades (LX Q5 follows LX Q4); `auto_continue` enables parallel sub-cue automation ("3 seconds after door slam, start the music"). The scheduler is small but central — it sits between cue-fire events on the bus and the next round of cue-fire events.

The trigger logic itself lives in Cuelist Core. The actual dispatch of payloads happens in B003-009 (`payloadDispatch`). The GO event side-channel (B003-008) is the signaling layer. Critic should pay careful attention to ordering: trigger engine observes the GO event, decides whether the next cue auto-fires, and emits a synthesized GO event for that next cue.

## Implementation notes

### Types

```ts
// src/modules/cuelist-core/src/trigger/types.ts
import type { Trigger, Cue } from '../../../../types/cue';

export interface ScheduledFire {
  cuelist_id: string;
  cue_id: string;
  trigger_mode: 'auto_follow' | 'auto_continue' | 'timecode';
  scheduled_at: number;   // epoch ms
  fire_at: number;        // epoch ms (when timer will fire)
  source_cue_id: string;  // the prev cue that triggered this
  timer_id?: ReturnType<typeof setTimeout>;
}

export interface TriggerEngineDeps {
  doc: Y.Doc;
  events: EventBus;
  log: Logger;
  abortSignal: AbortSignal;
}
```

### TriggerEngine class

```ts
// src/modules/cuelist-core/src/trigger/triggerEngine.ts
import * as Y from 'yjs';
import type { EventBus, Logger } from 'showx-shared';
import type { Cue } from '../../../../types/cue';
import { getCuelist, getCues } from '../document/cuelist';
import { schedule, type ScheduledFire } from './scheduler';

const MAX_AUTO_CHAIN = 1000;

export class TriggerEngine {
  private pending = new Map<string, ScheduledFire>(); // keyed by cue_id
  private chainDepth = new Map<string, number>();    // cuelist_id → consecutive auto count
  private unsubs: Array<() => void> = [];

  constructor(private deps: TriggerEngineDeps) {}

  start(): void {
    const fire = this.deps.events.subscribe('cue-fire', (e) => this.onCueFire(e));
    const complete = this.deps.events.subscribe('cue-complete', (e) => this.onCueComplete(e));
    this.unsubs.push(() => fire.unsubscribe(), () => complete.unsubscribe());

    this.deps.abortSignal.addEventListener('abort', () => this.cancelAll());
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.cancelAll();
  }

  private onCueFire(e: { cuelist_id: string; cue_id: string; ts: number }): void {
    // Reset chain depth on manual fires (clean break)
    // We can't tell if this fire was manual or auto without inspecting the cue trigger
    const cue = this.lookupCue(e.cuelist_id, e.cue_id);
    if (!cue) return;
    if (cue.trigger.kind === 'manual') {
      this.chainDepth.set(e.cuelist_id, 0);
    } else {
      const depth = (this.chainDepth.get(e.cuelist_id) ?? 0) + 1;
      this.chainDepth.set(e.cuelist_id, depth);
      if (depth >= MAX_AUTO_CHAIN) {
        this.deps.events.publish({
          type: 'system-error', module: 'cuelist-core',
          severity: 'error', code: 'trigger-chain-runaway',
          message: `auto-trigger chain exceeded ${MAX_AUTO_CHAIN} fires; breaking chain on cuelist ${e.cuelist_id}`,
        });
        return;
      }
    }

    // Look at the NEXT cue in cuelist; if its trigger is auto_follow with prev=this cue, OR auto_continue, schedule it
    const next = this.findNextCue(e.cuelist_id, e.cue_id);
    if (!next) return;

    const scheduled = schedule(next, e, this.deps.doc);
    if (scheduled) {
      this.pending.set(next.id, scheduled);
      scheduled.timer_id = setTimeout(() => {
        this.pending.delete(next.id);
        this.deps.events.publish({
          type: 'cuelist-go', show_id: this.showId(), cuelist_id: e.cuelist_id,
          next_cue_id: next.id, by_operator_id: scheduled.trigger_mode,
          ts: Date.now(), seq: 0, source: 'cuelist-core',
        });
      }, Math.max(0, scheduled.fire_at - Date.now()));
    }
  }

  private onCueComplete(e: { cuelist_id: string; cue_id: string }): void {
    // If next cue is auto_follow pointing at this cue, fire it now
    const next = this.findNextCue(e.cuelist_id, e.cue_id);
    if (!next) return;
    if (next.trigger.kind !== 'auto_follow') return;
    if ((next.trigger as any).prev_cue_id !== e.cue_id) return;
    // Already scheduled? Either by onCueFire (when prev duration_hint was null per Q5) or now
    if (this.pending.has(next.id)) return;
    this.deps.events.publish({
      type: 'cuelist-go', show_id: this.showId(), cuelist_id: e.cuelist_id,
      next_cue_id: next.id, by_operator_id: 'auto_follow',
      ts: Date.now(), seq: 0, source: 'cuelist-core',
    });
  }

  /** Cancel a pending fire (called when prev cue is skipped or chain breaks). */
  cancel(cue_id: string): void {
    const p = this.pending.get(cue_id);
    if (p?.timer_id) clearTimeout(p.timer_id);
    this.pending.delete(cue_id);
  }

  cancelAll(): void {
    for (const p of this.pending.values()) {
      if (p.timer_id) clearTimeout(p.timer_id);
    }
    this.pending.clear();
    this.chainDepth.clear();
  }

  private findNextCue(cuelistId: string, prevCueId: string): Cue | null {
    const cl = getCuelist(this.deps.doc, cuelistId);
    if (!cl) return null;
    const arr = getCues(cl).toArray().map(m => m.toJSON() as Cue);
    const idx = arr.findIndex(c => c.id === prevCueId);
    if (idx === -1 || idx === arr.length - 1) return null;
    return arr[idx + 1];
  }

  private lookupCue(cuelistId: string, cueId: string): Cue | null {
    const cl = getCuelist(this.deps.doc, cuelistId);
    if (!cl) return null;
    return getCues(cl).toArray().map(m => m.toJSON() as Cue).find(c => c.id === cueId) ?? null;
  }

  private showId(): string {
    return this.deps.doc.getMap('meta').get('show_id') as string;
  }
}
```

### Scheduler logic

```ts
// src/modules/cuelist-core/src/trigger/scheduler.ts
import * as Y from 'yjs';
import type { Cue } from '../../../../types/cue';
import type { ScheduledFire } from './types';

export interface FireEvent { cuelist_id: string; cue_id: string; ts: number; }

export function schedule(next: Cue, prevFire: FireEvent, doc: Y.Doc): ScheduledFire | null {
  const prevCue = lookupPrevCue(doc, prevFire);
  const now = prevFire.ts;
  switch (next.trigger.kind) {
    case 'manual':
      return null;
    case 'auto_continue': {
      const delay = Math.max(0, next.trigger.delay_ms);
      return {
        cuelist_id: prevFire.cuelist_id, cue_id: next.id,
        trigger_mode: 'auto_continue',
        scheduled_at: Date.now(), fire_at: now + delay,
        source_cue_id: prevFire.cue_id,
      };
    }
    case 'auto_follow': {
      if (next.trigger.prev_cue_id !== prevFire.cue_id) return null;
      // Q5 default: if prev.duration_hint_ms is null, fire immediately on prev start
      if (prevCue && prevCue.duration_hint_ms === null) {
        return {
          cuelist_id: prevFire.cuelist_id, cue_id: next.id,
          trigger_mode: 'auto_follow',
          scheduled_at: Date.now(), fire_at: now,
          source_cue_id: prevFire.cue_id,
        };
      }
      // Otherwise wait for cue-complete (handled by TriggerEngine.onCueComplete)
      return null;
    }
    case 'timecode':
      // Deferred to 0.2 — engine does not schedule timecode in MVP
      return null;
  }
}

function lookupPrevCue(doc: Y.Doc, fire: FireEvent): Cue | null {
  // helper — same lookup as TriggerEngine.lookupCue
}

export function isAutoTriggered(cue: Cue): boolean {
  return cue.trigger.kind === 'auto_follow' || cue.trigger.kind === 'auto_continue';
}

export function getFollowSource(cue: Cue): string | null {
  if (cue.trigger.kind === 'auto_follow') return cue.trigger.prev_cue_id;
  return null;
}
```

### Integration with CuelistCore

`CuelistCore.start()` instantiates `new TriggerEngine({doc, events, log, abortSignal})` and stores it. `CuelistCore.stop()` calls `engine.stop()`. The engine subscribes on EventBus and emits on EventBus — no direct module-to-module coupling.

### Edge cases

- **Cue skipped:** SM presses next-cue while pending fire is queued → TriggerEngine receives a manual `cue-fire` for cue N+1 while N's auto-fire timer is still scheduled → engine should cancel pending fires for any cue between manually-fired-cue and N (skipped cues' pending fires are stale). Implement via cancellation on receiving manual fire ahead of pending fire's target.
- **REHEARSAL → SHOW transition during pending fire:** transition handler should call `engine.cancelAll()` to flush any pending auto-fires (mid-transition state ambiguous).
- **Cue deletion during pending fire:** if the cue with a pending fire is deleted from cuelist, cancel its timer (use Yjs observer on cues array).
- **Doc reload:** on `Y.applyUpdate` with bulk state, cancel all pending fires (engine state should not survive doc state reset).

### Loop guard test scenario

Authoring error: cue N has `auto_continue(0)`, every cue thereafter has `auto_continue(0)`. Pressing GO on cue 0 cascades through all cues instantly. Loop guard breaks at MAX_AUTO_CHAIN (1000) — emits system-error, halts further auto-fires until next manual GO.

## Test plan

### `triggerEngine.test.ts`

1. Manual cue → engine does not schedule next cue (next is auto_continue, but engine waits for prev fire).
2. Manual cue → engine DOES schedule next cue (next is auto_continue) — wait, scheduling happens regardless of prev trigger kind; what matters is next.trigger.
3. Cue with auto_continue(0) following manual cue → next cue fires immediately after manual.
4. Cue with auto_continue(500) → next cue fires 500ms after prev start.
5. Cue with auto_follow + prev.duration_hint_ms=2000 → next cue fires on `cue-complete` event for prev.
6. Cue with auto_follow + prev.duration_hint_ms=null → next cue fires immediately on prev start (Q5 default).
7. Cue with auto_follow but prev_cue_id mismatch → not scheduled.
8. Cue with timecode trigger → not scheduled; log message recorded.
9. Chain of 5 auto_continue cues → all fire in correct order.
10. Loop guard: chain of 1001 auto_continue cues → 1000 fire, 1001st suppressed + system-error emitted.
11. Manual cue mid-chain → chain depth resets to 0.
12. `cancelAll` on REHEARSAL→SHOW → all pending fires cleared.
13. Cue with auto_continue deleted before timer fires → no synthesized fire after deletion.

### `scheduler.test.ts`

14. `schedule` returns null for manual cue.
15. `schedule` returns ScheduledFire with `fire_at = ts + delay_ms` for auto_continue.
16. `schedule` returns null for auto_follow when prev hasn't completed AND prev.duration_hint_ms is non-null.
17. `schedule` returns immediate ScheduledFire for auto_follow when prev.duration_hint_ms is null.
18. `schedule` returns ScheduledFire when timecode kind matches MVP gate — but actually returns null per Q-no.
19. `isAutoTriggered` true for auto_follow + auto_continue.
20. `isAutoTriggered` false for manual + timecode.
21. `getFollowSource` returns prev_cue_id for auto_follow.
22. `getFollowSource` returns null for non-auto_follow.

### Mock event bus test setup

Use a minimal in-memory EventBus mock (similar to `mock_context.ts` from ShowX-1). Engine subscribes; tests `mockBus.publish('cue-fire', {...})` and assert subsequent `cuelist-go` publishes.

### Negative cases

23. Engine started without `start()` → no subscriptions; safe `stop()` no-op.
24. Engine receives `cue-fire` for nonexistent cuelist → no error, no schedule.
25. Engine receives `cue-fire` for last cue in cuelist → no next cue, no schedule.

## Out of scope

- LTC/MTC infrastructure (ShowX-4 timecode source module).
- Time-of-day triggers (post-MVP).
- Triggers from external OSC IN (B003-008 GO channel handles external GO via side-channel; this engine only handles cue-to-cue chains).
- Custom delay overrides per-fire (use cue.trigger.delay_ms as-is; no temporary override).
- Snapshot of pending fires on save (engine state ephemeral; reload starts fresh).
- Skip-ahead UI commands (B003-015 GO button).
- Pause/resume affecting trigger engine (engine listens to cuelist-pause to defer fires; not in MVP).

## Notes for Critic

- Verify Q5 default is implemented EXACTLY: `auto_follow` with null `prev.duration_hint_ms` fires on prev start, not waiting for cue-complete.
- Verify chain depth resets on manual cue (so legitimate auto-chains don't accumulate to loop guard threshold).
- Confirm timer cancellation on cue delete — Forge needs a Yjs observer on the cues array; without it, deleting a cue with pending timer leaves a phantom fire.
- Verify engine respects `abortSignal` from ModuleContext — `stop()` is also called by CuelistCore, but abortSignal is the loader-level guarantee.
- Confirm engine subscribes to canonical event names from protocol_dictionary.md §2.2: `cue-fire`, `cue-complete`, emits `cuelist-go`.
- Verify NO direct DocOps — engine reads cues via accessors, doesn't mutate doc structure.
- Confirm loop guard threshold (1000) is configurable via config schema (Q9 hint) — if not in B003-001 config, leave as constant with TODO for follow-up task.
- Check that `setTimeout` IDs are tracked + cleared — no leaks across stop/restart cycles.
