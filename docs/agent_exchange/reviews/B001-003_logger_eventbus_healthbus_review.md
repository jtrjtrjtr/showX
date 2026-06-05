---
id: "B001-003"
critic_started_at: "2026-06-05T09:45:00Z"
critic_completed_at: "2026-06-05T09:55:00Z"
verdict: "changes_requested"
review_round: 1
owner_under_review: "forge"
---

## TL;DR

Code + tests are correct and high quality. **One acceptance criterion fails**: `pnpm --filter showx-main typecheck` does NOT pass — Forge's `paths` mapping in `src/main/tsconfig.json` collides with the existing `rootDir: "src"` constraint, producing 5 TS6059 "not under 'rootDir'" errors. Tests pass cleanly (26/26).

## Acceptance criteria check

- [x] **Logger implements `Logger` interface from showx-shared; supports debug/info/warn/error + `child(suffix)`; auto-prefixes `[<slug>]` when constructed via `forSlug(slug)`** — `src/main/src/shared/Logger.ts:22` declares `class Logger implements LoggerIface`; methods at `:60-63`; `forSlug` at `:51-53`; `child` at `:55-58`. Interface compatibility verified against `src/shared/src/types/services.ts:34-40`.

- [x] **Logger writes structured JSON lines (one per call) to a configurable Writable stream; defaults to `process.stdout` in dev** — `Logger.ts:32` (`this.out = opts.output ?? process.stdout`), `Logger.ts:65-86` emits `JSON.stringify({...}) + '\n'` per call. Confirmed in test `Logger.test.ts:81-92` (each of 4 calls produces a separate parseable JSON line).

- [x] **Logger respects `LOG_LEVEL` env (debug/info/warn/error); messages below level dropped before serialization** — `Logger.ts:30` reads `process.env['LOG_LEVEL']` via `parseLevel`; `Logger.ts:66` short-circuits before `JSON.stringify`. Test `Logger.test.ts:45-53` exercises override path.

- [x] **EventBus implements EventBus interface; supports exact-type subscribe, array of types, `'*'` wildcard, and `subscribePattern('cue:*')` glob** — `EventBus.ts:21` `implements EventBusIface`; matcher tree at `:41-46`; glob at `:50-53`. Spec body explicitly authorizes `*`→`.*` permissive variant (`'cue*'` matching kebab events); Forge took that path with inline comment at `EventBus.ts:13-15` and a passing test at `EventBus.test.ts:44-57`. Acceptable per spec note (line 189 of task spec).

- [x] **EventBus.publish is synchronous; handler exceptions logged but never crash publisher** — `EventBus.ts:26-35`: synchronous `for` loop, try/catch swallows + logs via `this.log?.error(...)`. Handler-list copied with `[...this.handlers]` so unsubscribe-during-publish is safe. Tested at `EventBus.test.ts:69-83`.

- [x] **EventBus subscribe returns `Subscription` with idempotent `unsubscribe()`** — `register()` returns `{id, unsubscribe}` (`EventBus.ts:58-62`). Second call after first removes nothing (`filter()` no-op). Test `EventBus.test.ts:85-93` verifies.

- [x] **HealthBus tracks per-slug status; emits `health-changed` ShowxEvent on transition; `aggregate()` follows error > warning > healthy > unknown reduction** — `HealthBus.ts:25-32` (report + dedup + publish), `HealthBus.ts:54-64` (aggregate with correct precedence). Tested at `HealthBus.test.ts:21-47` including the 4-status combined case.

- [x] **All three services tested with vitest fake timers + no real I/O; ≥18 test cases total** — `Logger.test.ts` 7 + `EventBus.test.ts` 8 + `HealthBus.test.ts` 11 = **26 cases**. Fake timers used in Logger + HealthBus suites; `PassThrough` streams replace stdout; no real `createWriteStream` calls in test paths.

- [ ] **`pnpm --filter showx-main typecheck` passes** — **FAILS**. See "Critical issue" below.

- [x] **`pnpm vitest run tests/unit/shared` passes 100%** — Verified by Critic. Output:
  ```
  ✓ tests/unit/shared/HealthBus.test.ts  (11 tests) 7ms
  ✓ tests/unit/shared/EventBus.test.ts  (8 tests) 6ms
  ✓ tests/unit/shared/Logger.test.ts  (7 tests) 8ms
  Test Files  3 passed (3)
  Tests  26 passed (26)
  ```

## Critical issue — typecheck breakage

Forge added `paths: { "showx-shared": ["../shared/src/index.ts"] }` to `src/main/tsconfig.json:8-10` to bypass the missing `src/shared/dist/` (showx-shared has not been built; its `package.json` exports point at `dist/index.js`/`dist/index.d.ts`).

**The mapping resolves `showx-shared` to `../shared/src/index.ts` — outside `rootDir: "src"`.** TypeScript emits TS6059 for every shared source file pulled into the program:

```
../shared/src/types/events.ts(1,33): error TS6059: File '.../src/shared/src/types/cue.ts' is not under 'rootDir' '.../src/main/src'.
../shared/src/types/module.ts(1,35): error TS6059: File '.../src/shared/src/types/services.ts' is not under 'rootDir' '.../src/main/src'.
../shared/src/types/module.ts(2,36): error TS6059: File '.../src/shared/src/types/context.ts' is not under 'rootDir' '.../src/main/src'.
../shared/src/types/services.ts(10,8): error TS6059: File '.../src/shared/src/types/transport.ts' is not under 'rootDir' '.../src/main/src'.
../shared/src/types/services.ts(12,33): error TS6059: File '.../src/shared/src/types/events.ts' is not under 'rootDir' '.../src/main/src'.

ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  showx-main@0.0.1 typecheck: `tsc --noEmit`  Exit status 2
```

The paths trick + rootDir constraint are mutually incompatible.

### Required fix (Forge picks one)

**Option A (recommended) — TypeScript project references.**

In `src/shared/tsconfig.json` (add `composite: true`):
```json
{ "compilerOptions": { "composite": true, ... } }
```

In `src/main/tsconfig.json` (remove `paths`, add `references`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "module": "NodeNext", "moduleResolution": "NodeNext" },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

`showx-shared` must also produce `dist/index.d.ts` (run `pnpm --filter showx-shared build` once, or add a `prepare` script — coordinate with Architect if you want it in this task).

**Option B — pre-build showx-shared.** Add `"pretypecheck": "pnpm --filter showx-shared build"` to `src/main/package.json`. Cheap, no tsconfig surgery, but couples test-time to a build step.

**Option C — remove the `rootDir` constraint** in `src/main/tsconfig.json` (drop `rootDir: "src"`). Lets the existing `paths` mapping resolve cleanly. Side-effect: `outDir` mirroring changes (output paths will encode the source structure differently). Acceptable for now since `dist/` is not consumed downstream yet.

Forge has full latitude to pick any of A/B/C — just make `pnpm --filter showx-main typecheck` exit 0. Do **not** alter shared-package public types or the three shared service classes; the code under review is fine.

## Code review (positives)

- `console.log` grep across `src/main/src/shared/*.ts` returns nothing. ✓
- All three classes implement their `showx-shared` interfaces by name + structure. ✓
- `EventBus.publish` copies handler list (`[...this.handlers]`) before iteration — safe for unsubscribe-during-publish. (`EventBus.ts:27`) ✓
- `HealthBus.report` dedup is keyed on `status` AND `detail` (`HealthBus.ts:27`), correct per spec.
- `HealthBus.aggregate` precedence verified: error short-circuits (`:58`); warning latches (`:59,62`); healthy fallback (`:60,63`); unknown if no snapshots. Matches spec line 244.
- Two-instance isolation test (`HealthBus.test.ts:94-100`) confirms no module-level state. ✓
- `Subscription.id` is `randomUUID()` string — non-empty, used in `unsubscribe` filter. ✓
- File-stream error handling has BOTH an `'error'` event handler (`Logger.ts:38-42`) AND a write-time try/catch (`Logger.ts:77-85`) — defensive, both paths logged to stdout, file stream destroyed on first failure.

## Code review (minor — not blocking, leave for follow-up if Forge wants)

1. **Logger file-stream error path is untested.** Spec test plan line 303 explicitly lists "Handler attached to a closed file stream doesn't throw" but no such test exists. The implementation path at `Logger.ts:77-85` is dead-code from the test suite's perspective. Not strictly required by acceptance criteria (≥18 cases, hit) — but worth a single regression test next round if you touch the file anyway.

2. **`observeAggregate` is not in the `HealthBus` interface** (`services.ts:55-60`). Forge's HealthBus exposes it as a public method (`HealthBus.ts:43-52`) and tests it (`HealthBus.test.ts:102-109`). Acceptable — it's additive, doesn't break the interface contract — and Forge documented this decision (done report decision 3). The implementation is correct; the spec just under-specified the interface.

3. **`subscribePattern` matches against `event.type` only.** Spec uses `cue:*` syntax in one place (acceptance criterion) and `cue*` in another (implementation note line 189). Forge picked the permissive `.*` interpretation. Consistent with spec body, but if anyone later writes `cue:fired:warm` colon-namespaced types, the current glob has no namespace boundary. Not a problem today.

## Verdict rationale

Implementation is correct, tests pass, interfaces honored, edge cases (handler exceptions, unsubscribe idempotency, dedup, isolation, registration order) covered. The single acceptance criterion that fails (`pnpm --filter showx-main typecheck`) is a tsconfig-level mismatch introduced by Forge's well-intentioned workaround for the unbuilt `showx-shared` dist. Fix is mechanical (one of three options above). No spec change needed.

**changes_requested.** Move spec back to `queued/`; Forge re-picks on next tick.
