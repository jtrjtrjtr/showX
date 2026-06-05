import { promises as fs } from 'node:fs';
import path from 'node:path';
import type * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import { atomicWriteFile } from '../persistence/atomicWrite.js';
import { renderSmMasterPdf, renderOperatorPdf } from './pdfLayout.js';

export interface PdfExportOpts {
  pkgPath: string;
  departments?: string[];        // default: ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS']
  generateSmMaster?: boolean;    // default: true
}

export interface PdfExportOutput {
  department: string;
  path: string;
  size_bytes: number;
  pages: number;
}

export interface PdfExportResult {
  outputs: PdfExportOutput[];
}

const DEFAULT_DEPARTMENTS = ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS'];

export async function exportCueSheetPdf(
  doc: Y.Doc,
  opts: PdfExportOpts,
): Promise<PdfExportResult> {
  const departments = opts.departments ?? DEFAULT_DEPARTMENTS;
  const generateSm = opts.generateSmMaster ?? true;

  const meta = doc.getMap('meta').toJSON() as Record<string, unknown>;
  const cuelistId = meta['active_cuelist_id'] as string | undefined;
  if (!cuelistId) throw new Error('no active_cuelist_id in show meta');

  const cuelists = doc.getArray('cuelists').toArray() as Array<{ get: (k: string) => unknown; toJSON: () => Record<string, unknown> }>;
  const cuelistMap = cuelists.find((m) => m.get('id') === cuelistId);
  if (!cuelistMap) throw new Error(`cuelist ${cuelistId} not found`);

  const cuelistJson = cuelistMap.toJSON();
  const cues = (cuelistJson['cues'] ?? []) as Cue[];
  const cuelistName = (cuelistJson['name'] as string | undefined) ?? '';

  const showMeta = {
    title: meta['title'] as string | undefined,
    venue: meta['venue'] as string | undefined,
    date: meta['date'] as string | undefined,
  };

  const exportsDir = path.join(opts.pkgPath, 'exports', 'pdf');
  await fs.mkdir(exportsDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = (showMeta.title ?? 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();

  const outputs: PdfExportOutput[] = [];

  if (generateSm) {
    const pdf = await renderSmMasterPdf(showMeta, cues, cuelistName);
    const buf = Buffer.from(await pdf.save());
    const filename = `SM_${safeTitle}_${ts}.pdf`;
    const outPath = path.join(exportsDir, filename);
    await atomicWriteFile(outPath, buf);
    outputs.push({ department: 'SM', path: outPath, size_bytes: buf.length, pages: pdf.getPageCount() });
  }

  for (const dept of departments) {
    const pdf = await renderOperatorPdf(showMeta, cues, dept);
    const buf = Buffer.from(await pdf.save());
    const filename = `${dept}_${safeTitle}_${ts}.pdf`;
    const outPath = path.join(exportsDir, filename);
    await atomicWriteFile(outPath, buf);
    outputs.push({ department: dept, path: outPath, size_bytes: buf.length, pages: pdf.getPageCount() });
  }

  return { outputs };
}
