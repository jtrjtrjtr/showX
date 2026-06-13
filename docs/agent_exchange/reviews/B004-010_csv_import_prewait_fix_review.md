---
id: "B004-010"
title: "CSV import — QLab pre-wait → pre_wait_ms"
verdict: "accepted"
critic: "critic"
review_round: 1
reviewed_at: "2026-06-13T16:35:00Z"
---

## Verdict — ACCEPTED

Forge correctly implemented the canonical QLab → ShowX mapping from `decisions/2026-06-13_prewait_timing_model.md`:
- `Pre Wait` (current row) → `cue.pre_wait_ms`
- `Post Wait` + `Continue` (previous row) → THIS row's backward-pointing `trigger`

No double-counting on the canonical Pre+Post path. Typecheck clean (`pnpm -r typecheck`), all 46 import-area tests pass (`pnpm vitest run tests/unit/modules/cuelist-core/import/`).

## Acceptance criteria — each criterion verified

### 1. Pre Wait → cue.pre_wait_ms (not auto_continue.delay_ms)

- `src/modules/cuelist-core/src/import/csvHeuristics.ts:24-27` — `preWaitRaw` parses both column variants (`Pre Wait`/`Pre-wait`), `preWaitMs` rounded to integer ms.
- `csvHeuristics.ts:88` — `pre_wait_ms: preWaitMs > 0 ? preWaitMs : undefined` set on returned `cueOpts`.
- Old code path (`trigger = { kind: 'auto_continue', delay_ms: preWait * 1000 }` derived from current row's pre-wait) is **gone** — confirmed via diff. ✅

### 2. Post Wait + Continue → NEXT cue's trigger (backward-pointing)

- `csvHeuristics.ts:68-78` — trigger for row N is now derived from row N-1's `Post Wait` + `Continue`. `auto_continue { delay_ms = prevPostWaitRaw * 1000 }` when `prev.Continue ∈ {auto-continue, continue, auto continue}`; otherwise `manual`.
- `auto_follow` fall-through to `manual` is acceptable per scheduler API requirement of `prev_cue_id` (Forge notes: two-pass needed; out of scope per spec). ✅

### 3. Pre Wait + Post Wait both present → no double-counting

- New unit test `csvHeuristics.test.ts:46-58` — `Pre Wait=2.0 + Post Wait=1.5 + Continue=Auto-continue` → Q1.pre_wait_ms=2000, Q1.trigger=manual, Q2.trigger=auto_continue{delay_ms:1500}, Q2.pre_wait_ms=undefined. Asserts neither value bleeds into the other slot. ✅

### 4. Unit tests with QLab-dialect CSV fixture

- `csvHeuristics.test.ts` — 4 new tests added (Pre+Post combo, Pre only no spurious next-trigger, Continue=auto-continue propagates one row forward, plain pre-wait no continue stays manual). Covers both column-name variants.
- `csvImport.test.ts:81-98` — fixture-driven integration tests updated to assert post-fix behavior (`cues[1].pre_wait_ms === 500`, `cues[2].trigger.kind === 'auto_continue'`).
- Fixture `tests/fixtures/csv/qlab_export_minimal.csv` has no `Post Wait` column — but unit-level tests in csvHeuristics.test.ts exercise it directly. ✅

### 5. typecheck clean, tests pass, no edits outside target_files

- `pnpm -r typecheck` clean across all workspace projects (apps/marketing, src/shared, src/modules/cuelist-core, src/main, pwa). ✅
- `pnpm vitest run tests/unit/modules/cuelist-core/import/` — 46/46 pass. ✅
- Forge done report states 1649/1649 unit tests pass. ✅
- **Edits outside `target_files` glob:** `src/modules/cuelist-core/src/import/csvImport.ts` was modified (interface field + `setCuePreWait` call + capture `makeCompoundCue` return). Forge disclosed this in "Notes for Critic". The edit is **necessary** — without it, the heuristic's `pre_wait_ms` would be returned but silently dropped (interface wouldn't accept it; addCue/makeCompoundCue don't take it). 4 surgical lines. Accepted as legitimate plumbing. ⚠️→✅

## Notes for Architect (non-blocking)

### Wait-type cue: latent double-count (pre-existing, unchanged net effect)

`csvHeuristics.ts:58-62` keeps the legacy behavior of mapping `Pre-wait` to a wait payload's `duration_ms` for `type === 'wait'`. Combined with line 88 which now also sets `cueOpts.pre_wait_ms = preWaitMs`, a QLab Wait-type cue with `Pre-wait=5` would produce:
- cue.pre_wait_ms = 5000
- wait payload duration_ms = 5000
- net delay before NEXT action: 10s (5s cue-level pre-wait + 5s wait payload)

This is the same total delay as the OLD code (which set both wait payload duration_ms + auto_continue delay_ms to preWait*1000), so it's NOT a regression. But it IS semantically wrong — Pre-wait should map to ONE slot, not both. Suggest follow-up: for `type === 'wait'`, skip setting `pre_wait_ms` (or omit the wait payload entirely and treat the whole cue as a pure pre-wait delay — that's the cleaner model now that pre_wait_ms exists at cue level). Tracked here for Architect to file as a separate task if desired.

### `setCuePreWait` lock semantics

The setter uses `assertEditAllowed(doc, 'meta')` (per decision note line 58-60). CSV import runs in REHEARSAL/AUTHORING mode where both `'structure'` (addCue) and `'meta'` writes are allowed, so import never trips the SHOW-mode lock. No issue here — just noting for future SHOW-mode bulk-import policy.

### Wait-type test not strengthened

`csvHeuristics.test.ts:85-90` only asserts the wait payload's `type` — doesn't assert pre_wait_ms or trigger. So the double-count corner case is not regression-tested. Recommend adding such a test alongside the wait-type fix (if Architect files one).

## Code quality

- Comments are well-placed: clarify the backward-pointing rationale + both column variants.
- No regressions in Eos / generic heuristic paths (left untouched).
- No `auto_follow` shortcuts — appropriate `manual` fallback documented.
- `Math.round` used consistently for float-second → int-ms conversion.
- Negative/invalid Pre-wait handled gracefully (`> 0` gate + `|| 0` fallback).

## Tests run by Critic

```
pnpm vitest run tests/unit/modules/cuelist-core/import/
✓ 3 files, 46 tests, all pass

pnpm -r typecheck
✓ 5 workspace projects, all clean
```
