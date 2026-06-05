---
id: "B003-006"
title: "Compound cue model — multi-department payload helpers + invariants"
type: "implementation"
estimated_size_lines: 500
priority: "P0"
depends_on: ["B003-002", "B003-005"]
target_files:
  - "src/modules/cuelist-core/src/cue/compoundCue.ts"
  - "src/modules/cuelist-core/src/cue/payloadOps.ts"
  - "src/modules/cuelist-core/src/cue/invariants.ts"
  - "tests/unit/modules/cuelist-core/cue/compoundCue.test.ts"
  - "tests/unit/modules/cuelist-core/cue/payloadOps.test.ts"
  - "tests/unit/modules/cuelist-core/cue/invariants.test.ts"
acceptance_criteria:
  - "`makeCompoundCue({label, departments, payloads, ...}): Cue` helper — creates cue with ≥2 departments and matching payload set; validates each payload pairs sensibly with a department"
  - "`isCompound(cue): boolean` returns true iff `cue.department.length > 1`"
  - "`payloadsByDepartment(cue): Map<DepartmentTag, Payload[]>` groups payloads by inferred department (using tag heuristic from B003-002 + the multi-dept owner aware variant)"
  - "`addPayloadWithDepartmentTag(doc, cuelistId, cueId, payload, departmentTag): string` convenience: pre-sets `payload.tag = departmentTag` (canonical) so highlight algorithm works without manual tag entry"
  - "`reorderPayloads(doc, cuelistId, cueId, newOrder: string[]): void` reorders payloads via CRDT-safe insert+delete; new order must contain exactly the same set of payload ids"
  - "`splitCompoundCue(doc, cuelistId, cueId, departments: DepartmentTag[][]): string[]` — utility that splits a compound cue into N atomic cues, distributing payloads by tag heuristic; returns array of new cue ids; original cue removed; preserves order in cuelist"
  - "`mergeCues(doc, cuelistId, cueIds: string[]): string` — inverse: merges multiple cues into one compound; label is concatenation `'A + B'`; new cue replaces all originals at first cue's position; preserves trigger from first; preserves all payloads"
  - "Invariant `assertCueInvariants(cue): void` throws if: `department.length === 0`, `department` has duplicates, `payloads` has duplicate ids, OR `payload.type` not in known enum; called by mutator API as defensive check"
  - "Per data_model.md §4.3 example reproduced as test fixture: 'Door slam' with dept=['SX','LX'] + OSC to QLab + LXRef to Eos — verify both LX op and SX op see correct highlights"
  - "Documentation on compound cue lifecycle for Forge follow-up tasks (B003-009, B003-013, B003-014): inline JSDoc comments referencing this task"
  - "20+ vitest tests covering happy path, split/merge round-trip, invariant violations, payload-by-dept grouping with mixed tags"
---

## Context

Compound cues are the architectural fulcrum of ShowX — one cue, multiple departments, multiple payloads firing in concert. The Yjs document model in B003-002 already supports them at the data layer (`department[]` array, `payloads[]` array). This task adds the **convenience helpers + invariants** that downstream tasks (dispatch, UI, import/export) need.

The split/merge utilities are operator-facing affordances: "I imported a CSV with one cue per department; let me merge them into a compound" and vice versa. Both are CRDT-safe and reversible.

## Implementation notes

### Compound cue factory

```ts
// src/modules/cuelist-core/src/cue/compoundCue.ts
import * as Y from 'yjs';
import type { Cue, Payload } from '../../../../types/cue';
import type { DepartmentTag } from '../../../../types/department';
import { isCanonicalDepartment } from '../../../../types/department';
import { addCue, makeCueMap, insertCueAfter } from '../document/cue';
import { addPayload, makePayloadMap } from '../document/payload';

export interface MakeCompoundCueOpts {
  label: string;
  description?: string;
  departments: DepartmentTag[];      // ≥ 2
  standby_note?: string;
  trigger?: Cue['trigger'];
  payloads: Array<Omit<Payload, 'id'> & { for_department?: DepartmentTag }>;
  created_by: string;
}

export function makeCompoundCue(
  doc: Y.Doc, cuelistId: string, opts: MakeCompoundCueOpts,
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
    const tag = p.for_department && isCanonicalDepartment(p.for_department)
      ? p.for_department
      : p.tag ?? null;
    const { for_department, ...payloadRest } = p;
    addPayload(doc, cuelistId, cueId, { ...payloadRest, tag });
  }
  return cueId;
}

export function isCompound(cue: Cue): boolean {
  return cue.department.length > 1;
}
```

### Payload-by-department grouping

```ts
// src/modules/cuelist-core/src/cue/payloadOps.ts
import type { Cue, Payload } from '../../../../types/cue';
import type { DepartmentTag } from '../../../../types/department';
import { isCanonicalDepartment } from '../../../../types/department';

/**
 * Group payloads by inferred department.
 *
 * Heuristic order (matches highlights.ts but extracts the grouping):
 *  1. If cue is single-department → all payloads go under that department.
 *  2. If payload.tag is a canonical department → group there.
 *  3. Else → 'unassigned' bucket.
 *
 * 0.2 will replace this with first-class payload.department field (Q4).
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
    if (p.tag && isCanonicalDepartment(p.tag)) push(p.tag as DepartmentTag, p);
    else push('unassigned', p);
  }
  return out;
}

export function addPayloadWithDepartmentTag(
  doc: Y.Doc, cuelistId: string, cueId: string,
  payload: Omit<Payload, 'id'>, departmentTag: DepartmentTag,
): string {
  if (!isCanonicalDepartment(departmentTag)) {
    throw new Error(`departmentTag must be canonical: ${departmentTag}`);
  }
  return addPayload(doc, cuelistId, cueId, { ...payload, tag: departmentTag });
}

export function reorderPayloads(
  doc: Y.Doc, cuelistId: string, cueId: string, newOrder: string[],
): void {
  const cuelist = getCuelist(doc, cuelistId);
  const cue = getCues(cuelist!).toArray().find(c => c.get('id') === cueId);
  if (!cue) throw new Error(`cue ${cueId} not found`);
  const payloads = cue.get('payloads') as Y.Array<Y.Map<unknown>>;
  const arr = payloads.toArray();
  const idSet = new Set(arr.map(m => m.get('id') as string));
  const newSet = new Set(newOrder);
  if (idSet.size !== newSet.size || ![...idSet].every(i => newSet.has(i))) {
    throw new Error('reorderPayloads newOrder must contain exactly the same payload ids');
  }
  doc.transact(() => {
    payloads.delete(0, arr.length);
    const byId = new Map(arr.map(m => [m.get('id') as string, m]));
    for (const id of newOrder) {
      const orig = byId.get(id)!;
      const clone = clonePayloadMap(orig);
      payloads.push([clone]);
    }
  });
}
```

(Note: cloning Y.Maps requires careful handling — Forge: prefer `Y.applyUpdate` of a synthesized state OR use the supported `payloads.move(from, to)` if Yjs version supports — verify yjs@^13.6 API.)

### Split/merge

```ts
// src/modules/cuelist-core/src/cue/compoundCue.ts (continued)
export function splitCompoundCue(
  doc: Y.Doc, cuelistId: string, cueId: string,
  partitions: DepartmentTag[][], // e.g. [['LX'], ['SX']]
): string[] {
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);
  const arr = cues.toArray();
  const idx = arr.findIndex(c => c.get('id') === cueId);
  if (idx === -1) throw new Error(`cue ${cueId} not found`);
  const orig = arr[idx];
  const origJson = orig.toJSON() as Cue;
  if (!isCompound(origJson)) throw new Error('split target must be compound');

  const grouped = payloadsByDepartment(origJson);
  const newCueIds: string[] = [];

  doc.transact(() => {
    let insertIdx = idx;
    cues.delete(idx, 1);
    for (const partition of partitions) {
      const payloadsForThisCue = partition.flatMap((d) => grouped.get(d) ?? []);
      const newId = uuidv7();
      const cueMap = makeCueMap({
        label: `${origJson.label} (${partition.join(',')})`,
        description: origJson.description,
        department: partition,
        standby_note: origJson.standby_note,
        trigger: origJson.trigger,
        created_by: origJson.created_by,
      });
      // Override id with newId
      cueMap.set('id', newId);
      cues.insert(insertIdx, [cueMap]);
      const payloadsArr = cueMap.get('payloads') as Y.Array<Y.Map<unknown>>;
      for (const p of payloadsForThisCue) {
        const { id, ...rest } = p;
        payloadsArr.push([makePayloadMap(rest)]);
      }
      newCueIds.push(newId);
      insertIdx++;
    }
  });

  return newCueIds;
}

export function mergeCues(
  doc: Y.Doc, cuelistId: string, cueIds: string[],
): string {
  if (cueIds.length < 2) throw new Error('mergeCues requires ≥ 2 cue ids');
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);
  const arr = cues.toArray();
  const idxs = cueIds.map(id => arr.findIndex(c => c.get('id') === id));
  if (idxs.some(i => i === -1)) throw new Error('one or more cue ids not found');

  const firstIdx = Math.min(...idxs);
  const cuesJson = cueIds.map(id => arr.find(c => c.get('id') === id)!.toJSON() as Cue);
  const mergedDepartments = [...new Set(cuesJson.flatMap(c => c.department))];
  const mergedLabel = cuesJson.map(c => c.label).join(' + ');
  const mergedPayloads = cuesJson.flatMap(c => c.payloads);

  doc.transact(() => {
    // Delete originals in reverse order to preserve indexes
    const sortedIdxs = [...idxs].sort((a, b) => b - a);
    for (const i of sortedIdxs) cues.delete(i, 1);
    // Insert new at firstIdx
    const newId = uuidv7();
    const cueMap = makeCueMap({
      label: mergedLabel,
      description: cuesJson.map(c => c.description).filter(Boolean).join('; '),
      department: mergedDepartments,
      standby_note: cuesJson[0].standby_note,
      trigger: cuesJson[0].trigger,
      created_by: cuesJson[0].created_by,
    });
    cueMap.set('id', newId);
    cues.insert(firstIdx, [cueMap]);
    const payloadsArr = cueMap.get('payloads') as Y.Array<Y.Map<unknown>>;
    for (const p of mergedPayloads) {
      const { id, ...rest } = p;
      payloadsArr.push([makePayloadMap(rest)]);
    }
    // Return inside transact closure via outer var; ts: assign below
  });

  // Return the new cue id via closure variable
  return getCues(cuelist).toArray()[firstIdx].get('id') as string;
}
```

### Invariants

```ts
// src/modules/cuelist-core/src/cue/invariants.ts
import type { Cue } from '../../../../types/cue';

export class InvariantError extends Error {
  constructor(public readonly field: string, msg: string) { super(msg); }
}

const KNOWN_PAYLOAD_TYPES = new Set([
  'osc', 'msc', 'lx_ref', 'midi', 'webhook', 'wait', 'group',
]);

export function assertCueInvariants(cue: Cue): void {
  if (cue.department.length === 0) {
    throw new InvariantError('department', 'cue.department must have ≥ 1 entry');
  }
  if (new Set(cue.department).size !== cue.department.length) {
    throw new InvariantError('department', 'cue.department contains duplicates');
  }
  const seen = new Set<string>();
  for (const p of cue.payloads) {
    if (seen.has(p.id)) {
      throw new InvariantError('payloads', `duplicate payload id ${p.id}`);
    }
    seen.add(p.id);
    if (!KNOWN_PAYLOAD_TYPES.has(p.type)) {
      // Forward compat: payload type 'unknown_*' is allowed (per data_model.md §11.1)
      if (!p.type.startsWith('unknown_')) {
        throw new InvariantError('payloads.type', `unknown payload.type ${p.type}`);
      }
    }
  }
}
```

Wire `assertCueInvariants` into B003-002's mutators: after every cue-creating/modifying transaction, run on the resulting cue.toJSON() for defensive validation. (Yes, this is belt-and-suspenders; CRDT merges can theoretically produce surprising states.)

## Test plan

### `compoundCue.test.ts`

1. `makeCompoundCue({departments: ['LX']})` throws (need ≥ 2).
2. `makeCompoundCue` with 3 payloads tagged 'LX'/'SX'/'VIDEO' creates cue with payloads in order.
3. `isCompound(cue)` true for dept.length ≥ 2.
4. `splitCompoundCue` with cue dept=['LX','SX'] + partitions=[['LX'],['SX']] produces 2 cues each with 1 dept; payloads distributed by tag.
5. `splitCompoundCue` preserves cuelist order — new cues land at original position.
6. `splitCompoundCue` removes original cue.
7. `mergeCues` with 2 single-dept cues produces compound with 2 depts.
8. `mergeCues` label concatenation `'A + B'`.
9. `mergeCues` payloads concatenated in cue order.
10. `mergeCues` placed at min(original indexes).
11. Round-trip: merge then split with original partitions → end state equivalent to start (payload ids regenerated, label changes).

### `payloadOps.test.ts`

12. `payloadsByDepartment` for single-dept cue: all payloads under that dept.
13. `payloadsByDepartment` for compound + tagged payloads: correct grouping.
14. `payloadsByDepartment` for compound + untagged payload: ends up in 'unassigned'.
15. `addPayloadWithDepartmentTag` rejects non-canonical tag.
16. `addPayloadWithDepartmentTag` sets `tag` correctly.
17. `reorderPayloads` rejects newOrder with missing id.
18. `reorderPayloads` rejects newOrder with extra id.
19. `reorderPayloads` produces correct final order via Y.Array.

### `invariants.test.ts`

20. `assertCueInvariants` rejects empty department.
21. `assertCueInvariants` rejects duplicate department.
22. `assertCueInvariants` rejects duplicate payload ids.
23. `assertCueInvariants` rejects unknown payload.type.
24. `assertCueInvariants` accepts `unknown_audio_play` (forward compat).

### Door slam fixture (data_model.md §4.3)

25. Build the example door slam cue with dept=['SX','LX'] + OSC to QLab tagged 'SX' + LXRef to Eos tagged 'LX'.
26. Pass through B003-005 filter as LX op: cue visible, OSC payload dimmed, LXRef highlighted.
27. Pass through as SX op: cue visible, OSC highlighted, LXRef dimmed.
28. Pass through as SM: cue visible, all payloads visible (highlight depends on owned).
29. Split into 2 single-dept cues → LX op now sees only LX cue; SX op only SX cue.

## Out of scope

- Cuelist insertion of compound cues via UI (B003-016 cue editor).
- Dispatch of compound cue payloads (B003-009 — dispatcher iterates payloads array; no special compound handling needed beyond iterating).
- PWA UI rendering (B003-013, B003-014).
- CSV import compound cue inference (B003-017 — heuristic-driven).
- Cue history (`history.jsonl` cue_edited events on split/merge — append basic events; full audit deferred).
- Conflict resolution when two operators split the same cue concurrently (Yjs CRDT handles — one wins per timestamp; document expected behavior).

## Notes for Critic

- Verify B003-002's cue model already supports `department: string[]` array (data array, not Y.Array since plain arrays merge via LWW; if B003-002 chose Y.Array<string>, this task should still work).
- Verify `splitCompoundCue` removes original cue BEFORE inserting new ones (avoids index drift).
- Verify `mergeCues` inserts at correct index — using min of original indexes is intuitive ("first cue position wins").
- Confirm `reorderPayloads` validation: newOrder must be exact same SET of ids — both length and membership.
- Confirm `assertCueInvariants` allows forward-compat unknown_* payload types per §11.1.
- Watch for off-by-one errors in splitCompoundCue's `insertIdx++` logic — write a failing test if unsure, then verify the fix.
- Verify Yjs operations are wrapped in `doc.transact(...)` — without this, observers see intermediate states.
- Confirm the door slam fixture matches data_model.md §4.3 exactly (label, dept, payloads).
