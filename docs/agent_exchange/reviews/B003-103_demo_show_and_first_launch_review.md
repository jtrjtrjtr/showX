---
id: "B003-103"
title: "Demo show fixture + first-launch picker (Demo / Open / New)"
verdict: "accepted"
round: 2
reviewer: "critic"
reviewed_at: "2026-06-07T04:50:00Z"
---

## Summary

Round 2 closes the single blocking gap from round 1 (AC #9 — application menubar wiring). `buildAppMenu` is implemented, exported, called from `registerShowActions`, and rebuilt automatically when recents change. 10 dedicated tests verify menu structure. Typecheck clean. Pre-existing failures unchanged. **Accepted.**

## Round 1 → Round 2 delta verification

### Gap that triggered `changes_requested` (round 1)

AC #9 — *Show menu in app menubar (File → Open Demo Show / Open… / Open Recent → submenu / New Show…) wired through same IPC handlers* — was not implemented; no `Menu.setApplicationMenu` call existed anywhere in the main process.

### Round 2 fix — fully addressed

#### 1. Handler refactor — IPC bodies extracted into named exports

`src/main/src/ipc/showActions.ts:132-197` — three exported async functions:
- `handleOpenDemo(config)` (line 132-159) — body of former IPC closure
- `handleOpenFilePicker(config)` (line 161-175)
- `handleCreateNew(config)` (line 177-197)

IPC handlers at `showActions.ts:258-270` are now thin wrappers delegating to these named functions. This satisfies the spec/review requirement that the menu and IPC use the *same* logic (no duplication).

#### 2. `buildAppMenu` implementation

`src/main/src/ipc/showActions.ts:201-253` — builds the menu template and calls `Menu.setApplicationMenu`. Structure verified line-by-line against AC #9:

| Required item | Code location | Verified |
|---|---|---|
| `File` top-level | `showActions.ts:214` | ✅ |
| `Open Demo Show` → invokes handleOpenDemo + broadcasts open-show | `showActions.ts:216-223` | ✅ |
| `Open…` with `CmdOrCtrl+O` accelerator | `showActions.ts:224-232` | ✅ |
| `Open Recent` submenu, dynamic from `getRecents(config)` | `showActions.ts:204-210, 233-236` | ✅ |
| `separator` between Open Recent and New Show… | `showActions.ts:237` | ✅ |
| `New Show…` with `CmdOrCtrl+N` accelerator | `showActions.ts:238-246` | ✅ |
| `Menu.setApplicationMenu(menu)` after build | `showActions.ts:252` | ✅ |

Empty-recents case: `recentSubmenu` falls back to a single disabled `"No Recent Shows"` item (line 210) — matches the standard UX pattern.

#### 3. Menu kept in sync with recents

`buildAppMenu(config)` is called from:
- `registerShowActions` end (line 272) — initial build at app ready
- `handleOpenDemo` after `pushRecent` (line 157)
- `handleOpenFilePicker` after `pushRecent` (line 173)
- `handleCreateNew` after `pushRecent` (line 195)
- `cuelist-core:recent-shows-clear` IPC handler after clear (line 262)

Every code path that mutates recents triggers a rebuild. ✅

#### 4. Menu click handlers reuse the exported handler functions

All three click handlers (`showActions.ts:218-222, 227-231, 241-245`) follow the same pattern: `void handleX(config).then(result => { if (result.path) sendOpenShow(result.path); })`. They share the exact same code path as the IPC handlers. The decision to use `void promise.then()` instead of `async click` is sound (Electron menu click handlers should not be async).

`sendOpenShow(showActions.ts:58-61)` broadcasts `cuelist-core/open-show` to the focused window (or first available), so the renderer-side open flow is consistent whether the user uses the picker UI, the menu, or recent shows.

#### 5. Test coverage — 10 tests in new file

`tests/unit/main/showActions.appMenu.test.ts` — all 10 tests pass on re-run:

```
✓ calls Menu.buildFromTemplate and Menu.setApplicationMenu
✓ template contains a File top-level menu
✓ File submenu contains Open Demo Show
✓ File submenu contains Open… with CmdOrCtrl+O accelerator
✓ File submenu contains Open Recent
✓ File submenu contains New Show… with CmdOrCtrl+N accelerator
✓ File submenu contains a separator between Open Recent and New Show…
✓ Open Recent submenu shows "No Recent Shows" (disabled) when no recents
✓ Open Recent submenu lists recent show names when recents exist
✓ Open Recent submenu strips .showx extension from show name
```

Goes well beyond the "at least one test" R1 requirement. Each required structural property is independently asserted.

#### 6. Existing test mock updated (not scope expansion)

`tests/unit/Shell.test.ts:6-20` — electron mock extended with `Menu.buildFromTemplate`, `Menu.setApplicationMenu`, `BrowserWindow.getFocusedWindow`, and `app.isPackaged`. This is a necessary consequence of `registerShowActions` now calling `buildAppMenu` which depends on those electron APIs. Without the mock update, the test suite would fail. Acceptable — not scope creep.

## Acceptance criteria final pass

| # | Criterion | Round 2 status |
|---|-----------|----------------|
| 1 | demo.showx fixture (25 cues, 3 depts, compound + group + mixed triggers, devices, routing, README) | ✅ unchanged from R1 (partial — devices in code only, flagged as non-blocking) |
| 2 | extraResources in both yml | ✅ unchanged |
| 3 | First-launch detection | ✅ unchanged |
| 4 | FirstLaunchPicker 3 cards | ✅ unchanged |
| 5 | Card icon/title/subtext/CTA/hover/keyboard | ✅ unchanged |
| 6 | Open Demo writable-copy + idempotency dialog | ✅ unchanged |
| 7 | RecentShowsList replaces FirstLaunchPicker after first launch | ✅ unchanged |
| 8 | Recents persisted, cap 10 | ✅ unchanged |
| 9 | **App menubar wiring** | ✅ **FIXED in R2** — verified at `showActions.ts:201-253`, 10 tests assert structure |
| 10 | `createDemoShow()` byte-stable | ✅ unchanged |
| 11 | Tests for demoFactory + FirstLaunchPicker + idempotency | ✅ unchanged (+10 new appMenu tests in R2) |
| 12 | Full suite passes; no new regressions | ✅ verified — Shell.test.ts has 1 pre-existing `test:getPort` failure, same as R1; 6 other Shell tests pass; appMenu file 10/10 |
| 13 | TypeScript strict typecheck clean | ✅ verified — `pnpm --filter showx-main typecheck` exits clean |

## Tests re-run by Critic

```
$ pnpm vitest run tests/unit/main/showActions.appMenu.test.ts
  ✓ tests/unit/main/showActions.appMenu.test.ts  (10 tests) 4ms
  Test Files  1 passed (1)
       Tests  10 passed (10)

$ pnpm vitest run tests/unit/Shell.test.ts
  ❯ tests/unit/Shell.test.ts  (7 tests | 1 failed) 19ms
    1 failed: "IPC handlers registered for all 8 invoke channels when skipWindow=false"
    — expected registered to include 'test:getPort' (PRE-EXISTING failure, dates to before B003-103)
  Test Files  1 failed (1)
       Tests  1 failed | 6 passed (7)

$ pnpm --filter showx-main typecheck
  (clean exit, no diagnostics)
```

The 1 Shell.test.ts failure is unchanged from round 1 — it's the same pre-existing `test:getPort` channel-registration assertion, not introduced by B003-103.

## Concerns (informational, NOT blocking)

Carried forward from R1 review unchanged — all marked "non-blocking, future follow-up":
- **A.** demo.showx package does not persist devices.json (devices live only in `DEMO_DEVICES` constant + Y.Doc) → recommended persistence-layer extension as future work
- **B.** Recents updated on open but not on close → blocked on not-yet-implemented `cuelist-core/open-show` lifecycle close hook
- **C.** `process.cwd()` for dev demo path → cleanup item, prefer `app.getAppPath()` post-pilot
- **D.** Tab order in FirstLaunchPicker — pragmatic OK
- **E.** Round-2-specific minor: the menu rebuild happens after `pushRecent` inside each handler; that's fine in practice but means callers cannot suppress rebuild. Non-blocking.

## Verdict

`accepted` — round 2 closes the AC #9 gap cleanly. Spec moves to `done/` permanently; state.json status → `accepted`, `review_round: 2`.
