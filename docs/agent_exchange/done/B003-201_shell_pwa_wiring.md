---
id: "B003-201"
title: "Shell PWA wiring — mount FirstLaunchPicker / RecentShowsList / CuelistCorePanel in shell mode"
type: "implementation"
estimated_size_lines: 500
priority: "P0"
depends_on: []
target_files:
  - "pwa/src/App.tsx"
  - "pwa/src/components/AppShell.tsx"
  - "pwa/src/components/ShellRouter.tsx"
  - "pwa/src/lib/uiPanelBridge.ts"
  - "src/main/src/ipc/uiPanelBridge.ts"
  - "src/main/src/Shell.ts"
  - "src/modules/cuelist-core/src/ui/index.ts"
  - "tests/unit/pwa/ShellRouter.test.tsx"
  - "tests/unit/pwa/lib/uiPanelBridge.test.ts"
acceptance_criteria:
  - "`pwa/src/App.tsx` shell mode renders new `<ShellRouter />` component instead of placeholder `<AppShell title=... subtitle='UI in later bundle' />`"
  - "`ShellRouter` reads the currently loaded show state from main process via `window.showxApi.shell.getState()` IPC (added by this task). States: `'no-show'` → render `<FirstLaunchPicker />` OR `<RecentShowsList />` (recents non-empty); `'show-loaded'` → render `<CuelistCorePanel />`"
  - "`FirstLaunchPicker` from cuelist-core module is exposed to PWA via the uiPanel bridge: cuelist-core's `manifest.uiPanel: () => import('./ui/index.js')` returns `{ FirstLaunchPicker, RecentShowsList, CuelistCorePanel }` already (B003-103); bridge exposes them as ESM imports the PWA can resolve at runtime"
  - "Main process exposes `cuelist-core/shell.getState` IPC handler returning `{ kind: 'no-show' } | { kind: 'show-loaded', showName: string, recentShows: Array<{path, last_opened_at, cue_count}> }`"
  - "Open Demo Show flow (from B003-103 menu OR from FirstLaunchPicker card click) end-to-end:\n  1. IPC `cuelist-core:open-demo` → main process copies bundle → opens show\n  2. Main process emits `cuelist-core:show-changed` event to shell window\n  3. ShellRouter receives event via `window.showxApi.shell.onShowChanged(callback)`\n  4. Re-fetches state, switches to `'show-loaded'` → renders `<CuelistCorePanel />`"
  - "RecentShowsList click on a recent → calls `cuelist-core:open-recent` IPC → same show-changed event flow"
  - "FirstLaunchPicker `New From Scratch` → calls `cuelist-core:create-new` IPC → saves new empty .showx → same event flow"
  - "CuelistCorePanel renders the active show. For 0.1 minimum: show name in header, status strip (path + last save), Stations table populated from awareness, and a tab switcher for Show/Devices/Routing already built in B003-101. The cue grid itself can defer to B003-202 (station mode shows the grid; shell mode = mostly admin/setup tabs)"
  - "Preload script (`src/main/src/ui/preload.ts`) exposes `window.showxApi.shell.{getState, openDemo, openExisting, createNew, openRecent, onShowChanged}` via `contextBridge.exposeInMainWorld`"
  - "Tests: ShellRouter renders correct child based on state; uiPanelBridge resolves cuelist-core panel exports; IPC handler returns correct state shape"
  - "Full PWA + main suite still passing; no regressions"
  - "TypeScript strict typecheck clean"
---

## Context

Per Architect post-0.1.2 audit, the shell window in 0.1.2 loads modules but shows placeholder UI because `pwa/src/App.tsx:53` was never updated to render module UI panels. B003-013..016 and B003-101 built the components but no integration layer was wired.

This task is the integration layer for shell mode. Station mode (B003-202) is parallel work.

## Implementation notes

### Architecture choice

PWA is served from `localhost:5300/?mode=shell`. The shell window loads this URL and gets a PWA bundle that, in shell mode, needs access to cuelist-core's UI exports. Two options:

1. **Bundle cuelist-core UI into PWA at build time** — cuelist-core becomes a PWA build dep
2. **Dynamic import at runtime via IPC** — main process bridges module imports to the renderer

Option 2 preserves the modular architecture (modules can be added without rebuilding PWA). Implement via preload script exposing a typed `window.showxApi.shell` namespace.

Bridge:

```ts
// src/main/src/ipc/uiPanelBridge.ts
import { ipcMain } from 'electron';

export function registerUiPanelBridge(shell: ShellState) {
  ipcMain.handle('cuelist-core:shell.getState', async () => {
    const recentShows = await getRecentShows();
    const activeShow = shell.activeShow;
    return activeShow
      ? { kind: 'show-loaded', showName: activeShow.name, recentShows }
      : { kind: 'no-show' };
  });
  // ... openDemo, openExisting, createNew, openRecent handlers from B003-103
  // Plus shell.onShowChanged event emitter
}
```

### Preload

```ts
// src/main/src/ui/preload.ts (existing file — augment)
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('showxApi', {
  shell: {
    getState: () => ipcRenderer.invoke('cuelist-core:shell.getState'),
    openDemo: () => ipcRenderer.invoke('cuelist-core:open-demo'),
    openExisting: () => ipcRenderer.invoke('cuelist-core:open-file-picker'),
    createNew: () => ipcRenderer.invoke('cuelist-core:create-new'),
    openRecent: (path: string) => ipcRenderer.invoke('cuelist-core:open-recent', path),
    onShowChanged: (cb: () => void) => {
      ipcRenderer.on('cuelist-core:show-changed', cb);
      return () => ipcRenderer.removeListener('cuelist-core:show-changed', cb);
    },
  },
});
```

### PWA-side bridge resolver

```ts
// pwa/src/lib/uiPanelBridge.ts
export async function loadCuelistCorePanel() {
  // In production (packed app), cuelist-core UI ships in PWA bundle via the
  // Vite chunk mechanism (Forge: configure pwa/vite.config.ts to include
  // ../../src/modules/cuelist-core/dist/ui/* as inputs).
  // In dev, dynamic import resolves via Vite dev server.
  return await import('../../../src/modules/cuelist-core/dist/ui/index.js');
}
```

(Forge: pick the approach that fits Vite — could also use a vite plugin to alias the import.)

### App.tsx change

```tsx
if (mode === 'shell') return <ShellRouter />;
```

That's it.

### ShellRouter

```tsx
export function ShellRouter() {
  const [state, setState] = useState<ShellState | null>(null);
  const [panelExports, setPanelExports] = useState<PanelExports | null>(null);

  useEffect(() => {
    Promise.all([
      window.showxApi.shell.getState(),
      loadCuelistCorePanel(),
    ]).then(([s, exports]) => {
      setState(s);
      setPanelExports(exports);
    });
    return window.showxApi.shell.onShowChanged(() => {
      window.showxApi.shell.getState().then(setState);
    });
  }, []);

  if (!state || !panelExports) return <Loading />;
  if (state.kind === 'no-show') {
    return state.recentShows.length > 0
      ? <panelExports.RecentShowsList shows={state.recentShows} onOpen={openRecent} onOpenDemo={openDemo} onOpenExisting={openExisting} onCreateNew={createNew} />
      : <panelExports.FirstLaunchPicker onOpenDemo={openDemo} onOpenExisting={openExisting} onCreateNew={createNew} />;
  }
  return <panelExports.CuelistCorePanel showName={state.showName} />;
}
```

## Notes for Critic

- Verify `ShellRouter` switches correctly based on IPC state
- Verify preload exposes a typed API (TypeScript should be strict here)
- Verify Open Demo IPC chain emits show-changed event reliably
- Out of scope: cue grid rendering in CuelistCorePanel main area (deferred to B003-202)
- Non-blocking: vite plugin for alias resolution may need follow-up if dynamic import path resolution is brittle

## Why this matters

Without this task, ShowX shell window stays a placeholder. After this task, the user clicks "Open Demo Show" and sees the CuelistCorePanel with their show name, can switch to Devices/Routing tabs, and the wiring for next step (cue grid) is in place.
