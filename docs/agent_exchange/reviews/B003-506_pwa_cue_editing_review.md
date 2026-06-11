---
id: "B003-506"
title: "Cue editing in PWA — double-click edit dialog, CRDT write-through, persists to .showx"
verdict: "accepted"
review_round: 2
reviewed_at: "2026-06-11T05:42:00Z"
reviewer: "critic"
---

## Round 2 — touch long-press resolution

Round 1 verdict: `changes_requested` because acceptance criterion #1 explicitly required `long-press >500ms for touch` and Forge had only implemented `onDoubleClick`. Everything else was already accepted in round 1 and remains accepted unchanged.

This round only verifies the new touch handler.

## Acceptance verification (round 2 delta only)

**Criterion #1 — long-press >500ms for touch, rehearsal only, with movement / release cancel and no double-fire of `onSelect`.** ✓

Implementation: `pwa/src/components/cuelist/CueRow.tsx`
- Constants: `LONG_PRESS_MS = 500` (`CueRow.tsx:11`), `LONG_PRESS_MOVE_THRESHOLD = 10` (`CueRow.tsx:12`).
- Refs: `longPressTimerRef`, `longPressFiredRef`, `touchStartRef` (`CueRow.tsx:26-28`).
- `handleTouchStart` (`CueRow.tsx:38-51`): clears any prior timer, records origin, schedules 500ms `setTimeout` that calls `onEdit()` only when `mode === 'rehearsal'` and sets `longPressFiredRef.current = true` before firing.
- `handleTouchMove` (`CueRow.tsx:53-62`): computes √(dx²+dy²) against the start point; if > 10px, cancels the timer. Correct scroll-gesture handling.
- `handleTouchEnd` / `handleTouchCancel` (`CueRow.tsx:64-66`): both bound to `clearLongPress`; releases before the threshold do nothing.
- `onClick` guard (`CueRow.tsx:81-84`): checks `longPressFiredRef` first; if set, resets and returns early so the synthetic click after a long-press does not also fire `onSelect`.
- JSX wiring (`CueRow.tsx:86-89`): `onTouchStart`/`onTouchMove`/`onTouchEnd`/`onTouchCancel` all attached.

Tests: `tests/unit/pwa/components/cuelist/CueRow.test.tsx`
- `touch long-press ≥500ms calls onEdit in rehearsal mode` (`CueRow.test.tsx:322-343`).
- `touch long-press does NOT call onEdit in show mode` (`CueRow.test.tsx:345-366`).
- `touch released before 500ms does NOT call onEdit` (`CueRow.test.tsx:368-391`).
- `long-press does not also fire onSelect via subsequent click` (`CueRow.test.tsx:393-417`).

All four scenarios isolated with `vi.useFakeTimers()` + `act(() => vi.advanceTimersByTime(...))`. Fake timers are correctly re-enabled with `vi.useRealTimers()` at the end of each test — no cross-test leakage.

## Test + typecheck

- `pnpm vitest run tests/unit/pwa/components/cuelist/CueRow.test.tsx` → **19/19 passed** (4 new touch tests + 15 pre-existing).
- `pnpm -r typecheck` → **clean** across all 5 workspace projects (showx-shared, marketing, cuelist-core, pwa, main).

## Code quality notes

- The pointer-events vs touch-events choice (Forge: touch events, citing jsdom unreliability around `PointerEvent.pointerType`) is reasonable and limited to testability — in real browsers both register touch input. No production behavior risk.
- `longPressFiredRef` reset paths: `onClick` consumes it (then resets), and the next `handleTouchStart` also resets it explicitly (`CueRow.tsx:42`). No leak between touches.
- Movement threshold (10px Euclidean) is conservative; matches typical mobile tap-slop. Fine.
- All edits remain inside the spec's `target_files` list (CueRow.tsx + CueRow.test.tsx in this round).

## Verdict

`accepted` — bundle ShowX-3.5 final task closes. Spec moves to `done/`.
