import * as Y from 'yjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { saveShowxPackage } from '../persistence/showxPackage.js';

export interface ExportOpts {
  includeHistory?: boolean;
  includeSnapshots?: boolean;
  includeMedia?: boolean;
}

export interface ExportResult {
  path: string;
  size_bytes: number;
}

/**
 * Export a Y.Doc as a .showx package directory to a new path (Save As).
 * Delegates to saveShowxPackage — does not duplicate save logic.
 * By default includes history, snapshots, and media unless opts explicitly set to false.
 */
export async function exportShowxPackage(
  doc: Y.Doc,
  targetPath: string,
  opts: ExportOpts = {},
  currentPkgPath?: string,
): Promise<ExportResult> {
  if (currentPkgPath !== undefined) {
    if (await pathCollidesWithCurrentShow(targetPath, currentPkgPath)) {
      throw new Error(`target path ${targetPath} collides with current show`);
    }
  }
  await saveShowxPackage(doc, targetPath, { reason: 'explicit', by_operator_id: 'export' });
  if (opts.includeHistory === false) await stripHistory(targetPath);
  if (opts.includeSnapshots === false) await stripSnapshots(targetPath);
  if (opts.includeMedia === false) await stripMedia(targetPath);
  const size = await computeDirSize(targetPath);
  return { path: targetPath, size_bytes: size };
}

export async function pathCollidesWithCurrentShow(
  targetPath: string,
  currentPkgPath: string,
): Promise<boolean> {
  const resolvedTarget = await canonicalizePath(targetPath);
  const resolvedCurrent = await canonicalizePath(currentPkgPath);
  return resolvedTarget === resolvedCurrent;
}

async function canonicalizePath(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

async function stripHistory(pkgPath: string): Promise<void> {
  try {
    await fs.unlink(path.join(pkgPath, 'history.jsonl'));
  } catch {
    // file may not exist — ignore
  }
}

async function stripSnapshots(pkgPath: string): Promise<void> {
  const snapDir = path.join(pkgPath, 'snapshots');
  try {
    await fs.rm(snapDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  await fs.mkdir(snapDir, { recursive: true });
}

async function stripMedia(pkgPath: string): Promise<void> {
  const mediaDir = path.join(pkgPath, 'media');
  try {
    await fs.rm(mediaDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  await fs.mkdir(mediaDir, { recursive: true });
}

export async function computeDirSize(dirPath: string): Promise<number> {
  let total = 0;
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await computeDirSize(full);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(full);
        total += stat.size;
      } catch {
        // skip unreadable
      }
    }
  }
  return total;
}
