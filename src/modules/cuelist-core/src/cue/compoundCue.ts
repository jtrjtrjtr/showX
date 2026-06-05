import * as Y from 'yjs';
import type { Cue, Payload, DepartmentTag } from 'showx-shared';
import { isCanonicalDepartment } from 'showx-shared';
import { getCuelist, getCues, getCuesSorted } from '../document/cuelist.js';
import { makeCueMap } from '../document/cue.js';
import { addCue } from '../document/cue.js';
import { addPayload, makePayloadMap } from '../document/payload.js';
import { assertEditAllowed } from '../mode/lockGuards.js';
import { payloadsByDepartment } from './payloadOps.js';
import { assertCueInvariants } from './invariants.js';

function assertCueMapValid(cueMap: Y.Map<unknown>): void {
  assertCueInvariants(cueMap.toJSON() as Cue);
}

export interface MakeCompoundCueOpts {
  label: string;
  description?: string;
  /** ≥ 2 departments required */
  departments: DepartmentTag[];
  standby_note?: string;
  trigger?: Cue['trigger'];
  /** Each payload may carry for_department to auto-set the tag. */
  payloads: Array<Omit<Payload, 'id'> & { for_department?: DepartmentTag }>;
  created_by: string;
}

/**
 * Create a compound cue (≥ 2 departments) with an initial payload set.
 * Use addCue() for single-department cues.
 *
 * Downstream tasks that consume compound cues: B003-009 (dispatch),
 * B003-013/B003-014 (PWA views), B003-016 (cue editor).
 */
export function makeCompoundCue(
  doc: Y.Doc,
  cuelistId: string,
  opts: MakeCompoundCueOpts,
): string {
  if (opts.departments.length < 2) {
    throw new Error('makeCompoundCue requires ≥ 2 departments; use addCue for single-dept');
  }
  const cueId = addCue(doc, cuelistId, {
    label: opts.label,
    description: opts.description,
    department: opts.departments,
    standby_note: opts.standby_note,
    trigger: opts.trigger,
    created_by: opts.created_by,
  });
  for (const p of opts.payloads) {
    const { for_department, ...payloadRest } = p;
    const tag =
      for_department && isCanonicalDepartment(for_department)
        ? for_department
        : (p.tag ?? null);
    addPayload(doc, cuelistId, cueId, { ...payloadRest, tag });
  }
  const finalCueMap = getCues(getCuelist(doc, cuelistId)!).toArray().find(c => c.get('id') === cueId);
  if (finalCueMap) assertCueMapValid(finalCueMap);
  return cueId;
}

/** True iff cue owns more than one department. */
export function isCompound(cue: Cue): boolean {
  return cue.department.length > 1;
}

/**
 * Split a compound cue into N atomic cues, one per partition.
 * Payloads are distributed by tag heuristic (payloadsByDepartment).
 * Unassigned payloads go to the first partition.
 * Original cue is removed; new cues inherit the original's sort_key range.
 * Returns array of new cue ids in partition order.
 *
 * Downstream: splitCompoundCue callers in B003-016 (cue editor).
 */
export function splitCompoundCue(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  partitions: DepartmentTag[][],
): string[] {
  if (partitions.length === 0) throw new Error('splitCompoundCue: partitions must be non-empty');
  if (partitions.some((p) => p.length === 0)) {
    throw new Error('splitCompoundCue: each partition must have ≥ 1 department');
  }
  assertEditAllowed(doc, 'structure');

  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);
  const arr = cues.toArray();
  const idx = arr.findIndex((c) => c.get('id') === cueId);
  if (idx === -1) throw new Error(`cue ${cueId} not found`);

  const origJson = arr[idx].toJSON() as Cue;
  if (!isCompound(origJson)) {
    throw new Error('splitCompoundCue: target must be a compound cue (department.length > 1)');
  }

  // Calculate sort_keys: spread N new cues evenly in [origSk, nextSk).
  const sortedArr = getCuesSorted(cuelist);
  const sortedIdx = sortedArr.findIndex((c) => c.get('id') === cueId);
  const origSk = (sortedArr[sortedIdx].get('sort_key') as number) ?? 0;
  const nextCue = sortedIdx + 1 < sortedArr.length ? sortedArr[sortedIdx + 1] : null;
  const nextSk = nextCue
    ? ((nextCue.get('sort_key') as number) ?? origSk + 1000 * partitions.length)
    : origSk + 1000 * partitions.length;
  const step = partitions.length > 1 ? (nextSk - origSk) / partitions.length : 0;

  const grouped = payloadsByDepartment(origJson);
  const unassigned = grouped.get('unassigned') ?? [];
  const newCueIds: string[] = [];
  const newCueMaps: Y.Map<unknown>[] = [];

  doc.transact(() => {
    // Remove original before inserting new cues.
    cues.delete(idx, 1);

    for (let i = 0; i < partitions.length; i++) {
      const partition = partitions[i];
      const payloadsForCue: Payload[] = partition.flatMap((d) => grouped.get(d) ?? []);
      // Unassigned payloads go to first partition only.
      if (i === 0) payloadsForCue.push(...unassigned);

      const cueMap = makeCueMap({
        label: `${origJson.label} (${partition.join(',')})`,
        description: origJson.description,
        department: partition,
        standby_note: origJson.standby_note,
        trigger: origJson.trigger,
        created_by: origJson.created_by,
      });
      cueMap.set('sort_key', origSk + i * step);

      // Integrate cueMap into the doc FIRST — prelim Y.Maps cannot have their nested
      // Y.Array children accessed via .get() until the parent is pushed into a Y.Doc.
      cues.push([cueMap]);
      newCueMaps.push(cueMap);

      const payloadsArr = cueMap.get('payloads') as Y.Array<Y.Map<unknown>>;
      for (const p of payloadsForCue) {
        const pd = p as unknown as { id: string } & Record<string, unknown>;
        const { id: _id, ...rest } = pd;
        payloadsArr.push([makePayloadMap(rest as unknown as Omit<Payload, 'id'>)]);
      }

      newCueIds.push(cueMap.get('id') as string);
    }
  });

  for (const cm of newCueMaps) {
    assertCueMapValid(cm);
  }
  return newCueIds;
}

/**
 * Merge multiple cues into one compound cue.
 * New cue is placed at the display position of the first (lowest sort_key) original.
 * Label = '<A> + <B>' concatenation. Trigger is taken from the first cue.
 * All payloads are concatenated in cue order; new payload ids are generated.
 * Original cues are removed.
 * Returns id of the new merged cue.
 *
 * Downstream: B003-016 (cue editor), B003-017 (CSV import heuristic).
 */
export function mergeCues(
  doc: Y.Doc,
  cuelistId: string,
  cueIds: string[],
): string {
  if (cueIds.length < 2) throw new Error('mergeCues requires ≥ 2 cue ids');
  assertEditAllowed(doc, 'structure');

  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);
  const arr = cues.toArray();

  const rawIdxs = cueIds.map((id) => arr.findIndex((c) => c.get('id') === id));
  if (rawIdxs.some((i) => i === -1)) {
    throw new Error('mergeCues: one or more cue ids not found');
  }

  const cuesJson = cueIds.map((id) => arr.find((c) => c.get('id') === id)!.toJSON() as Cue);

  // First cue by display order (sort_key) — merged cue inherits its sort_key.
  const sortedArr = getCuesSorted(cuelist);
  const sortedIdxs = cueIds.map((id) => sortedArr.findIndex((c) => c.get('id') === id));
  const firstSortedIdx = Math.min(...sortedIdxs);
  const firstSk = (sortedArr[firstSortedIdx].get('sort_key') as number) ?? 0;

  const mergedDepartments = [...new Set(cuesJson.flatMap((c) => c.department))];
  const mergedLabel = cuesJson.map((c) => c.label).join(' + ');
  const mergedPayloads = cuesJson.flatMap((c) => c.payloads);
  const mergedDescription = cuesJson
    .map((c) => c.description)
    .filter(Boolean)
    .join('; ');

  let newCueId = '';
  let newCueMapRef: Y.Map<unknown> | undefined;

  doc.transact(() => {
    // Delete originals in reverse rawIdx order to avoid index drift.
    const sortedRawIdxs = [...rawIdxs].sort((a, b) => b - a);
    for (const i of sortedRawIdxs) cues.delete(i, 1);

    const cueMap = makeCueMap({
      label: mergedLabel,
      description: mergedDescription,
      department: mergedDepartments,
      standby_note: cuesJson[0].standby_note,
      trigger: cuesJson[0].trigger,
      created_by: cuesJson[0].created_by,
    });
    cueMap.set('sort_key', firstSk);

    // Integrate cueMap first — nested Y.Array not accessible until parent is in a Y.Doc.
    cues.push([cueMap]);

    const payloadsArr = cueMap.get('payloads') as Y.Array<Y.Map<unknown>>;
    for (const p of mergedPayloads) {
      const pd = p as unknown as { id: string } & Record<string, unknown>;
      const { id: _id, ...rest } = pd;
      payloadsArr.push([makePayloadMap(rest as unknown as Omit<Payload, 'id'>)]);
    }

    newCueId = cueMap.get('id') as string;
    newCueMapRef = cueMap;
  });

  if (newCueMapRef) assertCueMapValid(newCueMapRef);
  return newCueId;
}
