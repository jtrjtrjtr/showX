---
id: "B001-003"
critic_started_at: "2026-06-05T11:25:00Z"
critic_completed_at: "2026-06-05T11:35:00Z"
verdict: "accepted"
review_round: 2
owner_under_review: "forge"
---

## TL;DR

The single failing criterion from round 1 (`pnpm --filter showx-main typecheck`) now passes cleanly. Forge picked Option B from the round-1 review (pre-build `showx-shared`, no tsconfig surgery to project references) and added an explicit `rootDir: "src"` for clarity. Source files (Logger.ts, EventBus.ts, HealthBus.ts) were not touched — round-1's green checks on the other nine criteria carry through. **accepted.**

## Round-2 verification

### Diff inspected

`git diff HEAD -- src/main/tsconfig.json src/main/package.json` — only the two files Forge claimed in the done report changed:

- `src/main/tsconfig.json`: removed the `paths: { "showx-shared": ["../shared/src/index.ts"] }` block, added `"rootDir": "src"` explicitly.
- `src/main/package.json:8`: `typecheck` script is now `pnpm --filter showx-shared build && tsc --noEmit`.

No shared source code or test code modified. No surface beyond the round-1 critical-issue scope.

### Typecheck (the one failing criterion)

```
$ pnpm --filter showx-main typecheck
> showx-main@0.0.1 typecheck
> pnpm --filter showx-shared build && tsc --noEmit
> showx-shared@0.0.1 build
> tsc
$ echo $?
0
```

Silent exit 0. `src/shared/dist/index.d.ts` produced as side-effect; TypeScript now resolves `showx-shared` through the workspace symlink (`node_modules/showx-shared` → `src/shared` package, `dist/index.d.ts` honored by the package's `types` field). No TS6059, no path-vs-rootDir collision.

### Test re-run

```
$ pnpm vitest run tests/unit/shared
 ✓ tests/unit/shared/EventBus.test.ts   (8 tests)  11ms
 ✓ tests/unit/shared/Logger.test.ts     (7 tests)  13ms
 ✓ tests/unit/shared/HealthBus.test.ts  (11 tests) 11ms
 ✓ tests/unit/shared/PersistedStore.test.ts (13 tests) 87ms
 ✓ tests/unit/shared/SecretStore.test.ts    (10 tests) 115ms
 Test Files  5 passed (5)
 Tests      49 passed (49)
```

26 B001-003 tests pass (7 + 8 + 11 = 26 ≥ 18 required). B001-004 PersistedStore/SecretStore suite (23 tests) also green — no regression from the tsconfig change.

## Acceptance criteria — final status

All 10 criteria now satisfied:

- [x] Logger interface + child + forSlug — `src/main/src/shared/Logger.ts:22,51-58,60-63` (round 1)
- [x] Logger JSON line writes to configurable stream — `Logger.ts:32,65-86` + `Logger.test.ts:81-92` (round 1)
- [x] `LOG_LEVEL` env override + level drop — `Logger.ts:30,66` + `Logger.test.ts:45-53` (round 1)
- [x] EventBus exact / array / `*` / `subscribePattern` — `EventBus.ts:21,41-46,50-53` + `EventBus.test.ts:44-57` (round 1)
- [x] EventBus.publish sync + handler-exception swallowed — `EventBus.ts:26-35` + `EventBus.test.ts:69-83` (round 1)
- [x] Subscription with idempotent `unsubscribe()` — `EventBus.ts:58-62` + `EventBus.test.ts:85-93` (round 1)
- [x] HealthBus report/emit/aggregate precedence — `HealthBus.ts:25-32,54-64` + `HealthBus.test.ts:21-47` (round 1)
- [x] ≥18 test cases, fake timers, no real I/O — 26 cases verified above (round 1)
- [x] **`pnpm --filter showx-main typecheck` passes** — verified this round, silent exit 0
- [x] `pnpm vitest run tests/unit/shared` passes 100% — verified this round, 49/49

## Code review notes (carried from round 1, still applicable as follow-ups, NOT blocking)

These were called out in round 1 as non-blocking. They remain non-blocking. Listed here only so the Architect has the trail in one place:

1. Logger file-stream error path (`Logger.ts:77-85`) has no dedicated regression test. Spec test-plan line 303 listed one; coverage gap is not on the acceptance-criteria critical path.
2. `HealthBus.observeAggregate` is an additive method beyond the `HealthBusIface` contract from `services.ts`. Documented in Forge's round-1 decision; harmless.
3. `subscribePattern` glob is the permissive `*`→`.*` variant (per spec line 189). Won't break colon-namespaced types in practice, but no namespace boundary if those ever appear.

## Decision-Option-B note

Forge's choice of Option B (pre-build via `pnpm --filter showx-shared build`) over Option A (project references with `composite: true`) is reasonable. Project references would have required `composite: true` on `src/shared/tsconfig.json` and a `tsc -b` invocation; Forge documented that `tsc -b --noEmit` hit TS6310 against the current base config. Option B keeps the change surgical (2 files, 4 lines). The build step is fast (~200ms type-only) and idempotent.

The only mild downside: every `typecheck` invocation now rebuilds `showx-shared` even when nothing in shared changed. For a foundation bundle this is fine. If the inner loop ever feels slow, future Forge can revisit Option A — but that's a separate task.

## Verdict

**accepted.** B001-003 closes. Spec stays in `done/`, done report stays in `done/`. No re-queue.
