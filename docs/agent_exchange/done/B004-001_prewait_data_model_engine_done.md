# Done Report — B004-001: Pre-wait data model + dispatch timing

**Status:** done  
**Round:** 2 (revision addressing Critic F-1)  
**Forge ended:** 2026-06-13T14:05:00Z  
**Tests:** 751 passed, 0 failed (54 test files, cuelist-core suite)  
**Typecheck:** clean (`pnpm -r typecheck` — all 5 workspace packages pass)

---

## Revision summary (round 2)

**Critic finding F-1 addressed:** `setCuePreWait` was calling `assertEditAllowed(doc, 'structure')` while `updateCueFields` used `'meta'` for the same field. In SHOW mode (`structure` blocked, `meta` allowed), this allowed `updateCueFields` to bypass the lock that `setCuePreWait` enforced — two public APIs disagree on the same write.

**Changes in round 2:**

| File | Change |
|---|---|
| `src/modules/cuelist-core/src/document/cue.ts:290` | `assertEditAllowed(doc, 'structure')` → `assertEditAllowed(doc, 'meta')` |
| `tests/unit/modules/cuelist-core/go/prewait.test.ts:195-200` | Replaced "throws LockedError in SHOW mode" with "succeeds in SHOW mode (pre_wait_ms is a meta/timing field)" |

This aligns `setCuePreWait` with all sibling helpers (`setCueLabel`, `setCueDescription`, `setCueTrigger`, `setCueDurationHint`) which all use `'meta'`. Pre-wait is a timing-tweak field adjustable during a live show (QLab semantics), not a structural operation.

---

## Files changed (cumulative)

| File | Change |
|---|---|
| `src/shared/src/types/cue.ts` | Added `pre_wait_ms?: number` optional field to `Cue` interface |
| `src/modules/cuelist-core/src/document/cue.ts` | Added `setCuePreWait()` (now `'meta'` lock); `pre_wait_ms` in `CueFieldPatch`; validation + write in `updateCueFields()` |
| `src/modules/cuelist-core/src/go/goEventChannel.ts` | `pendingPreWaits` Map; `onGoRequest()` delays `cue-fire` by `pre_wait_ms`; cancellation on new GO / stop / mode change |
| `tests/unit/modules/cuelist-core/go/prewait.test.ts` | 17 unit tests; SHOW-mode test updated to assert success |

---

## Acceptance criteria verification

| Criterion | Status |
|---|---|
| `Cue.pre_wait_ms?: number` in shared types | ✅ |
| `setCuePreWait()` with validation (non-negative integer, `'meta'` lock — same as trigger edits) | ✅ |
| `updateCueFields()` accepts `pre_wait_ms` patch | ✅ |
| Both APIs agree on lock kind | ✅ (both `'meta'`) |
| `cue-fire` delayed by `pre_wait_ms` ms when > 0 | ✅ |
| `cue-fire` immediate when `pre_wait_ms = 0` or absent | ✅ |
| `cue-fire.ts` reflects dispatch time (post-pre_wait) | ✅ |
| Pending pre_wait canceled on new GO / stop() / mode transition | ✅ |
| `auto_continue.delay_ms` measured from dispatch start | ✅ |

---

## Test output

```
pnpm vitest run tests/unit/modules/cuelist-core/go/prewait.test.ts
  ✓ 17 passed (36ms)

pnpm vitest run tests/unit/modules/cuelist-core/
  ✓ 54 files, 751 passed

pnpm -r typecheck
  ✓ all 5 workspace packages clean
```

---

## Notes for Critic

- Only two lines changed from round 1: lock kind in `cue.ts:290` and the SHOW-mode test description + assertion in `prewait.test.ts:195-200`.
- All 17 prewait tests pass; no regressions in the 54-file cuelist-core suite.
- Critic's non-blocking observations from round 1 still apply and require no action.
