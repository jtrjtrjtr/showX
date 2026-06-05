import { promises as fs } from 'node:fs';
import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

export type HistoryEvent = Record<string, unknown> & { ts: string; kind: string };

/**
 * Append one JSON event line to history.jsonl.
 * Creates the file if missing. Atomic for lines < PIPE_BUF on POSIX (~4 KB).
 */
export async function appendHistoryEvent(pkgPath: string, event: HistoryEvent): Promise<void> {
  const line = JSON.stringify(event) + '\n';
  await fs.appendFile(path.join(pkgPath, 'history.jsonl'), line, 'utf8');
}

export interface RotateOpts {
  maxBytes: number;    // rotate if file exceeds this size
  maxAgeDays: number;  // rotate if file is older than this many days
}

/**
 * Rotate history.jsonl if it exceeds maxBytes or maxAgeDays.
 * Gzips the current file to history.<n>.jsonl.gz, then unlinks the original.
 * Archives are kept indefinitely (never deleted).
 */
export async function rotateHistoryIfNeeded(pkgPath: string, opts: RotateOpts): Promise<void> {
  const histPath = path.join(pkgPath, 'history.jsonl');
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(histPath);
  } catch {
    return; // file doesn't exist — nothing to rotate
  }

  const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
  if (stat.size < opts.maxBytes && ageDays < opts.maxAgeDays) return;

  const nextN = await nextArchiveIndex(pkgPath);
  const gzPath = path.join(pkgPath, `history.${nextN}.jsonl.gz`);
  await pipeline(createReadStream(histPath), createGzip(), createWriteStream(gzPath));
  await fs.unlink(histPath);
}

async function nextArchiveIndex(pkgPath: string): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(pkgPath);
  } catch {
    return 1;
  }
  const indices = entries
    .map((f) => f.match(/^history\.(\d+)\.jsonl\.gz$/)?.[1])
    .filter(Boolean)
    .map(Number);
  return indices.length ? Math.max(...indices) + 1 : 1;
}

/**
 * Count events of kind 'cue_fired' in history.jsonl for UI display.
 * Returns 0 if the file is missing or unreadable.
 */
export async function countCueFires(pkgPath: string): Promise<number> {
  const histPath = path.join(pkgPath, 'history.jsonl');
  let raw: string;
  try {
    raw = await fs.readFile(histPath, 'utf8');
  } catch {
    return 0;
  }
  return raw
    .split('\n')
    .filter(Boolean)
    .reduce((n, line) => {
      try {
        const ev = JSON.parse(line) as { kind: string };
        return ev.kind === 'cue_fired' ? n + 1 : n;
      } catch {
        return n;
      }
    }, 0);
}
