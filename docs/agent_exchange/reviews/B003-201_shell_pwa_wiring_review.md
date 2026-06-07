---
id: "B003-201"
critic_started_at: "2026-06-07T22:10:00Z"
critic_completed_at: "2026-06-07T22:25:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] `pwa/src/App.tsx` shell mode renders `<ShellRouter />` → pwa/src/App.tsx:53 (`if (mode === 'shell') return <ShellRouter />;`)
- [x] `ShellRouter` reads state via `window.showxApi.shell.getState()`; switches on `'no-show'` (FirstLaunchPicker / RecentShowsList) vs `'show-loaded'` (CuelistCorePanel) → pwa/src/components/ShellRouter.tsx:35-65; verified by tests/unit/pwa/ShellRouter.test.tsx:54-95 (3 routing tests)
- [x] FirstLaunchPicker / RecentShowsList / CuelistCorePanel exposed to PWA → src/modules/cuelist-core/src/ui/index.ts:1-6 exports; ShellRouter imports statically at pwa/src/components/ShellRouter.tsx:2 (acceptable substitute for runtime panel bridge per spec note "pick the approach that fits Vite")
- [x] Main exposes `cuelist-core/shell.getState` returning `{ kind: 'no-show', recentShows }` or `{ kind: 'show-loaded', showName, recentShows }` → src/main/src/ipc/uiPanelBridge.ts:78-88; verified by tests/unit/main/uiPanelBridge.test.ts:60-89
- [x] Open Demo Show end-to-end chain → FirstLaunchPicker calls `cuelist-core:open-demo` (showActions.ts:270 → handleOpenDemo at showActions.ts:132 copies bundle), then calls `cuelist-core/open-show` (uiPanelBridge.ts:101-105 → openShow at uiPanelBridge.ts:33), which broadcasts `cuelist-core:show-changed` (uiPanelBridge.ts:57). ShellRouter onShowChanged callback re-fetches state (ShellRouter.tsx:45-47). Slight deviation from spec (open-demo doesn't itself "open" the show; UI does the two-step) — functionally equivalent
- [x] RecentShowsList click → `cuelist-core/open-show` → `show-changed` event flow → RecentShowsList.tsx:137-139
- [x] FirstLaunchPicker `New From Scratch` → `cuelist-core:create-new` IPC → FirstLaunchPicker.tsx:167; handler at showActions.ts:268
- [x] CuelistCorePanel renders active show with header + status strip + Stations + Show/Devices/Routing tabs (per B003-101 already built; cue grid deferred to B003-202)
- [x] Preload exposes `window.showxApi.shell.{getState, openDemo, openExisting, createNew, openRecent, onShowChanged}` → src/main/src/ui/preload.ts:28-46
- [x] Tests cover routing, bridge resolver, IPC handler state shape → tests/unit/pwa/ShellRouter.test.tsx (6 tests); tests/unit/pwa/lib/uiPanelBridge.test.ts (7 tests); tests/unit/main/uiPanelBridge.test.ts (6 tests); tests/unit/pwa/App.test.tsx shell-mode renamed test
- [x] No new regressions in full suite. Pre-existing failures (Shell.test.ts `test:getPort`, App.test.tsx pairing-flow timeout, cueCatalog.test.ts atomic-write race) documented in B003-103 done report and unchanged by this task. Full suite: 3 failed (all pre-existing) | 1176 passed.
- [x] TypeScript strict typecheck clean — `pnpm --filter showx-pwa typecheck` and `pnpm --filter showx-main typecheck` both succeed.

## Code review notes

**Architecture choice — static import**: ShellRouter uses a relative static import (`'../../../src/modules/cuelist-core/src/ui/index.js'`) rather than a runtime panel bridge. This works because Vite resolves it at build time and includes cuelist-core UI in the PWA bundle (verified: `pnpm --filter showx-pwa build` succeeds, output 282 kB). Spec explicitly allowed this approach. Removing `rootDir: "src"` from pwa/tsconfig.json is the necessary tradeoff. Reasonable for ShowX-3.2; a follow-up to publish cuelist-core as `@showx/module-cuelist-core/ui` package import would tidy this.

**IPC channel set**: `registerUiPanelBridge` registers `cuelist-core/shell.getState`, `cuelist-core/get-state`, `cuelist-core/open-show`, `cuelist-core:open-recent`, plus stubs for `cuelist-core/transition-mode` and `cuelist-core/kick-station`. The `cuelist-core:open-demo`, `cuelist-core:open-file-picker`, `cuelist-core:create-new` channels are registered separately by `registerShowActions` (showActions.ts:266-270). Both registrations are wired through registerIpcHandlers → registerShowActions → registerUiPanelBridge in Shell.ts:373-377. No channel collisions.

**`_activeShow` module-level state**: This is a singleton mirror of the loaded show. Acceptable for ShowX-3.2 single-window scope; means the test file `tests/unit/main/uiPanelBridge.test.ts` relies on vitest's sequential test-within-file execution. Fragile but not currently broken — would become problematic if the file is ever flipped to concurrent or randomized.

**Code duplication**: `getRecents()` exists in both `showActions.ts:25-32` (zod-validated) and `uiPanelBridge.ts:60-72` (typeof-checked). Both return the same shape from the same RECENT_KEY. Could be consolidated in a follow-up.

**`shell.openRecent` exposed but unused by UI**: The preload signature `shell.openRecent` maps to `'cuelist-core:open-recent'`, which is registered, but no component invokes it; RecentShowsList uses `cuelist-core/open-show` directly. Per done report this is intentional (programmatic API). Acceptable.

**`transition-mode` / `kick-station` stubs**: Both return `{ ok: true }` without broadcasting a `show-state` update. CuelistCorePanel's mode toggle and station-kick buttons will appear to do nothing in shell mode. Acceptable since CuelistCorePanel's spec deferred those interactions to later bundles; merely flagging that real wiring is a follow-up.

**openShow title/mode extraction**: `openShow` reads `show.json` once at open time to extract title and mode. Subsequent edits to show.json don't trigger re-broadcast. Adequate for now since meta edits aren't yet wired through B003-201.

**Preload migration of menu-driven open-show**: preload.ts:60-64 catches the legacy push event `cuelist-core/open-show` emitted by buildAppMenu and re-invokes the IPC handler. Clean migration path — menu clicks now flow through `openShow()` and broadcast `show-changed`, consistent with FirstLaunchPicker path.

## Verdict rationale

All 11 acceptance criteria are observable in the diff or the test suite. The 3 test failures in the full suite are all pre-existing and were called out as such in the B003-103 done report (Shell.test.ts `test:getPort`, App.test.tsx pairing two-phase timeout, cueCatalog.test.ts atomic-write race); none are introduced by this task. TypeScript and PWA build are clean. The static-import architecture and `_activeShow` module-level state are documented tradeoffs that are acceptable for ShowX-3.2 scope and worth carrying as known follow-ups, not blockers.

Accepted.
