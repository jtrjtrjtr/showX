---
id: "B003-015"
title: "PWA GO button + standby panel — SM authoritative dispatch UI"
status: "done"
review_round: 2
forge_confidence: high
---

## Summary (Round 2 revision)

Addressed both required Critic changes from round 1 review:

1. **Rejection reason toast added** — `SMMasterView` now derives `displayReason` by stripping the `:seq` counter suffix from `rejectedReason` state and renders a `<div role="alert" aria-live="assertive">` above the GO button when a rejection arrives. Toast auto-clears after 2 s (driven by the existing `setTimeout`). Styled red/bold/centered so it is immediately visible at FOH distances.

2. **Two rejection-reason tests added** — `SMMasterView.test.tsx` gains two tests inside a `describe('go.rejected toast')` block that use `vi.useFakeTimers()`:
   - Verifies the `role="alert"` element appears with reason text after simulating `go.rejected`, then disappears after `vi.advanceTimersByTime(2001)`.
   - Verifies the `:seq` suffix is stripped from the displayed reason.

The optional AC #9 gap (role indicator in HelpOverlay) remains deferred — station role is not yet available in PWA context. A follow-up task can wire `stationRole` from the awareness layer when needed.

## Files changed

| File | Change |
|------|--------|
| `pwa/src/components/cuelist/SMMasterView.tsx` | Added `displayReason` derived value (strips `:seq` suffix) + rejection toast `<div role="alert">` above GoButton |
| `tests/unit/pwa/components/cuelist/SMMasterView.test.tsx` | Added 2 tests for rejection toast display and auto-clear |

## Tests run

```
✓ tests/unit/pwa/components/cuelist/SMMasterView.test.tsx   (15 tests)  298ms
✓ tests/unit/pwa/components/cuelist/GoButton.test.tsx        (12 tests)  152ms
✓ tests/unit/pwa/hooks/usePlayhead.test.tsx                   (6 tests)   50ms
✓ tests/unit/pwa/components/cuelist/StandbyPanel.test.tsx   (13 tests)  164ms

Full suite: Test Files 90 passed, Tests 897 passed
(1 pre-existing intermittent failure in cueCatalog.test.ts — ENOTEMPTY cleanup race, unrelated to B003-015)
```

SMMasterView goes from 13 → 15 tests.

## Critic items addressed

| Issue | Status |
|-------|--------|
| #1 Rejection reason not displayed in DOM | Fixed — `<div role="alert">` shows `Rejected: {displayReason}` |
| #2 No unit test for rejection toast | Fixed — 2 tests added covering display and seq-suffix stripping |
| #3 HelpOverlay role indicator (optional) | Deferred — station role not yet in PWA context |

## Notes for Critic

- `displayReason` is derived: `rejectedReason.replace(/:\d+$/, '')` — safe even if reason has no suffix (regex returns original string unchanged).
- The dead-code `return () => clearTimeout(t)` noted in round 1 review (inside the side-channel callback) remains as-is — removing it would be cosmetic and touches the pattern Critic accepted as non-blocking.
- HelpOverlay role indicator gap documented in notes. Can be addressed in a follow-up task when `stationRole` is threaded through ConnectionContext or awareness.
