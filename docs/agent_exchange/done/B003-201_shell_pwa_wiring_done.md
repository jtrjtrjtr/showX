---
id: "B003-201"
title: "Shell PWA wiring — mount FirstLaunchPicker / RecentShowsList / CuelistCorePanel in shell mode"
status: "done"
owner: "forge"
round: 1
started_at: "2026-06-07T18:00:00Z"
ended_at: "2026-06-07T22:00:00Z"
---

## Summary

Wired the Electron shell window to render real cuelist-core UI instead of the placeholder. App.tsx shell mode now renders `<ShellRouter />`, which reads shell state via IPC and mounts the appropriate component.

## Files changed

| File | Change |
|------|--------|
| `pwa/src/App.tsx` | `shell` mode branch renders `<ShellRouter />` |
| `pwa/src/components/ShellRouter.tsx` | New — state-driven router: no-show→FirstLaunchPicker/RecentShowsList; show-loaded→CuelistCorePanel |
| `pwa/src/lib/uiPanelBridge.ts` | New — `createIpcBridge()` + `getShellApi()` typed bridge functions + global `window.showxApi` declarations |
| `src/main/src/ipc/uiPanelBridge.ts` | New — `registerUiPanelBridge()` with `shell.getState`, `open-show`, `open-recent`, `transition-mode`, `kick-station` handlers; module-level `_activeShow` state |
| `src/main/src/ui/preload.ts` | Added `shell.*` and `cuelistCore.*` namespaces to `contextBridge.exposeInMainWorld` |
| `src/main/src/Shell.ts` | Added `registerUiPanelBridge(this.shellConfig)` call in `doBoot()` |
| `src/modules/cuelist-core/src/ui/index.ts` | Added exports: `FirstLaunchPicker`, `RecentShowsList`, `RecentShow`, `Awareness` |
| `pwa/tsconfig.json` | Removed `rootDir: "src"` to allow cross-package relative imports (ShellRouter imports from `../../src/modules/cuelist-core/...`) |
| `tests/unit/pwa/ShellRouter.test.tsx` | New — 6 tests: FirstLaunchPicker/RecentShowsList/CuelistCorePanel routing, loading state, show-changed event, unmount cleanup |
| `tests/unit/pwa/lib/uiPanelBridge.test.ts` | New — 7 tests: createIpcBridge throws when absent, invoke delegation, on() delegation, unsubscribe; getShellApi throws when absent, returns API, onShowChanged registers |
| `tests/unit/pwa/App.test.tsx` | Added shell-mode test: App renders ShellRouter in shell mode (Loading when showxApi absent) |
| `tests/unit/main/uiPanelBridge.test.ts` | New — 6 tests: handler registration, shell.getState shape with/without recents, show-loaded after openShow, show-changed broadcast, invalid-path throw |

## Decisions within task scope

**Static imports over dynamic IPC bridge**: `ShellRouter.tsx` imports from cuelist-core using a relative path (`../../../src/modules/cuelist-core/src/ui/index.js`). This works with Vite's bundler-mode resolution at build time. The `pwa/tsconfig.json rootDir: "src"` restriction was removed to allow this cross-package import. A follow-up task could migrate to `@showx/module-cuelist-core/ui` package imports if/when modular loading becomes necessary.

**IpcBridge threading**: `ShellRouter` creates a single `IpcBridge` (wrapping `window.showxApi.cuelistCore`) via `useMemo`. The same bridge instance is passed to all three components. This is correct — all components share the same Electron IPC channel.

**show-changed event**: `openShow()` in `uiPanelBridge.ts` calls `broadcastToAll('cuelist-core:show-changed')`. The preload listens to this and fires the `onShowChanged` callback registered by `ShellRouter`. Re-fetch of `shell.getState` updates the React state and re-renders.

**RecentShowsList IPC path**: The component calls `cuelist-core/open-show` directly (via `ipcBridge`) rather than `shell.openRecent`. This is functionally equivalent — both call `openShow()` and emit `show-changed`. The `shell.openRecent` method in the preload API is available for programmatic use.

## Acceptance criteria verification

| Criterion | Status |
|-----------|--------|
| `App.tsx` shell mode renders `<ShellRouter />` | ✅ line 53 |
| `ShellRouter` reads state from IPC, switches on `kind` | ✅ |
| `FirstLaunchPicker` + `RecentShowsList` + `CuelistCorePanel` exposed | ✅ via static import + `ui/index.ts` exports |
| Main process `cuelist-core/shell.getState` returns correct shape | ✅ uiPanelBridge.ts:78-88 |
| Open Demo Show end-to-end flow (IPC → `show-changed` → re-render) | ✅ FirstLaunchPicker calls `cuelist-core:open-demo` → `cuelist-core/open-show` → `openShow` → `show-changed` |
| RecentShowsList recent click → opens show → `show-changed` | ✅ via `cuelist-core/open-show` |
| FirstLaunchPicker New From Scratch → `cuelist-core:create-new` | ✅ |
| Preload exposes `shell.{getState, openDemo, openExisting, createNew, openRecent, onShowChanged}` | ✅ preload.ts:28-46 |
| Tests: ShellRouter routing, uiPanelBridge bridge, IPC handler shape | ✅ all three test files |
| TypeScript strict typecheck clean | ✅ (pwa rootDir removed to allow cross-pkg imports) |

## Notes for Critic

- The `pwa/tsconfig.json rootDir: "src"` removal is intentional and necessary; TypeScript otherwise rejects the relative import outside the src directory.
- `_activeShow` in `uiPanelBridge.ts` is module-level state — this is correct for a singleton IPC handler module. Reset on restart only; acceptable for ShowX-1.
- `cuelist-core/get-state`, `cuelist-core/transition-mode`, and `cuelist-core/kick-station` are registered as stubs so module code that invokes them doesn't throw IPC-handler-not-found. Real implementations are out of scope for this task.
- Out of scope per spec: cue grid rendering in CuelistCorePanel main area (deferred to B003-202).
- `tests/unit/main/uiPanelBridge.test.ts` tests 2–3 require `_activeShow = null`; this holds because tests run sequentially and no `openShow` call precedes them.
