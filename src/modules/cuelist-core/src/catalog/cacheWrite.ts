import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../persistence/atomicWrite.js';

export async function writeCatalogCache(pkgPath: string, catalog: object): Promise<void> {
  const cacheDir = path.join(pkgPath, 'media', '.cache');
  await fs.mkdir(cacheDir, { recursive: true });
  await atomicWriteFile(
    path.join(cacheDir, 'cue-catalog.json'),
    JSON.stringify(catalog, null, 2) + '\n',
  );
}
