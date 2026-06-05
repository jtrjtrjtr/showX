---
id: "B003-007"
title: "Trigger taxonomy — manual / auto_follow / auto_continue scheduler"
verdict: "accepted"
review_round: 2
reviewer: "critic"
reviewed_at: "2026-06-06T23:05:00Z"
critic_model: "claude-opus-4-7"
---

## Summary

Round 2 addresses the single round-1 gap (missing info-level log for timecode triggers) exactly as recommended:

1. **Log added** in `TriggerEngine.onCueFire` (engine context — logger in scope, no signature churn to `schedule()`).
2. **Test added** that spies on `log.info` and asserts both the exact message string and the `{ cuelist_id, cue_id }` payload shape.
3. **`makeMockLog` upgraded** to `vi.fn()`-backed spies — backwards-compatible (all 35 existing tests still pass without modification).

36 trigger tests pass (was 35); 594 total tests pass; no regressions.

**Verdict: `accepted`.**

## Acceptance criteria — round 2 re-verification

| # | Criterion | Status | Citation |
|---|---|---|---|
| 1 | Discriminated union manual/auto_follow/auto_continue/timecode + timecode logged as "deferred to 0.2" | ✓ | `scheduler.ts:16-52` + `triggerEngine.ts:64-69` (log now present) |
| 2 | Q5 default — auto_follow + prev.duration_hint_ms=null fires on prev start | ✓ | `scheduler.ts:35-44`; `triggerEngine.test.ts:246-255` |
| 3 | TriggerEngine class with cue context + EventBus subscriptions | ✓ | `triggerEngine.ts:8-25` |
| 4 | `schedule(cue, prevFire, doc): ScheduledFire \| null` | ✓ | `scheduler.ts:12` |
| 5 | auto_follow on cue-complete OR immediately when null duration | ✓ | `triggerEngine.ts:94-114` + `scheduler.ts:35-44` |
| 6 | auto_continue triggers delay_ms after prev cue-fire | ✓ | `scheduler.ts:20-30`; `triggerEngine.test.ts:211-224` |
| 7 | setTimeout cancels via abortSignal / REHEARSAL→SHOW / skip | ✓ | `triggerEngine.ts:24`, `cancelAll()` line 124, `cancelAllForCuelist()` line 132 |
| 8 | Loop guard MAX 1000 → system-error | ✓ | `triggerEngine.ts:6, 45-58`; `triggerEngine.test.ts:336-374` |
| 9 | Timecode parsed + stored, NOT scheduled, **info log** | ✓ | `triggerEngine.ts:64-69` (log added round 2); `triggerEngine.test.ts:296-307` |
| 10 | `isAutoTriggered()` and `getFollowSource()` helpers | ✓ | `scheduler.ts:62-69` |
| 11 | EventBus integration | ✓ | `triggerEngine.ts:15-25, 81-92, 104-113` |
| 12 | 25+ vitest tests | ✓ | 36 tests (16 scheduler + 20 engine) |

## Round-2 delta — code review

### `src/modules/cuelist-core/src/trigger/triggerEngine.ts:64-69`

```ts
if (next.trigger.kind === 'timecode') {
  this.deps.log.info('timecode trigger deferred to 0.2', {
    cuelist_id: e.cuelist_id,
    cue_id: next.id,
  });
}
```

- Placement is correct: after `findNextCue`, before `schedule()`. The scheduler returns null for timecode, so behavior (no scheduled fire) is preserved.
- Log fires exactly once per cue-fire when next is timecode-triggered. No double-fire risk.
- Message string matches spec verbatim (AC #1 and AC #9): `"timecode trigger deferred to 0.2"`.
- Payload includes the two pieces of context an operator/debugger needs: which cuelist and which cue is being deferred.

### `tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts:64-73`

`makeMockLog` upgraded:

```ts
function makeMockLog(): Logger & { info: ReturnType<typeof vi.fn> } {
  const log = {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: () => log,
  } as Logger & { info: ReturnType<typeof vi.fn> };
  return log;
}
```

- All four log methods are now spies. Backwards-compatible (spies act as no-ops by default).
- `child()` returns the same logger instance — fine for unit tests, no scope-tagging behavior asserted by existing tests.
- `TestContext.log` exposed for future tests that need to assert log calls. Sensible foundation.

### `tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts:296-307`

```ts
it('logs info "timecode trigger deferred to 0.2" when next cue is timecode-triggered', () => {
  const { engine, add, fireCue, log } = makeSetup();
  const q0 = add('Q0');
  const q1 = add('Q1', { kind: 'timecode', time_ms: 5000, source: 'ltc' });
  engine.start();
  fireCue(q0);
  vi.runAllTimers();
  expect(log.info).toHaveBeenCalledWith('timecode trigger deferred to 0.2', {
    cuelist_id: expect.any(String),
    cue_id: q1,
  });
});
```

- Asserts the exact spec-required message string.
- Verifies payload structure (`cuelist_id` present, `cue_id` is the timecode-next cue).
- Companion test "does not emit cuelist-go for timecode trigger" (lines 286-294) remains, confirming behavior unchanged.

## Tests run

```
pnpm vitest run tests/unit/modules/cuelist-core/trigger/
  Test Files  2 passed (2)
  Tests       36 passed (36)

pnpm test
  Test Files  53 passed (53)
  Tests       594 passed (594)
```

No regressions. Trigger test count went from 35 → 36 (one new test for the log assertion). Full suite went from 568 → 594 (other unrelated B003 work landed between rounds).

## Non-blocking observations carried over from round 1

These were flagged as non-blocking in round 1 and remain non-blocking — Forge correctly chose not to address them:

- `MAX_AUTO_CHAIN = 1000` not configurable via config schema. Acceptable per spec ("if not in B003-001 config, leave as constant"). Worth a follow-up task only if a real venue needs to tune it.
- Chain-depth-reset test (now `triggerEngine.test.ts:378-397`) fires 998 autos before the manual reset, not approaching the 1000 threshold. Reset code (`triggerEngine.ts:41`) is correct; test-quality nit only.
- `cancelAllForCuelist` runs on every cue-fire. Wasteful in long chains (cancel + re-create each link) but correct behavior. Architect may want to revisit if perf becomes a concern in long shows.

None block acceptance.

## Verdict rationale

All 12 acceptance criteria now met with file-line citations. The round-2 fix is minimal, targeted, and exactly matches the recommendation given in round 1. Code quality is good; tests pass; no regressions. Engine design is sound and ready for downstream consumers (B003-008 GO side-channel, B003-009 payload dispatch).

`accepted`.

## Notes for Architect

- B003-007 closes at round 2 — well within the 5-round budget.
- Downstream B003-008 (GO event side-channel) and B003-009 (cue payload dispatch) can now consume `TriggerEngine.cuelist-go` emissions per protocol_dictionary contract.
- Mock-logger pattern (`vi.fn()` spies + exposed `log` in TestContext) is now established for cuelist-core trigger tests — good foundation for future tests that need to assert log behavior.
- No architectural decisions required.
