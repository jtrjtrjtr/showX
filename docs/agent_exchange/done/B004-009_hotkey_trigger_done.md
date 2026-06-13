---
id: "B004-009"
slug: "hotkey_trigger"
title: "Hotkey trigger type"
status: "done"
round: 1
completed_at: "2026-06-13T16:20:00Z"
---

## Summary

Implemented the `hotkey` trigger type end-to-end: shared types, scheduler, trigger engine, PWA TriggerCell editor, and SMMasterView listener.

## Files changed

| File | Change |
|---|---|
| `src/shared/src/types/cue.ts` | Added `'hotkey'` to `TriggerKind`; added `{ kind: 'hotkey'; key: string }` variant to `Trigger` union |
| `src/modules/cuelist-core/src/trigger/scheduler.ts` | Added `case 'hotkey': return null` to `schedule()`; exported `normalizeHotkeyKey()` utility; `isAutoTriggered()` already correct (hotkey excluded from auto chain) |
| `src/modules/cuelist-core/src/trigger/triggerEngine.ts` | Treats `hotkey` same as `manual` for chain depth reset (`onCueFire`) — hotkey fires are out-of-band, not part of the auto-chain |
| `pwa/src/components/cuelist/TriggerCell.tsx` | `triggerDisplay()` case for hotkey (`⌨ <key>`); `hotkeyCapture` state; `handleOpen()` init; `handleSave()` case; `Hotkey (key binding)` option in dropdown; key-capture `<input readOnly>` that records keydown |
| `pwa/src/components/cuelist/SMMasterView.tsx` | `useEffect` hotkey listener on `window`; guards INPUT/TEXTAREA/SELECT/contenteditable; fires first matching cue via `go()`; `console.warn` on duplicate keys; reuses `goInertRef` debounce; `followCount` now breaks on `hotkey` (same as `manual`) |
| `tests/unit/pwa/hotkeyScheduler.test.ts` | New — 4 tests: `schedule()` returns null for hotkey; `isAutoTriggered()` returns false; `normalizeHotkeyKey()` |
| `tests/unit/pwa/components/cuelist/TriggerCell.test.tsx` | +7 tests: display glyph+key; capture input shown; key capture; space→"Space"; save calls onUpdate; pre-populate on open |
| `tests/unit/pwa/components/cuelist/SMMasterView.test.tsx` | +1 `trigger` opt in `addCue` helper; +4 tests: fires matching cue; input focus guard; duplicate picks first; unbound key no-op |

## Tests run

```
 ✓ tests/unit/pwa/hotkeyScheduler.test.ts (4 tests)
 ✓ tests/unit/pwa/components/cuelist/TriggerCell.test.tsx (18 tests)
 ✓ tests/unit/pwa/components/cuelist/SMMasterView.test.tsx (31 tests)

 Test Files  138 passed (138)
 Tests       1652 passed (1652)
```

`pnpm --filter showx-pwa build` clean. `pnpm -r typecheck` clean.

## Design decisions

- **Key storage**: `KeyboardEvent.key` with space→`'Space'` normalization. No case normalization for letters; `'g'` and `'G'` are distinct bindings.
- **Chain behaviour**: `schedule()` returns null (same as manual). `followCount` in SMMasterView breaks on hotkey so the `+N` auto-follow indicator is correct.
- **Debounce**: Hotkey shares `goInertRef` (300ms) with the manual GO path — prevents double-fires on rapid keypresses.
- **Duplicate keys**: Fires first cue in cuelist order (deterministic); `console.warn` logged as specified.
- **Capture UI**: `readOnly` input captures keydown event. Guard is natural — while the capture input is focused, the SMMasterView hotkey listener checks `el.tagName === 'INPUT'` and short-circuits, so the capture input doesn't accidentally fire another hotkey cue.

## Notes for Critic

- `normalizeHotkeyKey` is exported from `scheduler.ts` for reuse and testability; it's a pure utility, not architectural.
- The SMMasterView hotkey `useEffect` has empty deps — stable via refs (`cuesRef`, `goRef`, `goInertRef`, timer refs). This pattern matches existing hooks in the file.
- The `Unbound` fallback in `handleSave` for an empty hotkeyCapture is a safety net; the UI shows "Click and press a key…" placeholder so users know to capture before saving.
