---
id: "B003-304"
slug: "show_state_ipc"
title: "Show-state IPC — get-state ShowState shape + observe broadcast (fixes Demo Show 0-cues)"
status: "done"
round: 1
---

# B003-304 Done Report — Show-state IPC

## Files Changed

| File | Change |
|---|---|
| `src/main/src/ipc/cuelistCoreShowStateBridge.ts` | NEW — registers `cuelist-core/get-state` handler + observe-driven broadcast |
| `src/main/src/ipc/uiPanelBridge.ts` | MODIFIED — removed stub `cuelist-core/get-state` handler + removed `cuelist-core/show-state` broadcast from `openShow()` |
| `src/main/src/Shell.ts` | MODIFIED — added import + step 14 call to `registerShowStateBridge` |
| `tests/unit/ipc/cuelistCoreShowStateBridge.test.ts` | NEW — 8 tests covering all ACs |
| `src/modules/cuelist-core/dist/document/cuelist.d.ts` | NEW — hand-authored declaration file (was missing from dist/) |
| `src/modules/cuelist-core/dist/document/demoFactory.d.ts` | NEW — hand-authored declaration file (was missing from dist/) |

## Tests Run

```
 ✓ tests/unit/ipc/cuelistCoreShowStateBridge.test.ts  (8 tests) 16ms

 Test Files  112 passed + 3 pre-existing failures
      Tests  1261 passed | 11 failed (pre-existing)
```

All 8 new tests pass. Full suite: 1261 passed / 11 failed — all 11 failures are pre-existing (Shell.test `test:getPort` channel, skeleton.test ESM constructor issue, App.test.tsx timeout). None are related to this task.

## Key Implementation Decisions

1. **Cuelist data structure**: `getCuelists(doc)` returns `Y.Array<Y.Map<unknown>>` (not plain objects). Each map exposes `get('id')`, `get('name')`, and `get('cues')` (via `getCues()`). The bridge uses `.toArray()` + `.map()` to produce `CuelistSummary[]`.

2. **Observe target**: Used `getCuelists(doc)` (a `Y.Array`) for `observeDeep`, not `doc.getMap('cuelists')` (that key doesn't exist as a Y.Map). Y.Array supports `observeDeep` identically to Y.Map.

3. **Missing .d.ts files**: `cuelist.d.ts` and `demoFactory.d.ts` were absent from `dist/document/` (only `.d.ts.map` files existed). Authored minimal hand-written declarations matching the source TypeScript. Future tsc rebuild of cuelist-core will overwrite with generated versions.

4. **25-cue assertion**: Used `buildDemoDoc()` from `dist/document/demoFactory.js` which constructs the full demo Y.Doc with 25 cues via `projectionsToDoc`. Test explicitly asserts `cueCount === 25`.

5. **uiPanelBridge cleanup**: Removed both the `cuelist-core/get-state` stub handler AND the `cuelist-core/show-state` broadcast from `openShow()`. Only `cuelist-core:show-changed` remains in `openShow()`. All existing uiPanelBridge tests still pass unchanged.

## AC Verification

- ✅ `registerShowStateBridge(activeShow, ipc, logger)` exported from new file
- ✅ `cuelist-core/get-state` handler returns `ShowState` with `cuelist: CuelistSummary[]`
- ✅ `{ open: false }` returned when no show open
- ✅ Demo show returns 1 cuelist with `cueCount: 25` (explicit assertion in tests)
- ✅ `observeDeep` on `cuelists` Y.Array fires on cue add → updated count broadcast
- ✅ On open: broadcasts once immediately
- ✅ On close: broadcasts `{ open: false }` + unsubscribes observer
- ✅ Stub `cuelist-core/show-state` broadcast removed from `uiPanelBridge.ts`
- ✅ `registerShowStateBridge` wired in `Shell.ts` after `registerRoutingBridge`
- ✅ Logger `debug` call per get-state invocation with open/cuelistCount/totalCues
- ✅ `pnpm --filter showx-main typecheck` clean
- ✅ Tests pass

## Notes for Critic

- The 11 pre-existing test failures are unrelated to this task: `Shell.test` expects `test:getPort` channel (defined in IPC channels object but never registered, a pre-existing gap); `skeleton.test` fails with ESM default import error; `App.test.tsx` has a race/timeout.
- The `.d.ts` files I created are not build artifacts — they're hand-authored because the cuelist-core build wasn't run in this session. Future `tsc` rebuild of cuelist-core will overwrite them with correct generated versions (no regression risk).
- `isSm: true` is hardcoded per the existing pattern in the removed stub handler. Task spec documents this field; determining actual SM role is out of scope for this task.
