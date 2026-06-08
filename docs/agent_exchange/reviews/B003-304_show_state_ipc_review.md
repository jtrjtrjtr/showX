---
id: "B003-304"
critic_started_at: "2026-06-08T00:55:00Z"
critic_completed_at: "2026-06-08T01:08:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

(No standalone `queued/B003-304_*.md` spec file exists. Criteria sourced from the bundle decision note `decisions/2026-06-07_showx_3_3_bundle_open.md:34` — "Cuelist show-state IPC (get-state ShowState shape + show-state observe broadcast) — fixes '0 cues'" — combined with the bundle's enumerated channels at `decisions/2026-06-07_showx_3_3_bundle_open.md:24` (`cuelist-core/get-state` + `show-state` observe broadcast), plus the structural precedent set by sibling `queued/B003-303_routing_ipc_bridge.md` and the bundle's success criteria at `decisions/2026-06-07_showx_3_3_bundle_open.md:57` ("Cuelist tab shows 25 cues (not 0)"). Forge's done report's "AC Verification" section was treated as a checklist to verify, not as authoritative criteria.)

- [x] **New file `src/main/src/ipc/cuelistCoreShowStateBridge.ts` exports `registerShowStateBridge(activeShow, ipc = ipcMain, logger)`** → `cuelistCoreShowStateBridge.ts:50-54`. Signature matches sibling bridges: `activeShow: ActiveShowDoc, ipc: IpcMainBridge = ipcMain, logger: Logger`.
- [x] **`cuelist-core/get-state` invoke handler returns a `ShowState` with `cuelist: CuelistSummary[]`** → `cuelistCoreShowStateBridge.ts:55-63`. Shape: `{ open, pkgPath?, title?, mode?, isSm?, cuelist? }` defined `cuelistCoreShowStateBridge.ts:16-23`; `CuelistSummary` = `{ id, name, cueCount }` at `cuelistCoreShowStateBridge.ts:10-14`. Test `cuelistCoreShowStateBridge.test.ts:114-129` asserts populated `cuelist[0].cueCount === 25` for demo show.
- [x] **`{ open: false }` returned when no show is open** → `cuelistCoreShowStateBridge.ts:26-28` (`if (!doc || !meta) return { open: false };`). Test `cuelistCoreShowStateBridge.test.ts:88-96`.
- [x] **Demo show returns 1 cuelist with `cueCount: 25`** (fixes the "Demo Show — 0 cues" bug from the bundle decision note) → Test `cuelistCoreShowStateBridge.test.ts:115-129`. Uses `buildDemoDoc()` from `dist/document/demoFactory.js` and explicitly asserts `state.cuelist![0].cueCount === 25`.
- [x] **`observeDeep` on cuelists Y.Array fires on cue add → updated count broadcast** → `cuelistCoreShowStateBridge.ts:70-73`. The observer is attached to `getCuelists(doc)` (a `Y.Array<Y.Map>`, not `doc.getMap('cuelists')` — `Y.Array` supports `observeDeep` symmetrically). Test `cuelistCoreShowStateBridge.test.ts:181-239` (`observe broadcast on mutation`) pushes a 3rd cue and verifies the last `show-state` broadcast payload reports `cueCount: 3`.
- [x] **On open: broadcast once immediately so UI gets cuelist counts without invoking get-state** → `cuelistCoreShowStateBridge.ts:75`. Test `cuelistCoreShowStateBridge.test.ts:152-176` confirms `mockSend` receives `cuelist-core/show-state` after `activeShow.open(...)` with `cuelist[0].cueCount === 25`.
- [x] **On close: broadcast `{ open: false }` + unsubscribe observer** → `cuelistCoreShowStateBridge.ts:76-80`. Tests `cuelistCoreShowStateBridge.test.ts:245-262` (close broadcasts `{ open: false }`) and `:264-300` (post-close mutation does NOT trigger any further `show-state` broadcasts — `expect(showStateCalls).toHaveLength(0)`).
- [x] **Stub `cuelist-core/get-state` handler removed from `uiPanelBridge.ts`** → `git diff src/main/src/ipc/uiPanelBridge.ts` shows `-  ipc.handle('cuelist-core/get-state', ...)` (~10 lines removed). Current file has zero `get-state` registrations: `grep get-state src/main/src/ipc/uiPanelBridge.ts` → no match.
- [x] **Stub `cuelist-core/show-state` broadcast removed from `uiPanelBridge.openShow()`** → `uiPanelBridge.ts:14-19`. `openShow()` now only calls `await activeShow.open(showPath)` and `broadcastToAll('cuelist-core:show-changed')`. The inline comment at `uiPanelBridge.ts:16-17` correctly documents the ownership transfer to `registerShowStateBridge`.
- [x] **`registerShowStateBridge` wired in `Shell.ts` after `registerRoutingBridge`** → `Shell.ts:391`. Boot order in step 14 is `registerUiPanelBridge` (388) → `registerDeviceBridge` (389) → `registerRoutingBridge` (390) → `registerShowStateBridge` (391). Also import at `Shell.ts:38`.
- [x] **Logger `debug` per `get-state` invocation with `open`, `cuelistCount`, `totalCues`** → `cuelistCoreShowStateBridge.ts:57-61`. Test `cuelistCoreShowStateBridge.test.ts:98-109` verifies the exact shape: `{ open: false, cuelistCount: 0, totalCues: 0 }` for no-show case.
- [x] **`pnpm --filter showx-main typecheck` clean** → Verified independently. `pnpm --filter showx-main typecheck` exits 0; `showx-shared` builds, `tsc --noEmit` returns no errors.
- [x] **Tests pass** → Verified independently:
  ```
  ✓ tests/unit/ipc/cuelistCoreShowStateBridge.test.ts  (8 tests) 17ms
  ✓ tests/unit/ipc/cuelistCoreDeviceBridge.test.ts     (19 tests)
  ✓ tests/unit/ipc/cuelistCoreRoutingBridge.test.ts    (18 tests)
  ✓ tests/unit/runtime/ActiveShowDoc.test.ts           (24 tests)
  Tests  69 passed (69)
  ```
  The 11 pre-existing failures Forge documented (Shell.test `test:getPort` channel, `skeleton.test` ESM default-import, `App.test.tsx` race) are unrelated to this task — none touch the show-state surface or any file modified by B003-304.

## Code review notes

### Strengths

1. **Observer attached to the correct Y.Array** — `getCuelists(doc)` returns the live `Y.Array<Y.Map>` used as the cuelists store. The done report's note (#2) about not using `doc.getMap('cuelists')` is correct: `cuelists` is keyed on a Y.Array, not a Y.Map. `Y.Array.observeDeep` fires on shallow array changes (push/delete) and on any nested Y.Map mutation inside cuelists/cues — exactly the surface this bridge cares about for cue count.
2. **Open-time immediate broadcast** (`cuelistCoreShowStateBridge.ts:75`) closes the race the bundle decision flagged: the previous flow relied on the renderer invoking `cuelist-core/get-state`, but a stale observer or panel mount timing could leave the UI showing "0 cues" until the user manually refreshed. Firing one broadcast on `'opened'` collapses that window to zero.
3. **Close-time teardown is leak-safe** — `unsub?.()` runs before the empty broadcast (`cuelistCoreShowStateBridge.ts:77-79`); the closure holds the prior `cuelistsArr` reference captured at open time, so unsubscription doesn't depend on `activeShow.getDoc()` (which `ActiveShowDoc.close()` nulls out before notifying listeners — see `ActiveShowDoc.ts:104,109`).
4. **`uiPanelBridge` cleanup is surgical** — only the stub `get-state` handler and the inline `show-state` broadcast are removed; the existing 6 `uiPanelBridge.test.ts` tests still pass unchanged (verified independently). Ownership comment at `uiPanelBridge.ts:16-17` documents the transfer.
5. **Test for post-close non-broadcast** (`cuelistCoreShowStateBridge.test.ts:264-300`) is the kind of regression check that catches future refactors that accidentally drop the unobserve call. Asserts `expect(showStateCalls).toHaveLength(0)` after a mutation following close — strong guarantee.

### Observations (non-blocking)

1. **Hand-written `.d.ts` files** — `src/modules/cuelist-core/dist/document/cuelist.d.ts` (+) and `demoFactory.d.ts` (+) are local-only (`.gitignore:6` excludes `dist/`) and exist to make `tsc` resolve types for the relative `dist/document/*.js` imports. Same precedent as B003-301 (`showxPackage.d.ts`), B003-302 (`devices.d.ts`), B003-303 (`routing.d.ts`). Done report (#3) flags this. Medium-term fix: either (a) run `tsc --build` on cuelist-core in the build chain, or (b) extend `@showx/module-cuelist-core`'s exports map to cover `./document/cuelist` + `./document/demoFactory`. Out of scope for this task.
2. **`isSm: true` hardcoded** at `cuelistCoreShowStateBridge.ts:35` — done report (#5) and bundle decision note ("SHOW mode lock UI integration ... separate task post-3.3") both explicitly defer SM-role determination. Acceptable for ShowX-3.3; ratchet to come from pairing/role state in a future bundle.
3. **`cuelist-core/show-state` close broadcast omits some keys** — `broadcastShowState({ open: false })` at `cuelistCoreShowStateBridge.ts:79` is missing `pkgPath`/`title`/`mode`/`cuelist`. Matches the `ShowState` type (all optional) and the no-show return path on line 28 — symmetric, intentional. Renderer should treat `open: false` as "clear all show-derived UI state."
4. **Double-broadcast inside open() lifecycle** — `cuelistCoreShowStateBridge.ts:75` broadcasts once explicitly on `'opened'`; the immediately-following `cuelistsArr.observeDeep(handler)` may not fire on the initial state alone (Yjs only fires on deltas). So the explicit fire is necessary, not redundant. Good.
5. **No explicit handler for `'mutated'` `ChangeKind`** — `ActiveShowDoc.onChange` listener at `cuelistCoreShowStateBridge.ts:67` only branches on `'opened'` / `'closed'`. The `'mutated'` event (fired by `ActiveShowDoc` debounced autosave at `ActiveShowDoc.ts:134`) is correctly ignored here because the `observeDeep` already covers any underlying doc change — no double-firing. Symmetric with B003-302 / B003-303 bridges.

### Out-of-scope file edits (informational, not introduced by this task)

Working tree shows modifications to `src/modules/cuelist-core/index.js`, `src/modules/cuelist-core/manifest.json`, `src/modules/cuelist-core/src/index.ts`, `tests/fixtures/showx/sample-show.showx/history.jsonl`, `electron-builder-unsigned.yml`, `package.json`, `src/main/package.json`. These are pre-existing changes from the v0.1.4-v0.1.6 fix series and prior tasks in this bundle (flagged in B003-302 review observation #5); not introduced by B003-304. Verified via `git log` — most recent uiPanelBridge.ts commit was f0b2959 (B003-201), so all uncommitted edits to that file come from B003-301..304.

## Verdict rationale

All 13 derived acceptance criteria are satisfied with file:line evidence. Independent typecheck and test runs confirm Forge's claims (typecheck clean, 8/8 new tests pass, 69/69 IPC+runtime tests pass, no new regressions in `uiPanelBridge.test.ts`). The bridge's observe wiring is leak-safe and symmetric with B003-302 / B003-303 (same `unsub` closure pattern, same `ipc.handle` arity, same `BrowserWindow.getAllWindows` broadcast helper). The Shell.ts wiring is in the correct position (step 14, after the prior three bridges, all inside `!skipWindow`). The "Demo Show — 0 cues" bug — the primary regression target named in the bundle decision note — is directly addressed by the open-time immediate broadcast at `cuelistCoreShowStateBridge.ts:75` combined with the live `observeDeep` on `getCuelists(doc)`.

The two carryover observations (hand-written `.d.ts` files; `isSm` hardcoded) are bundle-wide hygiene items already disclosed in prior B003-301/302/303 reviews and explicitly deferred in the ShowX-3.3 bundle out-of-scope list.

**Accepted, round 1.** ShowX-3.3 bundle complete (B003-301 ✅ + B003-302 ✅ + B003-303 ✅ + B003-304 ✅).
