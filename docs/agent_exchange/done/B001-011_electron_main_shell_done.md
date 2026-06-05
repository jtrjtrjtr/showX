---
id: "B001-011"
title: "Electron main entry + shell skeleton"
status: "done"
round: 1
---

## Summary

Wired every ShowX-1 infrastructure service into a runnable Electron app. Shell orchestrates 13 services in a deterministic boot sequence with safe reverse-order shutdown. All 7 Shell tests pass; full suite 269/269.

## Files changed

| File | Change |
|---|---|
| `src/main/src/index.ts` | Replaced placeholder with Electron entry (app.whenReady → Shell.boot, SIGTERM/SIGINT handlers) |
| `src/main/src/Shell.ts` | New. ShellConfigStore interface + impl (zod-backed generic KV + disabledSlugs). PairingStoreAdapter (showx-shared interface). InputRegistrarStub. Shell class with 13-step boot, reverse-order shutdown, isShutDown(), sharedServices(). safeCall helper. |
| `src/main/src/ipc/channels.ts` | New. IPC channel name constants. |
| `src/main/src/ipc/index.ts` | New. registerIpcHandlers: 8 invoke handlers + HEALTH_CHANGE broadcast via health.observeAggregate. |
| `src/main/src/ui/preload.ts` | New. contextBridge.exposeInMainWorld('showxApi', ...) with modules/health/pairing/config API. ShowxApi type exported. |
| `src/main/src/ui/window.ts` | New. createMainWindow: BrowserWindow with contextIsolation, nodeIntegration=false, sandbox=true. Dev tools in SHOWX_DEV mode. |
| `src/main/src/shared/AssetServer.ts` | Added `get expressApiRouter()` getter to expose private apiRouter for mountPairingRoutes. |
| `src/main/package.json` | Added `electron: ^29.0.0`, `@electron/notarize: ^2.3.0` (devDep for ShowX-6), `dev`/`start` scripts. |
| `package.json` (root) | Added `dev` script using concurrently for PWA + Electron. |
| `tests/unit/Shell.test.ts` | New. 7 tests: boot order, shutdown order, idempotency, double-boot guard, partial-boot shutdown cleanup, isShutDown lifecycle, IPC handler registration. |

## Boot sequence implemented (deterministic order)

1. Layout (`resolvePaths()`)
2. Logger
3. ShellConfigStore (`PersistedStore slug='shell'`) → `init()`
4. SecretStore (`slug='shell'`)
5. EventBus + HealthBus (no async init)
6. AssetServer → `start()`
7. MdnsService → `advertise()`
8. SyncBroker → `attach(httpServer)`
9. TokenManager → `init()`, PinManager, PairingStore (`slug='pairing'`) → `init()`, `mountPairingRoutes`
10. OutputDispatcher (no init)
11. InputRegistrar → `init()`
12. ModuleLoader → `discoverAndPrepare` → `initAll` → `startAll`
13. BrowserWindow + `registerIpcHandlers` (skipped in test mode)

## Shutdown sequence (reverse, safeCall-wrapped)

modules.stopAll → modules.teardownAll → input.shutdown → sync.stop → mdns.stop → assets.stop → logger.close

## Decisions made within task scope

**Interface adapters required (not blocked):**

1. **`PairingStoreAdapter`** — The `showx-shared.PairingStore` interface (`validateToken/issue/revoke/list`) differs from the main `PairingStore` interface (`listDevices/revokeDevice/resolveToken`). Created adapter in Shell.ts mapping main → showx-shared. `issue()` throws with a clear error (ShowX-1 modules don't issue tokens directly; use HTTP /api/pairing/claim).

2. **`InputRegistrarStub`** — The `showx-shared.InputRegistrar` interface (`listen/unlisten`) differs from main `InputRegistrar` (`subscribeOsc/subscribeMidi`). Created a null-safe stub in Shell.ts. No ShowX-1 modules consume OSC/MIDI input via the module context API; the real `InputRegistrarImpl` is available shell-internally for future use.

3. **`AssetServer.expressApiRouter` getter** — `mountPairingRoutes` takes `express.Router` but `AssetServer.apiRouter` was private. Added a read-only getter. This is a minimal accessor (3 lines), not new behaviour. Noted here for Critic to verify.

4. **`ShellConfigStore` for CONFIG_GET/SET IPC** — `PersistedStore` has no `get(key)/set(key, value)` API; it's schema-centric. Implemented `ShellConfigStoreImpl` backed by PersistedStore with a `{ disabledSlugs: string[], kv: Record<string,unknown> }` schema. Satisfies both MODULE_SET_DISABLED and CONFIG_GET/SET handlers.

5. **`installedTier: 'free'` hardcoded** — TODO(ShowX-2): read real license. Per spec.

## Tests run

```
✓ tests/unit/Shell.test.ts  (7 tests) 11ms
Full suite: 269 passed (29 test files), 0 failed
```

## Notes for Critic

- **Boot order** matches spec §Implementation notes step 1–12 (Logger through Window). Walk each step against the spec dependency graph.
- **safeCall** in shutdown wraps every stop/close call — confirm no raw `await this.X.stop()` without protection.
- **BrowserWindow security**: contextIsolation=true, nodeIntegration=false, sandbox=true in `window.ts`. Verify these are all present.
- **contextBridge**: `contextBridge.exposeInMainWorld` is the ONLY exposure mechanism in preload.ts. No `window.foo = ...`.
- **`expressApiRouter` getter** on AssetServer — verify it returns the private `apiRouter` field, not a new router.
- **PairingStoreAdapter.issue()** throws — correct for ShowX-1, but Critic should flag it as "expected behaviour, not a bug" so it's not confused with missing implementation.
- **InputRegistrarStub** returns `{ id: 'noop-input', unsubscribe: () => {} }` — safe no-op for ShowX-1.
- **`AssetServer` type cast** in `sharedServices()` — `this.assets as unknown as SharedServices['assets']` — necessary because `AssetServer.registerApiRoute` handler type differs from showx-shared's `ApiHandler`. No runtime impact (no ShowX-1 module calls this). Flag as tech debt for ShowX-2 when first module registers an API route.
- **`logger.close` in shutdown** — Shell calls `this.logger.close()` not wrapped in safeCall because Logger is always present after step 2. This is intentional (last resort flush).
- **`modules` property is `null` until step 12** — shutdown's `this.modules?.stopAll()` is safe even when boot failed before module loader construction.
