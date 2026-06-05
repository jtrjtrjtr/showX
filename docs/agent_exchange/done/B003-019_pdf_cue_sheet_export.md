---
id: "B003-019"
title: "PDF cue-sheet export — per-department + SM master, A4 printable"
type: "implementation"
estimated_size_lines: 600
priority: "P1"
depends_on: ["B003-005", "B003-013"]
target_files:
  - "src/modules/cuelist-core/src/export/pdfExport.ts"
  - "src/modules/cuelist-core/src/export/pdfLayout.ts"
  - "src/modules/cuelist-core/src/export/pdfStyles.ts"
  - "tests/unit/modules/cuelist-core/export/pdfExport.test.ts"
  - "tests/fixtures/expected-pdf/sm_master_3cues.pdf"
acceptance_criteria:
  - "`exportCueSheetPdf(doc, opts): Promise<{path; size_bytes; pages}>` produces PDF using pdf-lib (or pdfkit — Forge picks lighter dep)"
  - "Produces 1 PDF per department (LX, SX, VIDEO, AUTO, PYRO, FS) + 1 SM master — total 7 default outputs, configurable via `opts.departments: string[]`"
  - "Cover page per PDF: show title, venue, date, department name, export timestamp, page count"
  - "SM master view PDF columns: Q#, Label, Depts, Standby note, Trigger, Notes — all cues visible"
  - "Operator PDF columns: Q#, Label, dept-specific payload summary (Eos cue for LX, OSC address for SX, etc.), Standby, Notes — filtered per B003-005 visibleCues with watched=['SM'] (operators see SM cues too as context)"
  - "Layout: A4 portrait, 1cm margins, monospaced cue numbers for column alignment, sans-serif body, 10-12pt font"
  - "Page header (every page): show title + dept name + page X of Y"
  - "Page footer: ShowX 0.1 export marker + exported_at ISO"
  - "Greyed (watched-only) cues rendered in lighter ink color (≈40% opacity equivalent)"
  - "Highlighted (owned) cues bold/dark"
  - "Compound cue indicator: small dept-chip stripes on left margin"
  - "Trigger badge: 'M' for manual, '→' for auto_follow, '⏩' for auto_continue, '⏱' for timecode"
  - "PDFs output to `<pkgPath>/exports/pdf/<dept>_<showtitle>_<timestamp>.pdf`"
  - "10+ vitest tests covering: SM master generation, per-dept generation, empty cuelist edge, large cuelist (200 cues = multipage), cover page content, file write"
---

## Context

PDF cue sheets are theatre's paper backup — the printout an operator clips to their console at the start of the show "in case the iPad dies". Theatre tradition requires this; corporate AV less so but appreciates it. This task delivers MVP-quality PDFs — readable, printable, accurate. Polish (branding, custom fonts, logo headers) is post-MVP.

## Implementation notes

### Library choice

pdf-lib is a lightweight pure-JS PDF generator with good docs + 600KB bundle. Use it. Alternative pdfkit is heavier and DOM-coupled. Forge: pdf-lib unless there's a hard reason otherwise.

### Public API

```ts
// src/modules/cuelist-core/src/export/pdfExport.ts
import * as Y from 'yjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../persistence/atomicWrite';
import { visibleCues } from '../views/departmentFilter';
import { profileForRole } from '../views/viewProfiles';
import { summarizePayload } from '../catalog/summarize';

export interface PdfExportOpts {
  pkgPath: string;
  departments?: string[];  // default = ['SM', 'LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS']
  generateSmMaster?: boolean;  // default true
}

export interface PdfExportResult {
  outputs: Array<{ department: string; path: string; size_bytes: number; pages: number }>;
}

export async function exportCueSheetPdf(
  doc: Y.Doc, opts: PdfExportOpts,
): Promise<PdfExportResult> {
  const departments = opts.departments ?? ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS'];
  const generateSm = opts.generateSmMaster ?? true;
  const meta = doc.getMap('meta').toJSON() as any;
  const cuelistId = meta.active_cuelist_id;
  const cuelist = doc.getArray('cuelists').toArray().find((m: any) => m.get('id') === cuelistId)?.toJSON() as any;
  if (!cuelist) throw new Error('no active cuelist');
  const cues = cuelist.cues;

  const exportsDir = path.join(opts.pkgPath, 'exports', 'pdf');
  await fs.mkdir(exportsDir, { recursive: true });
  const outputs: PdfExportResult['outputs'] = [];
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = (meta.title || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();

  if (generateSm) {
    const pdf = await renderSmMasterPdf(meta, cues, cuelist.name);
    const buf = await pdf.save();
    const filename = `SM_${safeTitle}_${ts}.pdf`;
    const out = path.join(exportsDir, filename);
    await atomicWriteFile(out, Buffer.from(buf));
    outputs.push({ department: 'SM', path: out, size_bytes: buf.length, pages: pdf.getPageCount() });
  }

  for (const dept of departments) {
    const profile = profileForRole('operator', [dept]);
    const filtered = visibleCues(cues, { owned: new Set([dept]), watched: new Set(['SM']) });
    const pdf = await renderOperatorPdf(meta, filtered, cues, dept, profile);
    const buf = await pdf.save();
    const filename = `${dept}_${safeTitle}_${ts}.pdf`;
    const out = path.join(exportsDir, filename);
    await atomicWriteFile(out, Buffer.from(buf));
    outputs.push({ department: dept, path: out, size_bytes: buf.length, pages: pdf.getPageCount() });
  }

  return { outputs };
}
```

### Render SM master

```ts
// src/modules/cuelist-core/src/export/pdfLayout.ts
const PAGE_W = 595.276;  // A4 portrait in pt
const PAGE_H = 841.89;
const MARGIN = 28.35;     // 1cm

export async function renderSmMasterPdf(meta: any, cues: any[], cuelistName: string): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  // Cover page
  await renderCoverPage(pdf, { font: helv, fontBold: helvBold }, meta, 'SM Master', cuelistName);

  // Body pages
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN - 30;
  const COL_LABEL = MARGIN + 40;
  const COL_DEPT = COL_LABEL + 200;
  const COL_TRIGGER = COL_DEPT + 80;
  const COL_STANDBY = COL_TRIGGER + 60;

  // Header for first body page
  renderPageHeader(page, helvBold, meta, 'SM Master', 1);

  for (const cue of cues) {
    if (y < MARGIN + 30) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN - 30;
      renderPageHeader(page, helvBold, meta, 'SM Master', pdf.getPageCount());
    }
    // Cue row
    page.drawText(cue.label, { x: COL_LABEL, y, font: helvBold, size: 11 });
    page.drawText(cue.description ?? '', { x: COL_LABEL, y: y - 12, font: helv, size: 9 });
    page.drawText(cue.department.join(','), { x: COL_DEPT, y, font: helv, size: 9 });
    page.drawText(triggerBadge(cue.trigger), { x: COL_TRIGGER, y, font: mono, size: 9 });
    page.drawText(cue.standby_note ?? '', { x: COL_STANDBY, y, font: helv, size: 9 });
    y -= 30;
  }

  // Footer on each page
  for (let i = 0; i < pdf.getPageCount(); i++) {
    renderPageFooter(pdf.getPage(i), helv, new Date().toISOString());
  }

  return pdf;
}

function triggerBadge(t: any): string {
  if (t.kind === 'manual') return 'M';
  if (t.kind === 'auto_follow') return '→';
  if (t.kind === 'auto_continue') return '⏩';
  if (t.kind === 'timecode') return '⏱';
  return '?';
}
```

### Render operator PDF

```ts
export async function renderOperatorPdf(
  meta: any, filtered: any[], allCues: any[], dept: string, profile: any,
): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  await renderCoverPage(pdf, { font: helv, fontBold: helvBold }, meta, dept, 'Operator view');

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN - 30;
  renderPageHeader(page, helvBold, meta, dept, 1);

  const COL_LABEL = MARGIN + 40;
  const COL_PAYLOAD = COL_LABEL + 140;
  const COL_STANDBY = COL_PAYLOAD + 220;

  for (const cue of filtered) {
    if (y < MARGIN + 30) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN - 30;
      renderPageHeader(page, helvBold, meta, dept, pdf.getPageCount());
    }
    const isActionable = cue.department.includes(dept);
    const color = isActionable ? rgb(0, 0, 0) : rgb(0.5, 0.5, 0.5);
    page.drawText(cue.label, { x: COL_LABEL, y, font: helvBold, size: 11, color });
    const payloadSummary = dept === 'LX'
      ? lxPayloadSummary(cue) : dept === 'SX'
      ? sxPayloadSummary(cue) : dept === 'VIDEO'
      ? videoPayloadSummary(cue) : genericPayloadSummary(cue);
    page.drawText(payloadSummary, { x: COL_PAYLOAD, y, font: mono, size: 9, color });
    page.drawText(cue.standby_note ?? '', { x: COL_STANDBY, y, font: helv, size: 9, color });
    if (cue.description) {
      page.drawText(cue.description.substring(0, 80), { x: COL_LABEL, y: y - 12, font: helv, size: 8, color });
    }
    y -= 30;
  }

  for (let i = 0; i < pdf.getPageCount(); i++) {
    renderPageFooter(pdf.getPage(i), helv, new Date().toISOString());
  }
  return pdf;
}

function lxPayloadSummary(cue: any): string {
  const lx = cue.payloads.find((p: any) => p.type === 'lx_ref');
  return lx ? `Cue ${lx.cue_list}/${lx.cue_number}` : '—';
}
function sxPayloadSummary(cue: any): string {
  const sx = cue.payloads.find((p: any) => p.type === 'osc' && /sound|sfx|audio|cue/.test(p.address));
  return sx ? sx.address : '—';
}
function videoPayloadSummary(cue: any): string {
  const v = cue.payloads.find((p: any) => p.type === 'osc');
  return v ? v.address.split('/').pop() || v.address : '—';
}
function genericPayloadSummary(cue: any): string {
  return cue.payloads.map(summarizePayload).join('; ').substring(0, 80);
}
```

### Cover + header + footer

```ts
async function renderCoverPage(pdf: PDFDocument, fonts: { font: any; fontBold: any }, meta: any, dept: string, subtitle: string) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const cy = PAGE_H / 2;
  page.drawText(meta.title ?? '(untitled show)', { x: MARGIN, y: cy + 60, font: fonts.fontBold, size: 36 });
  page.drawText(`${meta.venue ?? ''} · ${meta.date ?? ''}`, { x: MARGIN, y: cy + 20, font: fonts.font, size: 14 });
  page.drawText(`${dept} cue sheet · ${subtitle}`, { x: MARGIN, y: cy - 20, font: fonts.fontBold, size: 24 });
  page.drawText(`Generated by ShowX 0.1 — ${new Date().toISOString()}`, { x: MARGIN, y: MARGIN, font: fonts.font, size: 9 });
}

function renderPageHeader(page: any, font: any, meta: any, dept: string, pageNum: number) {
  page.drawText(`${meta.title ?? ''} — ${dept}`, { x: MARGIN, y: PAGE_H - MARGIN + 5, font, size: 9 });
}

function renderPageFooter(page: any, font: any, exportedAt: string) {
  page.drawText(`ShowX 0.1 export · ${exportedAt}`, { x: MARGIN, y: MARGIN - 15, font, size: 7 });
}
```

## Test plan

### `pdfExport.test.ts`

1. Empty cuelist: produces single-page PDFs (cover only).
2. 3-cue cuelist: SM master PDF has 2 pages (cover + body).
3. 200-cue cuelist: multi-page (estimate: ~10 cues per page → ~21 pages).
4. SM master includes all cues; operator PDFs filter correctly.
5. Compound cue rendered with dept stripe.
6. Each output written to `<pkgPath>/exports/pdf/<dept>_*.pdf` with timestamp.
7. Output buffer is valid PDF (starts with `%PDF-`).
8. Cover page contains title + venue + date + dept.
9. opts.departments override produces only requested dept PDFs.
10. opts.generateSmMaster=false skips SM PDF.
11. Greyed cues rendered with lighter color (gray rgb).
12. Page footer contains export marker.

## Out of scope

- Custom branding / logo header (post-MVP).
- Custom fonts (Helvetica + Courier defaults are sufficient).
- Color cover (currently monochrome).
- PDF/A archival format (post-MVP if any archival requirement).
- Cue-by-cue page break logic for SHOW night printouts (post-MVP).
- Watermarks for SHOW vs REHEARSAL (post-MVP).
- Export of cue catalog as PDF (B003-010 emits JSON; PDF table of routing post-MVP).
- Email PDF distribution (post-MVP).

## Notes for Critic

- Verify pdf-lib is the chosen library (or document Forge's alternative choice).
- Verify per-dept filter uses B003-005's visibleCues with watched=['SM'] (operators see SM cues for context, not pure isolation).
- Confirm output directory created under pkgPath/exports/pdf.
- Verify atomicWriteFile (no partial PDFs).
- Verify page header on every body page; footer on every page.
- Confirm A4 dimensions in points (595.276 × 841.89).
- Verify greyed cues use rgb(0.5,0.5,0.5) — readable but visually subordinate.
- Watch for text overflow (long descriptions wrapping/truncating).
- Verify trigger badge symbols render — pdf-lib + Helvetica may not have ⏩ Unicode glyph; Forge documents fallback (e.g. 'CONT' instead) if so.
- Confirm operator payload summaries are dept-appropriate (LX shows Eos cue numbers, etc.).
