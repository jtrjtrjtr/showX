---
id: "B003-007"
title: "Trigger taxonomy — manual / auto_follow / auto_continue scheduler"
status: "done"
round: 2
forge_model: "claude-sonnet-4-6"
started_at: "2026-06-06T22:50:00Z"
ended_at: "2026-06-06T22:55:00Z"
---

## Summary (round 2)

Addressed the single Critic issue from round 1: added an `info`-level log call "timecode trigger deferred to 0.2" when `TriggerEngine.onCueFire` encounters a timecode-triggered next cue. Added one new test that spies on the mock logger and asserts the log fires.

36 trigger tests pass; 594 total tests pass; no regressions.

## Critic issue addressed

### Issue 1 — Missing info log for timecode triggers

**Fix:** In `triggerEngine.ts:onCueFire`, after `findNextCue` and before `schedule()`, added:

```ts
if (next.trigger.kind === 'timecode') {
  this.deps.log.info('timecode trigger deferred to 0.2', {
    cuelist_id: e.cuelist_id,
    cue_id: next.id,
  });
}
```

The engine already holds `this.deps.log`, so no signature changes were needed to `schedule()`.

**Test added:** Upgraded `makeMockLog()` to use `vi.fn()` on all methods (backwards-compatible — no-op by default). Added test:
> "logs info 'timecode trigger deferred to 0.2' when next cue is timecode-triggered"

Test asserts `log.info` was called with the exact message and correct `{ cuelist_id, cue_id: q1 }` payload.

Also exposed `log` in `TestContext` / `makeSetup` return so future tests can assert on log calls.

## Files changed

- `src/modules/cuelist-core/src/trigger/triggerEngine.ts` — added timecode log block in `onCueFire`
- `tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts` — upgraded `makeMockLog` to `vi.fn()`, added `log` to `TestContext`, added 1 new test (20 total)

## Non-blocking Critic observations (not fixing this round)

- Loop guard threshold `MAX_AUTO_CHAIN` not configurable — left as-is per original rationale; no config task spec yet.
- Chain-depth-reset test fires 998 autos before reset — no correctness bug, nit only.
- `cancelAllForCuelist` on every cue-fire — cancel + re-create pattern is correct per round-1 analysis.

## Tests run

```
pnpm vitest run tests/unit/modules/cuelist-core/trigger/
  Test Files  2 passed (2)
  Tests       36 passed (36)

pnpm test
  Test Files  53 passed (53)
  Tests       594 passed (594)
```

No regressions.

## Notes for Critic

1. The only change from round 1 is the `timecode` log block + test. Core engine logic is unchanged.
2. `makeMockLog` now returns `vi.fn()` spies for all methods. This is backwards-compatible — all 35 existing tests continue to pass without modification.
3. Log fires exactly once per `cue-fire` event when the next cue is timecode-triggered. The test confirms the exact message string and payload shape required by AC #1 and AC #9.
