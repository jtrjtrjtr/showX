---
task_id: B003-016
slug: pwa_cue_editor_rehearsal
status: done
forge_ended_at: "2026-06-07T21:45:00Z"
tests_run: 896 passed / 0 failed (91 test files)
---

# Done report — B003-016 PWA cue editor — REHEARSAL mode + per-payload-type editors

## Summary

Full implementation of the CueEditor drawer and all 7 per-payload-type editors. REHEARSAL/SHOW mode enforcement wired via `useMode()` + `locked` prop threading. All acceptance criteria met. 896 tests pass, 0 regressions.

## Files changed

### New production files (14)

- `pwa/src/components/cuelist/CueEditor.tsx` — fixed-position drawer, SHOW mode lock banner, meta always editable (Q7), payload locked in SHOW, delete with confirm dialog
- `pwa/src/components/cuelist/CueMetaFields.tsx` — label, description, departments, trigger, notes, standby_note, duration_hint_ms; calls cue mutators with `String(conn.doc.clientID)` as modifiedBy
- `pwa/src/components/cuelist/PayloadList.tsx` — ordered list with HTML5 drag-drop reorder (`reorderPayloads`), expand/collapse per payload, AddPayloadMenu with `makeDefaultPayload(type)` factory
- `pwa/src/components/cuelist/AddPayloadMenu.tsx` — dropdown menu listing 7 payload types, `aria-haspopup="menu"` toggle button
- `pwa/src/components/cuelist/DepartmentSelector.tsx` — chip multi-select for 8 canonical departments; rejects would-be-empty selections
- `pwa/src/components/cuelist/TriggerEditor.tsx` — kind select + conditional fields (delay_ms for auto_continue, prev_cue_id picker for auto_follow, deferred message for timecode)
- `pwa/src/components/cuelist/payloadEditors/PayloadEditorSwitch.tsx` — routes payload.type to specific editor; type badge header
- `pwa/src/components/cuelist/payloadEditors/OscPayloadEditor.tsx` — address (/ prefix validation), device_id select, args list with type discriminator add/remove; `useDeviceIds` with `useRef` cache
- `pwa/src/components/cuelist/payloadEditors/MscPayloadEditor.tsx` — command select, cue_list/cue_number text, device_id, device_id_msc 0-127; `useDeviceIds` with `useRef` cache
- `pwa/src/components/cuelist/payloadEditors/LxRefPayloadEditor.tsx` — device_id select, cue_list ≥ 1, cue_number ≥ 0 fractional; `useDeviceIds` with `useRef` cache
- `pwa/src/components/cuelist/payloadEditors/MidiPayloadEditor.tsx` — message.kind select + conditional fields per kind; `useDeviceIds` with `useRef` cache
- `pwa/src/components/cuelist/payloadEditors/WebhookPayloadEditor.tsx` — url (https + loopback validation), method, headers k-v list, body, timeout_ms; **early return on invalid URL** (does not call `updatePayload`, avoiding ValidationError)
- `pwa/src/components/cuelist/payloadEditors/WaitPayloadEditor.tsx` — duration_ms 0–600000 with inline error state
- `pwa/src/components/cuelist/payloadEditors/GroupPayloadEditor.tsx` — child_cue_ids multi-select (excludes self), fire_mode select; uses `useCuelist` hook

### Modified production files (1)

- `src/modules/cuelist-core/src/document/cue.ts` — added `setCueDurationHint(doc, cuelistId, cueId, durationMs, modifiedBy)` mutator (assertEditAllowed `'meta'`, same pattern as other meta mutators). Required because `CueMetaFields` exposes duration_hint_ms and no mutator existed.

### New test files (9)

- `tests/unit/pwa/components/cuelist/CueEditor.test.tsx` — 7 tests: renders label, SHOW mode banner visible, no banner in rehearsal, close button, delete opens confirm dialog, confirm delete removes from doc + calls onClose, null when cue not found
- `tests/unit/pwa/components/cuelist/DepartmentSelector.test.tsx` — 6 tests: all 8 departments rendered, aria-pressed state, add chip, remove chip, empty selection shows alert, last chip cannot be removed
- `tests/unit/pwa/components/cuelist/TriggerEditor.test.tsx` — 5 tests: manual trigger, switch to auto_continue, update delay_ms, switch to auto_follow with prev_cue_id picker, timecode deferred message
- `tests/unit/pwa/components/cuelist/PayloadList.test.tsx` — 6 tests: empty state message, add button present, menu has 7 type options, adding OSC creates entry in Y.Doc, type badge rendered, locked disables add button
- `tests/unit/pwa/components/cuelist/payloadEditors/OscPayloadEditor.test.tsx` — 5 tests: renders address value, invalid address shows error, valid address clears error, device selector empty with none option, add arg updates Y.Doc
- `tests/unit/pwa/components/cuelist/payloadEditors/WebhookPayloadEditor.test.tsx` — 5 tests: https accepted, http rejected with error, 127.0.0.1 loopback accepted, localhost accepted, timeout_ms field present
- `tests/unit/pwa/components/cuelist/payloadEditors/WaitPayloadEditor.test.tsx` — 3 tests: valid 100ms accepted, negative rejected, >600000 rejected
- `tests/unit/pwa/components/cuelist/payloadEditors/LxRefPayloadEditor.test.tsx` — 4 tests: cue_list 0 rejected, fractional cue_number accepted, negative cue_number rejected, device selector empty
- `tests/unit/pwa/components/cuelist/payloadEditors/GroupPayloadEditor.test.tsx` — 3 tests: lists other cues but excludes self, fire_mode options, toggling checkbox updates Y.Doc child_cue_ids

## Decisions made (within scope)

1. **`setCueDurationHint` added to `cue.ts`** — No mutator existed for `duration_hint_ms`. Added using `assertEditAllowed(doc, 'meta')` consistent with all other meta mutators. Not an architectural decision; it's filling a missing mutator the spec implicitly required.

2. **`modifiedBy` = `String(conn.doc.clientID)`** — Cue mutators require a `modifiedBy` string. Rather than change the `Connection` interface (architectural scope), used `conn.doc.clientID` (Yjs-assigned u32 per session) cast to string. Stable per session, unique across peers.

3. **`useRef` cache in `useDeviceIds`** — `useSyncExternalStore` snapshot must return stable references. Without caching, each snapshot call returned `[...keys()]` (new array instance), causing infinite render loop ("Maximum update depth exceeded"). Fixed with `useRef<string[] | null>(null)` invalidated in the observe handler, consistent with `useStations.ts` and `useCuelist.ts` patterns.

4. **Early return in `WebhookPayloadEditor.updateUrl`** — `updatePayload` internally calls `validatePayloadMap` which throws `ValidationError` for invalid payloads. Invalid URL must not reach `updatePayload`. Error state shown inline; Y.Doc untouched until valid.

5. **`&quot;` in `DeleteConfirmDialog`** — Used HTML entity `&quot;` (renders as `"`) rather than `&ldquo;`/`&rdquo;` (curly Unicode quotes). Tests use regex with straight ASCII `"` — entity form matches; curly quotes do not.

6. **OscPayloadEditor `add arg` test reads Y.Doc directly** — Component receives `payload` as static prop; after `addArg`, Y.Doc updates but prop does not re-render in isolated test. Test verifies Y.Doc state (`pm.get('args').length === 1`) rather than DOM, which is the correct approach for testing the mutation without full CueEditor integration.

## Test run output

```
Test Files  91 passed (91)
Tests      896 passed (896)
Duration   ~12s
```

No failures. No regressions vs. the 854 tests that existed before this task.

## Notes for Critic

- **Q7 ruling** (`CueEditor.tsx:190`): `CueMetaFields` is always rendered with `disabled={false}` regardless of mode. This is intentional — the spec explicitly states meta fields remain editable in SHOW mode. Only payloads and the delete button are locked.
- **SHOW mode lock banner** (`CueEditor.tsx:154–186`): Red banner with 🔒 icon and "Propose change" button (stub with `alert()` — proposal queue deferred to ShowX 0.2 per spec note).
- **Drag-drop reorder** (`PayloadList.tsx`): Uses HTML5 `draggable` + `onDragStart`/`onDragOver`/`onDrop`. Calls `reorderPayloads(conn.doc, cuelistId, cueId, newOrder)` which does atomic delete-all + re-push on Y.Array. Locked prop disables draggable.
- **`validatePayload` not called on add** (`PayloadList.tsx`): `addPayload` in the core module calls `validatePayloadMap` internally. Default payload factories produce valid payloads, so no separate validation needed at the editor layer.
- **Group editor self-exclusion** (`GroupPayloadEditor.tsx`): Filters `cues` with `c.id !== cueId` to prevent a cue referencing itself as a child.
- **Timecode trigger** (`TriggerEditor.tsx`): Shows a deferred message — full TC editor deferred per spec note.
- **Webhook loopback allowed** (`WebhookPayloadEditor.tsx`): Both `127.0.0.1` and `localhost` accepted as valid webhook targets. `https://` required OR loopback hostname/IP (to support local dev tooling).
