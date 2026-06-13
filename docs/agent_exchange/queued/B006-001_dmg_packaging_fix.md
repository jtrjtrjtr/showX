---
id: "B006-001"
title: "DMG packaging fix + boot verification"
type: "implementation"
estimated_size_lines: 250
priority: "P0"
bundle: "ShowX-6"
depends_on: []
target_files:
  - "electron-builder.yml"
  - "package.json"
  - "scripts/build-release.sh"
  - "docs/dev/**"
acceptance_criteria:
  - "`pnpm dist` (or arm64-only) produces a DMG WITHOUT the electron-builder sanityCheckPackage errors ('entry file src/main/dist/index.js does not exist' / 'package.json does not exist')."
  - "KEEP `files: src/main/dist → .` mapping — Shell.ts:163-173 packed-mode path detection depends on Shell.js at asar root + pwa at <asar>/pwa + modules at <asar>/modules. Do NOT change `to:` (would break runtime paths). Root package.json `main` stays src/main/dist/index.js (dev needs it)."
  - "Fix the packed metadata: add `extraMetadata.main: index.js` to electron-builder.yml so the PACKED package.json main points at the in-asar entry, AND ensure a package.json is present at asar root (electron-builder should inject it; if the custom files mapping suppresses it, add an explicit files entry to include the app package.json at root). See decisions/2026-06-13_dmg_packaging_regression.md for the full diagnosis."
  - "EMPIRICAL VERIFICATION (mandatory): the produced .app must BOOT. Launch `SHOWX_PAIRING_TEST_PIN=000000 <built>/ShowX.app/Contents/MacOS/ShowX` and confirm the shell window loads (not the v0.1.4 'Loading...' hang) — capture evidence in the done report (console output / screenshot path). A green build that doesn't boot is NOT done."
  - "arm64 unsigned build must succeed (signing is B006-002). Document the exact working `pnpm dist`/electron-builder invocation in scripts/build-release.sh + a short note in docs/dev/."
  - "If native dep drift contributed (@julusian/midi 3.5→3.6.1), pin versions as needed to make the build reproducible."
  - "No edits to src/ runtime code (this is packaging). No edits outside target_files."
---

## Context

The packed DMG build regressed since v0.2.1 (app-builder-lib drift) — see decisions/2026-06-13_dmg_packaging_regression.md. This blocks the batched F1+F2+F3 functional/eyes-on gate. Fix it FIRST so the gate can run. The diagnosis already narrowed the cause + the safe fix direction (keep layout, fix metadata, verify by booting).

## Implementation notes

- Read decisions/2026-06-13_dmg_packaging_regression.md and decisions/2026-06-13_f3_trust_cuelights_architecture.md §1 first.
- The asar currently gets src/main/dist flattened to root (index.js present) but lacks a package.json with main=index.js. extraMetadata.main fixes the pointer; ensure the package.json file is actually in the asar.
- This is iterative (memory: '5 DMG iterations, gnarly'). Iterate build→inspect asar→boot until it boots. `npx asar list <app.asar>` to inspect.
- Don't break dev mode (`pnpm dev:electron` uses root main = src/main/dist/index.js).

## Test plan

- Build arm64 unsigned → DMG produced, no sanity errors.
- Mount/install → launch binary → shell window loads, window title 'ShowX', no infinite 'Loading...'.
- Capture boot evidence.

## Out of scope

- Signing/notarization (B006-002). Runtime feature code.
