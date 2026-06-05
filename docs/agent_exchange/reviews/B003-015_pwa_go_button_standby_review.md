---
task_id: "B003-015"
title: "PWA GO button + standby panel — SM authoritative dispatch UI"
verdict: "accepted"
review_round: 2
reviewed_at: "2026-06-07T22:30:00Z"
reviewer: "critic"
---

## Summary

Round 2 resubmit cleanly addresses both required changes from round 1. Diff is surgical (~25 LOC component + 56 LOC tests). All 46 unit tests across the 4 B003-015 files pass. Deferred optional item (HelpOverlay role indicator) is documented per round 1 allowance.

## Round 1 required changes — verification

| # | Change required | Status | Citation |
|---|---|---|---|
| 1 | Display rejection reason in DOM | ✅ FIXED | `pwa/src/components/cuelist/SMMasterView.tsx:131` derives `displayReason` (strips `:seq` via `/:\d+$/`); `:236-253` renders `<div role="alert" aria-live="assertive">Rejected: {displayReason}</div>` above GoButton |
| 2 | Add unit test asserting rejection text rendered | ✅ FIXED | `tests/unit/pwa/components/cuelist/SMMasterView.test.tsx:268-322` adds `describe('go.rejected toast')` with two tests — display+autoclear (2001ms fake timer) and seq-suffix stripping |
| 3 | HelpOverlay role indicator (optional) | ⏭️ DEFERRED with note | Done report §"Notes for Critic" line 19 documents the deferral; round 1 review explicitly allowed this if noted |

## Acceptance criteria — final verification

| # | Criterion | Status | Citation |
|---|---|---|---|
| 1 | GO button bottom of SM view; SHOW=red, REHEARSAL=teal | ✅ | `GoButton.tsx:45` + `SMMasterView.tsx:254-262` |
| 2 | SM authority via `useGoChannel`; non-SM rejected | ✅ | `SMMasterView.tsx:67` + `:261` |
| 3 | Keyboard: Space/arrows/Q/Esc/? | ✅ | `SMMasterView.tsx:100-117` |
| 4 | Standby panel: next 1-3 cues + armed; pulses | ✅ | `StandbyPanel.tsx` + `SMMasterView.tsx:225-233` |
| 5 | Visual feedback on GO: flash, row pulse, calling text | ✅ | `GoButton.tsx:64-65` + `CueRow.isFiring` + `CallingText.tsx:30` |
| 6 | GO rejected: toast + shake; reason shown briefly | ✅ **NOW COMPLETE** | shake: `GoButton.tsx:47-52`; toast: `SMMasterView.tsx:236-253`; auto-clear: `:83` setTimeout 2000ms |
| 7 | Override: long-press 1.5s OR Cmd+Shift+G → dialog | ✅ | `GoButton.tsx:69` + `SMMasterView.tsx:89-98` |
| 8 | `usePlayhead` API + Yjs persistence | ✅ | `pwa/src/hooks/usePlayhead.ts` |
| 9 | Help overlay: shortcuts + authority + role | ⏭️ partial (role indicator deferred with documented gap — acceptable per round 1 ruling) | `HelpOverlay.tsx` shortcuts ✅, authority ✅, role indicator deferred |
| 10 | aria-label on GO; role=status aria-live=polite | ✅ | `GoButton.tsx:82` + `StandbyPanel.tsx:31-32` |
| 11 | Touch-friendly: GO ≥80px, standby tappable | ✅ | `GoButton.tsx:85` + StandbyPanel |
| 12 | Touch + mouse + keyboard parity | ✅ | `GoButton.tsx:76-80` |
| 13 | 15+ vitest + RTL tests | ✅ | 46 tests across 4 files (12+6+13+15) |

## Code review notes — round 2 delta

- `displayReason` derivation at `SMMasterView.tsx:131` uses `/:\d+$/` — correct anchored regex; safe no-op when reason has no suffix.
- Toast styling: red bg + white text + bold + centered — high visibility at FOH distances, matches safety-critical UX brief.
- ARIA: `role="alert" aria-live="assertive"` — appropriately more urgent than the standby panel's `polite`. Screen readers will interrupt to announce rejection. Correct.
- Test fake-timer pattern is clean: `beforeEach(useFakeTimers)` + `afterEach(useRealTimers)` scoped to the nested `describe`, so timer mocking doesn't leak to other tests.
- Handler-lookup pattern (inspecting `vi.mocked(sideChannel.on).mock.calls`) is the same approach used elsewhere in PWA tests. Idiomatic.
- The dead-code `return () => clearTimeout(t)` inside the `sideChannel.on` callback (round 1 §"Out-of-scope items") remains — Forge cited it as cosmetic-only. **Accepted as non-blocking** per round 1; not a regression.

## Test results

```
✓ tests/unit/pwa/hooks/usePlayhead.test.tsx                  (6 tests)
✓ tests/unit/pwa/components/cuelist/StandbyPanel.test.tsx   (13 tests)
✓ tests/unit/pwa/components/cuelist/GoButton.test.tsx       (12 tests)
✓ tests/unit/pwa/components/cuelist/SMMasterView.test.tsx   (15 tests)  ← +2 from round 1

Test Files  4 passed (4)
     Tests  46 passed (46)
   Duration  1.14s
```

## Verdict

`accepted` — both required round 1 changes implemented correctly with verified test coverage, and the optional HelpOverlay role indicator is properly deferred with a documented gap (round 1 explicitly permitted this). The GO button + standby UI is now feature-complete per spec and ready for production wiring.
