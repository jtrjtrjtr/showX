# Fix — DMG packaging regression: app-builder-lib drift clobbering package.json

**Date:** 2026-06-15
**Task:** hub #1144 (eiffel)
**Status:** FIXED — committed, tests green, DMG verified

---

## Symptom

The workspace root `package.json` was found clobbered after a DMG build session:
- `scripts` block missing (no `test`, `build`, `typecheck`, etc.)
- `devDependencies` block missing
- `"main"` changed from `"src/main/dist/index.js"` to `"index.js"`
- `"type": "module"` added (wrong for workspace root)

This broke `pnpm test`, `pnpm build`, `pnpm typecheck`, and dev mode.
The `packageJsonIntegrity` unit test (added in B006-001) correctly caught the regression.

---

## Root cause: app-builder-lib drift

When electron-builder packs the app, its `fileTransformer` reads the root `package.json`,
applies `extraMetadata` (main+type), strips `scripts` and `devDependencies`, and produces
the content that goes into the asar. This transformation is supposed to be in-memory only.

However, **certain pnpm + electron-builder environment combinations** have been observed
writing this patched content back to the SOURCE `package.json` on disk. The exact trigger
is not fully isolated (may be related to the native rebuild step using pnpm hooks in
older electron-builder minor patches, or a timing issue with pnpm's shamefully-hoist
layout). This is the "app-builder-lib drift" regression.

Evidence: the clobbered content exactly matches what `fileTransformer.modifyMainPackageJson()`
produces (strips scripts/devDeps, deepAssigns extraMetadata). This regression occurred at
least twice in the ShowX session history (B006-001 era + post-LTC session 2026-06-14).

---

## Fix

### Immediate: restore source
`git checkout -- package.json` — restores the workspace root from HEAD.

### Permanent: afterAllArtifactBuild hook
Added `afterAllArtifactBuild: scripts/restore-pkg-after-build.mjs` to `electron-builder.yml`.

The hook runs after ALL DMG/artifacts are built. It:
1. Reads the current `package.json`
2. Detects clobbering (missing scripts OR devDependencies OR main=index.js)
3. If clobbered: restores from `git show HEAD:package.json`
4. Logs a clear warning to make the drift visible

This is a defensive guard — it fires only when clobbering is detected, is otherwise a no-op.

### CI gate: type:module sentinel test
Added test `does NOT have type:module (clobber sentinel)` to `packageJsonIntegrity.test.ts`.
The patched version always has `type: module` (from extraMetadata). If the SOURCE root
ever gets this, the test fails fast in CI before it can be committed.

### Utility script (non-wired)
`scripts/gen-app-pkg.mjs` — alternative approach that generates `src/main/dist/package.json`
at build time, to be used if we later switch to NOT using `extraMetadata` (e.g. if
electron-builder's write-back behavior is definitively confirmed in a future version).
Currently NOT wired into the build (extraMetadata approach still correct and working).

---

## Files changed

| File | Change |
|---|---|
| `package.json` | Restored from HEAD (immediate fix) |
| `electron-builder.yml` | Added `afterAllArtifactBuild` hook + drift guard comment |
| `scripts/restore-pkg-after-build.mjs` | New: afterAllArtifactBuild hook |
| `scripts/gen-app-pkg.mjs` | New: utility (not wired, documents alternative approach) |
| `tests/unit/packageJsonIntegrity.test.ts` | New test: type:module sentinel + updated comments |

---

## Smoke results

- `tests/unit/packageJsonIntegrity.test.ts`: **5/5 passed** (pre + post build)
- Full suite: **2245/2245 passed**
- DMG build: **success** (`ShowX-0.7.0-arm64.dmg`)
- Asar verification: `main: index.js`, `type: module`, `showx-shared` ✓, `@showx/module-cuelist-core` ✓, `index.js` at root ✓
- Post-build `package.json`: **not clobbered** (`main: src/main/dist/index.js`, scripts: 15, devDeps: 31, no type field)

---

## Monitor after deploy

- Watch for `[restore-pkg] WARNING` in electron-builder output during DMG builds
- If the hook fires, investigate which step triggers the write-back and upgrade the fix
- `pnpm test` must pass immediately after any DMG build (CI gate)

## Rollback

If the `afterAllArtifactBuild` hook causes issues:
1. Remove `afterAllArtifactBuild:` line from `electron-builder.yml`
2. Run `git checkout -- package.json` manually after every DMG build
3. The packageJsonIntegrity test will catch any regression
