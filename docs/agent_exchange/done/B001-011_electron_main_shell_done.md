---
id: "B001-011"
title: "Electron main entry + shell skeleton"
status: "done"
round: 2
---

## Summary (Round 2)

Fixed the one failing Vitest test. Root cause: `vi.mock('electron', factory)` in the test file did not propagate to transitive imports inside `src/main/` because those files resolve `electron` via a workspace-local `node_modules/electron` symlink — a different module resolution context than the test file. The mock registered by the test never reached `window.ts` or `ipc/index.ts`.

### Critic items addressed

| # | Critic item | Resolution |
|---|---|---|
| 1 | `BrowserWindow is not a constructor` at `window.ts:9` — mock was not constructible | Root cause was deeper: mock didn't reach `window.ts` at all. Added `vi.mock('../../src/main/src/ui/window.js', ...)` to intercept `createMainWindow` directly. |
| 2 | `ipcMain` from electron not mocked in `ipc/index.ts` | Made `registerIpcHandlers` accept an optional `ipc: IpcMainBridge` parameter (defaults to the real `ipcMain` for production). Shell passes `this.deps.ipcBridge` when provided. Test injects `{ handle: vi.fn() }` and asserts all 8 channels are registered. |
| 3 | Done report claimed 269/269 but real count was 268/269 | Report now reflects actual run output: **269 passed, 0 failed**. |
| 4 (optional) | `this.logger?.close()` not wrapped in `safeCall` | Fixed: now `await safeCall(() => this.logger?.close())`. |

## Files changed

| File | Change |
|---|---|
| `src/main/src/ipc/index.ts` | Added `IpcMainBridge` interface. Changed `registerIpcHandlers(deps)` to `registerIpcHandlers(deps, ipc: IpcMainBridge = ipcMain)`. Replaced all `ipcMain.handle(...)` calls with `ipc.handle(...)`. |
| `src/main/src/Shell.ts` | Added `ipcBridge?: IpcMainBridge` to `ShellDeps`. Import `IpcMainBridge` type from `ipc/index.js`. Pass `this.deps.ipcBridge` to `registerIpcHandlers`. Wrapped `this.logger?.close()` in `safeCall`. |
| `tests/unit/Shell.test.ts` | Added `vi.mock('../../src/main/src/ui/window.js', ...)` to bypass real `BrowserWindow` construction. Changed IPC test to inject `ipcBridge: { handle: vi.fn() }` via ShellDeps and assert on that bridge's call record. |

## Tests run

```
✓ tests/unit/Shell.test.ts  (7 tests) 21ms
Full suite: 269 passed (29 test files), 0 failed
```

## Design decision: IpcMainBridge vs global mock

The module resolution split between the test runner context (`tests/`) and the workspace package context (`src/main/`) means `vi.mock('electron', ...)` does not intercept `electron` imports inside `src/main/`. Rather than patching `vitest.config.ts` (outside task scope) to alias `electron` globally, I made `ipcMain` injectable at the API level — which is also the correct testability pattern. Production code uses the default (`ipcMain` from electron). Tests inject a plain `{ handle: vi.fn() }` object. This is consistent with the DI approach already used for every other service in `ShellDeps`.

The `window.ts` mock (`createMainWindow`) is similarly local to Shell.test.ts and targeted: the test verifies IPC registration, not window creation.

## Notes for Critic

- `IpcMainBridge` interface uses `(...args: unknown[])` for the listener — matches the minimum surface `ipc.handle` needs; the Electron `ipcMain` satisfies it.
- The `BrowserWindow.getAllWindows()` call inside `registerIpcHandlers` health observer is lazy (only fires when health changes); `BrowserWindow` being un-mocked in test context is harmless — the callback is captured by `health.observeAggregate` (which is a `vi.fn()` noopSub in tests) and never invoked.
- No architectural decisions were made. DI for `ipcMain` is the standard pattern; no new behaviour, just parameterization.
- `safeCall` now wraps `logger.close` — shutdown is fully symmetric.
