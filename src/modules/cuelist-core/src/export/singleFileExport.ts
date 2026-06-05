import * as Y from 'yjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../persistence/atomicWrite.js';
import { docToProjections } from '../persistence/projections.js';
import { saveShowxPackage } from '../persistence/showxPackage.js';
import { pathCollidesWithCurrentShow } from './showxExport.js';
import type { ExportOpts, ExportResult } from './showxExport.js';

const SHOWX_SOURCE_VERSION = 'cuelist-core@0.1.0';
const MEDIA_WARN_BYTES = 10 * 1024 * 1024; // 10 MB

export interface SingleFileEnvelope {
  format: 'showx-single-file';
  version: '1.0';
  exported_at: string;
  source: string;
  show: Record<string, unknown>;
  cuelists: Record<string, unknown>;
  routing: unknown;
  operators: unknown;
  doc_yjs_base64: string;
  history?: string[];
  snapshots?: Array<{ name: string; content: string }>;
  media?: Array<{ name: string; content_base64: string }>;
}

/**
 * Export a Y.Doc as a single portable JSON file.
 * Single-file format is self-contained: JSON projections + doc.yjs binary as base64.
 * Default: excludes history, snapshots, media (pass opts to include).
 */
export async function exportSingleFile(
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

  const { show, cuelists, routing, operators } = docToProjections(doc);
  const docUpdate = Y.encodeStateAsUpdate(doc);

  const envelope: SingleFileEnvelope = {
    format: 'showx-single-file',
    version: '1.0',
    exported_at: new Date().toISOString(),
    source: SHOWX_SOURCE_VERSION,
    show: show as Record<string, unknown>,
    cuelists: cuelists as Record<string, unknown>,
    routing,
    operators,
    doc_yjs_base64: Buffer.from(docUpdate).toString('base64'),
  };

  if (opts.includeHistory && currentPkgPath) {
    const histPath = path.join(currentPkgPath, 'history.jsonl');
    try {
      const text = await fs.readFile(histPath, 'utf8');
      envelope.history = text.split('\n').filter(Boolean);
    } catch {
      // history.jsonl may not exist
    }
  }

  if (opts.includeSnapshots && currentPkgPath) {
    const snapDir = path.join(currentPkgPath, 'snapshots');
    try {
      const files = await fs.readdir(snapDir);
      envelope.snapshots = await Promise.all(
        files.map(async (f) => ({
          name: f,
          content: await fs.readFile(path.join(snapDir, f), 'utf8'),
        })),
      );
    } catch {
      // snapshots dir may not exist
    }
  }

  if (opts.includeMedia && currentPkgPath) {
    envelope.media = await collectMediaBase64(path.join(currentPkgPath, 'media'));
    const totalBase64Size = envelope.media.reduce((s, m) => s + m.content_base64.length, 0);
    if (totalBase64Size > MEDIA_WARN_BYTES) {
      console.warn(
        `[showx-export] media payload >10MB (${(totalBase64Size / 1024 / 1024).toFixed(1)}MB)`,
      );
    }
  }

  const jsonText = JSON.stringify(envelope, null, 2) + '\n';
  await atomicWriteFile(targetPath, jsonText);
  return { path: targetPath, size_bytes: Buffer.byteLength(jsonText, 'utf8') };
}

/**
 * Reconstruct a Y.Doc from a single-file export.
 * Validates format and version before applying Yjs update.
 * Optionally writes the reconstructed state as a .showx package to targetPkgPath.
 */
export async function importSingleFile(
  jsonText: string,
  targetPkgPath?: string,
): Promise<{ doc: Y.Doc; envelope: SingleFileEnvelope }> {
  const envelope = JSON.parse(jsonText) as SingleFileEnvelope;

  if (envelope.format !== 'showx-single-file') {
    throw new Error('not a ShowX single-file export');
  }
  if (envelope.version !== '1.0') {
    throw new Error(`unsupported single-file version ${envelope.version}`);
  }

  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(envelope.doc_yjs_base64, 'base64'));

  if (targetPkgPath) {
    await saveShowxPackage(doc, targetPkgPath, { reason: 'explicit' });

    if (envelope.history) {
      const histPath = path.join(targetPkgPath, 'history.jsonl');
      await fs.writeFile(histPath, envelope.history.join('\n') + '\n', 'utf8');
    }

    if (envelope.snapshots) {
      const snapDir = path.join(targetPkgPath, 'snapshots');
      await fs.mkdir(snapDir, { recursive: true });
      for (const s of envelope.snapshots) {
        await fs.writeFile(path.join(snapDir, s.name), s.content, 'utf8');
      }
    }

    if (envelope.media) {
      const mediaDir = path.join(targetPkgPath, 'media');
      await fs.mkdir(mediaDir, { recursive: true });
      for (const m of envelope.media) {
        await fs.writeFile(path.join(mediaDir, m.name), Buffer.from(m.content_base64, 'base64'));
      }
    }
  }

  return { doc, envelope };
}

async function collectMediaBase64(
  mediaDir: string,
): Promise<Array<{ name: string; content_base64: string }>> {
  const result: Array<{ name: string; content_base64: string }> = [];
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(mediaDir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (entry.isFile()) {
      try {
        const buf = await fs.readFile(path.join(mediaDir, entry.name));
        result.push({ name: entry.name, content_base64: buf.toString('base64') });
      } catch {
        // skip unreadable files
      }
    }
  }
  return result;
}
