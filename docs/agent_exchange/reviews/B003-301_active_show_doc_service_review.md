---
id: "B003-301"
critic_started_at: "2026-06-07T23:20:00Z"
critic_completed_at: "2026-06-07T23:30:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **`ActiveShowDoc` exports `open`, `close`, `getDoc`, `getPkgPath`, `getActiveShow`, `onChange`** → `src/main/src/runtime/ActiveShowDoc.ts:43-115`. All six methods present with the right signatures.
- [x] **`open(pkgPath)` calls `openShowxPackage` + reads title/mode from `show.json`** → `ActiveShowDoc.ts:58` (open) + `ActiveShowDoc.ts:64-72` (zod-validated parse with sensible fallback to basename + `'rehearsal'`).
- [x] **Double-open flushes and closes prior show** → `ActiveShowDoc.ts:56` (`if (this.meta) await this.close();`). `close()` itself awaits `saveShowxPackage` when `dirty` (lines 95-98). Verified by test `tests/unit/runtime/ActiveShowDoc.test.ts:128-151` ("flushes dirty save from prior show on double-open").
- [x] **350 ms debounced save on Y.Doc `update`** → `ActiveShowDoc.ts:22` (`SAVE_DEBOUNCE_MS = 350`), `ActiveShowDoc.ts:78-80` (handler reg), `ActiveShowDoc.ts:117-121` (`scheduleSave` clears prior timer + sets new one). Coalescing verified by `ActiveShowDoc.test.ts:205-222` (three rapid edits → one save).
- [x] **`close()` flushes pending dirty save before clearing state** → `ActiveShowDoc.ts:95-98`. Verified by `ActiveShowDoc.test.ts:278-296`.
- [x] **`onChange` fires `opened` / `mutated` / `closed`, returns unsubscribe fn** → `ActiveShowDoc.ts:83` (`opened`), `ActiveShowDoc.ts:134` (`mutated` after save resolves), `ActiveShowDoc.ts:109` (`closed`), `ActiveShowDoc.ts:112-115` (unsubscribe). Sequence test at `ActiveShowDoc.test.ts:345-359`.
- [x] **`uiPanelBridge.ts` delegates to `activeShow`; `openShow(path, activeShow)` refactored** → `src/main/src/ipc/uiPanelBridge.ts:14-26` (openShow signature), no `_activeShow` local var remains, every handler reads from the injected singleton (lines 47-86). 6 modified tests pass.
- [x] **Shell.ts boot step 13 creates singleton + `setActiveShowDoc`; shutdown calls `activeShow.close()`** → `src/main/src/Shell.ts:363-365` (creation + register), `Shell.ts:394` (`safeCall(() => this.activeShow?.close())` ordered BEFORE `modules.stopAll()` so module shutdowns see a flushed/closed show).
- [x] **`getActiveShowDoc()` exported from `runtime/index.ts` for B003-302/303/304** → `src/main/src/runtime/index.ts:11-13`.
- [x] **Logger calls** → `ActiveShowDoc.ts:82` (`active_show.opened { pkgPath }`), `ActiveShowDoc.ts:108` (`active_show.closed { pkgPath, savedDirty }`), `ActiveShowDoc.ts:130-133` (`active_show.autosave { pkgPath, durationMs }`).
- [x] **Typecheck clean** → `pnpm --filter showx-main typecheck` ran clean (only re-built `showx-shared`, no TS errors).
- [x] **New + modified tests pass** → Verified independently:
  ```
  ✓ tests/unit/main/uiPanelBridge.test.ts  (6 tests) 11ms
  ✓ tests/unit/runtime/ActiveShowDoc.test.ts  (24 tests) 21ms
  Test Files  2 passed (2)
       Tests  30 passed (30)
  ```

## Code review notes

### Strengths

1. **Race handling on close() during in-flight save** — `flushSave` flips `this.dirty = false` and nulls `saveTimer` *before* the `await saveShowxPackage` (lines 127-128). `close()` then sees `dirty === false` and skips a second save. Solid.
2. **zod-guarded show.json parsing** — `ShowMetaZ.safeParse` (lines 24-31) with try/catch wrapping `JSON.parse` means a malformed `show.json` won't crash open; it falls back to basename title + rehearsal mode. Defensive without being noisy.
3. **Listener iteration is snapshot-safe enough for current use** — `forEach` over a `Set<ChangeListener>`. No re-entrant `onChange` calls observed in callers.
4. **uiPanelBridge cleanup is thorough** — every handler now reads from the injected `activeShow`; no leftover module-level state. Tests cover the no-show, recents, and post-open paths.

### Observations (non-blocking)

1. **`mutated` can fire after `closed` under contention.** If `close()` is invoked while `flushSave()` is mid-`await saveShowxPackage`, the `await close()` resolves and fires `'closed'`, then the in-flight `flushSave` continues and fires `'mutated'` afterward. Listener contract isn't strict about cross-operation ordering and the in-flight save completes correctly, so this isn't a correctness bug — but consumers (B003-302/303/304 observers) should treat post-`closed` events as no-ops. Worth a tracker comment in the next bundle.
2. **`dist/` import path coupling** — `ActiveShowDoc.ts:5-8` imports from `../../../modules/cuelist-core/dist/persistence/showxPackage.js`. The hand-written `dist/persistence/showxPackage.d.ts` matches the source exports (`openShowxPackage`, `saveShowxPackage`, `OpenResult`, `SaveOpts`, `UnsupportedFormatError`) and is gitignored (`.gitignore:6 dist/`). The done report flags this as a temporary hack pending a proper `tsc --build` of cuelist-core. Acceptable for ShowX-3.3, but the workspace package exports map should be the medium-term fix.
3. **`getActiveShow().mode` defaults to `'rehearsal'`** — fine. The mode persistence path (REHEARSAL ↔ SHOW transition) is owned by `cuelist-core/transition-mode`, which currently no-ops in `uiPanelBridge.ts:84`. Out of scope for this task.
4. **Out-of-scope dirty changes in tree** — `src/modules/cuelist-core/{index.js,manifest.json,src/index.ts}` are modified in the working tree but not in B003-301's `files_changed`. These appear pre-existing (module-loader compat fixes) and don't affect B003-301 correctness. Flagged for Architect awareness, not a Forge issue.

## Verdict rationale

All 11 acceptance criteria verified with file:line citations. Independent test run confirms 30/30 passing. Typecheck clean. Implementation is well-bounded: ActiveShowDoc is a focused 117-line class with debounced autosave, listener fan-out, and proper open/close ordering. The Shell.ts wiring is minimal (3 added lines + 1 shutdown call) and respects the documented boot order (step 13 between modules.startAll and IPC registration so B003-302/303/304 bridges find the singleton when they wire up).

Foundation is solid for B003-302/303/304 to call `getActiveShowDoc().getDoc()` and register IPC handlers on top.

**Accepted, round 1.**
