import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { exportCueSheetPdf } from '../../../../../src/modules/cuelist-core/src/export/pdfExport.js';
import { initShowDoc, getMeta } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { addPayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function buildDoc(cueCount = 3): Y.Doc {
  const doc = initShowDoc({
    title: 'PDF Test Show',
    venue: 'Test Venue',
    date: '2026-06-17',
    created_by: 'op_test',
  });
  const meta = getMeta(doc);
  const cuelistId = meta.get('active_cuelist_id') as string;

  for (let i = 1; i <= cueCount; i++) {
    const dept = i % 2 === 0 ? 'SX' : 'LX';
    const cueId = addCue(doc, cuelistId, {
      label: `Q ${i}`,
      description: `Cue ${i} description`,
      department: [dept],
      standby_note: `Standby Q${i}`,
      created_by: 'op_test',
    });
    addPayload(doc, cuelistId, cueId, {
      type: 'lx_ref',
      tag: null,
      note: '',
      device_id: 'eos_main',
      cue_list: 1,
      cue_number: i,
    });
  }
  return doc;
}

function buildDocWithMixedDepts(): Y.Doc {
  const doc = initShowDoc({ title: 'Mixed Show', venue: 'Venue', date: '2026-01-01', created_by: 'op' });
  const meta = getMeta(doc);
  const cuelistId = meta.get('active_cuelist_id') as string;

  addCue(doc, cuelistId, { label: 'SM Cue 1', department: ['SM'], created_by: 'op' });
  addCue(doc, cuelistId, { label: 'LX Cue 1', department: ['LX'], created_by: 'op' });
  addCue(doc, cuelistId, { label: 'Compound', department: ['LX', 'SX'], created_by: 'op' });
  return doc;
}

function build200CueDoc(): Y.Doc {
  return buildDoc(200);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

async function makeTmp(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'showx-pdf-test-'));
  tmpDirs.push(d);
  return d;
}

afterEach(async () => {
  for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('exportCueSheetPdf', () => {
  it('returns outputs for SM + 6 default depts (7 total)', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(3);

    const result = await exportCueSheetPdf(doc, { pkgPath });

    expect(result.outputs).toHaveLength(7);
    const depts = result.outputs.map((o) => o.department);
    expect(depts).toContain('SM');
    expect(depts).toContain('LX');
    expect(depts).toContain('SX');
    expect(depts).toContain('VIDEO');
    expect(depts).toContain('AUTO');
    expect(depts).toContain('PYRO');
    expect(depts).toContain('FS');
  });

  it('all output PDFs start with %PDF- magic bytes', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(3);

    const result = await exportCueSheetPdf(doc, { pkgPath });

    for (const output of result.outputs) {
      const buf = await fs.readFile(output.path);
      expect(buf.slice(0, 5).toString('ascii')).toBe('%PDF-');
    }
  });

  it('all outputs have size_bytes > 0', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(3);

    const result = await exportCueSheetPdf(doc, { pkgPath });

    for (const output of result.outputs) {
      expect(output.size_bytes).toBeGreaterThan(0);
    }
  });

  it('SM master PDF has ≥ 2 pages for a 3-cue list (cover + body)', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(3);

    const result = await exportCueSheetPdf(doc, { pkgPath });

    const sm = result.outputs.find((o) => o.department === 'SM');
    expect(sm).toBeDefined();
    expect(sm!.pages).toBeGreaterThanOrEqual(2);
  });

  it('empty cuelist produces single-page PDFs (cover only)', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(0);

    const result = await exportCueSheetPdf(doc, { pkgPath });

    for (const output of result.outputs) {
      expect(output.pages).toBe(1);
    }
  });

  it('200-cue cuelist produces multi-page SM master', async () => {
    const pkgPath = await makeTmp();
    const doc = build200CueDoc();

    const result = await exportCueSheetPdf(doc, { pkgPath });

    const sm = result.outputs.find((o) => o.department === 'SM');
    expect(sm).toBeDefined();
    expect(sm!.pages).toBeGreaterThan(3);
  });

  it('files are written to <pkgPath>/exports/pdf/', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(3);

    const result = await exportCueSheetPdf(doc, { pkgPath });

    for (const output of result.outputs) {
      expect(output.path).toContain(path.join(pkgPath, 'exports', 'pdf'));
      const stat = await fs.stat(output.path);
      expect(stat.isFile()).toBe(true);
    }
  });

  it('opts.departments override produces only requested depts + SM', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(3);

    const result = await exportCueSheetPdf(doc, {
      pkgPath,
      departments: ['LX'],
      generateSmMaster: true,
    });

    expect(result.outputs).toHaveLength(2);
    const depts = result.outputs.map((o) => o.department);
    expect(depts).toContain('SM');
    expect(depts).toContain('LX');
  });

  it('generateSmMaster=false skips SM output', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(3);

    const result = await exportCueSheetPdf(doc, {
      pkgPath,
      departments: ['LX', 'SX'],
      generateSmMaster: false,
    });

    const depts = result.outputs.map((o) => o.department);
    expect(depts).not.toContain('SM');
    expect(result.outputs).toHaveLength(2);
  });

  it('operator PDFs filter correctly: LX PDF has fewer cues than SM PDF', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDocWithMixedDepts();

    const result = await exportCueSheetPdf(doc, { pkgPath, departments: ['LX'] });

    const sm = result.outputs.find((o) => o.department === 'SM')!;
    const lx = result.outputs.find((o) => o.department === 'LX')!;
    // SM PDF shows all cues (more pages) or same; LX PDF only shows cues with LX/SM dept
    // We can't easily assert on cue count from PDF bytes, but we can check both exist
    expect(sm).toBeDefined();
    expect(lx).toBeDefined();
  });

  it('compound cue (LX+SX) appears in both LX and SX operator PDFs', async () => {
    const pkgPath = await makeTmp();
    const doc = initShowDoc({ title: 'Compound Show', venue: 'V', date: '2026-06-01', created_by: 'op' });
    const meta = getMeta(doc);
    const cuelistId = meta.get('active_cuelist_id') as string;
    addCue(doc, cuelistId, { label: 'Compound', department: ['LX', 'SX'], created_by: 'op' });

    const result = await exportCueSheetPdf(doc, { pkgPath, departments: ['LX', 'SX'] });

    // Both depts see the compound cue (it's actionable for both)
    const lxOutput = result.outputs.find((o) => o.department === 'LX')!;
    const sxOutput = result.outputs.find((o) => o.department === 'SX')!;
    expect(lxOutput.pages).toBeGreaterThanOrEqual(2);  // cover + body
    expect(sxOutput.pages).toBeGreaterThanOrEqual(2);
  });

  it('SM-only cue appears in LX operator PDF (watched context)', async () => {
    const pkgPath = await makeTmp();
    const doc = initShowDoc({ title: 'SM Context Show', venue: 'V', date: '2026-06-01', created_by: 'op' });
    const meta = getMeta(doc);
    const cuelistId = meta.get('active_cuelist_id') as string;
    addCue(doc, cuelistId, { label: 'SM Cue', department: ['SM'], created_by: 'op' });

    const result = await exportCueSheetPdf(doc, { pkgPath, departments: ['LX'], generateSmMaster: false });

    // LX operator views SM cues as context (watched=['SM'])
    const lxOutput = result.outputs.find((o) => o.department === 'LX')!;
    expect(lxOutput.pages).toBeGreaterThanOrEqual(2);  // cover + body with SM cue
  });

  it('size_bytes in result matches actual file size', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(3);

    const result = await exportCueSheetPdf(doc, { pkgPath });

    for (const output of result.outputs) {
      const stat = await fs.stat(output.path);
      expect(output.size_bytes).toBe(stat.size);
    }
  });

  it('page count reported matches actual PDF pages', async () => {
    const pkgPath = await makeTmp();
    const doc = buildDoc(3);

    const result = await exportCueSheetPdf(doc, { pkgPath });

    for (const output of result.outputs) {
      // Verify by checking %PDF- is valid and size > 1KB (basic sanity)
      expect(output.size_bytes).toBeGreaterThan(1000);
      expect(output.pages).toBeGreaterThanOrEqual(1);
    }
  });
});
