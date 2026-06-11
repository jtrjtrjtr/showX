import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Write data to target atomically: write to .tmp, fsync, rename.
 * If writeFile throws, .tmp may remain but the original target is preserved.
 * The rename(2) call is atomic on POSIX — old or new present, never partial.
 */
let tmpSeq = 0;

export async function atomicWriteFile(target: string, data: Buffer | string): Promise<void> {
  // Unique tmp per call — concurrent writers sharing `${target}.tmp` interleave
  // (second open('w') truncates under the first writer) and rename corrupted bytes.
  const tmp = `${target}.${process.pid}.${++tmpSeq}.tmp`;
  const fd = await fs.open(tmp, 'w');
  try {
    await fd.writeFile(data);
    await fd.sync();
  } finally {
    await fd.close();
  }
  await fs.rename(tmp, target);
}

/**
 * Scan pkgPath for orphan *.tmp files older than 5 minutes and delete them.
 * Files younger than 5 minutes may be from a concurrent save — leave them alone.
 */
export async function cleanOrphanTmps(pkgPath: string, log?: (msg: string) => void): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(pkgPath);
  } catch {
    return;
  }
  const fiveMinMs = 5 * 60 * 1000;
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.endsWith('.tmp')) continue;
    const full = path.join(pkgPath, entry);
    try {
      const stat = await fs.stat(full);
      if (now - stat.mtimeMs > fiveMinMs) {
        await fs.unlink(full);
        log?.(`[atomicWrite] removed orphan tmp: ${full}`);
      }
    } catch {
      // already gone or unstat-able — ignore
    }
  }
}
