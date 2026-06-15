#!/usr/bin/env node
/**
 * Generates src/main/dist/package.json — the minimal package.json that Electron
 * reads from the packed asar root to find the main entry point.
 *
 * WHY THIS EXISTS (app-builder-lib drift fix, 2026-06-15):
 *   electron-builder 24.x writes `extraMetadata` values back to the SOURCE
 *   workspace root package.json before creating the asar. This clobbered
 *   the workspace scripts + devDependencies twice (B006-001 era and again
 *   post-LTC). The permanent fix is to maintain the packed package.json as a
 *   BUILD ARTIFACT in src/main/dist/ rather than deriving it from the root via
 *   extraMetadata at pack time. electron-builder's `files: from: src/main/dist
 *   to: .` mapping then picks it up and places it at the asar root — without
 *   ever touching the workspace root package.json.
 *
 * WHAT IS GENERATED:
 *   {
 *     "name": "showx",
 *     "version": "<from root package.json>",
 *     "main": "index.js",      ← asar-root-relative path
 *     "type": "module"          ← required: compiled main is ESM
 *   }
 *
 * RUN: node scripts/gen-app-pkg.mjs
 * Called automatically from src/main/package.json "build" script.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Read version from workspace root (authoritative source)
const rootPkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const version = rootPkg.version;
if (!version) {
  console.error('[gen-app-pkg] ERROR: no version in root package.json');
  process.exit(1);
}

const appPkg = {
  name: 'showx',
  version,
  main: 'index.js',
  type: 'module',
};

const outPath = resolve(rootDir, 'src/main/dist/package.json');
writeFileSync(outPath, JSON.stringify(appPkg, null, 2) + '\n');
console.log(`[gen-app-pkg] wrote ${outPath} (v${version})`);
