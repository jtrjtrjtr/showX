import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from 'showx-shared';

export interface DiscoveryEntry {
  slug: string;
  manifestPath: string;
  entryPath: string;
}

export interface DiscoveryResult {
  found: DiscoveryEntry[];
  errors: Array<{ slug: string; reason: string }>;
}

export async function discoverModules(modulesRoot: string, logger: Logger): Promise<DiscoveryResult> {
  const found: DiscoveryEntry[] = [];
  const errors: Array<{ slug: string; reason: string }> = [];

  const rawEntries = await fs.readdir(modulesRoot, { withFileTypes: true, encoding: 'utf8' }).catch((err: unknown) => {
    logger.warn('modules.root.not_accessible', { modulesRoot, error: String(err) });
    return null;
  });
  if (!rawEntries) return { found, errors };

  for (const entry of rawEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue; // skip hidden dirs (.DS_Store etc are not dirs but skip anyway)

    const slug = entry.name;
    const dir = join(modulesRoot, slug);
    const manifestPath = join(dir, 'manifest.json');
    const entryTs = join(dir, 'index.ts');
    const entryJs = join(dir, 'index.js');

    try {
      await fs.access(manifestPath);
    } catch {
      errors.push({ slug, reason: 'manifest.json missing' });
      continue;
    }

    // Prefer index.ts (dev/test), fall back to index.js (production build)
    let entryPath: string;
    try {
      await fs.access(entryTs);
      entryPath = entryTs;
    } catch {
      try {
        await fs.access(entryJs);
        entryPath = entryJs;
      } catch {
        errors.push({ slug, reason: 'index.ts/index.js missing' });
        continue;
      }
    }

    found.push({ slug, manifestPath, entryPath });
    logger.debug('module.discovered', { slug, entryPath });
  }

  return { found, errors };
}
