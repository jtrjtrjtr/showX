---
id: "B003-005"
title: "Per-department view filter logic + actionable/highlighted computation"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
depends_on: ["B003-002"]
target_files:
  - "src/modules/cuelist-core/src/views/departmentFilter.ts"
  - "src/modules/cuelist-core/src/views/highlights.ts"
  - "src/modules/cuelist-core/src/views/viewProfiles.ts"
  - "src/types/department.ts"
  - "tests/unit/modules/cuelist-core/views/departmentFilter.test.ts"
  - "tests/unit/modules/cuelist-core/views/highlights.test.ts"
  - "tests/unit/modules/cuelist-core/views/viewProfiles.test.ts"
acceptance_criteria:
  - "`visibleCues(cues, owned: Set<DepartmentTag>, watched: Set<DepartmentTag>): Cue[]` filters per data_model.md §6.3 algorithm: `cue.department ∩ (owned ∪ watched) ≠ ∅`"
  - "`isActionable(cue, owned: Set<DepartmentTag>): boolean` returns true iff `cue.department ∩ owned ≠ ∅` per §6.3"
  - "`highlightedPayloads(cue, owned: Set<DepartmentTag>): Set<string>` returns payload ids highlighted per data_model.md §6.3 pseudocode — using `payload.tag` heuristic for compound cues (MVP Q4); single-department cue highlights all payloads"
  - "Multi-department ownership first-class: station can own `['LX', 'SX', 'VIDEO']` for solo-op small-venue use case (data_model.md §6.2 table); filter handles correctly"
  - "Compound cues visible in every view their department touches: cue with `department=['LX','SX']` appears in LX view AND SX view AND SM view"
  - "View profile shortcuts: `viewProfiles.sm()` returns `{owned: ['SM'], watched: ['LX','SX','VIDEO','AUTO','PYRO','FS','OTHER']}` (i.e. SM sees all); `viewProfiles.lx()` returns `{owned: ['LX'], watched: ['SM']}`; profiles for SX, VIDEO, AUTO, PYRO, FS, OTHER, director (read-only all), solo (owned: ['LX','SX','VIDEO'], watched: ['SM'])"
  - "Pure functions — no Y.Doc reads inside filter helpers; caller passes plain Cue arrays (callers iterate Y.Array via `toArray().map(toJSON)`)"
  - "Reactive helper: `subscribeFilteredCuelist(doc, cuelistId, station: StationAwareness, handler): Subscription` — observes Y.Array mutation, recomputes filter, invokes handler with new array; handler receives diff hints `{ added, removed, changed }` for efficient UI re-render"
  - "Memoization for filter results — re-filtering identical inputs returns same array reference (referential equality) so React `useMemo` works"
  - "Department enum exported from `src/types/department.ts` as `CANONICAL_DEPARTMENTS` const tuple + `DepartmentTag` type"
  - "Custom department strings supported in `show.meta.departments` (post-canonical, escape-hatch per §6.1); filter handles unknown strings as opaque"
  - "30+ vitest tests across files covering scenarios: SM sees all, LX op sees LX cues only, solo op sees LX+SX+VIDEO, compound cue visibility matrix, watcher mode (empty owned), director (read-only), payload highlight scenarios"
---

## Context

This task implements the view-filtering brain of multi-operator UI. Every PWA station passes its awareness (`owned_departments`, `watched_departments`) and a list of cues; the filter produces the slice that station sees. This is THE central UX algorithm — the entire ShowX product premise is "per-department views over one shared document".

The filter is pure-functional — no Y.Doc reads, no side effects. PWA components compose it with React `useMemo`. Forge MUST keep it pure. The reactive helper for Y.Doc subscriptions is a separate function in the same module.

## Implementation notes

### Department enum (extracted to shared types)

```ts
// src/types/department.ts
export const CANONICAL_DEPARTMENTS = [
  'LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER',
] as const;
export type CanonicalDepartmentTag = typeof CANONICAL_DEPARTMENTS[number];
// Custom departments allowed post-MVP via show.meta.departments
export type DepartmentTag = CanonicalDepartmentTag | (string & {});

export function isCanonicalDepartment(s: string): s is CanonicalDepartmentTag {
  return (CANONICAL_DEPARTMENTS as readonly string[]).includes(s);
}
```

Move this from `src/types/cue.ts` (B003-002) — `cue.ts` now imports from `department.ts`.

### Filter algorithm

```ts
// src/modules/cuelist-core/src/views/departmentFilter.ts
import type { Cue } from '../../../../types/cue';
import type { DepartmentTag } from '../../../../types/department';

export interface FilterContext {
  owned: ReadonlySet<DepartmentTag>;
  watched: ReadonlySet<DepartmentTag>;
}

/** A cue is visible if any of its departments intersects (owned ∪ watched). */
export function visibleCues(cues: readonly Cue[], ctx: FilterContext): Cue[] {
  const lens = new Set([...ctx.owned, ...ctx.watched]);
  if (lens.size === 0) return []; // empty view (e.g. director observer mode with no watched yet)
  return cues.filter((c) => c.department.some((d) => lens.has(d)));
}

/** A cue is actionable (operator can GO/edit locally) if it owns at least one of its departments. */
export function isActionable(cue: Cue, owned: ReadonlySet<DepartmentTag>): boolean {
  if (owned.size === 0) return false;
  return cue.department.some((d) => owned.has(d));
}

/** Cues considered "neighbouring" — visible but NOT actionable (for greyed-out context). */
export function isContextOnly(cue: Cue, ctx: FilterContext): boolean {
  return !isActionable(cue, ctx.owned) && cue.department.some((d) => ctx.watched.has(d));
}
```

### Highlights

```ts
// src/modules/cuelist-core/src/views/highlights.ts
import type { Cue, Payload } from '../../../../types/cue';
import type { DepartmentTag } from '../../../../types/department';
import { isCanonicalDepartment } from '../../../../types/department';

/**
 * Returns the set of payload ids that should be HIGHLIGHTED in the station's view.
 *
 * MVP heuristic (per data_model.md §6.3 + Q4):
 *   - If cue is single-department AND that department is owned: highlight all payloads.
 *   - If cue is compound: highlight payload only when payload.tag is a canonical
 *     department string AND that department is owned. Non-tagged payloads in
 *     a compound cue are highlighted only when the cue is fully owned.
 *
 * Post-MVP 0.2 will switch to first-class payload.department field.
 */
export function highlightedPayloads(
  cue: Cue, owned: ReadonlySet<DepartmentTag>,
): Set<string> {
  const ownedHasAny = cue.department.some((d) => owned.has(d));
  const result = new Set<string>();
  if (!ownedHasAny) return result; // not actionable → no highlights

  const isCompound = cue.department.length > 1;
  for (const p of cue.payloads) {
    const ptag = p.tag ?? '';
    if (isCompound && isCanonicalDepartment(ptag)) {
      if (owned.has(ptag)) result.add(p.id);
    } else {
      // Single-dept cue OR compound payload without dept tag → highlight (rule-of-least-surprise)
      result.add(p.id);
    }
  }
  return result;
}

/** Returns payload ids that should be DIMMED — visible to convey "what else fires" but not actionable. */
export function dimmedPayloads(
  cue: Cue, owned: ReadonlySet<DepartmentTag>,
): Set<string> {
  const highlighted = highlightedPayloads(cue, owned);
  const all = new Set(cue.payloads.map((p) => p.id));
  for (const id of highlighted) all.delete(id);
  return all;
}
```

### View profiles

```ts
// src/modules/cuelist-core/src/views/viewProfiles.ts
import type { DepartmentTag } from '../../../../types/department';

export interface ViewProfile {
  owned: DepartmentTag[];
  watched: DepartmentTag[];
}

const allOthers = (excluded: DepartmentTag[]): DepartmentTag[] =>
  ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER'].filter(
    (d) => !excluded.includes(d as DepartmentTag),
  ) as DepartmentTag[];

export const viewProfiles = {
  sm: (): ViewProfile => ({ owned: ['SM'], watched: allOthers(['SM']) }),
  lx: (): ViewProfile => ({ owned: ['LX'], watched: ['SM'] }),
  sx: (): ViewProfile => ({ owned: ['SX'], watched: ['SM'] }),
  video: (): ViewProfile => ({ owned: ['VIDEO'], watched: ['SM'] }),
  auto: (): ViewProfile => ({ owned: ['AUTO'], watched: ['SM'] }),
  pyro: (): ViewProfile => ({ owned: ['PYRO'], watched: ['SM'] }),
  fs: (): ViewProfile => ({ owned: ['FS'], watched: ['SM'] }),
  other: (): ViewProfile => ({ owned: ['OTHER'], watched: ['SM'] }),
  director: (): ViewProfile => ({
    owned: [], watched: ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER'],
  }),
  solo: (): ViewProfile => ({ owned: ['LX', 'SX', 'VIDEO'], watched: ['SM'] }),
};

export function profileForRole(
  role: 'stage_manager' | 'operator' | 'director' | 'watcher',
  ownedDepartments?: DepartmentTag[],
): ViewProfile {
  if (role === 'stage_manager') return viewProfiles.sm();
  if (role === 'director') return viewProfiles.director();
  if (role === 'watcher') return viewProfiles.director(); // read-only equivalent
  // operator role — derive from ownedDepartments if provided
  if (!ownedDepartments || ownedDepartments.length === 0) {
    return { owned: [], watched: ['SM'] };
  }
  if (ownedDepartments.length === 1 && (ownedDepartments[0] in viewProfiles)) {
    return (viewProfiles as any)[ownedDepartments[0].toLowerCase()]();
  }
  return { owned: [...ownedDepartments], watched: ['SM'] };
}
```

### Reactive subscription helper

```ts
// inside src/modules/cuelist-core/src/views/departmentFilter.ts
import * as Y from 'yjs';
import { getCuelist, getCues } from '../document/cuelist';
import type { Subscription } from 'showx-shared';

export interface FilterChange {
  full: Cue[];
  added: Cue[];
  removed: string[];   // cue ids
  changed: Cue[];      // cues whose visibility/highlight changed
}

export function subscribeFilteredCuelist(
  doc: Y.Doc,
  cuelistId: string,
  ctx: FilterContext,
  handler: (change: FilterChange) => void,
): Subscription {
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);

  let prevVisible = new Map<string, Cue>();
  const recompute = () => {
    const all = cues.toArray().map((m) => m.toJSON() as Cue);
    const filtered = visibleCues(all, ctx);
    const newMap = new Map(filtered.map((c) => [c.id, c]));
    const added: Cue[] = [];
    const changed: Cue[] = [];
    for (const c of filtered) {
      const prev = prevVisible.get(c.id);
      if (!prev) added.push(c);
      else if (JSON.stringify(prev) !== JSON.stringify(c)) changed.push(c);
    }
    const removed = [...prevVisible.keys()].filter((id) => !newMap.has(id));
    prevVisible = newMap;
    handler({ full: filtered, added, removed, changed });
  };

  const observer = () => recompute();
  cues.observeDeep(observer);
  recompute(); // initial fire
  return {
    id: `filter-${cuelistId}`,
    unsubscribe: () => cues.unobserveDeep(observer),
  };
}
```

### Memoization

Wrap `visibleCues` and `highlightedPayloads` in WeakMap-keyed memoization on the cues array reference. PWA hooks call these on every render; memoization avoids recomputation when inputs are referentially equal. Forge: keep memoization simple — Map<cuesRef, Map<ctxKey, result>> with periodic eviction.

## Test plan

### `departmentFilter.test.ts`

1. SM profile: visibleCues returns all cues regardless of dept (since watched covers all).
2. LX op (owned=['LX'], watched=['SM']): cue with dept=['LX'] visible; cue with dept=['SX'] hidden; cue with dept=['SM'] visible (watched); cue with dept=['LX','SX'] visible (intersects owned).
3. Solo op (owned=['LX','SX','VIDEO']): cue with dept=['VIDEO'] visible + actionable; cue with dept=['AUTO'] hidden.
4. Director (owned=[], watched=all): all cues visible; none actionable.
5. Empty (owned=[], watched=[]): no cues visible.
6. `isActionable` for SM on cue dept=['LX']: false (SM does NOT own LX); but cue dept=['SM','LX']: true.
7. `isContextOnly` for LX op on cue dept=['SX','LX']: false (LX is owned → actionable, not context-only).
8. `isContextOnly` for LX op on cue dept=['SM']: true (watched-only).
9. Compound cue dept=['LX','SX','VIDEO'] visible in LX, SX, VIDEO operator views AND SM view.
10. Custom department string (e.g. 'CONFETTI'): treated opaquely; visible if 'CONFETTI' in lens; hidden otherwise.

### `highlights.test.ts`

11. Single-dept cue (dept=['LX']) with 2 payloads, LX op: both payloads highlighted.
12. Compound cue (dept=['LX','SX']) with payloads tagged 'LX' and 'SX', LX op: LX-tagged highlighted, SX-tagged dimmed.
13. Compound cue with payload.tag=null, LX op: highlighted (rule-of-least-surprise).
14. Compound cue, watcher (owned=[]): all payloads in dimmed set, none highlighted.
15. Compound cue with payload.tag='UNKNOWN_DEPT': payload highlighted (not canonical → not used for filtering).
16. Single-dept cue not actionable (e.g. SM viewing LX-only cue): all payloads dimmed.

### `viewProfiles.test.ts`

17. `viewProfiles.sm()` returns owned=['SM'], watched contains 7 others.
18. `viewProfiles.lx().owned === ['LX']`, watched=['SM'].
19. `viewProfiles.director()` has empty owned, all watched.
20. `viewProfiles.solo()` has 3 owned.
21. `profileForRole('stage_manager')` returns SM profile.
22. `profileForRole('operator', ['LX'])` returns LX profile.
23. `profileForRole('operator', ['LX','SX'])` returns multi-owned profile (not single LX).
24. `profileForRole('director')` returns director profile.

### Reactive subscription (in `departmentFilter.test.ts`)

25. `subscribeFilteredCuelist` fires initial handler with current state.
26. Adding a visible cue → handler receives `added` array with that cue.
27. Adding a hidden cue (dept outside lens) → handler does NOT fire with added (still fires with empty diff is acceptable; Forge documents).
28. Removing visible cue → handler receives `removed: [cueId]`.
29. Editing cue label → handler receives `changed`.
30. Unsubscribe → no further handler calls.

### Memoization

31. Same cues array + same ctx → returned filtered array is referentially equal.
32. Same cues array + different ctx → different result; memoization keyed correctly.

## Out of scope

- UI rendering (B003-013 SM master view, B003-014 operator view).
- Cue payload editor (B003-016).
- Payload `department` first-class field (Q4 → 0.2).
- Awareness publishing (B003-012 PWA hook publishes via Yjs awareness; this task is pure filter logic).
- Custom department renaming UI (post-MVP).
- Per-department PDF export (B003-019 calls filter, but PDF rendering is its own task).
- Filter caching strategy beyond simple WeakMap memoization (post-MVP optimization).

## Notes for Critic

- Verify filter is PURE — no Y.Doc reads inside `visibleCues`, `isActionable`, `highlightedPayloads`. They take plain Cue arrays + Sets.
- Confirm algorithm in §6.3 of data_model.md is followed verbatim, especially the highlight heuristic for compound cues.
- Verify compound cue visibility — cue with `department=['LX','SX','VIDEO']` MUST be visible in LX, SX, AND VIDEO operator views.
- Confirm SM profile sees all cues — `owned=['SM']` + `watched` containing all other departments.
- Verify `subscribeFilteredCuelist` uses `observeDeep` (not just `observe`) so cue+payload edits trigger recomputation, not just structural changes.
- Confirm memoization doesn't leak — using WeakMap keyed on cues array reference is correct.
- Verify `CANONICAL_DEPARTMENTS` matches protocol_dictionary.md §A.5 enum exactly (case + order).
- Check that `viewProfiles` is not exported as a singleton object that callers mutate — return new objects each call.
