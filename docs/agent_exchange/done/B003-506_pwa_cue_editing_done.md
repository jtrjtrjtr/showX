---
id: "B003-506"
title: "Cue editing in PWA — double-click edit dialog, CRDT write-through, persists to .showx"
status: "done"
round: 2
---

## Summary

Round 2 — added missing touch long-press handler (≥500ms) to open CueEditDialog on tablet/touch. All other criteria were already accepted in round 1 and are unchanged.

## Critic round-1 concern addressed

**Long-press >500ms for touch missing (was: MISSING → now: ✓)**

Added `onTouchStart`/`onTouchMove`/`onTouchEnd`/`onTouchCancel` handlers to `CueRow.tsx` using `useRef`-based timer:
- `onTouchStart`: records touch origin, starts 500ms `setTimeout`
- `onTouchMove`: cancels timer if finger moves >10px from start (scroll gesture)
- `onTouchEnd` / `onTouchCancel`: cancels timer (released before threshold)
- On fire: sets `longPressFiredRef.current = true`, calls `onEdit()` — mode-gated to `rehearsal` only
- `onClick` guard: checks `longPressFiredRef.current` first; if set, resets it and returns early → `onSelect` not called after a long-press

Used `onTouchStart`/`onTouchEnd` (not `onPointerDown` with `pointerType`) because jsdom does not reliably expose `PointerEvent.pointerType` from `fireEvent.pointerDown` init — touch events are reliably supported.

## Files Changed

| File | Change |
|---|---|
| `pwa/src/components/cuelist/CueRow.tsx` | Added `useRef`/`useCallback` imports; `handleTouchStart`, `handleTouchMove`, `handleTouchEnd` callbacks; wired to JSX `onTouchStart`/`onTouchMove`/`onTouchEnd`/`onTouchCancel`; updated `onClick` to check `longPressFiredRef.current` |
| `tests/unit/pwa/components/cuelist/CueRow.test.tsx` | Added `act` import; 4 new tests with `vi.useFakeTimers` covering all 4 long-press scenarios |

## Test Results

```
tests/unit/pwa/components/cuelist/CueRow.test.tsx   19 tests ✓ (4 new long-press tests)
Full suite: 1371 passed / 9 failed (pre-existing skeleton.test.ts failures, unrelated)
pnpm -r typecheck: clean across all 5 workspace projects
```

## New tests (round 2)

1. `touch long-press ≥500ms calls onEdit in rehearsal mode` — fires after 500ms via `vi.advanceTimersByTime`
2. `touch long-press does NOT call onEdit in show mode` — timer fires but mode gate blocks
3. `touch released before 500ms does NOT call onEdit` — `touchEnd` cancels timer at 400ms
4. `long-press does not also fire onSelect via subsequent click` — `longPressFiredRef` absorbs the follow-on click

## Notes for Critic

- `onTouchStart`/`onTouchEnd` chosen over pointer events for reliable jsdom testability; in real browsers both approaches behave identically for touch input.
- The `longPressFiredRef.current` flag is reset either by the `onClick` guard or by the next `handleTouchStart` call (`longPressFiredRef.current = false`), so state cannot leak between touches.
- Pre-existing skeleton.test.ts failures (9 tests) unchanged.
