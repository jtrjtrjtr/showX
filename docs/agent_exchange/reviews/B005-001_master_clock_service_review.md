---
id: "B005-001"
critic_started_at: "2026-06-13T17:35:00Z"
critic_completed_at: "2026-06-13T17:40:00Z"
verdict: "accepted"
review_round: 2
---

## Round-1 issues — all resolved

### Issue A (CRITICAL) — `setSource` dropped accumulated free-run

Fix verified at **Clock.ts:71-83**:

```ts
setSource(source: ClockSource): void {
  if (this.source === source) return;
  const frozenAt = this.currentTotalFrames();   // ← read BEFORE mutating
  this.source = source;
  if (this.running) {
    this.anchor = { perfMs: this.nowFn(), totalFrames: frozenAt };
  }
  this.log?.info('master-clock: setSource', { source });
  this.emit();
}
```

`currentTotalFrames()` now reads with `this.source` still equal to its old value, so the internal-mode branch (Clock.ts:101-108) executes and returns the live free-run position.

Regression test at **Clock.test.ts:345-351**: `start → advanceMs(2000) → setSource('mtc')` → `totalFrames === 50` (was 0). Existing tests at l.311-340 were also strengthened to assert `frozenFrames === 25` rather than the previously-tautological `0 === 0` (l.317, l.329).

### Issue B (AC2 violation) — 29.97 free-run used integer 30

Fix verified at **Clock.ts:107**:

```ts
const fps = this.rate === 29.97 ? 30000 / 1001 : this.rate;
return this.anchor.totalFrames + Math.floor(elapsedMs * fps / 1000);
```

Drift eliminated. Math check: `1000 ms × 30000/1001 ÷ 1000 = 29.970029… → floor = 29` (not 30); `1001 ms × 30000/1001 ÷ 1000 = 30.0 → floor = 30`. Both directly asserted in regression test at **Clock.test.ts:364-376**.

`intFps()` is now used only by the DF label math in `framesToTc`/`tcToFrames` (timecode.ts:43, 99), which is correct — DF labeling counts integer frame slots per second. The unused `intFps` import was removed from Clock.ts. ✓

The renamed/updated test at **Clock.test.ts:197-204** ("29.97DF increments at real 30000/1001 rate") replaces the old integer-30 expectation with the correct 29.

### Issue C (Minor) — `setSource('internal')` did not re-anchor

Fix verified at **Clock.ts:78**: the re-anchor condition changed from `if (source !== 'internal' && this.running)` (round 1) to `if (this.running)` (round 2). Every transition while running re-anchors at the current frozen position with `perfMs = now`, so wall-clock elapsed during chase is never retroactively counted as free-run time.

Regression test at **Clock.test.ts:353-362**: `start → 1 s → setSource('mtc') → 5 s → setSource('internal') → 1 s` → expected `totalFrames === 50` (25 pre-chase + 25 resumed), not `175` (which would have included the 5 chase-mode seconds). ✓

## Acceptance criteria — final check

- [x] **AC1** — anchor-based monotonic clock, `performance.now` via `node:perf_hooks` (Clock.ts:1, 34), no wall-clock `Date`. Canonical state `{rate, dropFrame, totalFrames, running, source}` (Clock.ts:21-25, 85-93).
- [x] **AC2** — `Timecode` types + `framesToTc`/`tcToFrames`/`formatTc` in src/shared/src/types/timecode.ts:6-122. DF label math correct (tested at 1799/1800/17982/107892 boundaries). Free-run uses `30000/1001` for 29.97 (Clock.ts:107) — the spec's explicit requirement.
- [x] **AC3** — `start`/`stop`/`locate`/`setRate`/`setSource`/`getState` + `onChange` (Clock.ts:37-99); cheap `getState()` is O(1) via on-demand `currentTotalFrames()`; `source` defaults to `'internal'` (Clock.ts:24).
- [x] **AC4** — Registered after `sync.attach` in Shell.ts:311-312 (matches seam map); exposed on `SharedServices` (contextFactory.ts:37) and `ModuleContext` (context.ts:35) and threaded via `buildContext` (contextFactory.ts:99); `loaderShared` + `sharedServices()` populate `clock` (Shell.ts:385, 469).
- [x] **AC5** — Chase mode freezes free-run at the correct **pre-chase** position; external locate while in chase still updates anchor (`locate` is source-agnostic, Clock.ts:54-59); `currentTotalFrames` returns the anchor as long as `source !== 'internal'` (Clock.ts:102-104). Verified by tests at Clock.test.ts:311-343 (strengthened) and 345-362 (new regression).
- [x] **AC6** — 50 unit tests cover: round-trips at 24/25/30/29.97DF, DF boundaries (1799, 1800, 17982 ten-min exception, 107892 one-hour, 9th-min no-exception), format string (NDF/DF separators), free-run at all four rates, `locate`/`start`/`stop`/`setRate` idempotence and side effects, `onChange` lifecycle + unsubscribe, all three setSource regression cases. `pnpm vitest run tests/unit/shared/Clock.test.ts` → 50/50 pass (re-run during review).
- [x] **AC7** — `pnpm -r typecheck` clean across all 5 workspace packages (apps/marketing, src/shared, src/modules/cuelist-core, pwa, src/main — re-run during review). Scope extensions outside declared `target_files` (contextFactory.ts, src/shared/src/index.ts, src/main/package.json) were disclosed in round 1 and remain pure plumbing for AC4.

## Code quality notes

- Minimal-diff round-2 fix: 3 changed lines in Clock.ts (capture-before-mutate, drop the source-direction guard, real-fps conditional) + removal of unused `intFps` import. No collateral churn.
- Test additions are tight and assertion-rich — each new test maps to one specific failure mode from the round-1 review.
- `MasterClock` interface placement remains in timecode.ts (round-1 non-blocking note carried over); Architect can request a follow-up move to services.ts when convenient.
- Comments at Clock.ts:73-75, 106 explain the *why* of the fix in a way that survives future refactors. Good signal for downstream F2 tasks that will read this code.
- No edits to production code outside the declared scope (Clock.ts + test). `pnpm-lock.yaml`/package.json untouched.

## Verdict rationale

Round-2 patch surgically addresses every issue from round 1:

- **Issue A**: capture-before-mutate. Single-line root cause, fixed at root.
- **Issue B**: real-rate fps at the one site that needed it; integer-fps preserved at the DF label sites that genuinely use slot counts.
- **Issue C**: removed an incorrect direction guard rather than adding a special case — the right shape, structurally.

All three regression tests fail the round-1 code and pass the round-2 code. Existing tests at l.311-343 strengthened to make the previously-masked failure mode loud. Full suite (50/50 unit tests verified locally) green; typecheck across all 5 packages green; no scope expansion.

Acceptance criteria 1-7 fully met. Clean handoff into B005-002 (broadcast) and the rest of F2.

**Accepted.**
