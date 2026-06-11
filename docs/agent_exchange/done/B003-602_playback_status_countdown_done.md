---
id: "B003-602"
title: "Playback status — live countdown, header, caret≠selection, follow-grid autoscroll"
status: "done"
round: 1
forge_started_at: "2026-06-11T18:00:00Z"
forge_ended_at: "2026-06-11T19:30:00Z"
---

## Summary

All 5 acceptance criteria implemented. 1427 tests pass, `pnpm -r typecheck` clean, `pnpm --filter showx-pwa build` succeeds.

## Files changed

| File | Change |
|---|---|
| `pwa/src/hooks/useGoChannel.ts` | Added `firstGoAt: number | null` — timestamp of first live GO in session |
| `pwa/src/components/cuelist/PlaybackHeader.tsx` | NEW — LAST FIRED / NEXT / Elapsed strip |
| `pwa/src/components/cuelist/CueRow.tsx` | Countdown, Eos left edge, progress bar, gutter zone, selection ring |
| `pwa/src/components/cuelist/SMMasterView.tsx` | Integrated all; ONYX caret≠selection, rAF ticker, autoscroll, follow-grid toggle |
| `tests/unit/pwa/components/cuelist/CueRow.test.tsx` | Updated all existing tests with new required props; +9 new tests |
| `tests/unit/pwa/components/cuelist/PlaybackHeader.test.tsx` | NEW — 8 tests |

## Acceptance criteria addressed

1. **Live countdown** — `data-testid="row-countdown"` appears on running cue rows. Format: `M:SS.t remaining`. Driven by `firedAt + duration_hint_ms - now`; pure client-side rAF ticker in SMMasterView (single interval, not per row). Falls back to nothing when `duration_hint_ms` is null.

2. **Eos color** — red left border (`4px solid tokens.color.red`) while counting down. Separate from green fire flash (bg) and teal playhead (bg).

3. **Progress bar** — 2px teal bar along row bottom. Width grows 0→100% as cue runs. Opacity = `remaining/duration_hint_ms` (fades to 0 at completion).

4. **PlaybackHeader** — `data-testid="playback-header"`, `aria-live="polite"`. Shows LAST FIRED (label · Xs ago), NEXT (playhead cue label), Elapsed (M:SS since first GO). `firstGoAt` sourced from `useGoChannel` (set on first live dispatch, never reset).

5. **ONYX caret≠selection** — `selectedCueId` state in SMMasterView, separate from `playheadCueId`. Clicking a row body → `setSelectedCueId` (thin teal boxShadow ring). Clicking 24px gutter zone (`data-testid="playhead-gutter"`) → `setPlayhead` with `stopPropagation`. `aria-selected = isPlayhead || isSelected`. Keyboard arrows still drive playhead only.

6. **Follow-grid autoscroll** — `⇣` toggle button (`data-testid="follow-grid-toggle"`) in header, default ON. When ON: `scrollToPlayhead()` called on each playhead change. When OFF: `data-testid="jump-to-playhead"` pill appears when playhead row is off-screen. Clicking pill scrolls to playhead and re-enables followGrid.

7. **Zero new doc fields, zero new awareness fields** — all state is local React state or event-derived.

## Decisions

- `scrollTo` guarded with `typeof === 'function'` check for jsdom compatibility. Real browsers always have it.
- `aria-selected = isPlayhead || isSelected` preserves all 15 existing SMMasterView tests (arrow-key tests check `aria-selected` for playhead; click test checks for selection).
- `firstGoAt` lives in `useGoChannel` (already owns dispatched events); cleaner than SMMasterView ref.
- Late-joining countdown: `useGoChannel` only sets `lastDispatched` for non-historic events → countdown never shown for events missed before station connected. Documented in spec Watch out section.

## Tests run

```
Test Files  125 passed (125)
Tests  1427 passed (1427)
Duration  21.76s
```

PWA build: ✓ (885ms, no errors)
Typecheck: ✓ (all workspaces clean)

## Notes for Critic

- `data-testid="jump-to-playhead"` only renders when `!followGrid && jumpVisible`. In jsdom, `getBoundingClientRect()` returns all zeros so the pill may always be visible in tests when followGrid is OFF — tests don't assert on it, so no issue.
- The `now` prop on CueRow is `number` (ms), not a `Date`. SMMasterView owns the single rAF ticker and passes `now` down.
- `usePlayhead.ts` untouched — selection state is local to SMMasterView, not in awareness.
