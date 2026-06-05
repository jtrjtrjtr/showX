# 05 — Per-department view filter

How an operator station sees only their cues without re-rendering the entire cuelist on every change.

## The algorithm

For each cue, given the station's `owned` and `watched` departments:

| State | Condition | UI |
|---|---|---|
| visible-actionable | `cue.department ∩ owned !== ∅` | Full row, opacity 1, buttons enabled |
| visible-context | `cue.department ∩ watched !== ∅ && ∩ owned === ∅` | Dimmed row, opacity 0.5, buttons disabled |
| hidden | `cue.department ∩ (owned ∪ watched) === ∅` | Not rendered |

Per `data_model.md` §6.6 + Q4 ruling (payload department inferred from cue + tag heuristic in 0.1; first-class field in 0.2).

`src/views/departmentFilter.ts` exposes:

```ts
visibleCues(cuelist, owned, watched): Y.Map<unknown>[]
isActionable(cue, owned): boolean
isContextOnly(cue, owned, watched): boolean
```

## Memoization

WeakMap-based, keyed by the cue Y.Map reference. Crucial for React's `useSyncExternalStore` reactivity — without referential equality across renders, every cuelist subscriber re-renders on every change.

```ts
const cache = new WeakMap<Y.Map<unknown>, FilterResult>()

export function isActionable(cue: Y.Map<unknown>, owned: DepartmentTag[]): boolean {
  // owned-string is the cache key partition
  const cached = cache.get(cue)
  if (cached && cached.owned === owned.join('|')) return cached.actionable
  const result = computeActionable(cue, owned)
  cache.set(cue, { owned: owned.join('|'), actionable: result })
  return result
}
```

Cache eviction: WeakMap auto-evicts when cue is GC'd. On cue removal, the Y.Map reference is dropped → entry vanishes.

## Reactive subscriptions

`subscribeFilteredCuelist(cuelist, owned, watched, callback)` uses `observeDeep` to fire callback only when filter result changes:

```ts
let lastResult = visibleCues(cuelist, owned, watched)
const unsubscribe = cuelist.observeDeep(() => {
  const newResult = visibleCues(cuelist, owned, watched)
  if (sameFilterResult(lastResult, newResult)) return
  lastResult = newResult
  callback(newResult)
})
```

`sameFilterResult` does identity + length comparison. If the visible cue list is the same set of Y.Map refs, no callback.

## Highlights inside cues

For a cue that IS visible (any dept overlap), payloads inside are sub-filtered:

`src/views/highlights.ts`:

```ts
highlightedPayloads(cue, dept): Set<payloadId>   // payload's dept tag matches station dept → bold
dimmedPayloads(cue, dept): Set<payloadId>       // mismatch → grey
```

Tag heuristic (Q4): if payload has explicit `department` field, use it. Otherwise infer from cue:

- Single-dept cue → all payloads inherit
- Compound cue → payloads with `tag === <dept>` go to that dept, others fall back to "all"

## View profiles

`src/views/viewProfiles.ts` maps `role` → `{ owned, watched }`:

```ts
export const PROFILES = {
  sm:        { owned: ['SM'], watched: ALL_DEPARTMENTS },
  lx_op:     { owned: ['LX'], watched: ['SM'] },
  sx_op:     { owned: ['SX'], watched: ['SM'] },
  pyro_op:   { owned: ['PYRO'], watched: ['SM', 'LX'] },   // pyro watches LX for sync
  // ...
}

export function profileForRole(role: string): { owned, watched }
```

Used by PWA on pair complete: station gets a role → profile decides what they see.

## What happens on dept change

When SM changes a cue's `department` array:

1. Mutator fires, Y.Map field updates
2. `observeDeep` on cuelist fires
3. `subscribeFilteredCuelist` recomputes `visibleCues`
4. If membership changed, callback fires
5. UI re-renders the filtered list
6. Stations that just lost the cue see it disappear; stations that just gained it see it appear

The memo cache returns stale data on the first call after a dept change; the second call recomputes (WeakMap entry is stale but valid — the result is wrong but we always recompute on observeDeep).

Future optimization: invalidate cache entries by cue id when dept changes. Not done in 0.1 because the cost is tiny.

## Tests

- `tests/unit/modules/cuelist-core/views/departmentFilter.test.ts` (multiple cases incl. compound)
- `tests/unit/modules/cuelist-core/views/highlights.test.ts` (single/compound/heuristic edge cases)
- `tests/unit/modules/cuelist-core/views/viewProfiles.test.ts` (profile completeness)
- PWA: `tests/unit/pwa/useDepartment.test.tsx` asserts referential identity via `Object.is(r0.visible, r1.visible)` — the contract that lets React skip re-renders

## Cross-component duplication note

`pwa/src/components/cuelist/payloadSummaries.ts` reimplements `highlightedPayloads` because cuelist-core's PWA layer doesn't directly import from `src/modules/cuelist-core/src/views/`. Flagged for consolidation by Critic in B003-014. Pattern proposal: lift these helpers into `showx-shared` so PWA and main both import the same source.
