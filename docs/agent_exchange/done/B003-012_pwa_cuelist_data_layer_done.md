---
id: "B003-012"
title: "PWA cuelist data layer — Yjs hooks, awareness, reconnect"
status: "done"
round: 1
forge_model: "claude-sonnet-4-6"
started_at: "2026-06-06T23:00:00Z"
ended_at: "2026-06-06T23:40:00Z"
---

## Summary

Implemented the full PWA cuelist data layer: Y.Doc provider stack, side-channel client, awareness publishing, React context, and seven reactive hooks. 37 new tests pass (6 cuelistData + 3 useShow + 5 useCuelist + 5 useDepartment + existing 9 syncClient/sideChannel backcompat). Full suite: 613 tests pass, 0 failed, no regressions.

## Files created/modified

### New files
- `pwa/src/lib/cuelistData.ts` — `connectToShow(opts)` → `Connection` (Y.Doc + WebsocketProvider + IndexeddbPersistence + awareness + SideChannelClient + heartbeat timer + disconnect)
- `pwa/src/lib/sideChannel.ts` — UPDATED: added `SideChannelClient` class with typed emitter, exponential backoff reconnect (1/2/5/10/30s), side-channel message routing, `sendGoRequest`/`sendArmRequest`. Old `createSideChannel` preserved for backwards compat.
- `pwa/src/lib/awareness.ts` — `StationAwareness` type, `makeInitialAwarenessState()`, `extractStations()` helper
- `pwa/src/lib/yProviders.ts` — `createProviderStack()` helper (standalone, not yet wired)
- `pwa/src/lib/ConnectionProvider.tsx` — `ConnectionProvider` React context + `useConnection()` hook. `ConnectionContext` exported for tests.
- `pwa/src/hooks/useShow.ts` — `useShow(): ShowState | null` — observes `meta` Y.Map, cache+clear pattern
- `pwa/src/hooks/useCuelist.ts` — `useCuelist(id): {cuelist, cues}` — observeDeep on cuelists, cache+clear pattern for correct React detection
- `pwa/src/hooks/useCue.ts` — `useCue(cuelistId, cueId): Cue | null`
- `pwa/src/hooks/useDepartment.ts` — `useDepartment(cuelistId, ctx): {visible, actionable, ctx}` — inline filter functions (see note below), stable deps via serialized Set keys
- `pwa/src/hooks/useStations.ts` — `useStations(): StationAwareness[]` — awareness change observer, cache+clear
- `pwa/src/hooks/useMode.ts` — `useMode(): {mode, canToggle, transition}` — direct meta.mode write (MVP)
- `pwa/src/hooks/useGoChannel.ts` — `useGoChannel(cuelistId): {go, standby, lastDispatched}` — side-channel event subscription, historic filter
- `tests/unit/pwa/helpers/makeTestConnection.ts` — test helper: minimal Connection with mocked awareness, sideChannel, real Y.Doc
- `tests/unit/pwa/helpers/connectionContext.ts` — re-exports ConnectionContext for tests
- `tests/unit/pwa/cuelistData.test.ts` — 6 tests: Y.Doc instance, URL token param, IDB key, awareness fields, heartbeat, disconnect
- `tests/unit/pwa/useShow.test.tsx` — 3 tests: null when empty, title render, re-render on change
- `tests/unit/pwa/useCuelist.test.tsx` — 5 tests: unknown ID, empty cuelist, cue labels, re-render on add, absent cuelist
- `tests/unit/pwa/useDepartment.test.tsx` — 5 tests: SM sees all, LX filter, empty ctx, re-render on dept change, memoization

## Decisions made within task scope

**`useSyncExternalStore` cache+clear pattern**: All hooks that return new objects (ShowState, CuelistSnapshot, StationAwareness[]) use a `useRef` cache cleared in the subscribe handler and populated lazily in `getSnapshot`. This ensures React sees the same reference between mutations (no re-render) and a fresh reference after mutations (triggers re-render). Without this, `meta.toJSON()` creates a new object on every `getSnapshot` call → infinite loop.

**`showx-shared/views` import not created**: The spec shows `import { visibleCues, isActionable } from 'showx-shared/views'` but this subpath doesn't exist in showx-shared. The PWA cannot import from cuelist-core internals. Resolution: inlined both pure filter functions in `useDepartment.ts`. They are ~15 lines with no external deps. A follow-up task should add a `views` export to showx-shared and update useDepartment to use it.

**No `eventemitter3` or `uuid` dependencies**: pwa/package.json doesn't include these. Used a minimal typed emitter (Map of Sets) and `crypto.randomUUID()` (universally available in modern browsers and Node.js 19+).

**Factory injection on `ConnectOpts`**: Added `_providerFactory` and `_persistenceFactory` injection points to `connectToShow` opts. Tests use these to avoid needing y-websocket/y-indexeddb in root workspace (only in pwa/ workspace). Pattern matches existing `createSyncClient._providerFactory`.

**`useMode.transition` writes doc directly**: Mode transitions are local Y.Doc writes (which propagate via Yjs to all peers). This is consistent with how mode state is managed in cuelist-core. In a future iteration, this should go through the side-channel so the server can validate authority.

**Reconnect backoff**: SideChannelClient uses the exact BACKOFF_STEPS `[1000, 2000, 5000, 10000, 30000]` as required by AC. On `onclose`, schedules next connect with current step and increments index (capped at last step = 30s).

**Side-channel replay window**: `go.dispatched` events with `Date.now() - dispatched_at > 5000ms` are marked `historic: true`. `useGoChannel` ignores historic events for `lastDispatched` updates (AC: "do not animate cue-fire visuals").

## Tests run

```
pnpm vitest run tests/unit/pwa/
  Test Files  7 passed (7)
  Tests       37 passed (37)

pnpm test
  Test Files  57 passed (57)
  Tests       613 passed (613)
```

No regressions.

## Notes for Critic

1. **`useSyncExternalStore` cache pattern**: Verify the cache+clear approach in `useShow`, `useCuelist`, `useStations`. Pattern: subscribe handler clears `cache.current = null` AND calls `cb()`; `getSnapshot` returns `cache.current` if set, else recomputes. This is the only safe pattern for Yjs + `useSyncExternalStore`.

2. **`visibleCues`/`isActionable` inlined**: Not importing from `showx-shared/views` (doesn't exist). Inlined in `useDepartment.ts`. Critic may flag and request a follow-up task to add the subpath export.

3. **No UUID v7**: Using `crypto.randomUUID()` (v4). For go.request idempotency this is sufficient — the spec only requires unique IDs, not v7 time-ordering. If monotonic ordering is needed, a follow-up can add uuid/v7 to pwa/package.json.

4. **`useMode.canToggle = true` always**: MVP placeholder. Does not check operator role. Acceptable for Kongres demo; revisit for multi-role production.

5. **Backward compat**: Old `createSideChannel` + `SideChannelEvent` API in `sideChannel.ts` is preserved unchanged. All 9 existing syncClient/sideChannel tests continue to pass.

6. **`yProviders.ts`**: Created as per target_files but not yet consumed by `cuelistData.ts` (which has its own inline provider creation). Forge chose inline for simplicity. Could consolidate post-Kongres.

7. **`ConnectionProvider.tsx`**: `useEffect` dependency array uses `[opts.wsUrl, opts.show_id, opts.pairingToken]`. Reconnects if these change. Does not reconnect on `_providerFactory` change (injection only, not production concern).
