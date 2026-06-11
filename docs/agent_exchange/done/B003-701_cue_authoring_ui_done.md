---
id: "B003-701"
status: "done"
round: 1
---

# B003-701 Done Report — Cue authoring v browseru

## Summary

Implemented full cue authoring UI in the browser: add, insert-after, delete (with undo), and drag-reorder. Engine functions were already implemented in `document/cue.ts`; this task wired them to the UI layer.

## Files changed

| File | Change |
|---|---|
| `src/modules/cuelist-core/src/index.ts` | Added exports: `addCue`, `insertCueAfter`, `removeCue`, `reorderCues`, `MakeCueOpts` |
| `pwa/src/hooks/useCuelist.ts` | Extended `CuelistSnapshot` with all 4 authoring functions; also fixed cue ordering to use `getCuesSorted()` (was using insertion-order `.toArray()`, which meant `reorderCues` had no visible effect in the UI) |
| `pwa/src/components/cuelist/AddCueButton.tsx` | New component: reusable button for add-cue actions |
| `pwa/src/components/cuelist/CueRow.tsx` | Added props: `onInsertAfter`, `onDelete`, `isDragging`, `isDragTarget`, `onDragHandlePointerDown`; renders `+ below` and `🗑` on selected/playhead rows (rehearsal only); drag handle (⠿) with pointer events; drop indicator line; outer wrapper div carries `data-cue-id` |
| `pwa/src/components/cuelist/SMMasterView.tsx` | Wired authoring functions from hook; EmptyState `+ Add cue` now works; Cmd/Ctrl+N shortcut; undo-delete 2s toast; pointer-based drag-reorder state machine; `+ Add cue` button below list in rehearsal mode |
| `tests/unit/pwa/cue_authoring.test.tsx` | 9 new tests covering all authoring operations + lock guards + AddCueButton |

## Implementation notes

### sort_key ordering fix
`useCuelist` was reading `cues` via `getCues().toArray()` (Y.Array insertion order). Since `reorderCues` only mutates `sort_key` fields without moving items in the Y.Array, the displayed order was never updated. Fixed by switching to `getCuesSorted()` which sorts by `sort_key` ascending — this is the correct read path per spec.

### Delete UX — optimistic hide + deferred CRDT write
Deleted cue is hidden optimistically from the UI immediately (filtered out in render). The actual `removeCue()` call on the Y.Doc fires after 2s. Undo cancels the timer. If another cue is deleted before the first timer fires, the first delete is committed immediately. This avoids showing "zombie" cues while preserving CRDT semantics.

### Drag-reorder — pointer events (mouse + touch)
Used pointer events (`onPointerDown` on drag handle, `onPointerMove` on list container, `pointerup`/`pointercancel` on `document`) for universal mouse and touch support. Long press (500ms) required for touch to initiate drag. `document.elementFromPoint` finds the target row during move. On `pointerup`, `reorderCues` is called with the new full cue order.

### Cmd/Ctrl+N behavior
If a cue is selected: `insertCueAfter(selectedCueId)`. If nothing is selected: `addCue(...)` (appends to end). New cue is auto-selected and label field opened for inline edit.

## Tests run

```
Test Files  129 passed (129)
     Tests  1497 passed (1497)
```

(+9 new tests; all 1488 pre-existing pass)

## Build

`pnpm --filter showx-pwa build` — success, 396 KB bundle.

## Propagation verification

`addCue` / `insertCueAfter` / `removeCue` / `reorderCues` all write through the shared `Y.Doc` via Yjs transactions. Any PWA station connected via y-websocket to the same `Y.Doc` receives CRDT updates in real time — identical to the existing `updateCueFields` path (which was already propagating live per prior Critic verification in B003-506). Specifically:
- New cues propagate via `Y.Array.push/insert` → y-websocket sync → remote `observeDeep` → React re-render
- Deletions propagate via `Y.Array.delete` → same path
- Reorder propagates via `Y.Map.set('sort_key', ...)` on each cue → `getCuesSorted` on read side

## Notes for Critic

1. The `useCuelist` sort fix (insertion-order → `getCuesSorted`) is a correctness fix that was a prerequisite for `reorderCues` to have any visible effect. All existing tests still pass.
2. SHOW mode authoring lock is enforced by `assertEditAllowed(doc, 'structure')` inside the engine functions. UI buttons are hidden via `mode === 'rehearsal'` guard.
3. No architectural decisions made. All changes within `target_files`.
