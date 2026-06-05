---
task_id: "B003-015"
title: "PWA GO button + standby panel — SM authoritative dispatch UI"
verdict: "changes_requested"
review_round: 1
reviewed_at: "2026-06-07T18:50:00Z"
reviewer: "critic"
---

## Summary

Implementation is largely solid. All 5 components (GoButton, StandbyPanel, GoConfirmDialog, HelpOverlay, usePlayhead) exist, are wired into SMMasterView, and 44 unit tests pass cleanly. No typecheck regressions introduced by this task (the pre-existing OperatorView TS6133 errors come from B003-014 and are unrelated).

However, **AC #6 is only partially fulfilled**: shake animation works, but the rejection reason is never displayed to the operator. The spec explicitly requires "toast + button shake animation; reason from `go.rejected` envelope shown briefly", and the test plan (spec line 30) lists "rejection toast" as a mandatory test. Neither the toast UI nor the test exists.

For a button described in the spec as "the most safety-critical UI element in the entire product," letting the user see only a shake — with no indication of *why* the GO was rejected — is a meaningful UX gap. Operator presses GO, button shakes, operator has no information about whether it's a stale armed cue, authority mismatch, or something else.

## Acceptance criteria verification

| # | Criterion | Status | Citation |
|---|---|---|---|
| 1 | GO button bottom of SM view; SHOW=red, REHEARSAL=teal | ✅ | `pwa/src/components/cuelist/GoButton.tsx:45` (color) + `SMMasterView.tsx:233-243` (placement) + tests #4–5 |
| 2 | SM authority enforced via `useGoChannel`; non-SM rejected per B003-008 | ✅ | `SMMasterView.tsx:67` (useGoChannel) + `SMMasterView.tsx:241` (`isAuthoritative={true}`); rejection comes from server via `go.rejected` |
| 3 | Keyboard: Space=GO, arrows=playhead, Q=standby, Esc=cancel, ?=help | ✅ | `SMMasterView.tsx:100-117` (shortcuts map) |
| 4 | Standby panel: next 1-3 cues + armed standby_note; pulses when armed | ✅ | `StandbyPanel.tsx:49-62` (red pulse, font 20) + `SMMasterView.tsx:224` (next 3) |
| 5 | Visual feedback on GO: flash 300ms, cue row pulses, CallingText 'GO <label>' | ✅ | `GoButton.tsx:64-65` (flash 300ms) + `CueRow.isFiring` from `SMMasterView.tsx:212` + `CallingText.tsx:30` |
| 6 | GO rejected: toast + button shake; reason shown briefly | ⚠️ **PARTIAL** | Shake works (`GoButton.tsx:47-52`, test #6); **no toast, no reason display anywhere in DOM** — `rejectedReason` value is consumed only to re-key the shake `useEffect` (`SMMasterView.tsx:74-86`) |
| 7 | Override: long-press 1.5s OR Cmd+Shift+G → confirm dialog | ✅ | `GoButton.tsx:69` (1500ms timer) + `SMMasterView.tsx:89-98` (Cmd+Shift+G) + tests #7, #8 |
| 8 | `usePlayhead` API + persists to Yjs `cuelist.playhead` | ✅ | `pwa/src/hooks/usePlayhead.ts:32-76` + tests usePlayhead #1–6 (incl. two-station propagation) |
| 9 | Help overlay: shortcuts + GO authority explanation + role indicator | ⚠️ **MINOR** | `HelpOverlay.tsx:36-63` lists shortcuts + authority explanation at line 60-62; but "role indicator" (showing operator their own station role: SM/LX/SX/etc.) is **not displayed**. Authority explanation is generic text, not a personalized indicator. |
| 10 | aria-label on GO; role=status aria-live=polite on standby | ✅ | `GoButton.tsx:82` + `StandbyPanel.tsx:31-32`, tests StandbyPanel #5, #6 |
| 11 | Touch-friendly: GO ≥80px, standby cues tappable | ✅ | `GoButton.tsx:85` (minHeight:80) + `StandbyPanel.tsx:66-84` (tappable buttons) + tests GoButton #12, StandbyPanel #7, #8 |
| 12 | Touch + mouse + keyboard parity | ✅ | `GoButton.tsx:76-80` (all three handlers) + tests #10, #11 |
| 13 | 15+ vitest + RTL tests | ✅ on count, ❌ on coverage | 31 new/updated tests (12+6+4 new + SMMasterView updated). But **no test covers "rejection toast"** — spec line 30 explicitly listed this. |

## Required changes (changes_requested)

1. **Display rejection reason in DOM.** Add a small toast/banner near the GO button that renders `rejectedReason` text when set (e.g. "Rejected: not_sm" or a friendly translation: "Not authorized — Stage Manager only"). Auto-clear after ~2 seconds (the existing setTimeout already targets this). Acceptable placement: a `<div role="alert">` above or below the GO button, or a fixed-position toast.
   - The current 2026-06-07 implementation already encodes `reason:seq` and stores it in state — only the render is missing.
   - Strip the `:seq` suffix when rendering to keep the displayed text clean.

2. **Add a unit test asserting the rejection reason text is rendered.** Suggested:
   - In `SMMasterView.test.tsx`: fire `sideChannel.emit('go.rejected', {reason: 'not_sm', …})` and assert the reason text appears in the DOM via `screen.findByText(/not_sm/)` or similar.
   - Verify it disappears after the timeout (use fake timers).

3. **Minor (optional, do not block on this alone):** Add a role indicator to `HelpOverlay` showing the operator's current station role. If station role is not yet available in the PWA context, document the gap and defer to a follow-up task. If you defer, leave a one-line note in your next done report.

## Out-of-scope items I noted but am not requesting

- `setPlayhead` added to `usePlayhead` API (spec didn't list it). Forge documented this in Decision #2 of the done report. **Accepted** as a necessary primitive for click-to-position.
- `SMMasterView.tsx` modified despite not appearing in `target_files`. Spec "## Composition" section explicitly required the wiring. **Accepted** as scope-implicit.
- Cleanup-callback inside the `go.rejected` event handler in `SMMasterView.tsx:84-85` returns `() => clearTimeout(t)` from inside the event callback — this return value goes nowhere (the SideChannel handler return type is ignored). It is not a functional bug because the timeout is short and the state is unconditionally cleared, but the dead-code return value is misleading. Suggest moving the cleanup ref-tracking into a separate effect or removing the return statement. Not a blocker.

## Test results

```
✓ tests/unit/pwa/hooks/usePlayhead.test.tsx        (6 tests)
✓ tests/unit/pwa/components/cuelist/StandbyPanel.test.tsx  (13 tests)
✓ tests/unit/pwa/components/cuelist/GoButton.test.tsx      (12 tests)
✓ tests/unit/pwa/components/cuelist/SMMasterView.test.tsx  (13 tests)

Test Files  4 passed (4)
     Tests  44 passed (44)
```

Typecheck: clean on B003-015 files. Pre-existing TS6133 errors in `OperatorCueRow.tsx`, `OperatorView.tsx`, and `variants/*OperatorView.tsx` originate from B003-014 — not this task.

## Verdict

`changes_requested` — fix the toast/rejection-reason display (#1) and add the toast test (#2). The HelpOverlay role indicator (#3) is optional/deferable. Re-pick should be quick (~30-50 LOC).
