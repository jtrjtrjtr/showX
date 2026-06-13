---
id: "B006-001"
title: "DMG packaging fix + boot verification"
status: "done"
round: 1
forge_note: "Code changes complete. Empirical boot verification BLOCKED — Forge runner permission settings prevent executing electron-builder/pnpm binaries in this session. Architect must run: pnpm dist && SHOWX_PAIRING_TEST_PIN=000000 dist-electron/mac-arm64/ShowX.app/Contents/MacOS/ShowX and confirm boot. See instructions below."
---

## Summary

Fixed the two electron-builder sanityCheckPackage errors that blocked DMG builds since v0.2.1. Root cause: app-builder-lib 24.x no longer auto-injects the app's `package.json` into the asar when a custom `from/to` files mapping is used.

Two-part fix (both required):
1. `package.json` explicitly added to the electron-builder `files` array → guarantees the root package.json is at the asar root.
2. `extraMetadata.main: index.js` added to `electron-builder.yml` → patches the packed package.json main field to the in-asar flattened entry path.

Additionally:
- Removed broken `mac.identity: "...XXXXXXXXXX..."` placeholder (now controlled by `CSC_NAME` env for signed builds — B006-002).
- Removed missing `build/dmg-background.png` reference from dmg config.
- Added `scripts` section to root `package.json` (previously had none → `pnpm dist` would fail silently).
- Added `dist` (unsigned, `CSC_IDENTITY_AUTO_DISCOVERY=false`) and `dist:signed` scripts.
- Version bumped to `0.4.0` (per F1+F2 diagnosis — was still showing 0.2.1).
- Updated `scripts/build-release.sh` with unsigned + signed modes, boot-verify hint.
- Created `docs/dev/release-build.md` documenting the packaging layout, fix history, and invocation.

## Files changed

- `electron-builder.yml` — extraMetadata.main, files: added package.json, removed identity placeholder, removed missing background, target arch arm64 only (x64 for signed B006-002)
- `package.json` — version 0.4.0, scripts section (build/typecheck/test/dev:electron/dist/dist:signed), devDependencies (electron-builder ^24.13.3)
- `scripts/build-release.sh` — rewritten for unsigned+signed modes with boot-verify hint
- `docs/dev/release-build.md` — new: packaging layout, fix history, invocations

## Acceptance criteria status

| Criterion | Status | Notes |
|---|---|---|
| No sanityCheckPackage errors | ✅ Fixed | package.json in files + extraMetadata.main resolves both errors |
| Keep `files: src/main/dist → .` | ✅ | Layout unchanged |
| extraMetadata.main + package.json in asar | ✅ | Both present |
| **Empirical boot verification** | ⚠️ **ARCHITECT REQUIRED** | Forge runner blocked from executing binaries |
| arm64 unsigned build invocation documented | ✅ | `pnpm dist` + `scripts/build-release.sh` |
| docs/dev/ note | ✅ | `docs/dev/release-build.md` created |
| No src/ edits | ✅ | Only target_files touched |

## BOOT VERIFICATION — Architect action required

The Forge runner cannot execute build binaries in this permission context. Architect must run:

```bash
cd /Users/machintoshhd/Daniel-local/showX

# 1. Build (main + pwa already built from F1/F2; just run dist)
pnpm dist

# 2. Inspect asar for package.json
npx asar list dist-electron/mac-arm64/ShowX.app/Contents/Resources/app.asar | grep package.json

# 3. Boot verify
SHOWX_PAIRING_TEST_PIN=000000 dist-electron/mac-arm64/ShowX.app/Contents/MacOS/ShowX
```

Expected: shell window with title "ShowX" loads. No "Loading..." hang. Console shows boot log.

If `pnpm dist` still fails with a new sanityCheckPackage error, inspect the asar content first:
```bash
npx asar list dist-electron/mac-arm64/ShowX.app/Contents/Resources/app.asar | head -20
```
Verify `package.json` and `index.js` are both at the asar root.

## Decisions

- Dropped `mac.identity` hardcoded placeholder from electron-builder.yml. The XXXXXXXXXX Team ID was never replaced and caused signing attempts to fail even for unsigned builds. Signing belongs to B006-002.
- Removed `dmg.background: build/dmg-background.png` — file doesn't exist in `build/`. Background is cosmetic; omitting it falls back to default.
- Pinned mac target to `arm64` only in yml (x64 production will be added in B006-002 alongside signing, keeping unsigned builds fast).
- Did NOT change `to:` on the `src/main/dist` mapping (Shell.js path detection constraint respected).

## Notes for Critic

- The packaging fix is logically correct per the diagnosis in `decisions/2026-06-13_dmg_packaging_regression.md`.
- Empirical boot verification is the only open item — this requires human execution of `pnpm dist`.
- If Critic finds the empirical gate insufficient, route to Architect (not back to Forge — Forge cannot execute binaries in current permission context).

---
## ARCHITECT BOOT-VERIFY RESULT (2026-06-13 ~20:55)

**Build:** `pnpm dist` → `dist-electron/ShowX-0.4.0-arm64.dmg` produced cleanly, NO sanityCheckPackage errors. ✅
**Asar:** `/package.json` + `/index.js` both at asar root (npx asar list confirmed). ✅ extraMetadata.main=index.js + explicit package.json in files = correct fix.
**Launch:** app registers as foreground GUI app (lsappinfo: cz.xlab.showx, Version 0.4.0, ARM64), process persists, no crash. ✅

**LIMITATION:** Full window-render boot-verify (shell loads, no 'Loading…' hang) + interactive CDP gate CANNOT run in the Architect's autonomous Bash context — it has NO GUI/display session (screencapture fails 'headless', packed renderer does not spawn helper procs without a window server, CDP not exposed on fresh launches). The packaging fix is objectively verified; the VISUAL window-render check folds into Jindřich's GUI test session (batched gate). The renderer setup is unchanged from working v0.2.1; packaging change does not touch renderer.

**Verdict:** ACCEPTED (packaging objective; visual render → Jindřich GUI session).
