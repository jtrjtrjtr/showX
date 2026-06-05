---
id: "B003-012"
title: "PWA cuelist data layer — Yjs hooks, awareness, reconnect"
status: "done"
round: 2
forge_model: "claude-sonnet-4-6"
started_at: "2026-06-07T01:00:00Z"
ended_at: "2026-06-07T01:45:00Z"
---

## Summary (Round 2 — addresses all Critic round-1 items)

All six changes_requested items resolved. Full suite: **691 tests pass, 0 failed**, no regressions.

## Changes relative to round 1

### Bug fixes

1. **`useCue.ts` — cache+clear pattern applied.**
   - Added `useRef<Cue | null | typeof UNSET>(UNSET)` where `UNSET = undefined` serves as the "not-yet-computed" sentinel (since `null` is a valid return value for "cue not found").
   - Subscribe handler: `cache.current = UNSET; cb()`.
   - `getSnapshot`: returns `cache.current` if `!== UNSET`, else computes and caches.
   - Pattern now mirrors `useCuelist.ts` exactly; eliminates the `cueMap.toJSON()` new-object-on-every-call issue.

2. **`useStations.ts` — null sentinel replaces `length > 0` guard.**
   - Changed `const cache = useRef<StationAwareness[]>([])` → `useRef<StationAwareness[] | null>(null)`.
   - Guard changed from `if (cache.current.length > 0) return cache.current` → `if (cache.current !== null) return cache.current`.
   - Zero-stations case now caches correctly: `cache.current = []` (empty but not null), returned on subsequent calls without reallocation.

### Dead code removed

3. **`pwa/src/lib/yProviders.ts` deleted.** Not imported by any code file. `cuelistData.ts` inlines the provider stack. Zero production impact.

### New tests

4. **`tests/unit/pwa/sideChannel.test.ts` — 6 SideChannelClient tests (blocking items from Critic):**
   - WSS URL passes token query param through to WebSocket constructor
   - `sendGoRequest` returns unique IDs and emits correct `go.request` payload
   - `onclose` schedules reconnects at exact delays `[1000, 2000, 5000, 10000, 30000, 30000]` (verified with `vi.useFakeTimers` — checks both "not yet" and "exactly at delay")
   - On reconnect open, `resume` frame sent per tracked topic with correct `since_seq`
   - `go.dispatched` with `dispatched_at > 5s` ago → `historic: true`; recent events → `historic: false`
   - `disconnect()` sets stopped; subsequent `onclose` does not schedule reconnect

5. **`tests/unit/pwa/useGoChannel.test.tsx` — 3 tests:**
   - `go()` calls `sendGoRequest(cuelistId, cueId, false)` and returns the request ID
   - Historic `go.dispatched` event → `lastDispatched` stays null
   - Non-historic `go.dispatched` event → `lastDispatched` updated

6. **`tests/unit/pwa/useHooksSmoke.test.tsx` — 10 tests (smoke for useStations, useMode, useCue):**
   - `useStations`: empty array initially; re-renders when awareness change fires; same array reference on parent re-render with no awareness change
   - `useMode`: returns 'rehearsal' initially; re-renders when `meta.mode` changes in Y.Doc; same primitive value on parent re-render
   - `useCue`: null for unknown cue; returns cue data; re-renders when label changes; same `Cue` reference on parent re-render with no Yjs mutation

7. **`tests/unit/pwa/useDepartment.test.tsx` — memoization test strengthened.**
   - Was: only checked `results.length >= 1` and `visible.length === 0` — did not verify identity.
   - Now: forces a second render via `rerender()` with a different `tick` prop, captures results from both renders, asserts `Object.is(r0.visible, r1.visible)` and `Object.is(r0.actionable, r1.actionable)`.

## Tests run

```
pnpm vitest run tests/unit/pwa/
  Test Files  10 passed (10)
  Tests       56 passed (56)

pnpm test
  Test Files  64 passed (64)
  Tests       691 passed (691)
```

No regressions. Test count up from 613 (round 1) to 691 — delta includes tasks B003-007/B003-008 plus 19 new tests in this round.

## New test breakdown
- `sideChannel.test.ts`: 6 tests
- `useGoChannel.test.tsx`: 3 tests
- `useHooksSmoke.test.tsx`: 10 tests
- (modified) `useDepartment.test.tsx`: same count, memoization test now correctly asserts `Object.is`

## Notes for Critic

1. **useCue UNSET sentinel**: chose `undefined` over a Symbol because the TypeScript type `Cue | null | undefined` expresses the three states clearly: `undefined` = not-yet-cached, `null` = cached-as-not-found, `Cue` = cached-result. No magic values.

2. **yProviders.ts deleted**: confirmed zero imports in source files (only referenced in docs/logs). Clean removal.

3. **sideChannel backoff test precision**: uses `advanceTimersByTime(delay - 1)` to verify no early reconnect, then `advanceTimersByTime(1)` to verify exact-delay reconnect. Covers all 6 steps in the BACKOFF_STEPS array (including the capped repeat at 30s).

4. **useHooksSmoke referential equality approach**: forces re-render via new `tick` prop value. Parent-triggered re-renders cause the child component body to run again; `useSyncExternalStore`'s `getSnapshot` returns `cache.current` (same reference), proving the cache is working.

5. **useDepartment memoization test**: `useMemo` already provided the correct referential stability — the previous test just failed to verify it. The new test asserts both `visible` and `actionable` identity.

6. **Backwards compat**: all 9 existing `syncClient`/`sideChannel` tests continue to pass. Old `createSideChannel` API untouched.
