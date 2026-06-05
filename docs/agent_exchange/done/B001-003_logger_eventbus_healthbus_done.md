---
id: "B001-003"
status: "done"
forge_attempt: 3
forge_started_at: "2026-06-05T11:20:00Z"
forge_completed_at: "2026-06-05T11:25:00Z"
files_changed:
  - "src/main/tsconfig.json"
  - "src/main/package.json"
tests_run:
  command: "pnpm vitest run tests/unit/shared"
  passed: 49
  failed: 0
---

## What I did

Fixed the single failing acceptance criterion: `pnpm --filter showx-main typecheck` now exits 0.

**Root cause (per Critic review):** `paths: { "showx-shared": ["../shared/src/index.ts"] }` in `src/main/tsconfig.json` resolved the module to a file outside the inferred `rootDir: "src"`, causing 5 TS6059 errors.

**Fix applied (Critic's Option B):**

1. **`src/main/tsconfig.json`** — removed the `paths` block entirely; added explicit `"rootDir": "src"` for clarity. TypeScript now resolves `showx-shared` through the workspace symlink in `node_modules` → `dist/index.d.ts`.

2. **`src/main/package.json`** — changed `typecheck` script to:
   ```
   pnpm --filter showx-shared build && tsc --noEmit
   ```
   This builds `showx-shared` (creates `dist/`) before typechecking `showx-main`. Without this, `dist/index.d.ts` doesn't exist (workspace package is source-only in CI until explicitly built) and TypeScript cannot resolve the import.

The Logger, EventBus, HealthBus source files are UNCHANGED from the previous attempt (Critic confirmed all implementation criteria were met).

## Diff summary

`src/main/tsconfig.json` before:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "paths": { "showx-shared": ["../shared/src/index.ts"] }
  },
  "include": ["src/**/*"]
}
```

`src/main/tsconfig.json` after:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*"]
}
```

`src/main/package.json` typecheck script before:
```
"typecheck": "tsc --noEmit"
```

After:
```
"typecheck": "pnpm --filter showx-shared build && tsc --noEmit"
```

## Test results

```
✓ tests/unit/shared/EventBus.test.ts   (8 tests) 4ms
✓ tests/unit/shared/HealthBus.test.ts  (11 tests) 6ms
✓ tests/unit/shared/Logger.test.ts     (7 tests) 6ms
✓ tests/unit/shared/PersistedStore.test.ts (13 tests) 46ms
✓ tests/unit/shared/SecretStore.test.ts (10 tests) 76ms

Test Files  5 passed (5)
     Tests  49 passed (49)
  Duration  316ms
```

Typecheck output: silent exit 0 (no errors).

## Decisions made within task scope

**Chose Option B (pre-build) over Option A (project references):** `tsc -b --noEmit` fails with TS6310 ("Referenced project may not disable emit") against the current `src/shared/tsconfig.json`, likely because of an interaction with `isolatedModules: true` from the base config. Option B (build before typecheck) is self-contained, works with TS 5.9, and does not require tsconfig restructuring. The `pnpm --filter showx-shared build` step is fast (type-only build, ~200ms) and idempotent.

## Notes for Critic

1. Verify `pnpm --filter showx-main typecheck` exits 0 — this is the one criterion that failed last round. The output should be silent (only pnpm build output, then no TS errors).
2. Source files (Logger.ts, EventBus.ts, HealthBus.ts) are unchanged — Critic's previous green checks on those criteria still hold.
3. The `src/main/tsconfig.json` `rootDir: "src"` is now explicit. This matches the `include: ["src/**/*"]` pattern and keeps output paths predictable.
4. `PersistedStore.test.ts` and `SecretStore.test.ts` (B001-004) also ran and pass — no regression.
