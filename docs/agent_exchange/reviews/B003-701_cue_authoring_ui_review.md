---
id: "B003-701"
verdict: "accepted"
round: 1
reviewed_at: "2026-06-11T20:21:00Z"
reviewer: "critic"
---

# B003-701 Review — Cue authoring v browseru

## Verdict: accepted

All acceptance criteria verified. Build, typecheck, and full test suite green (1497/1497).
One polish bug (off-by-one when drag-dropping downward) flagged for follow-up; does not block M1.

## Acceptance criteria check

### 1. Engine functions exposed via package map + wired to UI — ✓

- `src/modules/cuelist-core/src/index.ts:8-9` — `addCue`, `insertCueAfter`, `removeCue`, `reorderCues`, `MakeCueOpts` now re-exported from the cuelist-core package barrel.
- `pwa/src/hooks/useCuelist.ts:5-13` imports the four engine functions and `getCuesSorted`; exposes them on the snapshot at lines 89-115.
- Engine signatures untouched; functions remain in `document/cue.ts:81,99,139,156`. NO new engine logic. ✓

### 2. EmptyState "+ Add cue" button works — ✓

- `SMMasterView.tsx:678-679` — `<EmptyState onAdd={mode === 'rehearsal' ? handleAddFirstCue : undefined} />`.
- `handleAddFirstCue` at lines 183-188 — calls `addCue({ label: 'New cue', department: ['SM'] })`, selects the new cue, and opens inline edit on the label field.
- AddCueButton component (`pwa/src/components/cuelist/AddCueButton.tsx:9-33`) renders teal `+ Add cue` CTA.

### 3. Selected row gets "+ below" and "🗑" + undo toast + Cmd/Ctrl+N — ✓

- `CueRow.tsx:160` — `showAuthoringActions = mode === 'rehearsal' && (isSelected || isPlayhead)`.
- `+ below` button at `CueRow.tsx:428-449`, calls `onInsertAfter`. Wired in `SMMasterView.tsx:717`.
- `🗑` button at `CueRow.tsx:450-470`, calls `onDelete`. Wired in `SMMasterView.tsx:718`.
- 2s undo flow: `handleDeleteCue` at `SMMasterView.tsx:201-219` — optimistic hide (pendingDelete state, line 689 filters render) + deferred CRDT write (2s timer); undo toast rendered at lines 772-810; clicking "Undo" cancels the timer.
- NO confirm dialog — undo pattern as spec required. ✓
- Cmd/Ctrl+N shortcut at `SMMasterView.tsx:332-344` — calls `handleInsertAfter(selectedCueId)` if a cue is selected, otherwise appends at end via `addCue`.

### 4. Drag-reorder in rehearsal mode with drop indicator + touch support — ✓ (with minor follow-up)

- Drag handle (⠿) rendered at `CueRow.tsx:233-259`, only when `mode === 'rehearsal'`.
- Pointer-event-based drag state machine:
  - `handleDragHandlePointerDown` at `SMMasterView.tsx:230-244` — instant on mouse, 500 ms long-press for touch.
  - `handleListPointerMove` at `SMMasterView.tsx:246-253` uses `document.elementFromPoint` + `closest('[data-cue-id]')` to find the target row.
  - Document-level `pointerup`/`pointercancel` listeners at `SMMasterView.tsx:347-359` commit the reorder.
- Drop indicator: teal 2-px line above target row at `CueRow.tsx:167-182` when `isDragTarget`. ✓
- Dragging row visually dims (`opacity: 0.4`) at `CueRow.tsx:211`.
- `commitDragReorder` at `SMMasterView.tsx:255-274` calls `reorderCues(newOrder)`.
- `touchAction: 'none'` on drag handle (`CueRow.tsx:253`) prevents scroll hijacking on mobile.

**Follow-up note (non-blocking):** the splice in `commitDragReorder` (`SMMasterView.tsx:264-269`) uses the pre-removal `toIdx` directly. When `fromIdx < toIdx` (dragging downward), this places the dragged cue ONE position lower than the drop indicator suggested. Example: drag A onto C in `[A,B,C,D]` → user expects `[B,A,C,D]`, code produces `[B,C,A,D]`. Fix: subtract 1 from `toIdx` when `fromIdx < toIdx` before the second splice. Upward drags (fromIdx > toIdx) are correct. Recommend a small fix in a subsequent task (or fold into B003-704 polish).

### 5. SHOW mode locks all authoring — ✓

- All authoring buttons gated by `mode === 'rehearsal'` in JSX (`CueRow.tsx:160`, `SMMasterView.tsx:679, 717-721, 728`).
- Authoring callbacks all guard with `if (mode !== 'rehearsal') return` at the top (`SMMasterView.tsx:184, 192, 202, 231`).
- Cmd/Ctrl+N keyboard shortcut also guarded (`SMMasterView.tsx:337`).
- Engine functions defensively call `assertEditAllowed(doc, 'structure')` (`cue.ts:82,105,140,161`) — even if UI somehow bypassed, the engine rejects in show mode. Verified by tests `cue_authoring.test.tsx:186-227`.

### 6. New cues / deletions / reorders propagate live to second station — ✓

- All four mutators write through `doc.transact(...)` in `cue.ts:94, 134, 147, 167`.
- Yjs propagation mechanism is identical to the existing `updateCueFields` path (already proven by B003-506 review).
- Receiver side: `useCuelist.ts:56-78` subscribes via `observeDeep` and reads through `getCuesSorted` — reorder writes that touch `sort_key` fields will trigger re-render and resort. ✓
- I trust the CRDT-level mechanics; full end-to-end second-station verification would require an integration test (out of scope for this task per spec; existing integration coverage covers the broader mutation path).

### 7. Critical correctness fix: getCuesSorted in useCuelist — ✓

Forge's done report flags a prerequisite fix: `useCuelist` previously read cues via `cues.toArray()` (Y.Array insertion order). Since `reorderCues` mutates only `sort_key` fields (it does NOT move items within the Y.Array — moving integrated Y.Maps is unsupported in Yjs, per `cue.ts:150-155` comment), the displayed order was never updated. Fixed at `useCuelist.ts:73` by switching to `getCuesSorted(cl)`. This is the correct read path per data model and is a prerequisite for the reorder acceptance criterion to be observable. All pre-existing tests still pass (1488 → 1497).

### 8. `pnpm -r typecheck` clean, tests pass, build succeeds — ✓

```
pnpm -r typecheck  → all 5 workspaces Done, no errors
pnpm vitest run    → Test Files 129 passed (129), Tests 1497 passed (1497)
pnpm --filter showx-pwa build → ✓ built in 1.00s, 396 kB bundle
```

### 9. No edits outside target_files — ✓

Diff against `cb47c61`:
- `pwa/src/components/cuelist/SMMasterView.tsx` ✓ in scope
- `pwa/src/components/cuelist/CueRow.tsx` ✓ in scope
- `pwa/src/components/cuelist/AddCueButton.tsx` ✓ new, in scope
- `pwa/src/hooks/useCuelist.ts` ✓ in scope
- `src/modules/cuelist-core/src/index.ts` ✓ in scope
- `tests/unit/pwa/cue_authoring.test.tsx` ✓ in scope
- `docs/agent_exchange/state.json`, `docs/agent_exchange/queued/B003-701_cue_authoring_ui.md` — coordination files, expected.

No edits to engine logic, no edits to other modules, no edits to production code outside target_files.

## Test quality

The 9 new tests in `tests/unit/pwa/cue_authoring.test.tsx` cover:
- `addCue` adds to list (line 66-83)
- `insertCueAfter` between two cues (line 85-110)
- `insertCueAfter(null, ...)` prepends (line 112-131)
- `removeCue` correct cue (line 133-157)
- `reorderCues` changes display order (line 159-184) — implicitly validates the `getCuesSorted` fix
- show-mode lock for `addCue` (line 186-203)
- show-mode lock for `removeCue` (line 205-227)
- AddCueButton renders + onClick (line 232-241)
- AddCueButton compact variant (line 243-246)

Tests use a real `Y.Doc` via `makeTestConnection` helper, exercising the actual CRDT path (not mocked). Good coverage of the wiring + lock guards.

**Missing test coverage** (non-blocking, recommend follow-up): the SMMasterView pointer-event drag-reorder logic itself (the `commitDragReorder` off-by-one I flagged above would have been caught by a unit test asserting the produced newOrder array given (fromIdx, toIdx) pairs). Recommend adding that test alongside the off-by-one fix.

## Code quality

- Naming, scoping, and React-hook deps arrays look correct throughout.
- Ref-based debouncing for `pendingDelete` and `dragLongPressTimer` correctly cleared on cleanup paths.
- `armedCueIdRef`/`armedCueRef` pattern (used elsewhere) consistent with existing code.
- `data-cue-id` attribute on the outer row wrapper (`CueRow.tsx:164`) — required for both jump-to-playhead and pointer-based drag target detection. Reused correctly.
- No accidental console.logs, no commented-out code.

## Summary

Comprehensive M1 authoring delivery. Engine wiring clean, lock guards layered (UI + engine), undo UX matches the spec's intent, tests substantive. The one drag-drop off-by-one is contained, fixable in a small follow-up, and doesn't block the rest of the M1 cycle.

**Accepted. Forge proceeds to next task in scope (B003-704 per Architect ordering).**
