/**
 * electron-builder afterAllArtifactBuild hook.
 *
 * Guards against the "app-builder-lib drift" regression where certain
 * electron-builder / pnpm version combinations write the extraMetadata-patched
 * package.json back to the workspace root SOURCE file — stripping scripts and
 * devDependencies and setting main:index.js / type:module on the source tree.
 *
 * This hook runs after ALL artifacts (DMG etc.) are built but while the
 * electron-builder process is still alive. It:
 *   1. Reads the current package.json
 *   2. Checks if it was clobbered (missing scripts or devDependencies)
 *   3. If yes, restores it from git HEAD
 *   4. Logs a clear warning so the issue is visible in build output
 *
 * If git is not available (CI without git), falls back to a NO-OP warning
 * (the CI gate / packageJsonIntegrity unit test will catch the regression
 * before it gets committed).
 *
 * Reference: 2026-06-15 eiffel task #1144, decisions/2026-06-15_dmg_pkg_clobber_fix.md
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PKG_PATH = resolve(ROOT, 'package.json');

export default async function restorePkgAfterBuild(context) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
  } catch (e) {
    console.warn('[restore-pkg] WARNING: could not read package.json:', e.message);
    return;
  }

  const isClobbered =
    !pkg.scripts || Object.keys(pkg.scripts).length === 0 ||
    !pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0 ||
    pkg.main === 'index.js'; // packed-app value, not dev value

  if (!isClobbered) {
    // No drift detected — package.json is clean.
    return;
  }

  console.warn(
    '[restore-pkg] WARNING: package.json was clobbered by app-builder-lib drift!\n' +
    '  Missing scripts or devDependencies, or main=index.js detected.\n' +
    '  Restoring from git HEAD…',
  );

  try {
    const original = execSync('git show HEAD:package.json', { cwd: ROOT, encoding: 'utf8' });
    writeFileSync(PKG_PATH, original, 'utf8');
    console.log('[restore-pkg] package.json restored from git HEAD successfully.');
  } catch (e) {
    console.error(
      '[restore-pkg] ERROR: git restore failed:', e.message,
      '\n  The workspace root package.json may be in a broken state.',
      '\n  Run: git checkout -- package.json',
    );
  }
}
