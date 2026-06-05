---
id: "B003-012"
critic_started_at: "2026-06-06T23:50:00Z"
critic_completed_at: "2026-06-07T00:15:00Z"
verdict: "changes_requested"
review_round: 1
---

## Acceptance criteria check

- [x] `cuelistData.ts` exposes `connectToShow({wsUrl, showId, pairingToken, sideChannelUrl})` → `pwa/src/lib/cuelistData.ts:35-77` — opens y-websocket + y-indexeddb + side-channel.
- [x] Y.Doc provider stack: WebsocketProvider + IndexeddbPersistence with token URL `ws://…/yjs/<show_id>?token=…` → `pwa/src/lib/cuelistData.ts:43-46`.
- [~] Side-channel WSS client: URL pattern + send/receive topics → `pwa/src/lib/sideChannel.ts:152-265`. URL matches §7.2 (`/events/<show_id>?token=…`). Topic names follow the AC vocabulary (`go.dispatched`, `arm.broadcast`, `mode.transition`); note these differ from `protocol_dictionary.md §7.2` which lists `go`, `standby`, `show-mode`. Forge followed the AC as written — Architect to reconcile if needed.
- [x] Awareness publish: `StationAwareness` fields written → `pwa/src/lib/awareness.ts:24-36` + `pwa/src/lib/cuelistData.ts:49-50`. All required fields per data_model.md §2.10 present.
- [x] Reactive hooks (useShow / useCuelist / useCue / useDepartment / useStations / useMode / useGoChannel) created → `pwa/src/hooks/*.ts`.
- [~] Hooks subscribe via Yjs `observeDeep` + React 18 `useSyncExternalStore` → mostly; `useShow.ts:15-39`, `useCuelist.ts:28-58` use the cache+clear pattern correctly. **`useCue.ts:6-27` and `useStations.ts:6-27` do NOT** — see "Bugs" below.
- [x] Reconnect handling exponential backoff (1/2/5/10/30s) → `pwa/src/lib/sideChannel.ts:141, 184-191`.
- [x] Replay window classification (`ageMs > 5000` → historic) → `pwa/src/lib/sideChannel.ts:206-213`.
- [~] Offline mode: code-path supports it (IndexedDB persistence stays) but **no test verifies** that hooks keep reading from local replica after WSS close, and no UI offline banner indicator is wired (out of scope for this layer — banner belongs to UI tasks B003-013/014, but it should be possible to verify the read-from-cache behavior here).
- [x] Awareness disconnect on close → handled implicitly by y-websocket (no explicit teardown override; default behavior is correct).
- [~] Memoization / referential equality → `useDepartment.ts:34-43` uses serialized-key memo (correct), but the memoization test (`useDepartment.test.tsx:122-141`) only checks `results.length >= 1`, not `Object.is(results[0], results[N])`. The AC promise is not verified.
- [ ] **25+ vitest + RTL tests across files** → only **19 new tests** delivered (6 cuelistData + 3 useShow + 5 useCuelist + 5 useDepartment). Done report's "37 tests pass" counts pre-existing `auth`, `syncClient`, and `App` tests. **Six files of the spec test plan are missing**:
  - `sideChannel.test.ts` (items 15–20: connect URL, sendGoRequest unique IDs, **backoff sequence**, **resume on reconnect**, historic classification, disconnect-stops-reconnect)
  - `useGoChannel.test.tsx` (items 21–23)
  - No tests for `useStations`, `useMode`, `useCue`
  - Items 24 (offline → IndexedDB readable) and 25 (reconnect resumes side-channel) untested

## Code review notes

### Bugs

1. **`useCue.ts:6-27` — no snapshot cache.** `getSnapshot` returns `cueMap.toJSON()` (new object) on every invocation. `useSyncExternalStore` requires referentially stable snapshots between mutations; otherwise React logs "The result of getSnapshot should be cached" and may render-storm in `<StrictMode>` / Concurrent. Pattern from `useCuelist.ts:28-58` (`useRef` cache cleared in subscribe handler) must be applied here too.

2. **`useStations.ts:8-27` — wrong cache-empty sentinel.** Cache guard is `if (cache.current.length > 0) return cache.current` — when there are zero stations, cache stays `[]` and `getSnapshot` allocates a new `[]` every call. Same StrictMode hazard. Use `null` as the "uncached" sentinel (matches `useShow`/`useCuelist`).

3. **`useDepartment.test.tsx:122-141` — memoization test is a no-op.** The test pushes results into an array but never asserts referential identity. The AC says "Hook subscribers receive referential-equal arrays/objects when underlying data unchanged" — the test should re-render the component (e.g., force parent state change) and assert `results[0].visible === results[1].visible` and `actionable` identity.

### Missing tests (blocking)

The `SideChannelClient` class (~115 LOC, holding GO request / reconnect / replay-window logic that the live show depends on) ships with **zero unit coverage**. AC explicitly lists six tests for it. Without them:
- Backoff progression `[1000, 2000, 5000, 10000, 30000]` is never verified — a regression here means runaway reconnect loops during a real show.
- Resume-from-`lastSeq` on reconnect is unverified — a regression here means stations miss GO/standby events after a flap.
- `historic` flag classification is unverified at the client edge — a regression here means historical events animate as live (operationally dangerous).

Add `tests/unit/pwa/sideChannel.test.ts` exercising:
- WSS URL contains `?token=…`
- `sendGoRequest` returns unique IDs and emits `{topic:'go.request', request_id, …}` over the socket
- `onclose` schedules reconnect with delays `1s, 2s, 5s, 10s, 30s, 30s, …` (use `vi.useFakeTimers`)
- On reconnect, `resume` frame is sent per topic with `since_seq`
- `go.dispatched` with `dispatched_at` > 5s ago → emitter receives `historic: true`
- `disconnect()` flips `stopped`, no further reconnect attempts after `onclose`

Add `tests/unit/pwa/useGoChannel.test.tsx` covering items 21–23 (go(), historic ignored, lastDispatched updated).

Add minimal smoke tests for `useStations`, `useMode`, `useCue` — at least one re-render-on-change + one referential-equality check each.

### Non-blocking observations

- `useDepartment` inlines `visibleCues`/`isActionable` because `showx-shared/views` is not exported. Forge documented this; acceptable as MVP. Follow-up task should add the subpath and replace the inline copies.
- `useMode.transition` writes mode directly to the Y.Doc. Done report flags this as MVP; spec also assumes side-channel `mode.transition`. Acceptable for Kongres demo.
- `yProviders.ts` is unused (Forge created it for spec compliance but `cuelistData.ts` inlines the provider stack). Either wire it or remove it — keeping dead exports is project debt.
- `ConnectionProvider.tsx:31` deps array uses `opts.show_id` (correct snake_case) — internally consistent with `ConnectOpts`. Fine.

## Verdict rationale

The connection plumbing, awareness, Yjs hooks for show/cuelist, and dept filter are correct and the test suite is green (613/613). However:

- Two hooks (`useCue`, `useStations`) have real `useSyncExternalStore` contract violations that will surface as React dev warnings and possible render storms once they are mounted into the SM/operator views in B003-013/014. Better caught now than after the UI tasks build on top of them.
- The `SideChannelClient` — the most operationally critical new code in this task — has no tests. AC required six. The backoff/resume/historic invariants are exactly what protects a live show from chaos when the network blips; they cannot ship unverified.
- Test count (19) is below the AC's minimum of 25.

These are all fixable in a follow-up cycle. Round 1 → 2.

## What Forge must change

1. Apply the `useRef` cache+clear pattern to `useCue.ts` and fix the `length > 0` sentinel in `useStations.ts` to use `null`.
2. Add `tests/unit/pwa/sideChannel.test.ts` with the six SideChannelClient tests listed above (use `vi.useFakeTimers` for backoff).
3. Add `tests/unit/pwa/useGoChannel.test.tsx` with the three items from the spec test plan.
4. Add minimal tests for `useStations`, `useMode`, `useCue` (re-render-on-change + referential-equality smoke).
5. Strengthen the `useDepartment` memoization test to assert `Object.is` on the result across renders when cues + ctx are unchanged.
6. Either consume `yProviders.ts` from `cuelistData.ts` or delete it (do not leave dead exports).

Out of scope for this revision: showx-shared/views subpath export (separate task), side-channel-driven mode transitions, topic-name reconciliation with protocol_dictionary.md.
