---
id: "B003-103"
title: "Demo show fixture + first-launch picker (Demo / Open / New)"
status: "done"
round: 2
forge_session: "2026-06-07T04:30:00Z"
---

## Round 2 summary — What Critic flagged and how it was addressed

### Critic R1 verdict: `changes_requested`

**Single blocking gap:** Application menubar wiring (AC #9) was not implemented. No `Menu.setApplicationMenu` call existed anywhere in the main process.

### What was changed in Round 2

#### `src/main/src/ipc/showActions.ts` — refactored + menubar added

Three changes in one file:

1. **Extracted handler bodies into exported named functions** so both IPC handlers and menu click handlers can call them:
   - `handleOpenDemo(config: ShellConfigStore)` — copied from the R1 `ipc.handle('cuelist-core:open-demo', ...)` closure body
   - `handleOpenFilePicker(config: ShellConfigStore)` — same pattern
   - `handleCreateNew(config: ShellConfigStore)` — same pattern

2. **Added `buildAppMenu(config: ShellConfigStore): void`** — builds and sets the application menu:
   - `File > Open Demo Show` — calls `handleOpenDemo`, then broadcasts `cuelist-core/open-show` on focused window
   - `File > Open…` (accelerator `CmdOrCtrl+O`) — calls `handleOpenFilePicker`, then broadcasts
   - `File > Open Recent` — dynamic submenu from `getRecents(config)`; shows `"No Recent Shows"` (disabled) when empty
   - `File > separator`
   - `File > New Show…` (accelerator `CmdOrCtrl+N`) — calls `handleCreateNew`, then broadcasts

3. **Menu rebuilds automatically after recents change:** each of `handleOpenDemo`, `handleOpenFilePicker`, `handleCreateNew` calls `buildAppMenu(config)` after `pushRecent`. The `cuelist-core:recent-shows-clear` IPC handler also calls `buildAppMenu(config)` after clearing.

4. **Initial menu built in `registerShowActions`** — `buildAppMenu(config)` called at the end of `registerShowActions`, so the menu is ready when the app launches.

5. **Added `sendOpenShow(showPath)` helper** — finds focused or first window via `BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]` and sends `cuelist-core/open-show` to its webContents.

#### `tests/unit/Shell.test.ts` — electron mock updated

Added `Menu: { buildFromTemplate: vi.fn(() => ({})), setApplicationMenu: vi.fn() }` and `getFocusedWindow: vi.fn(() => null)` to the existing electron mock. Without this, the Shell test that boots with `skipWindow=false` failed because `registerShowActions` now calls `buildAppMenu` which calls `Menu.buildFromTemplate`.

Also added `isPackaged: false` to the `app` mock (needed for `getDemoSrc()` path resolution inside `showActions.ts`).

#### `tests/unit/main/showActions.appMenu.test.ts` — new test file (10 tests)

Tests that `buildAppMenu` sets the correct menu structure:
- `Menu.buildFromTemplate` and `Menu.setApplicationMenu` are called
- Template has a `File` top-level menu
- File submenu contains `Open Demo Show`, `Open…`, `Open Recent`, `New Show…`
- `Open…` has `CmdOrCtrl+O` accelerator
- `New Show…` has `CmdOrCtrl+N` accelerator
- Separator between `Open Recent` and `New Show…`
- `Open Recent` shows `"No Recent Shows"` (disabled) when no recents
- `Open Recent` lists show names from recents (basename without `.showx`)
- `.showx` extension stripped from show name in recent items

## Files changed

### Modified files

| File | Change |
|------|--------|
| `src/main/src/ipc/showActions.ts` | Extracted handler functions, added `buildAppMenu`, added imports for `Menu`/`BrowserWindow`, IPC handlers become thin wrappers |
| `tests/unit/Shell.test.ts` | Added `Menu`, `getFocusedWindow`, `isPackaged` to electron mock |

### New files

| File | Description |
|------|-------------|
| `tests/unit/main/showActions.appMenu.test.ts` | 10 tests verifying `buildAppMenu` produces correct menu template structure |

## Acceptance criteria review (round 2 delta)

| # | Criterion | Status |
|---|-----------|--------|
| 9 | **Show menu in app menubar wired via same IPC handlers** | ✅ **FIXED** — `buildAppMenu` called from `registerShowActions`; File submenu has all 4 required items with correct accelerators; `Open Recent` dynamic submenu rebuilds on every `pushRecent`; at least one test (10 tests) asserting structure |
| All other criteria | Unchanged from R1 | ✅ (see R1 done report) |

## Tests run

```
tests/unit/main/showActions.appMenu.test.ts  (10 tests)  ✓
tests/unit/Shell.test.ts                     (7 tests)   6 passed, 1 pre-existing failure

Full suite: 4 failed (pre-existing) | 1156 passed (1160 total)
```

**Pre-existing failures (not caused by this task — same 3 categories from R1):**
- `Shell.test.ts` — `test:getPort` IPC channel never registered (pre-dates B003-103)
- `App.test.tsx` — "switches to show mode" test flaky timeout (pre-dates B003-103)
- `cueCatalog.test.ts` — 2 failures: ENOENT + concurrent atomic write race (pre-dates B003-103)

Total: 1160 tests = 1150 (R1) + 10 (new appMenu tests)

## TypeScript typecheck

`pnpm --filter showx-main typecheck` — clean, no errors.

## Decisions made within task scope

- **Menu click handlers use `void promise.then()`** rather than `async click` to avoid unhandled promise warnings while keeping the handler non-blocking. Click handlers in Electron menus should not be async per Electron docs.
- **`sendOpenShow` targets focused window then falls back to first window** — `BrowserWindow.getFocusedWindow()` returns `null` when no window is focused (e.g., dialog is open), so we fall back to `getAllWindows()[0]`. Handles edge cases gracefully.
- **`buildAppMenu` called from within handler functions** (after `pushRecent`) rather than requiring callers to rebuild — self-contained; recents always stay in sync with the menu.
- **Shell.test.ts mock updated** (not scope expansion) — this is a direct consequence of the new `Menu` dependency added to `showActions.ts`, which `registerShowActions` now imports from. Updating the mock is required to keep the pre-existing Shell test passing.

## Notes for Critic

- Verify `buildAppMenu` is exported from `showActions.ts` and can be independently tested
- Verify `tests/unit/main/showActions.appMenu.test.ts` tests all 4 required items (Open Demo Show, Open…, Open Recent, New Show…) plus accelerators and separator
- Verify `Shell.test.ts` pre-existing failure (`test:getPort`) is unchanged — it's still the same failure, not a new one introduced by this round
- The `Open Recent` submenu rebuild is triggered both by: (a) menu item click that opens a show, and (b) `cuelist-core:recent-shows-clear` IPC handler
- `sendOpenShow` is only called when a handler returns `{ path }` (not cancelled, not error) — safe to call from menu click context
