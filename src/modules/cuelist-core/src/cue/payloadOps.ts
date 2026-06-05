import * as Y from 'yjs';
import type { Cue, Payload, DepartmentTag } from 'showx-shared';
import { isCanonicalDepartment } from 'showx-shared';
import { getCuelist, getCues } from '../document/cuelist.js';
import { addPayload, makePayloadMap } from '../document/payload.js';
import { assertEditAllowed } from '../mode/lockGuards.js';
import { assertCueInvariants } from './invariants.js';

function assertCueMapValid(cueMap: Y.Map<unknown>): void {
  assertCueInvariants(cueMap.toJSON() as Cue);
}

/**
 * Group cue payloads by inferred department.
 *
 * Heuristic order (mirrors departmentFilter.ts computeHighlightedPayloads):
 *  1. Single-department cue → all payloads go under that department.
 *  2. Compound cue, payload.tag is canonical → group under that tag.
 *  3. Otherwise → 'unassigned' bucket.
 *
 * 0.2 will replace this heuristic with a first-class payload.department field (Q4).
 *
 * Used by splitCompoundCue (B003-006) and downstream UI (B003-013, B003-014).
 */
export function payloadsByDepartment(
  cue: Cue,
): Map<DepartmentTag | 'unassigned', Payload[]> {
  const out = new Map<DepartmentTag | 'unassigned', Payload[]>();
  const push = (key: DepartmentTag | 'unassigned', p: Payload) => {
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(p);
  };
  if (cue.department.length === 1) {
    for (const p of cue.payloads) push(cue.department[0], p);
    return out;
  }
  for (const p of cue.payloads) {
    if (p.tag && isCanonicalDepartment(p.tag)) {
      push(p.tag as DepartmentTag, p);
    } else {
      push('unassigned', p);
    }
  }
  return out;
}

/**
 * Convenience wrapper: sets payload.tag = departmentTag before calling addPayload.
 * Ensures tag is a canonical department so the highlight algorithm works without
 * manual tag entry (see B003-005 departmentFilter.ts).
 */
export function addPayloadWithDepartmentTag(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  payload: Omit<Payload, 'id'>,
  departmentTag: DepartmentTag,
): string {
  if (!isCanonicalDepartment(departmentTag)) {
    throw new Error(`departmentTag must be canonical; got: ${departmentTag}`);
  }
  return addPayload(doc, cuelistId, cueId, { ...payload, tag: departmentTag });
}

/**
 * Reorder payloads in a cue via CRDT-safe delete-then-reinsert.
 * newOrder must contain exactly the same set of payload ids (same count, same members).
 * Original payload ids are preserved; positions change.
 *
 * Note: Y.Array has no move primitive in yjs@^13.6 — we delete-all then re-push.
 * Concurrent reorders on the same cue will produce one winner per Yjs LWW on the array.
 */
export function reorderPayloads(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  newOrder: string[],
): void {
  assertEditAllowed(doc, 'payload');
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cue = getCues(cuelist).toArray().find((c) => c.get('id') === cueId);
  if (!cue) throw new Error(`cue ${cueId} not found`);

  const payloads = cue.get('payloads') as Y.Array<Y.Map<unknown>>;
  const arr = payloads.toArray();
  const existingIds = new Set(arr.map((m) => m.get('id') as string));
  const newSet = new Set(newOrder);

  if (
    existingIds.size !== newSet.size ||
    newOrder.length !== arr.length ||
    ![...existingIds].every((id) => newSet.has(id))
  ) {
    throw new Error('reorderPayloads: newOrder must contain exactly the same payload ids');
  }

  const byId = new Map(arr.map((m) => [m.get('id') as string, m.toJSON() as Payload]));

  doc.transact(() => {
    payloads.delete(0, arr.length);
    for (const id of newOrder) {
      const payloadJson = byId.get(id)!;
      const payloadData = payloadJson as unknown as { id: string } & Record<string, unknown>;
      const { id: _discardId, ...rest } = payloadData;
      const newMap = makePayloadMap(rest as unknown as Omit<Payload, 'id'>);
      // Preserve original id — makePayloadMap generates a new one; override here.
      newMap.set('id', id);
      payloads.push([newMap]);
    }
  });
  assertCueMapValid(cue);
}
