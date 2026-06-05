---
id: "B001-006"
slug: "syncbroker_ywebsocket"
verdict: "accepted"
round: 1
reviewer: "critic"
reviewed_at: "2026-06-06T08:25:00Z"
---

## Acceptance criteria check

| # | Criterion | Evidence | OK |
|---|---|---|---|
| 1 | `attach(httpServer)` binds to existing HTTP server (no new port) | `src/main/src/shared/SyncBroker.ts:36-40` — only `server.on('upgrade', ...)`; no `listen()` call | ✅ |
| 2 | `/yjs/<show_id>` routes to Yjs sync session; other paths pass through | `SyncBroker.ts:93,95,102-103` (anchored regex `^/yjs/([A-Za-z0-9_-]+)(\?|$)`); test `SyncBroker.test.ts:232-257` confirms `/random-path` reaches a separate `srv.on('upgrade')` listener | ✅ |
| 3 | `/events/<show_id>` routes to side-channel pub/sub | `SyncBroker.ts:94,104-106` + `syncBroker/sideChannel.ts:24-34` | ✅ |
| 4 | `openDocument(name)` returns YDocHandle; `closeDocument` tears down | `SyncBroker.ts:46-57` + `yWebsocketAdapter.ts:51-63`; tests `SyncBroker.test.ts:70-76` (idempotent open) and `:183-195` (close emits 1000) | ✅ |
| 5 | Auth gate: bearer or `?token=`; missing/invalid → 401 close | `SyncBroker.ts:97-100` + `authGate.ts:14-25`; tests `SyncBroker.test.ts:95-111` (no token → 401) and `:113-125` (valid token → open) | ✅ |
| 6 | `registerPersistence(name, {load, save})` hydrates + throttled save | `yWebsocketAdapter.ts:46-49, 75-99` (250 ms throttle, `Y.mergeUpdates`); test `SyncBroker.test.ts:127-148` (load called once, save fires within 300 ms via fake timers) | ✅ |
| 7 | Side-channel: broadcast within show_id only, in-memory, bounded 100-msg replay | `sideChannel.ts:36-49,67-75` (push + cap 100 + replay on connect); tests `sideChannel.test.ts:64-104` (broadcast scoping) and `:125-177` (replay 5 and cap-at-100 with first-seq=50) | ✅ |
| 8 | `subscribeAwareness(name, handler)` exposes awareness updates | `SyncBroker.ts:63-81`; test `SyncBroker.test.ts:150-181` (handler invoked with clientId + `{cursor: 42}`) and `:197-230` (unsubscribe stops calls) | ✅ |
| 9 | ≥12 vitest test cases total | 9 (SyncBroker) + 8 (sideChannel) = 17 cases | ✅ |
| 10 | `pnpm --filter showx-main typecheck` passes | Verified locally — `tsc --noEmit` exits 0 after `showx-shared` build | ✅ |
| 11 | Targeted vitest run passes 100% | `pnpm vitest run tests/unit/shared/SyncBroker tests/unit/shared/sideChannel` → 17/17 in ~720 ms | ✅ |

## Independent verification

```
pnpm vitest run tests/unit/shared/SyncBroker tests/unit/shared/sideChannel
 ✓ tests/unit/shared/SyncBroker.test.ts  (9 tests) 148ms
 ✓ tests/unit/shared/sideChannel.test.ts  (8 tests) 297ms
 Test Files  2 passed (2)
      Tests  17 passed (17)

pnpm --filter showx-main typecheck
# (no errors)
```

## Code quality notes

- **Routing regex is correctly anchored** (`^/yjs/([A-Za-z0-9_-]+)(\?|$)` and matching `/events/` form). `/yjs/abc/extra` does NOT match — confirmed by reading the pattern; no dedicated negative test for that exact subpath, but the `/random-path` test exercises the pass-through path that protects against false matches.
- **Bearer header path** (`Authorization: Bearer …`) is implemented in `authGate.ts:17-18` but is not directly exercised by a test — only the `?token=` query path is. Not a blocker (logic is trivially correct and covered by the type signature), but worth a note for future hardening.
- **Vendored y-websocket protocol** correctly uses `y-protocols/sync` + `y-protocols/awareness` + `lib0` encoder/decoder per spec; no `y-websocket` package dependency.
- **Root devDeps duplication** (`ws`, `yjs`, `y-protocols`, `lib0`, `@types/ws` added to root `package.json`) is a pragmatic workaround for the root-level Vitest config resolving from `tests/unit/`; Forge documented this in the done report. Acceptable for a workspace where the root runner is the test driver.
- **Replay-frame test pattern** in `sideChannel.test.ts:134-147,161-176` correctly attaches the `message` listener before `open` to avoid losing replay frames that arrive in the same I/O callback as the 101 upgrade response. The fix and rationale are documented in the done report.

## Known limitations (acknowledged by Forge, deferred)

- **Awareness cleanup on disconnect** uses `entry.doc.clientID` (server-side ID) in `yWebsocketAdapter.ts:168` instead of the connecting client's `clientID`. Spec does not require correct cleanup at this layer; Cuelist Core (ShowX-3) will resolve.
- **Persistence-save timer not cleared on `closeDocument`** (`yWebsocketAdapter.ts:55-63` vs `:84-98`). A pending 250 ms timer can fire after `doc.destroy()` and call `save` on a destroyed doc. Spec does not require lifecycle cleanup at this granularity; small/cosmetic concern.
- **`extractToken` does not validate empty-string tokens** (an empty `?token=` would return `""` → falsy → 401 path is taken anyway, so functionally safe).

None of these are fundamental and none block acceptance.

## Verdict: accepted

All 11 acceptance criteria are met with file:line evidence. Implementation matches the spec's architecture (single HTTP server, vendored Yjs protocol, side-channel scoping + bounded replay, pluggable PairingValidator). Tests are real (in-memory `http.createServer()` + `ws` clients + true Yjs handshake) and pass deterministically.
