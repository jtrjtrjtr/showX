import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import {
  initShowDoc,
  getMeta,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { addPayload, getPayloads } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { getCuelist, getCues, getCuesSorted } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import {
  makeCompoundCue,
  isCompound,
  splitCompoundCue,
  mergeCues,
} from '../../../../../src/modules/cuelist-core/src/cue/compoundCue.js';
import { visibleCues, isActionable } from '../../../../../src/modules/cuelist-core/src/views/departmentFilter.js';
import { highlightedPayloads, dimmedPayloads } from '../../../../../src/modules/cuelist-core/src/views/highlights.js';

function makeDocWithCuelist() {
  const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

function getCueJson(doc: Y.Doc, cuelistId: string, cueId: string): Cue {
  const cuelist = getCuelist(doc, cuelistId)!;
  const m = getCues(cuelist).toArray().find((c) => c.get('id') === cueId);
  if (!m) throw new Error(`cue ${cueId} not found`);
  return m.toJSON() as Cue;
}

function getAllCuesSorted(doc: Y.Doc, cuelistId: string): Cue[] {
  const cuelist = getCuelist(doc, cuelistId)!;
  return getCuesSorted(cuelist).map((m) => m.toJSON() as Cue);
}

function oscPayload(tag: string | null, address = '/cue/1/start') {
  return { type: 'osc' as const, tag, note: '', device_id: 'qlab', address, args: [] };
}

function lxRefPayload(tag: string | null) {
  return { type: 'lx_ref' as const, tag, note: '', device_id: 'eos', cue_list: 1, cue_number: 1 };
}

// ── makeCompoundCue + isCompound ──────────────────────────────────────────────

describe('makeCompoundCue', () => {
  it('throws when departments.length < 2 (test 1)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    expect(() =>
      makeCompoundCue(doc, cuelistId, {
        label: 'Q1',
        departments: ['LX'],
        payloads: [],
        created_by: 'op1',
      }),
    ).toThrow('≥ 2 departments');
  });

  it('creates cue with 3 payloads tagged for different depts (test 2)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = makeCompoundCue(doc, cuelistId, {
      label: 'Door slam',
      departments: ['LX', 'SX', 'VIDEO'],
      payloads: [
        { ...oscPayload('LX'), for_department: 'LX' },
        { ...oscPayload('SX', '/cue/2/start'), for_department: 'SX' },
        { ...oscPayload('VIDEO', '/cue/3/start'), for_department: 'VIDEO' },
      ],
      created_by: 'op1',
    });
    const cue = getCueJson(doc, cuelistId, cueId);
    expect(cue.department).toEqual(['LX', 'SX', 'VIDEO']);
    expect(cue.payloads).toHaveLength(3);
    expect(cue.payloads[0].tag).toBe('LX');
    expect(cue.payloads[1].tag).toBe('SX');
    expect(cue.payloads[2].tag).toBe('VIDEO');
  });

  it('isCompound returns true for dept.length ≥ 2 (test 3)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id2 = makeCompoundCue(doc, cuelistId, {
      label: 'C2',
      departments: ['LX', 'SX'],
      payloads: [],
      created_by: 'op1',
    });
    const id3 = makeCompoundCue(doc, cuelistId, {
      label: 'C3',
      departments: ['LX', 'SX', 'VIDEO'],
      payloads: [],
      created_by: 'op1',
    });
    const single = addCue(doc, cuelistId, {
      label: 'S1', department: ['LX'], created_by: 'op1',
    });
    expect(isCompound(getCueJson(doc, cuelistId, id2))).toBe(true);
    expect(isCompound(getCueJson(doc, cuelistId, id3))).toBe(true);
    expect(isCompound(getCueJson(doc, cuelistId, single))).toBe(false);
  });
});

// ── splitCompoundCue ──────────────────────────────────────────────────────────

describe('splitCompoundCue', () => {
  it('produces 2 cues each with 1 dept, payloads by tag (test 4)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = makeCompoundCue(doc, cuelistId, {
      label: 'Door slam',
      departments: ['LX', 'SX'],
      payloads: [
        { ...oscPayload('SX'), for_department: 'SX' },
        { ...lxRefPayload('LX'), for_department: 'LX' },
      ],
      created_by: 'op1',
    });

    const newIds = splitCompoundCue(doc, cuelistId, cueId, [['LX'], ['SX']]);
    expect(newIds).toHaveLength(2);

    const lxCue = getCueJson(doc, cuelistId, newIds[0]);
    const sxCue = getCueJson(doc, cuelistId, newIds[1]);

    expect(lxCue.department).toEqual(['LX']);
    expect(sxCue.department).toEqual(['SX']);

    expect(lxCue.payloads).toHaveLength(1);
    expect(lxCue.payloads[0].type).toBe('lx_ref');

    expect(sxCue.payloads).toHaveLength(1);
    expect(sxCue.payloads[0].type).toBe('osc');
  });

  it('preserves cuelist order — new cues sorted at original position (test 5)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const before = addCue(doc, cuelistId, { label: 'Before', department: ['SM'], created_by: 'op1' });
    const cueId = makeCompoundCue(doc, cuelistId, {
      label: 'Middle',
      departments: ['LX', 'SX'],
      payloads: [oscPayload('LX'), oscPayload('SX')],
      created_by: 'op1',
    });
    const after = addCue(doc, cuelistId, { label: 'After', department: ['SM'], created_by: 'op1' });

    const newIds = splitCompoundCue(doc, cuelistId, cueId, [['LX'], ['SX']]);
    const sorted = getAllCuesSorted(doc, cuelistId);
    const labels = sorted.map((c) => c.label);

    // Before and After sandwich the two new cues
    expect(labels[0]).toBe('Before');
    expect(labels[labels.length - 1]).toBe('After');
    // Both new cues appear between Before and After
    expect(labels.includes('Middle (LX)')).toBe(true);
    expect(labels.includes('Middle (SX)')).toBe(true);
    const lxIdx = labels.indexOf('Middle (LX)');
    const sxIdx = labels.indexOf('Middle (SX)');
    const beforeIdx = labels.indexOf('Before');
    const afterIdx = labels.indexOf('After');
    expect(lxIdx).toBeGreaterThan(beforeIdx);
    expect(sxIdx).toBeGreaterThan(beforeIdx);
    expect(lxIdx).toBeLessThan(afterIdx);
    expect(sxIdx).toBeLessThan(afterIdx);
  });

  it('removes the original cue (test 6)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = makeCompoundCue(doc, cuelistId, {
      label: 'Remove me',
      departments: ['LX', 'SX'],
      payloads: [],
      created_by: 'op1',
    });

    splitCompoundCue(doc, cuelistId, cueId, [['LX'], ['SX']]);
    const cuelist = getCuelist(doc, cuelistId)!;
    const remaining = getCues(cuelist).toArray().map((m) => m.get('id'));
    expect(remaining).not.toContain(cueId);
  });
});

// ── mergeCues ─────────────────────────────────────────────────────────────────

describe('mergeCues', () => {
  it('merges 2 single-dept cues into compound with 2 depts (test 7)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const lxId = addCue(doc, cuelistId, { label: 'LX cue', department: ['LX'], created_by: 'op1' });
    const sxId = addCue(doc, cuelistId, { label: 'SX cue', department: ['SX'], created_by: 'op1' });

    const mergedId = mergeCues(doc, cuelistId, [lxId, sxId]);
    const merged = getCueJson(doc, cuelistId, mergedId);
    expect(merged.department).toContain('LX');
    expect(merged.department).toContain('SX');
    expect(merged.department).toHaveLength(2);
  });

  it('label is concatenation A + B (test 8)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const aId = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    const bId = addCue(doc, cuelistId, { label: 'B', department: ['SX'], created_by: 'op1' });
    const mergedId = mergeCues(doc, cuelistId, [aId, bId]);
    expect(getCueJson(doc, cuelistId, mergedId).label).toBe('A + B');
  });

  it('payloads are concatenated in cue order (test 9)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const aId = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    addPayload(doc, cuelistId, aId, lxRefPayload('LX'));
    const bId = addCue(doc, cuelistId, { label: 'B', department: ['SX'], created_by: 'op1' });
    addPayload(doc, cuelistId, bId, oscPayload('SX'));

    const mergedId = mergeCues(doc, cuelistId, [aId, bId]);
    const merged = getCueJson(doc, cuelistId, mergedId);
    expect(merged.payloads).toHaveLength(2);
    expect(merged.payloads[0].type).toBe('lx_ref');
    expect(merged.payloads[1].type).toBe('osc');
  });

  it('merged cue placed at min sort_key position (test 10)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const c1 = addCue(doc, cuelistId, { label: 'C1', department: ['LX'], created_by: 'op1' });
    const c2 = addCue(doc, cuelistId, { label: 'C2', department: ['SX'], created_by: 'op1' });
    const c3 = addCue(doc, cuelistId, { label: 'C3', department: ['VIDEO'], created_by: 'op1' });

    const cuelist = getCuelist(doc, cuelistId)!;
    const skBefore = getCuesSorted(cuelist)
      .find((m) => m.get('id') === c1)!
      .get('sort_key') as number;

    const mergedId = mergeCues(doc, cuelistId, [c1, c2]);
    const mergedSk = getCuesSorted(cuelist)
      .find((m) => m.get('id') === mergedId)!
      .get('sort_key') as number;

    // Merged cue inherits sort_key of the first (lowest-sort_key) original.
    expect(mergedSk).toBe(skBefore);

    // C3 still present and sorted after merged cue
    const sorted = getAllCuesSorted(doc, cuelistId);
    const mergedPos = sorted.findIndex((c) => c.id === mergedId);
    const c3Pos = sorted.findIndex((c) => c.id === c3);
    expect(c3Pos).toBeGreaterThan(mergedPos);
  });

  it('round-trip: merge then split → same dept structure, payload ids regenerated (test 11)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const lxId = addCue(doc, cuelistId, { label: 'LX', department: ['LX'], created_by: 'op1' });
    const lxPayloadId = addPayload(doc, cuelistId, lxId, lxRefPayload('LX'));
    const sxId = addCue(doc, cuelistId, { label: 'SX', department: ['SX'], created_by: 'op1' });
    const sxPayloadId = addPayload(doc, cuelistId, sxId, oscPayload('SX'));

    const mergedId = mergeCues(doc, cuelistId, [lxId, sxId]);
    const splitIds = splitCompoundCue(doc, cuelistId, mergedId, [['LX'], ['SX']]);

    expect(splitIds).toHaveLength(2);
    const lxSplit = getCueJson(doc, cuelistId, splitIds[0]);
    const sxSplit = getCueJson(doc, cuelistId, splitIds[1]);

    expect(lxSplit.department).toEqual(['LX']);
    expect(sxSplit.department).toEqual(['SX']);
    expect(lxSplit.payloads).toHaveLength(1);
    expect(sxSplit.payloads).toHaveLength(1);
    expect(lxSplit.payloads[0].type).toBe('lx_ref');
    expect(sxSplit.payloads[0].type).toBe('osc');
    // payload ids regenerated (not same as original)
    expect(lxSplit.payloads[0].id).not.toBe(lxPayloadId);
    expect(sxSplit.payloads[0].id).not.toBe(sxPayloadId);
  });
});

// ── Door slam fixture (data_model.md §4.3) ────────────────────────────────────

describe('Door slam fixture (tests 25-29)', () => {
  function buildDoorSlam() {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = makeCompoundCue(doc, cuelistId, {
      label: 'Door slam',
      departments: ['SX', 'LX'],
      payloads: [
        { ...oscPayload('SX'), for_department: 'SX' },
        { ...lxRefPayload('LX'), for_department: 'LX' },
      ],
      created_by: 'op1',
    });
    return { doc, cuelistId, cueId };
  }

  it('builds door slam cue with dept=[SX, LX] + OSC tagged SX + LXRef tagged LX (test 25)', () => {
    const { doc, cuelistId, cueId } = buildDoorSlam();
    const cue = getCueJson(doc, cuelistId, cueId);
    expect(cue.department).toEqual(['SX', 'LX']);
    expect(cue.payloads).toHaveLength(2);
    const oscP = cue.payloads.find((p) => p.type === 'osc')!;
    const lxP = cue.payloads.find((p) => p.type === 'lx_ref')!;
    expect(oscP.tag).toBe('SX');
    expect(lxP.tag).toBe('LX');
  });

  it('LX op: cue visible, LXRef highlighted, OSC dimmed (test 26)', () => {
    const { doc, cuelistId, cueId } = buildDoorSlam();
    const cue = getCueJson(doc, cuelistId, cueId);
    const owned = new Set(['LX'] as const);

    const allCues = getAllCuesSorted(doc, cuelistId);
    const visible = visibleCues(allCues, { owned, watched: new Set() });
    expect(visible.map((c) => c.id)).toContain(cueId);
    expect(isActionable(cue, owned)).toBe(true);

    const lxRefP = cue.payloads.find((p) => p.type === 'lx_ref')!;
    const oscP = cue.payloads.find((p) => p.type === 'osc')!;
    const highlighted = highlightedPayloads(cue, owned);
    const dimmed = dimmedPayloads(cue, owned);

    expect(highlighted.has(lxRefP.id)).toBe(true);
    expect(dimmed.has(oscP.id)).toBe(true);
  });

  it('SX op: cue visible, OSC highlighted, LXRef dimmed (test 27)', () => {
    const { doc, cuelistId, cueId } = buildDoorSlam();
    const cue = getCueJson(doc, cuelistId, cueId);
    const owned = new Set(['SX'] as const);

    const allCues = getAllCuesSorted(doc, cuelistId);
    const visible = visibleCues(allCues, { owned, watched: new Set() });
    expect(visible.map((c) => c.id)).toContain(cueId);

    const oscP = cue.payloads.find((p) => p.type === 'osc')!;
    const lxRefP = cue.payloads.find((p) => p.type === 'lx_ref')!;
    const highlighted = highlightedPayloads(cue, owned);
    const dimmed = dimmedPayloads(cue, owned);

    expect(highlighted.has(oscP.id)).toBe(true);
    expect(dimmed.has(lxRefP.id)).toBe(true);
  });

  it('SM (owns SX+LX): cue visible, both payloads highlighted (test 28)', () => {
    const { doc, cuelistId, cueId } = buildDoorSlam();
    const cue = getCueJson(doc, cuelistId, cueId);
    const owned = new Set(['SX', 'LX'] as const);

    const highlighted = highlightedPayloads(cue, owned);
    expect(highlighted.has(cue.payloads[0].id)).toBe(true);
    expect(highlighted.has(cue.payloads[1].id)).toBe(true);
    expect(dimmedPayloads(cue, owned).size).toBe(0);
  });

  it('split into 2 single-dept cues → each op sees only their cue (test 29)', () => {
    const { doc, cuelistId, cueId } = buildDoorSlam();
    const [lxCueId, sxCueId] = splitCompoundCue(doc, cuelistId, cueId, [['LX'], ['SX']]);

    const allCues = getAllCuesSorted(doc, cuelistId);
    const lxOwned = new Set(['LX'] as const);
    const sxOwned = new Set(['SX'] as const);

    const lxVisible = visibleCues(allCues, { owned: lxOwned, watched: new Set() });
    const sxVisible = visibleCues(allCues, { owned: sxOwned, watched: new Set() });

    // LX op sees only LX cue (not SX cue)
    expect(lxVisible.map((c) => c.id)).toContain(lxCueId);
    expect(lxVisible.map((c) => c.id)).not.toContain(sxCueId);

    // SX op sees only SX cue (not LX cue)
    expect(sxVisible.map((c) => c.id)).toContain(sxCueId);
    expect(sxVisible.map((c) => c.id)).not.toContain(lxCueId);
  });
});
