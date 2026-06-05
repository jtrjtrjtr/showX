---
id: "B003-015"
title: "PWA GO button + standby panel — SM authoritative dispatch UI"
status: "done"
review_round: 1
forge_confidence: high
---

## Summary

Implemented the full GO button + standby panel composition for the SM master view, including:
- `GoButton` component with flash/shake animations, long-press override, touch + mouse + keyboard parity
- `StandbyPanel` updated with `role="status"`, `aria-live="polite"`, tappable next-cue buttons, pulse animation when armed
- `GoConfirmDialog` for the 1.5s long-press / Cmd+Shift+G emergency override flow
- `HelpOverlay` extracted from SMMasterView inline → standalone component with full keyboard reference
- `usePlayhead` hook persisting playhead + armed cue ID to Yjs `cuelist.playhead` for cross-station sync
- `SMMasterView` wired with GoButton, GoConfirmDialog, HelpOverlay, usePlayhead — replaces local useState for playhead/armed

## Files changed

| File | Change |
|------|--------|
| `pwa/src/hooks/usePlayhead.ts` | NEW — PlayheadState hook with Yjs persistence + setPlayhead/advance/retreat/arm/unarm |
| `pwa/src/components/cuelist/GoButton.tsx` | NEW — authoritative GO button with flash/shake/long-press |
| `pwa/src/components/cuelist/GoConfirmDialog.tsx` | NEW — override-confirm dialog (emergency fire) |
| `pwa/src/components/cuelist/HelpOverlay.tsx` | NEW — keyboard shortcut help overlay (extracted from SMMasterView) |
| `pwa/src/components/cuelist/StandbyPanel.tsx` | UPDATED — role/aria, onStandby, pulse animation, tappable next cues |
| `pwa/src/components/cuelist/SMMasterView.tsx` | UPDATED — usePlayhead integration, GoButton, GoConfirmDialog, HelpOverlay, go.rejected subscription, Cmd+Shift+G |
| `tests/unit/pwa/components/cuelist/GoButton.test.tsx` | NEW — 12 tests |
| `tests/unit/pwa/hooks/usePlayhead.test.tsx` | NEW — 6 tests |
| `tests/unit/pwa/components/cuelist/StandbyPanel.test.tsx` | UPDATED — added 4 accessibility + onStandby tests |
| `tests/unit/pwa/components/cuelist/SMMasterView.test.tsx` | UPDATED — 1 test updated for wrapping behavior |

## Tests run

```
✓ tests/unit/pwa/components/cuelist/GoButton.test.tsx  (12 tests)
✓ tests/unit/pwa/hooks/usePlayhead.test.tsx  (6 tests)
✓ tests/unit/pwa/components/cuelist/StandbyPanel.test.tsx  (13 tests)
✓ tests/unit/pwa/components/cuelist/SMMasterView.test.tsx  (13 tests)

All 852 tests pass (cueCatalog.test.ts intermittent debounce failure is pre-existing B003-010 issue, unrelated to this task)
```

Total new tests: 12 + 6 + 4 new + 1 updated = 23 new/updated tests.

## Decisions made within task scope

**1. `usePlayhead` wraps at boundaries (spec: "wraps at end/beginning")**
`advance()` from the last cue wraps to first; `retreat()` from the first cue wraps to last. This changed SMMasterView's previous clamping behavior. The SMMasterView test "ArrowUp from first cue stays on first cue" was updated to "wraps to last cue."

**2. `setPlayhead(cueId)` added to `usePlayhead`**
The spec lists `{playheadCueId, armedCueId, advance(), retreat(), arm(cueId), unarm()}` but not a direct `setPlayhead`. It was added as a required internal primitive — row-click in SMMasterView calls `setPlayhead(cue.id)` to position the playhead at an arbitrary cue. Without it, there's no way to click-select a row outside of sequential advance/retreat. Listed in tests as "setPlayhead updates Yjs cuelist.playhead.cue_id."

**3. SMMasterView.tsx modified (not in target_files)**
The spec's "## Composition" section requires wiring `armedCueId` from `usePlayhead`, `onGo` from `useGoChannel.go`, `onOverride` → GoConfirmDialog. This requires modifying SMMasterView. Since GoButton compositing into SMMasterView is the primary deliverable, the modification was necessary. Noted here for Critic to confirm scope is acceptable.

**4. `isAuthoritative={true}` in SMMasterView**
SMMasterView is the SM-exclusive view. All stations on SMMasterView are authoritative (the server also enforces this via go.rejected). Future per-station authority check can read `cuelist.go_authority` vs station role if needed.

**5. `rejectedReason` encoded with a counter suffix**
`go.rejected` events of the same reason (e.g. repeated "not_sm" rejections) need to re-trigger the shake animation. Encoding the rejection key as `reason:seq` (e.g. `not_sm:2`) ensures `useEffect([rejectedReason])` fires on every new rejection even if the reason string is identical.

## Notes for Critic

- Verify GoButton is DISABLED when `armedCueId=null` (test #1 covers this).
- Verify GoButton is DISABLED when `isAuthoritative=false` (test #8 covers this).
- Confirm override requires either 1.5s long-press OR Cmd+Shift+G — not just click. Long-press test uses fake timers (test #7 confirms 1.5s threshold).
- Confirm override opens GoConfirmDialog, not immediate fire (wired in SMMasterView: `handleGoOverride → setShowConfirmDialog(true)`).
- Verify shake animation on rejection (test #6 covers via `toHaveStyle({ animation: 'goShake 0.5s' })`).
- Spacebar is handled in `useKeyboardShortcuts` via SMMasterView shortcuts map — does NOT fire when focus is in search box (tested in SMMasterView test "keyboard shortcuts do not fire when typing in search box").
- Playhead updates persist via Yjs — usePlayhead test #6 (two-station propagation) verifies cross-station sync.
- `aria-live="polite"` on StandbyPanel verified in test suite.
- `cueCatalog.test.ts` intermittent failure is NOT from this task — it's a timing issue in B003-010's debounce test. Pre-existing.
