# Fix — packed app ESM crash ("Cannot use import statement outside a module")

**Date:** 2026-06-14
**Reported by:** Jindřich (GUI session, v0.7.0) — error dialog at boot:
`app.asar/index.js:1 import { app } from 'electron' — SyntaxError: Cannot use import statement outside a module`

## Root cause
The compiled Electron main (`src/main/dist/index.js`) is ESM (`import ...`). The PACKED
app.asar/package.json had `main: index.js` but **no `type: module`** → Node/Electron
loaded index.js as CommonJS → SyntaxError at boot. Latent through F3/F4/LTC because the
Architect could only verify headless (the process launched; the GUI error dialog was
invisible without a display). Jindřich's GUI session surfaced it.

Also found: the root package.json had been re-clobbered (main:index.js, no scripts/devDeps)
— the packageJsonIntegrity guard was correctly FAILING. Restored from 983548f (full
workspace root, main src/main/dist/index.js, scripts+devDeps) + current deps + 0.7.0.

## Fix
electron-builder.yml `extraMetadata` now sets BOTH:
```
extraMetadata:
  main: index.js
  type: module      # ← the fix; packed pkg must declare ESM for the ESM main
```
Reference: bridgeX (`apps/bridgex-app`) ships `main: dist/main.cjs` + `type: module` —
it bundles main to a single .cjs (electron-vite) so the entry is unambiguously CommonJS.
ShowX keeps tsc-ESM-multifile main, so it needs `type: module` in the packed pkg instead.

## Verification (headless, by Architect)
- Packed app.asar/package.json now: `main: index.js`, `type: module` ✓
- Ran the packed binary: NO "Cannot use import statement" / SyntaxError; main process
  loads index.js and stays alive (previously crashed immediately on line 1). ✓
- Full window RENDER still needs Jindřich's GUI session (Architect context has no display).

## Lessons
1. Packed Electron main = ESM → packed package.json MUST have `type: module`. A future option:
   bundle main to `.cjs` (electron-vite/esbuild) like bridgeX to remove the ESM fragility.
2. The headless gate cannot catch boot-time GUI errors. The binding eyes-on gate (Jindřich)
   is essential precisely for this class of bug — automated green ≠ boots in a real session.
3. Root package.json keeps getting clobbered by build steps; guard test catches it but the
   working tree must be re-checked before each DMG build.
