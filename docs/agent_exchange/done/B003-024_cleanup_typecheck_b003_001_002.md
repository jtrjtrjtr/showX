---
id: "B003-024"
title: "Cleanup: resolve TypeScript strict-mode errors from B003-001..011"
type: "cleanup"
estimated_size_lines: 100
priority: "P1"
depends_on:
  - "B003-002"
  - "B003-003"
target_files:
  - "src/modules/cuelist-core/package.json"
  - "src/modules/cuelist-core/tsconfig.json"
  - "src/modules/cuelist-core/src/CuelistCore.ts"
  - "src/modules/cuelist-core/src/document/cue.ts"
  - "src/modules/cuelist-core/src/document/payload.ts"
  - "src/modules/cuelist-core/src/document/uuid.ts"
  - "src/modules/cuelist-core/src/persistence/projections.ts"
  - "src/modules/cuelist-core/src/persistence/showxPackage.ts"
  - "src/modules/cuelist-core/migrations/index.ts"
  - "src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx"
  - "src/modules/cuelist-core/src/ui/ShowFilePicker.tsx"
  - "src/modules/cuelist-core/src/ui/StatusStrip.tsx"
  - "src/modules/cuelist-core/src/go/goEventChannel.ts"
acceptance_criteria:
  - "`@types/uuid: ^10.0.0` added to `src/modules/cuelist-core/package.json` devDependencies (uuid@10 ships NO .d.ts files; types live in separate package)"
  - "`pnpm install` executed; lockfile updated"
  - "`src/modules/cuelist-core/src/CuelistCore.ts` line 6: remove unused `private config?: CuelistCoreConfig;` field declaration — OR wire it through such that `init()` continues to assign it and at least one downstream method reads it (e.g., emit autosave interval into Logger on `start()`). Architect preference: rename to `private _config?` if keeping for future B003-006+ use; TypeScript strict-unused rule accepts underscore-prefixed locals as intentional"
  - "`src/modules/cuelist-core/src/document/cue.ts` line 5: `getPayloads` import unused — either remove from import statement or surface it in the cue module's public re-export (it IS used in tests via the document namespace, so keep it exported)"
  - "`src/modules/cuelist-core/src/document/payload.ts` line 2: `PayloadType` type import unused — remove from import"
  - "`src/modules/cuelist-core/src/document/uuid.ts`: import statement `import { v7 as uuidv7Base } from 'uuid'` resolves cleanly after `@types/uuid` install. No code change needed in this file — verify only"
  - "`src/modules/cuelist-core/src/persistence/projections.ts` line 141: remove unused `a` and `b` parameter names (TS6133 × 2) — either rename to `_a`/`_b` if used as positional placeholders or drop the params entirely if the comparator doesn't need them"
  - "`src/modules/cuelist-core/src/persistence/showxPackage.ts` line 7: remove unused `projectionsToDoc` import (TS6133)"
  - "`src/modules/cuelist-core/migrations/index.ts` lives OUTSIDE `src/modules/cuelist-core/src/` while `tsconfig.json` declares `rootDir: src` — causes TS6059 + TS6307 on `showxPackage.ts:14` import. **PREFERRED FIX:** move file to `src/modules/cuelist-core/src/migrations/index.ts`, update the import in `showxPackage.ts` to `./migrations/index.js`. Migration registry stays empty-stub for MVP; no logic change. **ALTERNATIVE (NOT preferred):** widen tsconfig to `include: ['src/**/*', '../migrations/**/*']` — but this leaks the boundary"
  - "`src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx` line 1: `import React from 'react'` is unused (tsconfig has `jsx: react-jsx`, modern JSX runtime — no explicit React import needed). REMOVE the line. Keep any other named imports (`useState`, `useEffect`, etc.) on their own line if present"
  - "`src/modules/cuelist-core/src/ui/ShowFilePicker.tsx` line 1: same — remove unused default `React` import"
  - "`src/modules/cuelist-core/src/ui/StatusStrip.tsx` line 1: same — remove unused default `React` import"
  - "`src/modules/cuelist-core/src/go/goEventChannel.ts:321` TS2352: type cast `(GoDispatched | GoRejected | ArmBroadcast | ModeTransition) → { _seq: number } & Record<string, unknown>` doesn't sufficiently overlap. **Fix:** convert through `unknown` first: `const { _seq, ...payload } = item as unknown as { _seq: number } & Record<string, unknown>;` — TypeScript accepts the double-cast as intentional. No behavioral change (runtime is still spread destructuring on the same object shape)"
  - "`pnpm --filter @showx/module-cuelist-core typecheck` → exit 0, zero errors"
  - "`pnpm --filter @showx/module-cuelist-core test` → all existing tests still pass (no behavioral change expected; this is pure cleanup)"
  - "`pnpm -r typecheck` → cuelist-core no longer contributes ANY errors to workspace typecheck"
  - "No new tests required — this is a hygiene task; existing test coverage already validates behavior"
---

## Context

Architect tick 2.5 + tick 5 monitoring on 2026-06-06 ran `pnpm --filter @showx/module-cuelist-core typecheck` after each major B003 task landed. Spec expanded between ticks; current snapshot (post B003-006 done, pre B003-024 execution):

```
src/CuelistCore.ts(6,11): error TS6133: 'config' is declared but its value is never read.
src/document/cue.ts(5,27): error TS6133: 'getPayloads' is declared but its value is never read.
src/document/payload.ts(2,24): error TS6196: 'PayloadType' is declared but never used.
src/document/uuid.ts(2,34): error TS2307: Cannot find module 'uuid' or its corresponding type declarations.
src/persistence/projections.ts(141,16): error TS6133: 'a' is declared but its value is never read.
src/persistence/projections.ts(141,19): error TS6133: 'b' is declared but its value is never read.
src/persistence/showxPackage.ts(7,3): error TS6133: 'projectionsToDoc' is declared but its value is never read.
src/persistence/showxPackage.ts(14,31): error TS6059: File 'migrations/index.ts' is not under 'rootDir' 'src'.
src/persistence/showxPackage.ts(14,31): error TS6307: File 'migrations/index.ts' is not listed within the file list of project tsconfig.json.
```

(`mode/transitions.ts:56 TS2304 SnapshotResult` is B003-004 round 1 changes_requested scope — Forge fixes in its own revision, NOT this task.)

Forge missed these because `vitest` passes (esbuild strips types at runtime) and the cleanup pattern is "leftover refactor garbage." Critic flagged them in B003-005 round 2 review explicitly as "B003-024 cleanup scope, not introduced regressions" — confirming this task is the right bucket.

Original draft of this spec (pre-tick 5):

```
src/CuelistCore.ts(6,11): error TS6133: 'config' is declared but its value is never read.
src/document/cue.ts(5,27): error TS6133: 'getPayloads' is declared but its value is never read.
src/document/payload.ts(2,24): error TS6196: 'PayloadType' is declared but never used.
src/document/uuid.ts(2,34): error TS2307: Cannot find module 'uuid' or its corresponding type declarations.
```

Three are unused-import/field hygiene (TS6133/TS6196). One (`uuid` TS2307) is a real missing types-package issue: `uuid@10.0.0` ships only the `dist/` runtime — types are distributed separately as `@types/uuid`.

## Why this matters now

ShowX CI (per B001-013 parity harness setup) runs `pnpm typecheck` per workspace. With these four errors, cuelist-core typecheck currently exits non-zero. Each subsequent B003 task that touches cuelist-core inherits a dirty baseline — Forge can't tell its own warnings from pre-existing ones. Fix now while scope is small.

## Implementation notes

### Add @types/uuid

```json
// src/modules/cuelist-core/package.json
{
  "devDependencies": {
    "@types/uuid": "^10.0.0",
    "@types/node": "^20.11.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0",
    "zod": "^3.22.0"
  }
}
```

Then `pnpm install` from repo root.

### CuelistCore.ts:6 — `config` field

Forge's intent was clearly to retain config for B003-006+ trigger engine / B003-008 GO channel wiring. Recommended: keep the field, rename to `_config` (underscore prefix is the canonical "intentionally unused for now" marker — `noUnusedLocals` exempts it):

```ts
export class CuelistCore implements Module {
  private ctx?: ModuleContext;
  private _config?: CuelistCoreConfig;  // future: B003-006+ trigger engine, B003-008 GO channel
  private state: 'idle' | 'inited' | 'started' | 'stopped' = 'idle';

  async init(context: ModuleContext): Promise<void> {
    this.ctx = context;
    this._config = await context.persisted.load(configSchema);
    context.log.info('cuelist-core init complete');
    this.state = 'inited';
  }
  // ...
}
```

### cue.ts:5 — `getPayloads`

Import is unused at file level. Likely Forge meant to re-export it. Check:
- If `getPayloads` is defined in `cue.ts` itself: drop the import (it's already in scope via local definition)
- If imported from another module and used only in tests: re-export it via `cue.ts` so tests don't break

Decide based on inspection. Easiest: remove the import line entirely if local; if external, do `export { getPayloads } from '<where>';`.

### payload.ts:2 — `PayloadType` import

Likely a leftover from refactor. Remove from import statement. Verify no `PayloadType` reference elsewhere in the file (if there is, then the unused-error is wrong and the type IS used — but TS6196 says it's not).

### uuid.ts — verification only

After `pnpm install`, the import `import { v7 as uuidv7Base } from 'uuid'` should resolve. No source change needed.

### projections.ts:141 — unused `a` / `b` params

Inspect the line first. If it's a comparator `(a, b) => 0` placeholder, the comparator likely should compute something but doesn't. If it's a `.filter((a, b) => ...)`, the `b` is the array index that may legitimately be unused. Either rename to `_a`/`_b` (intentional-unused marker) or drop them if the function signature allows.

### showxPackage.ts:7 — `projectionsToDoc` unused

Drop the import line. `projectionsToDoc` was likely imported during initial structure but the implementation took a different path. If grep finds it referenced elsewhere in the file, the unused-error is wrong — but TS6133 says it's not.

### showxPackage.ts:14 / migrations/index.ts — rootDir boundary

**Preferred fix:** move `src/modules/cuelist-core/migrations/index.ts` into `src/modules/cuelist-core/src/migrations/index.ts`. Update the import in `showxPackage.ts:14` from `'../migrations/index.js'` (or wherever it currently points) to `'./migrations/index.js'`.

This keeps the entire source tree under `rootDir: src` per tsconfig. The `migrations/` folder hierarchy survives — it just lives inside `src/` now. The migration registry remains empty for MVP per data_model.md §10.

After move, verify no broken imports remain (`grep -r migrations src/modules/cuelist-core/`).

**Alternative (NOT preferred):** edit `tsconfig.json` to `include: ['src/**/*', '../migrations/**/*']` AND remove or widen `rootDir`. Avoid — leaks the boundary, complicates declaration emit.

## Verification

```bash
pnpm install
pnpm --filter @showx/module-cuelist-core typecheck   # must exit 0
pnpm --filter @showx/module-cuelist-core test        # must keep 60+ tests passing
pnpm typecheck                                       # workspace-wide cleanup verification
```

If any test breaks, the change was wrong — revert and write a partial done report explaining what conflict was found.

## Out of scope

- **Two-copy types deduplication** (`src/types/` vs `src/shared/src/types/`). Critic flagged this in B003-002 review as "Architect may want to deduplicate before B003-005." B003-005 is already in_progress; deferred to a separate architectural decision + cleanup task post-B003-005 lands.
- Any logic changes — this is hygiene only.
- Refactoring config-handling deeper (B003-006+ scope).

## Notes for Critic

This is a pure cleanup task. Verify:
- No test count regression (60+ document tests still green)
- Typecheck exits 0 on cuelist-core
- No unused imports / fields warnings remain in the four target files
- `@types/uuid` actually landed in package.json devDeps + pnpm-lock.yaml
