import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverModules } from '../../../src/main/src/moduleLoader/discovery.js';
import { Logger } from '../../../src/main/src/shared/Logger.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'showx-disc-test-'));
}

function makeLogger() {
  return new Logger({ output: { write: () => true } as unknown as NodeJS.WritableStream });
}

async function makeModule(root: string, slug: string, files: { manifest?: boolean; entry?: boolean }): Promise<void> {
  const dir = join(root, slug);
  await mkdir(dir, { recursive: true });
  if (files.manifest) {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ slug }), 'utf8');
  }
  if (files.entry) {
    await writeFile(join(dir, 'index.ts'), `export default {};`, 'utf8');
  }
}

describe('discoverModules', () => {
  let root: string;
  let logger: Logger;

  beforeEach(async () => {
    root = await makeTmpDir();
    logger = makeLogger();
  });

  it('returns all modules when manifest + index.ts present', async () => {
    await makeModule(root, 'alpha', { manifest: true, entry: true });
    await makeModule(root, 'beta', { manifest: true, entry: true });
    await makeModule(root, 'gamma', { manifest: true, entry: true });

    const result = await discoverModules(root, logger);
    expect(result.found).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    const slugs = result.found.map((f) => f.slug).sort();
    expect(slugs).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('reports error for module missing manifest.json', async () => {
    await makeModule(root, 'good', { manifest: true, entry: true });
    await makeModule(root, 'no-manifest', { manifest: false, entry: true });

    const result = await discoverModules(root, logger);
    expect(result.found).toHaveLength(1);
    expect(result.found[0].slug).toBe('good');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].slug).toBe('no-manifest');
    expect(result.errors[0].reason).toContain('manifest.json');
  });

  it('reports error for module missing index.ts and index.js', async () => {
    await makeModule(root, 'good', { manifest: true, entry: true });
    await makeModule(root, 'no-entry', { manifest: true, entry: false });

    const result = await discoverModules(root, logger);
    expect(result.found).toHaveLength(1);
    expect(result.found[0].slug).toBe('good');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].slug).toBe('no-entry');
    expect(result.errors[0].reason).toContain('index.ts');
  });

  it('falls back to index.js when index.ts absent', async () => {
    const dir = join(root, 'jsonly');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'manifest.json'), '{}', 'utf8');
    await writeFile(join(dir, 'index.js'), 'export default {};', 'utf8');

    const result = await discoverModules(root, logger);
    expect(result.found).toHaveLength(1);
    expect(result.found[0].entryPath).toMatch(/index\.js$/);
  });

  it('ignores hidden directories (starting with .)', async () => {
    await makeModule(root, 'visible', { manifest: true, entry: true });
    const hiddenDir = join(root, '.hidden');
    await mkdir(hiddenDir, { recursive: true });
    await writeFile(join(hiddenDir, 'manifest.json'), '{}', 'utf8');
    await writeFile(join(hiddenDir, 'index.ts'), '', 'utf8');

    const result = await discoverModules(root, logger);
    expect(result.found.map((f) => f.slug)).toEqual(['visible']);
  });

  it('ignores regular files (non-directory entries)', async () => {
    await makeModule(root, 'real', { manifest: true, entry: true });
    await writeFile(join(root, '.DS_Store'), '', 'utf8');
    await writeFile(join(root, 'README.md'), '', 'utf8');

    const result = await discoverModules(root, logger);
    expect(result.found).toHaveLength(1);
  });

  it('returns empty result for non-existent modulesRoot', async () => {
    const result = await discoverModules(join(root, 'nonexistent'), logger);
    expect(result.found).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
