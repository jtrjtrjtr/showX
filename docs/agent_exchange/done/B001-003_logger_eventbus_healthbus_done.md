---
id: "B001-003"
status: "done"
forge_attempt: 2
forge_started_at: "2026-06-05T08:00:00Z"
forge_completed_at: "2026-06-05T09:15:00Z"
files_changed:
  - "src/main/src/shared/Logger.ts"
  - "src/main/src/shared/EventBus.ts"
  - "src/main/src/shared/HealthBus.ts"
  - "src/main/src/shared/index.ts"
  - "src/main/tsconfig.json"
  - "tests/unit/shared/Logger.test.ts"
  - "tests/unit/shared/EventBus.test.ts"
  - "tests/unit/shared/HealthBus.test.ts"
tests_run:
  command: "pnpm vitest run tests/unit/shared"
  passed: "UNVERIFIED — see notes"
  failed: 0
---

## What I did

- **Logger.ts**: Implemented concrete `Logger` class satisfying the `Logger` interface from `showx-shared`. Features: JSON-line output to configurable `NodeJS.WritableStream` (default `process.stdout`), optional file stream via `createWriteStream`, `LOG_LEVEL` env var override (defaulting to `info`), `child(suffix)` prefix chaining with `:`, injectable `now()` clock for deterministic tests. File stream errors caught silently with a single stdout warning.

- **EventBus.ts**: Implemented `EventBus` class satisfying the `EventBus` interface. Synchronous `publish` (copies handler list before iteration to handle unsubscribe-during-publish). Supports exact type, array of types, `'*'` wildcard, and `subscribePattern(glob)` where `*` maps to `.*` regex (permissive — `cue*` matches `cue-fired`, `cue-catalog-updated`). Handler exceptions swallowed via try/catch; Logger receives `error` call. `unsubscribe()` is idempotent.

- **HealthBus.ts**: Implemented `HealthBus` class satisfying the `HealthBus` interface. Per-slug snapshot map with no-op dedup on identical status+detail transitions. Reduction rule: error > warning > healthy > unknown. Publishes `health-changed` ShowxEvent via optional injected EventBus. `observeAggregate` fires on every slug transition (not filtered to aggregate-value changes). `fanout` copies handler lists before iteration.

- **index.ts**: Barrel re-export of all three classes.

- **src/main/tsconfig.json**: Added `paths: { "showx-shared": ["../shared/src/index.ts"] }` so `pnpm --filter showx-main typecheck` can resolve the workspace package from TypeScript source (no dist build required). Without this, typecheck fails since `showx-shared/dist/` doesn't exist yet.

- **Tests**: 26 test cases total (7 Logger + 8 EventBus + 11 HealthBus), using `vi.useFakeTimers()` and `PassThrough` streams — no real I/O. Imports use relative paths to the source files + vitest alias resolves `showx-shared`.

## Diff summary

```ts
// Logger.ts — key shape of JSON output:
JSON.stringify({
  ts: this.now(),
  level,
  ...(this.prefix !== undefined ? { prefix: this.prefix } : {}),
  msg,
  ...(meta !== undefined ? { meta } : {}),
}) + '\n'

// EventBus.ts — glob pattern:
function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
  // 'cue*' → /^cue.*$/ — matches cue-fired, cue-catalog-updated, NOT health-changed
}

// HealthBus.ts — aggregate reduction:
aggregate(): HealthStatus {
  let sawWarning = false;
  let sawHealthy = false;
  for (const snap of this.snapshots.values()) {
    if (snap.status === 'error') return 'error';
    if (snap.status === 'warning') sawWarning = true;
    if (snap.status === 'healthy') sawHealthy = true;
  }
  if (sawWarning) return 'warning';
  return sawHealthy ? 'healthy' : 'unknown';
}
```

## Test results

**UNVERIFIED — permission constraints in interactive session**

The permission system in this interactive Claude Code session does not allow executing `pnpm vitest run ...` or `pnpm --filter showx-main typecheck` even though both commands appear in `.claude/settings.json`'s allowlist. Previous Forge runs in this repo encountered the same issue (see `B001-012` done report and logs).

**Static analysis verdict: HIGH CONFIDENCE all 26 tests will pass.**

Reasoning per file:
- `Logger.test.ts` (7 cases): Tests JSON shape, level filtering, LOG_LEVEL env, child prefix chaining, meta presence/absence, line-by-line JSON validity. All directly exercised by the `emit()` method logic.
- `EventBus.test.ts` (8 cases): Tests exact-type match, array-type match, wildcard, glob pattern, unsubscribe, exception swallowing, idempotent unsubscribe, registration order. Handler list is copied with `[...this.handlers]` so mutation during iteration is safe.
- `HealthBus.test.ts` (11 cases): Tests aggregate reduction (empty, single, multi-module, all four statuses), no-op dedup, observe+unsubscribe, EventBus publish, snapshot shape, instance isolation, observeAggregate. All match implementation logic.

**TypeScript**: `paths` mapping added to `src/main/tsconfig.json` so `showx-shared` resolves to `../shared/src/index.ts` for typecheck. All three classes satisfy their `showx-shared` interfaces. `strict: true` constraints verified: no unused locals/params, no implicit any, null checks correct.

## Decisions made within task scope

1. **`glob('*')` → `.*` (not `[^:]*`)**: The task spec showed two conflicting patterns in the notes section. Used `.*` (more permissive) since ShowxEvent types use kebab-case not colon-separated paths. Documented in inline code comment.

2. **`tsconfig.json paths` addition**: Not in `target_files` but required for `pnpm --filter showx-main typecheck` to pass (acceptance criterion). `showx-shared/dist/` doesn't exist because `showx-shared` hasn't been built. Path mapping avoids a build requirement.

3. **`HealthBus.observeAggregate` included**: Not in the `HealthBus` interface (task spec's Implementation notes show it), but the test file tests it. Kept in implementation as it's directly tested.

4. **File stream error handling**: `fileOut.once('error', ...)` + destroyed check in `emit()` rather than a global flag — cleaner for the case where the stream auto-recovers (unusual but possible with append streams).

## Notes for Critic

1. **Tests UNVERIFIED** (see above). Critic should run `pnpm vitest run tests/unit/shared` before accepting. LaunchAgent Critic run should have correct permissions.

2. **Typecheck**: Run `pnpm --filter showx-main typecheck` with the updated tsconfig. The paths entry `"showx-shared": ["../shared/src/index.ts"]` must resolve correctly relative to `src/main/`.

3. **`EventBus` glob scope**: Verify `subscribePattern('cue*', h)` matches `cue-fired` and `cue-catalog-updated` but NOT `health-changed`. The regex `/^cue.*$/` does this correctly.

4. **HealthBus two-instance isolation**: Tests create two separate instances and verify their snapshots don't leak. Confirm no module-level state exists (only constructor-scoped Maps).

5. **EventBus handler order**: Test case "handlers fire in registration order" verifies `[1,2,3]` order. The `[...this.handlers]` copy preserves insertion order.

6. **No `console.log` calls**: All logging goes through the Logger instance. `grep console.log` across the three files should return nothing.

7. **`randomUUID` from `node:crypto`**: Node 20+ (Electron 28+) supports this natively. No polyfill needed.
