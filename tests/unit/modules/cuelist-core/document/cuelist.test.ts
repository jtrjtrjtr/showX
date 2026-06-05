import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  initShowDoc,
  getMeta,
  getCuelists,
  getCuelist,
  getCues,
  getCue,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import {
  addCue,
  insertCueAfter,
  removeCue,
  reorderCues,
} from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import {
  makeCuelistMap,
  addCuelist,
  getCuesSorted,
} from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';

function makeDocWithCuelist() {
  const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

/** Integrate a standalone Y.Map into a temp doc so .get() works. */
function integrate<T extends Y.Map<unknown>>(m: T): T {
  const doc = new Y.Doc();
  doc.transact(() => { doc.getArray<Y.Map<unknown>>('_t').push([m]); });
  return m;
}

describe('makeCuelistMap defaults', () => {
  it('go_authority defaults to sm_called', () => {
    const m = integrate(makeCuelistMap('Act 1'));
    expect(m.get('go_authority')).toBe('sm_called');
  });

  it('sm_offline_policy.kind defaults to freeze', () => {
    const m = integrate(makeCuelistMap('Act 1'));
    expect((m.get('sm_offline_policy') as { kind: string }).kind).toBe('freeze');
  });

  it('cues starts as empty Y.Array', () => {
    const m = integrate(makeCuelistMap('Act 1'));
    expect(m.get('cues')).toBeInstanceOf(Y.Array);
    expect((m.get('cues') as Y.Array<unknown>).length).toBe(0);
  });

  it('default_trigger is manual', () => {
    const m = integrate(makeCuelistMap('Act 1'));
    expect(m.get('default_trigger')).toBe('manual');
  });
});

describe('addCue / insertCueAfter / removeCue / reorderCues', () => {
  it('addCue appends cue to cuelist', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    addCue(doc, cuelistId, { label: 'Q2', department: ['SX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    const cues = getCues(cuelist).toArray();
    expect(cues).toHaveLength(2);
    expect(cues[0].get('label')).toBe('Q1');
    expect(cues[1].get('label')).toBe('Q2');
  });

  it('insertCueAfter(null) prepends cue at index 0', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    insertCueAfter(doc, cuelistId, null, { label: 'Q0', department: ['SX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    // Y.Array preserves physical insertion order; sort_key determines visual order
    const sorted = getCuesSorted(cuelist);
    expect(sorted[0].get('label')).toBe('Q0');
    expect(sorted[1].get('label')).toBe('Q1');
  });

  it('insertCueAfter(id) inserts after the specified cue', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id1 = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    addCue(doc, cuelistId, { label: 'Q3', department: ['LX'], created_by: 'op1' });
    insertCueAfter(doc, cuelistId, id1, { label: 'Q2', department: ['SX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    const labels = getCuesSorted(cuelist).map((c) => c.get('label'));
    expect(labels).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('removeCue removes the cue and preserves remaining order', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id1 = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const id2 = addCue(doc, cuelistId, { label: 'Q2', department: ['SX'], created_by: 'op1' });
    addCue(doc, cuelistId, { label: 'Q3', department: ['LX'], created_by: 'op1' });
    removeCue(doc, cuelistId, id2);
    const cuelist = getCuelist(doc, cuelistId)!;
    const ids = getCues(cuelist).toArray().map((c) => c.get('id'));
    expect(ids).toEqual([id1, expect.any(String)]);
    expect(ids).not.toContain(id2);
    expect(getCues(cuelist).length).toBe(2);
  });

  it('reorderCues produces correct ordering (via getCuesSorted)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id1 = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const id2 = addCue(doc, cuelistId, { label: 'Q2', department: ['SX'], created_by: 'op1' });
    const id3 = addCue(doc, cuelistId, { label: 'Q3', department: ['LX'], created_by: 'op1' });
    reorderCues(doc, cuelistId, [id3, id1, id2]);
    const cuelist = getCuelist(doc, cuelistId)!;
    const labels = getCuesSorted(cuelist).map((c) => c.get('label'));
    expect(labels).toEqual(['Q3', 'Q1', 'Q2']);
  });

  it('addCuelist creates a second cuelist', () => {
    const { doc } = makeDocWithCuelist();
    const newId = addCuelist(doc, 'Act 2');
    expect(getCuelists(doc).length).toBe(2);
    const cuelist2 = getCuelist(doc, newId);
    expect(cuelist2).toBeDefined();
    expect(cuelist2!.get('name')).toBe('Act 2');
  });

  it('getCue finds a cue by id within a cuelist map', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCue(cuelist, id);
    expect(cue).toBeDefined();
    expect(cue!.get('label')).toBe('Q1');
  });
});
