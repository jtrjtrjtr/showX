# Finding — DMG packaging regression (since v0.2.1), fix → F3 task 1

**Date:** 2026-06-13 ~20:15 CEST
**Status:** F1+F2 code complete, automated gate GREEN. Packed-DMG build BLOCKED on packaging regression. Functional+eyes-on gate deferred to F3 (after DMG fix), batched.

---

## Symptom

`pnpm dist` (and `electron-builder --mac dmg --arm64`) fails at electron-builder sanityCheckPackage:
1. First: `Application entry file "src/main/dist/index.js" in app.asar does not exist`.
2. After `extraMetadata.main: index.js` experiment: advances to `Application "package.json" in app.asar does not exist`.

## Root cause (diagnosed)

`electron-builder.yml` `files` maps `from: src/main/dist, to: .` → asar root contains the compiled main flattened (`/index.js`, `/Shell.js`, …) but:
- root `package.json` `main` = `src/main/dist/index.js` (correct for DEV `electron .`, wrong as the in-asar path), and
- no `package.json` is injected at asar root under this custom `files` mapping.

This config is UNCHANGED since v0.1.4 (git: electron-builder.yml last touched f9ff93a) yet built working DMGs at v0.2.0/v0.2.1 (Jun 11). Conclusion: **environment/dependency drift** in app-builder-lib's implicit main-remapping + package.json injection behavior (note: native dep rebuild log shows @julusian/midi@3.6.1 vs package.json ^3.5.0 — node_modules drifted). The sanity check now enforces what it previously inferred.

## Correct fix direction (for F3 task)

Asar root must contain BOTH a `package.json` (with `main` = the in-asar entry) AND the entry file. Options:
- (A) Add root `package.json` to `files` + `extraMetadata.main: index.js` so packed metadata points at the flattened entry. (extraMetadata alone advanced past error 1 → on the right track; needs the package.json present too.)
- (B) Change `files` `to: src/main/dist` so asar paths match root `main` — BUT this would break Shell.ts packed-mode path detection (pwaDistPath/modulesRootPath, the v0.1.2 fix) which assumes `to: .`. Higher risk.
- Recommend (A), verified by actually BOOTING the produced DMG (empirical gate), not just a successful build.

## Decision

- Do NOT hack this into the release config unsupervised mid-gate. Make it **F3 task 1** (DMG packaging + signed/notarized pipeline is already F3 scope). The fix is informed by this diagnosis.
- F1+F2 source committed (verified: typecheck + 1842 tests + prod build + no node:* leak green). Version bumped to 0.4.0.
- **Batched gate:** once F3's DMG fix lands, build ONE v0.4.x DMG and run the functional+eyes-on gate covering F1+F2+F3 together (matches Jindřich 'otestujeme více věcí najednou'). Closes B004-012 + B005-010 + the F3 gate.

## Automated gate evidence (F1+F2, this working tree)

- `pnpm -r typecheck` clean (5 projects)
- `pnpm test` 1842/1842 passed (146 files; +176 from F2, +333 from v0.2.1 baseline 1509)
- `pnpm build` clean; PWA 436KB, no node:* leak
