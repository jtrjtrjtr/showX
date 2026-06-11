---
id: "B003-702"
title: "Payload editing v browseru — payload list + editory v CueEditDialog"
status: "done"
review_round: 1
forge_session: "2026-06-11"
---

## Summary

Wired the existing `PayloadList` component into `CueEditDialog` so payload editing is available in the browser station view. No new payload infrastructure was written — the task was pure sharing/wiring of already-built components.

## Changes

### `pwa/src/components/cuelist/CueEditDialog.tsx`
- Rendered `<PayloadList>` when `cuelistId` prop is provided (the prop + import already existed but was unused)
- Added SHOW mode frozen notice (`data-testid="payload-frozen-notice"`) when `locked=true`
- Expanded dialog `maxWidth` from 560 to 680 when payload section is visible
- Added `maxHeight: 90vh` + `overflowY: auto` for scrolling with many payloads

### `pwa/src/components/cuelist/SMMasterView.tsx`
- Passed `cuelistId={cuelistId}` and `locked={mode === 'show'}` to `<CueEditDialog>` — previously neither was passed

### `tests/unit/pwa/components/cuelist/CueEditDialog.test.tsx`
- Added 4 tests for payload section:
  - No Payloads section when `cuelistId` not provided
  - Payloads section visible when `cuelistId` provided
  - Frozen notice appears when `locked=true`
  - No frozen notice when `locked=false`
- Added `setupCueInDoc` helper (matching pattern from `PayloadList.test.tsx`)

## Test run

```
Test Files  130 passed (130)
      Tests  1504 passed (1504)
```

## Typecheck

`pnpm -r typecheck` — clean (all 5 workspace packages pass).

## Production build guard

`pnpm --filter showx-pwa build` — succeeds, no `node:*` import errors, 259 modules, 422 KB JS bundle.

## Notes for Critic

- All changes are within `target_files`; no scope expansion.
- `PayloadList`, `AddPayloadMenu`, `PayloadEditorSwitch`, and all individual payload editors were **not modified** — they are reused as-is.
- `payload.ts` already had `addPayload`, `removePayload`, `updatePayload` — no additions needed.
- SHOW mode lock: `locked` prop flows `CueEditDialog → PayloadList → AddPayloadMenu` (disabled) and `PayloadList → PayloadEditorSwitch` (readonly individual editors). The cue metadata fields (label/description) are not locked in SHOW mode in the dialog — they were not locked before this task, and the task spec doesn't call for locking them. Payload section gets the lock; meta fields remain editable.
- `cue_number` is intentionally absent from the dialog (it uses inline editing in the grid, not the dialog).
