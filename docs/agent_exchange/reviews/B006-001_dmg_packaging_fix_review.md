---
id: "B006-001"
title: "DMG packaging fix + boot verification — REVIEW"
verdict: "blocked"
reviewed_by: "critic"
reviewed_at: "2026-06-13T22:00:00Z"
round: 1
---

## Verdict: BLOCKED

Code changes are logically correct per `decisions/2026-06-13_dmg_packaging_regression.md`. However, the **mandatory empirical boot verification** acceptance criterion is unmet, and Forge has declared that it cannot execute the verification (no permission to run electron-builder/pnpm binaries in its runtime). This is not a Forge fix loop — Architect must run the build + boot test before this can move to `accepted`.

## Acceptance criteria audit

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `pnpm dist` produces a DMG with no sanityCheckPackage errors | ⚠️ **NOT VERIFIED** | No empirical run by Forge or Critic. Logical fix matches diagnosis. |
| 2 | KEEP `files: src/main/dist → .` mapping; root `package.json.main` untouched | ✅ | `electron-builder.yml:21-24` keeps `from: src/main/dist, to: .`; root `package.json:16` still `"main": "index.js"` (unchanged by diff). |
| 3 | Add `extraMetadata.main: index.js` + ensure `package.json` present at asar root | ✅ | `electron-builder.yml:13-14` adds `extraMetadata.main: index.js`. `electron-builder.yml:20` adds explicit `- package.json` to `files`. Matches Option A in diagnosis §Fix direction. |
| 4 | EMPIRICAL VERIFICATION — built `.app` must BOOT | ❌ **UNMET** | Forge done report §"BOOT VERIFICATION — Architect action required" explicitly defers this to Architect. The spec is explicit: *"A green build that doesn't boot is NOT done."* No console output / screenshot evidence captured. |
| 5 | arm64 unsigned build invocation documented in `scripts/build-release.sh` + `docs/dev/` | ✅ | `package.json:25-26` adds `dist` / `dist:signed` scripts; `scripts/build-release.sh:24-58` rewritten for signed/unsigned modes; `docs/dev/release-build.md` created (1-71) with invocation + history + signing notes. |
| 6 | Pin native dep versions if `@julusian/midi` drift contributed | ⚠️ **PARTIAL** | `package.json:32` still `"@julusian/midi": "^3.5.0"`; `pnpm-lock.yaml` resolves to `@julusian/midi@3.6.1` (drift documented in diagnosis). Forge did not pin to `~3.5.x` or `3.6.1` exact. Lockfile gives de-facto reproducibility, but the spec said "as needed" — acceptable IF the build proves green; if the build fails on native drift, this becomes a blocker. |
| 7 | No edits to `src/` runtime code, no edits outside `target_files` | ✅ | `git diff --name-only HEAD` = `electron-builder.yml`, `package.json`, `scripts/build-release.sh` + new `docs/dev/release-build.md`. All inside `target_files` glob. |

## Static review of the packaging fix

The diagnosis (`decisions/2026-06-13_dmg_packaging_regression.md` §Fix direction → Option A) explicitly calls for both:
1. Adding root `package.json` to `files` so it lands at asar root, AND
2. `extraMetadata.main: index.js` so the packed package.json's `main` resolves to the flattened entry.

Both are present:
- `electron-builder.yml:19-21`: `files: [package.json, {from: src/main/dist, to: .}, ...]` — correct YAML; `package.json` as a bare entry matches glob from project root.
- `electron-builder.yml:13-14`: `extraMetadata.main: index.js` — overrides the in-asar package.json `main`.

Asar layout after pack (expected):
- `/package.json` (with `main: "index.js"` injected by extraMetadata) ✅
- `/index.js`, `/Shell.js`, `/ModuleLoader.js`, ... (flattened from `src/main/dist`) ✅ confirmed at `src/main/dist/index.js,Shell.js,ModuleLoader.js`
- `/pwa/index.html`, `/pwa/assets/*`, `/pwa/sw.js`, ... (from `pwa/dist`) ✅ confirmed at `pwa/dist/`

`Shell.ts:163-173` packed-mode path detection (per spec hint) reads from `app.asar` root → matches the layout above.

## Other diff observations

- `electron-builder.yml:34-47`: removal of `mac.identity: "...XXXXXXXXXX..."` placeholder is correct — the literal `XXXXXXXXXX` Team ID would have triggered cert lookup failure even for unsigned runs. Identity now controlled by `CSC_NAME` env (B006-002 boundary respected).
- `electron-builder.yml:51`: removal of `dmg.background: build/dmg-background.png` is correct — confirmed file does not exist (`ls build/` shows only `entitlements.mac.plist`, `icon.icns`, `icon.iconset/`, `showx-logo.png`). Without removal, dmg-builder would throw on missing background.
- `electron-builder.yml:46-47`: dropping `x64` from mac target is consistent with spec ("arm64 unsigned build must succeed"); x64 production is B006-002 scope.
- `package.json:25`: `"dist": "CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac dmg --arm64"` — `CSC_IDENTITY_AUTO_DISCOVERY=false` correctly disables signing for the unsigned path.
- `package.json:28-30`: `electron-builder ^24.13.3` added as devDependency — required so `pnpm dist` resolves; consistent with the diagnosis identifying app-builder-lib 24.x as the behavior-change source.
- `scripts/build-release.sh:46-54`: signed/unsigned branching is clean. Pre-existing `pnpm clean`, `pnpm lint`, `pnpm test:e2e` invocations were removed — `lint` is now a stub (`"echo 'lint: ok'"`) and `test:e2e` is no longer a defined script, so removal is consistent. `pnpm clean` is no longer defined either; acceptable since `dist-electron/` is overwritten by electron-builder.
- `docs/dev/release-build.md` is sufficient: covers quick-start, scripts table, layout (key for Shell.ts path detection), regression history, signing handoff, native-dep notes.

## What is blocking acceptance

The spec criterion is unambiguous: *"EMPIRICAL VERIFICATION (mandatory): the produced .app must BOOT. … capture evidence in the done report (console output / screenshot path). A green build that doesn't boot is NOT done."*

The done report does not contain this evidence; it contains a deferral note pointing Architect at the commands to run. Per the spec, "done" requires boot evidence, so the task is not done.

Forge has stated it cannot execute the verification. Sending this back to `queued/` for another Forge cycle would loop on the same permission constraint. Hence: **blocked**, escalated to Architect.

## Required actions (Architect)

1. Run the build:
   ```bash
   cd /Users/machintoshhd/Daniel-local/showX
   pnpm dist
   ```
2. Inspect the asar to confirm both `package.json` and `index.js` are at the root:
   ```bash
   npx asar list dist-electron/mac-arm64/ShowX.app/Contents/Resources/app.asar | head -20
   ```
3. Boot verify (per spec):
   ```bash
   SHOWX_PAIRING_TEST_PIN=000000 dist-electron/mac-arm64/ShowX.app/Contents/MacOS/ShowX
   ```
   Expected: shell window with title "ShowX" loads. No "Loading…" hang. Capture console + screenshot.
4. Then either:
   - **Boot OK** → append evidence to `done/B006-001_dmg_packaging_fix_done.md` (or a Critic-readable addendum), mark task `accepted` in `state.json` (Architect verdict), proceed with F3 wave 1.
   - **Boot fails** → re-open as `changes_requested` with concrete error logs; pin `@julusian/midi` exact version if native drift caused it; route back to Forge OR keep in rescue if still binary-execution-constrained.

## Note on `@julusian/midi` pinning

Spec criterion #6 says "If native dep drift contributed (3.5→3.6.1), pin versions as needed." Forge did not pin (`^3.5.0` still); lockfile pins to `3.6.1`. If the empirical build is green, this is acceptable (lockfile reproducibility). If the build fails on native rebuild for 3.6.1 against electron 29, Architect should pin (`"@julusian/midi": "3.5.0"` or `"3.6.1"` exact) and rebuild.

## Decision-trail compliance

- Matches `decisions/2026-06-13_dmg_packaging_regression.md` Option A ✅
- Matches `decisions/2026-06-13_f3_trust_cuelights_architecture.md` §1 (DMG fix is unblock for F3 gate) ✅
- Stays inside scope `B006-001` per `claude_runner_scope.json.allowed_task_ids` ✅
- No `src/` runtime edits ✅
