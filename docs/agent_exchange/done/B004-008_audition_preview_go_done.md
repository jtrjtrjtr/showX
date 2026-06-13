---
id: "B004-008"
title: "Audition / Preview GO — dry-run dispatch"
status: "done"
owner: "forge"
round: 1
started_at: "2026-06-13T15:40:00Z"
ended_at: "2026-06-13T16:10:00Z"
---

## Summary

Audition (dry-run) mode was already partially implemented in the codebase from an earlier incomplete session. This run completed the implementation, fixed the one failing test, and confirmed all 1638 tests pass.

## What was already in place

- `payloadDispatch.ts`: `makeAuditionOutput()` no-op dispatcher, `deps.audition` flag wired through, `[AUDITION]` prefix on detail entries, `cue-complete` suppression in audition mode.
- `types.ts`: `audition?: boolean` in `DispatchDeps`.
- `goEventChannel.ts`: `AuditionRequest` type, `onAuditionRequest()` handler subscribed in `start()`, SM authority check, `dispatchAudition` callback wired.
- `GoExecutor.ts`: `dispatchAudition` injected into `GoEventChannel` deps, uses a no-op `makeNopOutput()`, pushes to dispatch ring log.
- `sideChannel.ts`: `AuditionResult` type, `audition.result` topic in `SideChannelEventMap`, `handleMessage` switch case, `sendAuditionRequest()` method.
- `useGoChannel.ts`: `audition(cueId)` function, `lastAuditioned` state, `audition.result` subscription.
- `SMMasterView.tsx`: `AuditionBar` component with AUDITION button (teal border, disabled state), last result display, wired to `audition()` and `lastAuditioned`.
- Unit tests in `payloadDispatch.test.ts`: 5 audition-mode tests (sendFn not called, [AUDITION] prefix, no cue-complete, webhook, disarmed+audition).
- Unit tests in `goEventChannel.test.ts`: 5 audition.request tests.

## Fix applied

One test was failing:

```
GoEventChannel — audition.request > audition.request: audition.result published to requesting station
```

**Root cause:** `onAuditionRequest` is an async function. The happy path awaits `this.deps.dispatchAudition(...)` (a mock resolved promise). The mock's resolution chain requires an extra microtask tick compared to what the test accounted for. Synchronous-rejection paths (`toStation` already populated synchronously for unknown cue / non-SM) passed fine; only the async success path needed the extra tick.

**Fix:** Added one more `await Promise.resolve()` to the failing test (total 3 instead of 2), with a comment explaining the reason.

## Files changed

- `tests/unit/modules/cuelist-core/go/goEventChannel.test.ts` — added one `await Promise.resolve()` to the audition.result timing test with comment.

## Tests run

```
Test Files  137 passed (137)
Tests       1638 passed (1638)
```

`pnpm --filter showx-pwa build` — clean  
`pnpm -r typecheck` — clean

## Notes for Critic

- All implementation code was already correct and complete — the only change is one extra `await Promise.resolve()` in a test that was validating async timing.
- The audition pipeline: PWA AuditionBar → `sideChannel.sendAuditionRequest()` → WS `audition.request` topic → `GoEventChannel.onAuditionRequest()` (SM auth check) → `GoExecutor.dispatchAudition()` (no-op output, full routing) → `audition.result` pushed back to station → `useGoChannel` receives and sets `lastAuditioned` → `AuditionBar` displays result.
- No playhead advance, no `cue-complete` event, no real transport bytes in audition mode — all confirmed by tests.
- `AuditionBar` works in both REHEARSAL and SHOW mode (it's always safe).
