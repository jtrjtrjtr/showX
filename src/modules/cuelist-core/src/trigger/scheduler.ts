import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import { getCuelist, getCues } from '../document/cuelist.js';
import type { ScheduledFire, FireEvent } from './types.js';

/**
 * Returns a ScheduledFire if `next` should auto-fire given that `prevFire` just occurred,
 * or null if the cue is manual or if auto_follow must wait for cue-complete.
 *
 * Timecode triggers are parsed+stored but NOT scheduled in MVP (deferred to ShowX 0.2).
 */
export function schedule(next: Cue, prevFire: FireEvent, doc: Y.Doc): ScheduledFire | null {
  const prevCue = lookupCue(doc, prevFire.cuelist_id, prevFire.cue_id);
  const now = prevFire.ts;

  switch (next.trigger.kind) {
    case 'manual':
      return null;

    case 'auto_continue': {
      const delay = Math.max(0, next.trigger.delay_ms);
      return {
        cuelist_id: prevFire.cuelist_id,
        cue_id: next.id,
        trigger_mode: 'auto_continue',
        scheduled_at: Date.now(),
        fire_at: now + delay,
        source_cue_id: prevFire.cue_id,
      };
    }

    case 'auto_follow': {
      if (next.trigger.prev_cue_id !== prevFire.cue_id) return null;
      // Q5 default: if prev.duration_hint_ms is null, fire immediately on prev start
      if (prevCue?.duration_hint_ms === null) {
        return {
          cuelist_id: prevFire.cuelist_id,
          cue_id: next.id,
          trigger_mode: 'auto_follow',
          scheduled_at: Date.now(),
          fire_at: now,
          source_cue_id: prevFire.cue_id,
        };
      }
      // Otherwise TriggerEngine fires on cue-complete (not scheduled here)
      return null;
    }

    case 'timecode':
      // Timecode triggers are clock-driven (TriggerEngine.tickTimecode), not chain-scheduled.
      return null;

    case 'hotkey':
      // Out-of-band: keyboard listener fires the cue directly; not part of the chain.
      return null;
  }
}

function lookupCue(doc: Y.Doc, cuelistId: string, cueId: string): Cue | null {
  const cl = getCuelist(doc, cuelistId);
  if (!cl) return null;
  const found = getCues(cl).toArray().find((m) => m.get('id') === cueId);
  return found ? (found.toJSON() as Cue) : null;
}

export function isAutoTriggered(cue: Cue): boolean {
  return cue.trigger.kind === 'auto_follow' || cue.trigger.kind === 'auto_continue';
}

/** Normalize a KeyboardEvent key value to a stable string for hotkey storage. */
export function normalizeHotkeyKey(key: string): string {
  return key === ' ' ? 'Space' : key;
}

export function getFollowSource(cue: Cue): string | null {
  if (cue.trigger.kind === 'auto_follow') return cue.trigger.prev_cue_id;
  return null;
}
