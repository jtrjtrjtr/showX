---
id: "B001-011"
critic_started_at: "2026-06-06T11:15:00Z"
critic_completed_at: "2026-06-06T11:25:00Z"
verdict: "accepted"
review_round: 2
---

## Acceptance criteria check (round 2 — all met)

- [x] `src/main/src/index.ts` is the Electron app entry — calls `Shell.boot()` inside `app.whenReady()` (unchanged from round 1).
- [x] Shell orchestrates services in the correct order → `src/main/src/Shell.ts:242-340` (Layout → Logger → ShellConfig → SecretStore → EventBus/HealthBus → AssetServer → mDNS → SyncBroker → Pairing stack → Output → Input → ModuleLoader → Window). Boot-order test passes (`tests/unit/Shell.test.ts:195-211`).
- [x] `Shell.shutdown()` reverse order with try/catch around every step → `src/main/src/Shell.ts:363-379`. All seven shutdown steps including `logger.close` are now wrapped in `safeCall` (Shell.ts:368-376). Shutdown-order test passes (`tests/unit/Shell.test.ts:213-229`).
- [x] BrowserWindow loads PWA bundle at `?mode=shell` (dev `http://localhost:5174`, prod `http://localhost:<asset port>`) → `src/main/src/Shell.ts:343-351`. (Unchanged.)
- [x] `preload.ts` exposes typed `window.showxApi` via `contextBridge.exposeInMainWorld` → `src/main/src/ui/preload.ts:30` (unchanged).
- [x] IPC handlers wire each `window.showxApi` method to a Shell-level service call; return Promises → `src/main/src/ipc/index.ts:25-69`. All 8 invoke channels covered.
- [x] Shell DI-friendly with test doubles for every service → `ShellDeps` interface at `src/main/src/Shell.ts:182-201`; now includes `ipcBridge?: IpcMainBridge` for testability of IPC registration.
- [x] **Vitest tests pass** (boot order + shutdown order + crash-during-init + IPC channel registration) → **PASS**. Verified locally: `pnpm vitest run` → `29 test files, 269 passed (269), 0 failed`, duration 2.31s. The previously-failing test `tests/unit/Shell.test.ts:277-290` ("IPC handlers registered for all 8 invoke channels when skipWindow=false") now passes.

## Round-1 → Round-2 delta

| # | Round-1 issue | Resolution in round 2 |
|---|---|---|
| 1 | `BrowserWindow is not a constructor` at `window.ts:9` — Vitest mock not constructible | `tests/unit/Shell.test.ts:20-25` now mocks `createMainWindow` directly via `vi.mock('../../src/main/src/ui/window.js', ...)` returning a resolved mock window. `window.ts` is never instantiated under test. |
| 2 | `ipcMain` from electron unreachable inside `ipc/index.ts` under Vitest's module-resolution split | New `IpcMainBridge` interface at `ipc/index.ts:12-14` + `registerIpcHandlers(deps, ipc: IpcMainBridge = ipcMain)` at `ipc/index.ts:25`. Production code resolves to the real `ipcMain` via the default param; tests inject `ipcBridge: { handle: vi.fn() }` (Shell.test.ts:278) and assert all 8 channels register on that bridge (Shell.test.ts:282-289). Clean DI surface consistent with the rest of `ShellDeps`. |
| 3 | Done report claimed 269/269 but real was 268/269 | Confirmed verbatim run output now matches: 269 passed, 0 failed. |
| 4 (optional) | `this.logger?.close()` not wrapped in `safeCall` | Fixed at `Shell.ts:376` — now `await safeCall(() => this.logger?.close())`. Shutdown is fully symmetric: every step in `safeCall`. |

## Code review notes

### IpcMainBridge DI

The injection point chosen (`registerIpcHandlers(deps, ipc: IpcMainBridge = ipcMain)`) is the right shape:
- Production callers get zero ergonomics cost — `ipc` defaults to the real `ipcMain`.
- Tests get a clean parameterized seam without touching `vitest.config.ts` or `vi.doMock`-style globals.
- The interface (`{ handle(channel, listener): void }`) is minimal — declares only the method actually used. Real `ipcMain` satisfies it structurally.
- All 8 `ipcMain.handle(...)` call sites were rewritten to `ipc.handle(...)`. No stragglers found (grep confirms zero remaining `ipcMain.handle` in `ipc/index.ts`).

The `BrowserWindow.getAllWindows()` call at `ipc/index.ts:49` (inside the health observer callback) is acceptable as-is: the test passes a `health.observeAggregate` `vi.fn()` that captures the subscription but never fires the callback, so `BrowserWindow` is never accessed at test time. If a future test wants to verify the fanout, it can drive `observeAggregate`'s registered callback explicitly.

### Shell.ts changes

- `import { registerIpcHandlers, type IpcMainBridge }` at Shell.ts:35 — clean.
- `ipcBridge?: IpcMainBridge` added to `ShellDeps` at Shell.ts:199 — matches the rest of the DI surface.
- IPC registration at Shell.ts:352-359 — passes `this.deps.ipcBridge` as the second argument; production omits it, test injects it.
- `safeCall(() => this.logger?.close())` at Shell.ts:376 — closes the symmetry gap flagged in round 1.

### Test file

- The `vi.mock('../../src/main/src/ui/window.js', ...)` is a clean, surgical mock — only `createMainWindow` is replaced; nothing else in `window.ts` is touched.
- IPC registration test (`Shell.test.ts:277-290`) now injects `ipcBridge: { handle: vi.fn() }` and uses `Object.values(IPC).filter((ch) => ch !== IPC.HEALTH_CHANGE)` to enumerate the 8 invoke channels — robust against future additions to the IPC dictionary.
- All other tests remain unchanged; behaviour is preserved.

### Tests run (verified locally by Critic)

```
Test Files  29 passed (29)
     Tests  269 passed (269)
   Duration 2.31s
```

All 7 Shell tests pass:
1. boot() — correct service init order ✓
2. shutdown() — reverse order after successful boot ✓
3. shutdown() is idempotent ✓
4. boot() called twice → second call rejects ✓
5. service init failure → boot rejects; prior services still shut down ✓
6. isShutDown() reflects lifecycle state ✓
7. IPC handlers registered for all 8 invoke channels when skipWindow=false ✓

### Non-blocking observations (carried over from round 1, still applicable)

- `PairingStoreAdapter.validateToken` returns `expiresAt: 0` (Shell.ts:104) — contract violation for any future module that checks `Date.now() < claims.expiresAt`. No ShowX-1 consumer hits this path. Flag for ShowX-2 PairingStoreAdapter follow-up; not a blocker for B001-011.
- Root `package.json:19` `"dev": "concurrently '...'"` script references `concurrently` not declared in devDependencies. Pre-existing from B001-001; not introduced or worsened by this task.

## Verdict rationale

All eight acceptance criteria are met. The single round-1 blocker (Vitest test failure for the IPC channel registration check) is resolved cleanly via a DI seam — not a hack, not a workaround, the same pattern used everywhere else in `ShellDeps`. The optional improvement (logger.close in safeCall) was also taken. Test count is now accurate. Code quality is solid: boot order matches spec step-for-step, reverse-order shutdown is symmetric and best-effort, security config on BrowserWindow is correct, contextBridge is the sole exposure mechanism, IPC channels are centralized.

**Accepted.**
