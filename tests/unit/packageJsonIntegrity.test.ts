import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardrail: the workspace ROOT package.json must keep its scripts +
 * devDependencies + workspace identity. Forge tasks that edit package.json
 * to add a dependency have TWICE (B006-001, B007-004) wrongly rewritten it
 * with a minimal "app" package.json (asar-root shape), stripping scripts and
 * devDeps — which silently breaks pnpm test/build/dist + dev mode.
 *
 * The packed-app package.json (main=index.js, no scripts) is produced by
 * electron-builder via `extraMetadata.main` + `files: - package.json`, NOT by
 * editing the source root. This test fails fast if the source root is clobbered,
 * so Critic catches it before accept instead of the Architect catching it at the gate.
 */
describe('root package.json integrity', () => {
  const root = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
  );

  it('keeps the workspace name + dev main entry', () => {
    expect(root.name).toBe('showx-workspace');
    // dev entry (electron . at repo root). Packed override = extraMetadata.main.
    expect(root.main).toBe('src/main/dist/index.js');
  });

  it('keeps the essential scripts', () => {
    for (const s of ['test', 'build', 'build:main', 'build:pwa', 'dist', 'typecheck', 'dev']) {
      expect(root.scripts?.[s], `missing script: ${s}`).toBeTruthy();
    }
  });

  it('keeps devDependencies (electron toolchain)', () => {
    expect(Object.keys(root.devDependencies ?? {}).length).toBeGreaterThan(5);
  });

  it('declares the pnpm workspaces', () => {
    expect(Array.isArray(root.workspaces)).toBe(true);
    expect(root.workspaces).toContain('src/main');
  });
});
