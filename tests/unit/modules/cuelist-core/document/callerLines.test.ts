import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  initShowDoc,
  getMeta,
  getCuelist,
  getCues,
  setMode,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import {
  makeCueMap,
  addCue,
  setCueCallerLines,
  updateCueFields,
} from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import type { CallerLineGroup } from '../../../../../src/shared/src/types/caller.js';

function makeDocWithCuelist() {
  const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

function integrate<T extends Y.Map<unknown>>(m: T): T {
  const doc = new Y.Doc();
  doc.transact(() => { doc.getArray<Y.Map<unknown>>('_t').push([m]); });
  return m;
}

describe('CallerLineGroup type + factory defaults', () => {
  it('makeCueMap sets caller_lines to undefined (lazy null)', () => {
    const m = integrate(makeCueMap({ label: 'Q1', department: ['LX'], created_by: 'op1' }));
    expect(m.get('caller_lines')).toBeUndefined();
  });

  it('Cue.caller_lines coalesces to null when missing from toJSON()', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id)!;
    const json = cue.toJSON();
    expect(json['caller_lines'] ?? null).toBeNull();
  });
});

describe('setCueCallerLines', () => {
  it('sets caller_lines on a cue and touches modified fields', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id)!;
    const prevAt = cue.get('modified_at') as string;

    await new Promise((r) => setTimeout(r, 2));
    const lines: CallerLineGroup = { standby: { LX: 'LX standby' }, go: 'GO' };
    setCueCallerLines(doc, cuelistId, id, lines, 'op2');

    expect(cue.get('caller_lines')).toEqual(lines);
    expect(cue.get('modified_by')).toBe('op2');
    expect(cue.get('modified_at') as string).not.toBe(prevAt);
  });

  it('clears caller_lines by setting null', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id)!;

    setCueCallerLines(doc, cuelistId, id, { standby: { LX: 'LX standby' }, go: 'GO' }, 'op1');
    setCueCallerLines(doc, cuelistId, id, null, 'op1');
    expect(cue.get('caller_lines')).toBeNull();
  });

  it('is allowed in SHOW mode (meta kind = not locked per policy)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    setMode(doc, 'show', 'op1');
    // meta edits are permitted in SHOW mode; UI disables the inputs (disabled prop)
    expect(() =>
      setCueCallerLines(doc, cuelistId, id, { standby: {}, go: 'GO' }, 'op1'),
    ).not.toThrow();
  });
});

describe('CueFieldPatch — caller_lines', () => {
  it('updateCueFields accepts caller_lines patch', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id)!;

    const lines: CallerLineGroup = { standby: { LX: 'LX standby', SX: 'SX standby' }, go: 'And go' };
    updateCueFields(doc, cuelistId, id, { caller_lines: lines }, 'op1');
    expect(cue.get('caller_lines')).toEqual(lines);
  });

  it('updateCueFields clears caller_lines with null', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id)!;

    updateCueFields(doc, cuelistId, id, { caller_lines: { standby: {}, go: 'GO' } }, 'op1');
    updateCueFields(doc, cuelistId, id, { caller_lines: null }, 'op1');
    expect(cue.get('caller_lines')).toBeNull();
  });
});
