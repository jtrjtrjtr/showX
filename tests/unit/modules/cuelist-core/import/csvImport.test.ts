import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import * as Y from 'yjs';
import { importCsv, parseCsvWithHeader } from '../../../../../src/modules/cuelist-core/src/import/csvImport.js';
import {
  initShowDoc,
  getMeta,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import {
  getCuelist,
  getCues,
  getCuesSorted,
} from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import type { Cue, Payload } from 'showx-shared';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { qlabToCues, eosToCues, genericToCues } from '../../../../../src/modules/cuelist-core/src/import/csvHeuristics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../../../fixtures/csv');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

function makeDocWithCuelist() {
  const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

function getCuesSortedJson(doc: Y.Doc, cuelistId: string): Cue[] {
  const cl = getCuelist(doc, cuelistId)!;
  return getCuesSorted(cl).map((m) => m.toJSON() as Cue);
}

// ── CSV parser ────────────────────────────────────────────────────────────────

describe('parseCsvWithHeader', () => {
  it('handles quoted fields containing commas', () => {
    const csv = 'A,B,C\n1,"hello, world",3\n';
    const result = parseCsvWithHeader(csv);
    expect(result).toHaveLength(1);
    expect(result[0]['B']).toBe('hello, world');
  });

  it('handles empty cells', () => {
    const csv = 'A,B,C\n1,,3\n';
    const result = parseCsvWithHeader(csv);
    expect(result[0]['B']).toBe('');
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCsvWithHeader('A,B,C\n')).toHaveLength(0);
  });
});

// ── QLab fixture import ────────────────────────────────────────────────────────

describe('importCsv — QLab', () => {
  it('imports 3 cues from minimal QLab fixture (test 5)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('qlab_export_minimal.csv');
    const result = await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    expect(result.dialect).toBe('qlab');
    expect(result.added).toBe(3);
    expect(result.skipped).toBe(0);
  });

  it('infers Audio → SX department, Video → VIDEO department (test 5)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('qlab_export_minimal.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    const cues = getCuesSortedJson(doc, cuelistId);
    expect(cues[0].department).toContain('SX');  // Q1 Audio
    expect(cues[1].department).toContain('SX');  // Q2 Audio
    expect(cues[2].department).toContain('VIDEO'); // Q3 Video
  });

  it('sets auto_continue trigger when pre-wait > 0 (test 13)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('qlab_export_minimal.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    const cues = getCuesSortedJson(doc, cuelistId);
    // Q2 has Pre-wait=0.5 → auto_continue with delay_ms=500
    expect(cues[1].trigger.kind).toBe('auto_continue');
    expect((cues[1].trigger as { kind: 'auto_continue'; delay_ms: number }).delay_ms).toBe(500);
  });

  it('sets auto_continue trigger when Continue=Auto-continue (test 14)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    // Q2 in fixture has Continue=Auto-continue + Pre-wait=0.5 → auto_continue
    const csv = loadFixture('qlab_export_minimal.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    const cues = getCuesSortedJson(doc, cuelistId);
    expect(cues[1].trigger.kind).toBe('auto_continue');
  });

  it('appends to existing cues (does not clear by default)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    addCue(doc, cuelistId, { label: 'PRE', description: '', department: ['SM'], created_by: 'op1' });
    const csv = loadFixture('qlab_export_minimal.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    const cues = getCuesSortedJson(doc, cuelistId);
    expect(cues).toHaveLength(4); // 1 existing + 3 imported
  });
});

// ── Eos fixture import ────────────────────────────────────────────────────────

describe('importCsv — Eos', () => {
  it('imports 3 cues with lx_ref payloads (test 6)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('eos_export_minimal.csv');
    const result = await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    expect(result.dialect).toBe('eos');
    expect(result.added).toBe(3);
  });

  it('each cue has exactly 1 lx_ref payload', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('eos_export_minimal.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    const cues = getCuesSortedJson(doc, cuelistId);
    for (const cue of cues) {
      expect(cue.payloads).toHaveLength(1);
      expect(cue.payloads[0].type).toBe('lx_ref');
    }
  });

  it('accepts fractional cue numbers (test 17)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('eos_export_minimal.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    const cues = getCuesSortedJson(doc, cuelistId);
    const payload = cues[1].payloads[0] as Payload & { cue_number: number };
    expect(payload.cue_number).toBe(1.5);
  });

  it('sets auto_continue when FollowTime > 0 (test 15)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('eos_export_minimal.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    const cues = getCuesSortedJson(doc, cuelistId);
    // cue 1.5 (House out) has FollowTime=2
    expect(cues[1].trigger.kind).toBe('auto_continue');
    expect((cues[1].trigger as { kind: 'auto_continue'; delay_ms: number }).delay_ms).toBe(2000);
  });

  it('skips malformed Eos row with non-numeric Cue (test 9)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = 'Cue,Label,FollowTime,Notes\nX,Bad cue,0,\n1,Good cue,0,\n';
    const result = await importCsv(doc, cuelistId, csv, { createdBy: 'op1', dialect: 'eos' });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toMatch(/Invalid Eos cue number/);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('uses defaultLxDevice option', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = 'Cue,Label,FollowTime,Notes\n1,Test,0,\n';
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1', dialect: 'eos', defaultLxDevice: 'dev_custom' });
    const cues = getCuesSortedJson(doc, cuelistId);
    const pl = cues[0].payloads[0] as Payload & { device_id: string };
    expect(pl.device_id).toBe('dev_custom');
  });
});

// ── Generic fixture import ────────────────────────────────────────────────────

describe('importCsv — Generic', () => {
  it('imports generic fixture (test 7)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('generic_cuelist.csv');
    const result = await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    expect(result.dialect).toBe('generic');
    expect(result.added).toBe(3);
  });

  it('Q3 with Department="LX,VIDEO" creates compound cue with 2 departments (test 8)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('generic_cuelist.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    const cues = getCuesSortedJson(doc, cuelistId);
    const q3 = cues.find((c) => c.label === 'Q3')!;
    expect(q3).toBeDefined();
    expect(q3.department).toContain('LX');
    expect(q3.department).toContain('VIDEO');
  });

  it('Q3 has lx_ref + osc payloads', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('generic_cuelist.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    const cues = getCuesSortedJson(doc, cuelistId);
    const q3 = cues.find((c) => c.label === 'Q3')!;
    const types = q3.payloads.map((p) => p.type);
    expect(types).toContain('lx_ref');
    expect(types).toContain('osc');
  });

  it('empty cells handled with defaults (test 10)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = 'Q#,Label,Department,LX-cue,OSC-address,Standby\nQ1,,LX,,,\n';
    const result = await importCsv(doc, cuelistId, csv, { createdBy: 'op1' });
    expect(result.added).toBe(1);
    expect(result.warnings).toHaveLength(0);
    const cues = getCuesSortedJson(doc, cuelistId);
    expect(cues[0].label).toBe('Q1');
    expect(cues[0].description).toBe('');
    expect(cues[0].payloads).toHaveLength(0);
  });
});

// ── mergeDuplicates ───────────────────────────────────────────────────────────

describe('importCsv — mergeDuplicates', () => {
  it('merges 2 rows with same Q# into 1 compound cue (test 11)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('qlab_export_compound.csv');
    const result = await importCsv(doc, cuelistId, csv, {
      createdBy: 'op1',
      mergeDuplicates: true,
    });
    expect(result.added).toBe(1);
    const cues = getCuesSortedJson(doc, cuelistId);
    expect(cues).toHaveLength(1);
    // Should have both SX (audio) and VIDEO departments merged
    expect(cues[0].department).toContain('SX');
    expect(cues[0].department).toContain('VIDEO');
  });

  it('without mergeDuplicates, 2 rows with same Q# create 2 separate cues', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const csv = loadFixture('qlab_export_compound.csv');
    const result = await importCsv(doc, cuelistId, csv, {
      createdBy: 'op1',
      mergeDuplicates: false,
    });
    expect(result.added).toBe(2);
    const cues = getCuesSortedJson(doc, cuelistId);
    expect(cues).toHaveLength(2);
  });
});

// ── clearFirst ───────────────────────────────────────────────────────────────

describe('importCsv — clearFirst', () => {
  it('removes existing cues before import when clearFirst=true (test 12)', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    // Pre-populate with 2 cues
    addCue(doc, cuelistId, { label: 'OLD1', description: '', department: ['SM'], created_by: 'op1' });
    addCue(doc, cuelistId, { label: 'OLD2', description: '', department: ['SM'], created_by: 'op1' });
    expect(getCuesSortedJson(doc, cuelistId)).toHaveLength(2);

    const csv = loadFixture('eos_export_minimal.csv');
    await importCsv(doc, cuelistId, csv, { createdBy: 'op1', clearFirst: true });
    const cues = getCuesSortedJson(doc, cuelistId);
    expect(cues).toHaveLength(3);
    expect(cues.every((c) => c.label !== 'OLD1' && c.label !== 'OLD2')).toBe(true);
  });
});
