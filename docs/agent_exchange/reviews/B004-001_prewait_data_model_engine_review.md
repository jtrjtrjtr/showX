# Critic Review — B004-001: Pre-wait data model + dispatch timing

**Verdict:** `accepted`
**Reviewer:** Critic (Opus)
**Reviewed at:** 2026-06-13T14:10:00Z
**Review round:** 2
**Tests run:** 17/17 prewait.test.ts green; 760/761 cuelist-core green (one unrelated failure in `payloadDispatch.test.ts` for webhook payload — caused by B004-005's WIP changes in `transports/webhook.ts` + `webhookOut.ts`, NOT B004-001 territory); `pnpm -r typecheck` clean across all 5 workspace packages.

---

## Round 2 summary

Round 1 finding **F-1** (lock-kind inconsistency between `setCuePreWait` and `updateCueFields` for `pre_wait_ms`) is resolved with the minimal change requested:

- `src/modules/cuelist-core/src/document/cue.ts:290` — `assertEditAllowed(doc, 'structure')` → `assertEditAllowed(doc, 'meta')` ✅
- `tests/unit/modules/cuelist-core/go/prewait.test.ts:195-200` — replaced "throws LockedError in SHOW mode" with "succeeds in SHOW mode (pre_wait_ms is a meta/timing field, not structural)" ✅

Both public APIs (`setCuePreWait` and `updateCueFields`) now agree: `'meta'` lock, allowed in SHOW mode. Matches sibling timing-field helpers (`setCueTrigger`, `setCueDurationHint`, `setCueLabel`, `setCueDescription`) and the spec direction ("same lock as trigger edits").

No other changes from round 1 — the engine timing model, cancellation logic, lazy default, and chain-correct `auto_continue.delay_ms` measurement remain as previously accepted in F-1's surrounding context.

---

## Acceptance-criteria walk (round 2)

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `pre_wait_ms?: number` on `Cue`, lazy default 0, no destructive migration | ✅ | `src/shared/src/types/cue.ts`; lazy default at `goEventChannel.ts:232` (`?? 0`); follows existing nullable-field pattern |
| 2 | Dispatch delayed by `pre_wait_ms`; `pre_wait_ms === 0` → no behavior change | ✅ | `goEventChannel.ts` schedule/immediate branches; tests C + E |
| 3 | `cue-fire` published at DISPATCH time (post-pre_wait), TriggerEngine chain still correct | ✅ | `goEventChannel.ts` `publishCueFire` called from inside the timeout; test G end-to-end through `TriggerEngine` confirms 1000+3000=4000 ms total |
| 4 | Pre-wait cancelable on new GO / abort / mode transition | ✅ | New GO replaces pending timer; mode-change handler clears map; channel `stop()` covers shutdown. Section F tests all pass. |
| 5 | Document helper with validation + lock guard matching trigger edits | ✅ | `cue.ts:283-299` — `'meta'` lock now matches `updateCueFields` (`cue.ts:330`) and `setCueTrigger` (`cue.ts:245`). Validation rejects negative/NaN/non-integer (`:291-293`). |
| 6 | Unit tests for 0/delayed/cancel/auto_continue/lazy default | ✅ | 17 tests, fake timers, all required cases covered |
| 7 | `pnpm -r typecheck` clean, tests pass, no edits outside `target_files` | ✅ | Verified; B004-001's diff touches only `src/shared/src/types/cue.ts`, `src/modules/cuelist-core/src/document/cue.ts`, `src/modules/cuelist-core/src/go/goEventChannel.ts`, and new `tests/unit/modules/cuelist-core/go/prewait.test.ts`. The 1 failing test belongs to B004-005's webhook work-in-progress, not this task. |

---

## Test execution

```
pnpm vitest run tests/unit/modules/cuelist-core/go/prewait.test.ts
  ✓ 17 passed (14 ms)

pnpm vitest run tests/unit/modules/cuelist-core/
  ✓ 54 of 55 files, 760 passed, 1 failed
  ✗ payloadDispatch.test.ts > webhook payload: not_implemented, does not crash
    — caused by B004-005 in_progress webhook implementation, not B004-001

pnpm -r typecheck
  ✓ all 5 workspace packages clean
```

---

## Final disposition

`accepted`. Engine-side pre-wait timing model is correct, well-tested, lazy-default-safe, cancelable, and lock-consistent across both write APIs. B004-002 (UI countdown) and B004-010 (CSV import) can now proceed as dependents.

No further action requested from Forge.
