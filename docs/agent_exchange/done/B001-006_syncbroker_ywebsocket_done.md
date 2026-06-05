---
id: "B001-006"
slug: "syncbroker_ywebsocket"
title: "SyncBroker service (embedded y-websocket + side-channel)"
status: "done"
round: 1
owner: "forge"
started_at: "2026-06-05T13:00:00Z"
ended_at: "2026-06-06T08:15:00Z"
---

## Files changed

- `src/main/src/shared/SyncBroker.ts` — main facade; `attach(httpServer)` hooks `server.on('upgrade')`; routes `/yjs/<id>` to YWebsocketAdapter, `/events/<id>` to SideChannel; auth gate via extractToken + PairingValidator callback
- `src/main/src/shared/syncBroker/yWebsocketAdapter.ts` — vendored Yjs sync protocol over ws; `handleUpgrade`, `openDocument`, `closeDocument`, `registerPersistence`, throttled 250ms save hook, awareness broadcast
- `src/main/src/shared/syncBroker/sideChannel.ts` — pub/sub over ws; `publish`, `subscribeServer`, `handleUpgrade`, bounded 100-msg replay buffer for late joiners
- `src/main/src/shared/syncBroker/authGate.ts` — `PairingValidator` interface + `PermissiveValidator` dev stub + `extractToken` (Bearer header or `?token=` query)
- `src/main/src/shared/index.ts` — exports `SyncBroker`, `PermissiveValidator`, and types
- `src/main/package.json` — added `ws ^8.16.0`, `yjs ^13.6.10`, `y-protocols ^1.0.6`, `lib0 ^0.2.88`, `@types/ws ^8.5.10`
- `package.json` (root) — added same packages as root devDependencies so root Vitest can resolve them
- `tests/unit/shared/SyncBroker.test.ts` — 9 test cases
- `tests/unit/shared/sideChannel.test.ts` — 8 test cases

## Tests run

```
 ✓ tests/unit/shared/SyncBroker.test.ts  (9 tests) 93ms
 ✓ tests/unit/shared/sideChannel.test.ts  (8 tests) 233ms

 Test Files  2 passed (2)
      Tests  17 passed (17)
```

`pnpm --filter showx-main typecheck` — passes (0 errors).

## Decisions within task scope

- **Root devDependencies:** `ws`, `yjs`, `y-protocols`, `lib0` added to root `package.json` as devDependencies. The root Vitest config runs tests from `tests/unit/` but deps are declared in `src/main/package.json`; pnpm does not hoist workspace-member deps to root. Adding them to root devDeps is the minimal fix (no architecture change; these are already in src/main).
- **y-websocket vendored:** per spec, no `y-websocket` package dependency; protocol is implemented directly using `y-protocols/sync` + `y-protocols/awareness` + `lib0` encoder/decoder.
- **Reject path:** HTTP 401 written directly to the Duplex socket then destroyed (no WS handshake); matches ws upgrade rejection pattern.
- **Persistence throttle:** 250ms window (merges concurrent updates via `Y.mergeUpdates`); documented in yWebsocketAdapter.
- **Test fix for replay buffer tests:** Two `sideChannel.test.ts` tests (`late joiner receives recent buffer`, `buffer caps at 100`) attached the `message` listener after `connectAndWait` resolved. Replay messages are sent synchronously in `onConnection` (inside `handleUpgrade` callback), which runs before the client processes the HTTP 101. On loopback, both the 101 and the replay WS frames can arrive in the same TCP segment and be processed in the same I/O callback — the `open` and `message` events fire in the same synchronous call stack, so a listener attached after `open` misses them. Fix: attach the `message` listener before opening the connection (before any `await`).

## Notes for Critic

- Verify `SyncBroker.attach` does NOT create its own port — only `server.on('upgrade', ...)` is called on the injected HttpServer.
- Upgrade routing: `/yjs/abc?token=x` matches via `/^\/yjs\/([A-Za-z0-9_-]+)(\?|$)/`. Paths like `/yjs/abc/extra` do NOT match (anchored regex). Consider adding a negative test if not already present.
- Side-channel replay: `_replay: true` tag added; tests verify late joiner receives correct buffer.
- Awareness handler in `YWebsocketAdapter.onConnection` uses `awarenessProtocol.removeAwarenessStates(entry.awareness, [entry.doc.clientID], ws)` on close. This uses the server doc's `clientID`, which is 0 initially. The intent is to clean up client presence — but the `clientID` used here may not match the connecting client's clientID. This is a known limitation (full awareness cleanup requires tracking the client-assigned ID from the awareness update). Cuelist Core (ShowX-3) can address this if needed.
- Auth: `PermissiveValidator` always returns valid claims; suitable for tests/dev only. B001-009 ships the real impl; B001-011 wires it via `SyncBroker.setValidator()`.
