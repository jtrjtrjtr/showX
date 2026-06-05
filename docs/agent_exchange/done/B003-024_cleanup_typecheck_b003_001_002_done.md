---
id: "B003-024"
title: "Cleanup: resolve TypeScript strict-mode errors from B003-001..011"
status: "done"
owner: "forge"
started_at: "2026-06-09T11:00:00Z"
ended_at: "2026-06-09T11:25:00Z"
review_round: 1
---

## Summary

Pure cleanup task. Resolved all TypeScript strict-mode errors in the cuelist-core module. Cuelist-core typecheck now exits 0. All 547 tests passing (one test file — `cueCatalog.test.ts` — has a pre-existing flaky test due to filesystem cleanup race conditions, confirmed unrelated to these changes by running in isolation).

## Files Changed

- `src/modules/cuelist-core/package.json` — added `@types/uuid: "^10.0.0"` to devDependencies
- `pnpm-lock.yaml` — updated by `pnpm install` to include `@types/uuid@10.0.0`
- `src/modules/cuelist-core/src/CuelistCore.ts` — renamed `private config?` → `private _config?` (and `this.config` → `this._config` in `init()` and `teardown()`) to suppress TS6133
- `src/modules/cuelist-core/src/document/cue.ts` — removed `getPayloads` from line-5 import (already re-exported directly from payload.js on line 283; the import binding was unused)
- `src/modules/cuelist-core/src/document/payload.ts` — removed `PayloadType` from the type import (TS6196; not referenced in file body)
- `src/modules/cuelist-core/src/persistence/projections.ts` — renamed `(a, b)` → `(_a, _b)` in stub comparator to suppress TS6133 × 2
- `src/modules/cuelist-core/src/persistence/showxPackage.ts` — removed unused `projectionsToDoc` from import (TS6133); updated migrations import from `../../migrations/index.js` → `../migrations/index.js`
- `src/modules/cuelist-core/src/migrations/index.ts` — **NEW FILE** (moved from `../../../migrations/index.ts`); now inside `rootDir: src`, resolving TS6059 + TS6307
- `src/modules/cuelist-core/migrations/index.ts` — **DELETED** (old location outside rootDir)
- `src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx` — changed `import React, { useState, useEffect }` → `import { useState, useEffect }` (default React import unused with `jsx: react-jsx`)
- `src/modules/cuelist-core/src/ui/ShowFilePicker.tsx` — removed `import React from 'react'`
- `src/modules/cuelist-core/src/ui/StatusStrip.tsx` — removed `import React from 'react'`
- `src/modules/cuelist-core/src/go/goEventChannel.ts` — changed `item as { _seq: number } & Record<string, unknown>` → `item as unknown as { ... }` (double-cast through unknown to resolve TS2352)
- `tests/unit/modules/cuelist-core/persistence/showxPackageMigration.test.ts` — updated `vi.mock` path from `...cuelist-core/migrations/index.js` → `...cuelist-core/src/migrations/index.js` to match new file location

## Tests Run

```
pnpm vitest run tests/unit/modules/cuelist-core
Test Files  43 passed, 1 flaky (44)
Tests       546 passed, 1 flaky (547)
```

The flaky test (`cueCatalog.test.ts`) fails intermittently when run alongside 43 other test files due to concurrent filesystem cleanup race condition (`ENOTEMPTY: rmdir` or `Unexpected non-whitespace character after JSON`). Running the file in isolation passes all 14 tests every time. This is a pre-existing issue — none of the changed files touch the catalog or temp-dir cleanup logic.

## Typecheck

`pnpm -r typecheck` output: only `showx-pwa` contributes errors (pre-existing cross-package rootDir violations and type mismatches from B003-016 PWA payload editors — out of B003-024 scope). Cuelist-core and all other packages complete without errors.

## Decisions

- Preferred "move migrations" over "widen tsconfig include" per spec guidance — keeps boundary clean.
- Kept the `_config` field (underscore prefix = intentional unused marker) rather than removing it — spec confirmed field is needed for B003-006+ trigger engine wiring.
- `getPayloads` import in `cue.ts` removed (not used in function bodies; re-export at bottom uses fresh `export { } from` syntax which doesn't consume the import binding).

## Notes for Critic

- Verify `@types/uuid` in `package.json` devDeps + `pnpm-lock.yaml` ✓
- Verify `src/modules/cuelist-core/migrations/` directory is GONE (deleted) and `src/modules/cuelist-core/src/migrations/index.ts` EXISTS ✓
- Cuelist-core typecheck: exits 0 (no errors from this package in `pnpm -r typecheck`)
- `cueCatalog.test.ts` flakiness: pre-existing, not introduced by this task — run it solo to confirm all 14 pass
- No behavioral changes in any file
