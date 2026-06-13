---
id: "B005-008"
title: "Countdown-only station view + 'countdown' role"
status: done
round: 1
forge_ended_at: "2026-06-13T19:33:00Z"
---

## Summary

Implemented the `countdown` role and `CountdownView` full-screen kiosk component, routed through `StationRouter`, and selectable in `PairingView`.

## Files changed

| File | Change |
|---|---|
| `pwa/src/lib/types.ts` | Added `'countdown'` to `PairedSession.role` union |
| `pwa/src/components/cuelist/CountdownView.tsx` | New — full-screen countdown kiosk view |
| `pwa/src/components/StationRouter.tsx` | Import + route `role === 'countdown'` → `<CountdownView>` |
| `pwa/src/components/PairingView.tsx` | Added "Countdown display" option to role select; type widened; countdown gets empty `owned_departments` |
| `tests/unit/pwa/CountdownView.test.tsx` | New — 16 unit tests |

## Design decisions

- `CountdownView` uses `useClock()` (B005-002) for show time, `usePlayhead()` for standing/next cue IDs, `useCuelist()` to resolve cue labels, and `useGoChannel()` for pre-wait state and last-dispatched cue.
- Pre-wait countdown animates via `requestAnimationFrame` in an isolated `CountdownBlock` sub-component; when no pre-wait is active it shows an idle `—:——` placeholder.
- "Next / standby" shows `armedCueId ?? playheadCueId` cue label at large teal font; "then" sub-label shows the cue after the standing one.
- "Last fired" shows label from `lastDispatched`.
- No GO button, no edit controls — read-only by construction.
- `buildConnectOpts` in `StationRouter` maps `countdown` → awareness role `'operator'` (no SM privileges; simplest authority-safe option).
- PairingView: countdown role gets `owned_departments = []` (no department authority).

## Tests run

```
Tests  1842 passed (1842)
Test Files  146 passed (146)
```

Build: `pnpm --filter showx-pwa build` clean (no node:* leak).
Typecheck: `pnpm -r typecheck` clean.

## Acceptance criteria checklist

- [x] `'countdown'` added to role enum in `pwa/src/lib/types.ts`
- [x] Selectable in PairingView; countdown station gets no `owned_departments`
- [x] `CountdownView`: full-screen, TimecodeDisplay reused, big countdown + cue labels
- [x] `StationRouter` routes `role === 'countdown'` → `CountdownView` (lines 190-192)
- [x] Subscribes to `useClock`, `usePlayhead`, `useGoChannel` — no cue-control affordances
- [x] Responsive layout for kiosk (100vw/100vh fixed, dark high-contrast)
- [x] Unit tests: 16 tests covering routing, render, no-GO, pre-wait countdown, cue labels
- [x] Build clean, typecheck clean, 1842 tests pass, no edits outside target_files

## Notes for Critic

- `requestAnimationFrame` is mocked via `vi.stubGlobal` in tests; the RAF loop in `CountdownBlock` only runs when `preWaitMs !== null`, avoiding side-effects in idle tests.
- `buildConnectOpts` change is minimal: `countdown` → `'operator'` awareness role. No SM path needed; the view never writes playhead.
- The `StationRouter` seam map cited in the spec (lines 185-202) matches the actual routing block; `countdown` is inserted between `sm` and `operator`.
