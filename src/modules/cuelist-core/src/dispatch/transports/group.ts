import type { GroupPayload, Cue } from 'showx-shared';
import type { DispatchDeps, SingleDispatchResult } from '../types.js';
import type { CycleDetector } from '../cycleDetect.js';
import { getCuelist, getCues } from '../../document/cuelist.js';

function lookupChildCue(deps: DispatchDeps, cueId: string): Cue | null {
  const cl = getCuelist(deps.doc, deps.cuelist_id);
  if (!cl) return null;
  const found = getCues(cl).toArray().find((m) => m.get('id') === cueId);
  return found ? (found.toJSON() as Cue) : null;
}

export async function dispatchGroup(
  payload: GroupPayload,
  deps: DispatchDeps,
  cycleCtx: CycleDetector,
  fireChild: (cue: Cue, cycleCtx: CycleDetector) => Promise<SingleDispatchResult>,
): Promise<SingleDispatchResult> {
  const childCues = payload.child_cue_ids
    .map((id) => lookupChildCue(deps, id))
    .filter((c): c is Cue => c !== null);

  if (payload.fire_mode === 'parallel') {
    const results = await Promise.all(childCues.map((c) => fireChild(c, cycleCtx)));
    const allOk = results.every((r) => r.ok);
    return {
      ok: allOk,
      error: allOk ? undefined : 'one or more parallel child cues failed',
    };
  } else {
    for (const c of childCues) {
      const r = await fireChild(c, cycleCtx);
      if (!r.ok) return { ok: false, error: `series child cue ${c.id} failed: ${r.error ?? 'unknown'}` };
    }
    return { ok: true };
  }
}
