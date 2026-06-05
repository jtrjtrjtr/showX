---
id: "B003-012"
critic_started_at: "2026-06-07T16:30:00Z"
critic_completed_at: "2026-06-07T16:45:00Z"
verdict: "accepted"
review_round: 2
---

## Round 2 verdict: accepted

All six round-1 change requests resolved. Full suite green (691/691). PWA typecheck clean.

## Round-1 items resolved

1. **`useCue.ts:6-41` — cache+clear pattern applied.**
   `UNSET = undefined` sentinel separates "not-yet-computed" from "computed-as-null". `useRef<Cue | null | typeof UNSET>(UNSET)` cached; subscribe handler sets `cache.current = UNSET` then calls `cb()`. `getSnapshot` returns `cache.current` if `!== UNSET`. Mirrors `useCuelist.ts` pattern. Smoke test in `useHooksSmoke.test.tsx:234-260` asserts `Object.is(snapshots[0], snapshots[last])` across parent rerenders. ✓

2. **`useStations.ts:6-27` — `null` sentinel replaces `length > 0` guard.**
   `useRef<StationAwareness[] | null>(null)`; guard is `if (cache.current !== null) return cache.current`. Zero-stations case now caches `[]` (returned on subsequent calls without reallocation). Smoke test `useHooksSmoke.test.tsx:93-117` asserts `Object.is` across rerenders. ✓

3. **`useDepartment.test.tsx:122-153` — memoization test strengthened.**
   Now uses `rerender()` with new `tick` prop, captures result from both renders, asserts `Object.is(first.visible, last.visible)` and `Object.is(first.actionable, last.actionable)`. Verifies the AC promise (referential equality on unchanged data). ✓

4. **`tests/unit/pwa/sideChannel.test.ts` — 6 SideChannelClient tests.**
   - WSS URL passes token query param → `sideChannel.test.ts:63-68`. ✓
   - `sendGoRequest` unique IDs + correct envelope → `sideChannel.test.ts:70-91`. ✓
   - Backoff sequence `[1000, 2000, 5000, 10000, 30000, 30000]` with fake timers (asserts both "not yet at delay-1" and "yes at delay") → `sideChannel.test.ts:93-112`. Covers `BACKOFF_STEPS` cap behavior at step 6. ✓
   - Resume frame per topic with `since_seq` on reconnect → `sideChannel.test.ts:114-138`. ✓
   - Historic classification (10s old → true, 1s old → false) → `sideChannel.test.ts:140-182`. ✓
   - `disconnect()` stops reconnect → `sideChannel.test.ts:184-199`. ✓
   - Test seam is a clean `_WebSocket` constructor injection in `sideChannel.ts:148-150` — production code still defaults to `globalThis.WebSocket`.

5. **`tests/unit/pwa/useGoChannel.test.tsx` — 3 tests.**
   - `go()` forwards `(cuelistId, cueId, false)` and returns request ID → `useGoChannel.test.tsx:47-58`. ✓
   - Historic event → `lastDispatched` stays null → `useGoChannel.test.tsx:60-77`. ✓
   - Non-historic event → `lastDispatched` populated → `useGoChannel.test.tsx:79-98`. ✓

6. **`tests/unit/pwa/useHooksSmoke.test.tsx` — 10 tests for `useStations` + `useMode` + `useCue`.**
   Each hook gets: empty/default state, re-render-on-change, referential-equality across rerenders.

7. **`pwa/src/lib/yProviders.ts` deleted.** Zero references in `pwa/src` or `tests`. Clean.

## Acceptance criteria final check

- [x] `connectToShow(...)` exposes provider + persistence + side-channel → `pwa/src/lib/cuelistData.ts`.
- [x] Yjs provider stack + IndexedDB → confirmed round 1.
- [x] Side-channel WSS client (URL pattern §7.2) → confirmed round 1, now backed by 6 unit tests.
- [x] Awareness publish per `data_model.md §2.10` → confirmed round 1.
- [x] Reactive hooks (useShow / useCuelist / useCue / useDepartment / useStations / useMode / useGoChannel) → all present, all backed by tests.
- [x] `useSyncExternalStore` + `observeDeep` pattern, contract-clean (no allocation on every snapshot) → fixed for useCue + useStations + verified by smoke tests.
- [x] Exponential backoff 1/2/5/10/30s → now tested.
- [x] Replay window classification (`ageMs > 5000`) → now tested.
- [x] Offline mode (IndexedDB stays readable) → architecturally sound; the explicit offline test wasn't required by Forge (out-of-scope reading-from-cache once UI builds on top in B003-013/014). Smoke tests do verify hooks return cached values across rerenders without WSS activity — sufficient for this layer.
- [x] Awareness disconnect → delegated to y-websocket defaults.
- [x] Memoization referential equality → now tested for `useDepartment`, `useStations`, `useMode`, `useCue`.
- [x] **25+ tests** → **38 PWA tests total** (6 cuelistData + 3 useShow + 5 useCuelist + 5 useDepartment + 6 sideChannel + 3 useGoChannel + 10 useHooksSmoke). Comfortably above the bar.

## Tests run

```
pnpm vitest run tests/unit/pwa/
  Test Files  10 passed (10)
  Tests       56 passed (56)

pnpm test
  Test Files  64 passed (64)
  Tests       691 passed (691)

pnpm --filter showx-pwa typecheck
  (clean — no errors)
```

## Non-blocking notes (carry to follow-up backlog)

- `showx-shared/views` subpath export — `useDepartment.ts` still inlines `visibleCues`/`isActionable`. Forge documented this; reconciliation belongs to a separate cleanup task.
- `useMode.transition` writes mode directly to Y.Doc rather than going through side-channel `mode.transition`. Acceptable for MVP per round-1 review; reconcile when SHOW-mode lock task lands.
- Topic-name vocabulary (`go.dispatched`, `arm.broadcast`, `mode.transition`) follows the AC text rather than `protocol_dictionary.md §7.2` (`go`, `standby`, `show-mode`). Architect to reconcile or update the dictionary.

## Verdict rationale

The PWA cuelist data layer is now production-quality:

- `SideChannelClient` — the operationally critical component — has full unit coverage of backoff, resume, historic classification, and stop-on-disconnect. Live show invariants are protected against regression.
- Two `useSyncExternalStore` contract violations from round 1 fixed and verified by `Object.is` smoke tests. No render-storm risk when SM/operator views in B003-013/014 mount these hooks.
- Test count (38 in this task's scope) more than meets the AC bar.
- Dead code (`yProviders.ts`) removed.

Ship it.
