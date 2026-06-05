import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  initShowDoc,
  getMeta,
  getCuelists,
  getCuelist,
  getCues,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import {
  makeCueMap,
  addCue,
  setCueLabel,
  setCueDescription,
  setCueDepartments,
  setCueTrigger,
  setCueStandbyNote,
  setCueNotes,
} from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { ValidationError } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { InvariantError } from '../../../../../src/modules/cuelist-core/src/cue/invariants.js';

function makeDocWithCuelist() {
  const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

/** Integrate a standalone Y.Map into a temp doc so .get() works on the result. */
function integrate<T extends Y.Map<unknown>>(m: T): T {
  const doc = new Y.Doc();
  doc.transact(() => { doc.getArray<Y.Map<unknown>>('_t').push([m]); });
  return m;
}

describe('makeCueMap', () => {
  it('throws ValidationError when department is empty', () => {
    expect(() => makeCueMap({ label: 'Q1', department: [], created_by: 'op1' })).toThrow(
      ValidationError,
    );
  });

  it('creates cue with all required fields', () => {
    // Integrate into a doc so Y.Map.get() reads from _map (not prelim)
    const m = integrate(makeCueMap({ label: 'Q1', department: ['LX'], created_by: 'op1' }));
    expect(m.get('label')).toBe('Q1');
    expect(m.get('department')).toEqual(['LX']);
    expect(m.get('trigger')).toEqual({ kind: 'manual' });
    expect(m.get('payloads')).toBeInstanceOf(Y.Array);
    expect(m.get('notes')).toBe('');
    expect(m.get('created_by')).toBe('op1');
  });

  it('auto-generates UUIDv7 id', () => {
    const m = integrate(makeCueMap({ label: 'Q1', department: ['LX'], created_by: 'op1' }));
    expect(typeof m.get('id')).toBe('string');
    expect((m.get('id') as string).length).toBe(36);
  });
});

describe('setCueLabel', () => {
  it('updates label and touches modified_at + modified_by', async () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id)!;
    const prevModifiedAt = cue.get('modified_at') as string;

    // Ensure at least 1ms passes so timestamps differ
    await new Promise((r) => setTimeout(r, 2));
    setCueLabel(doc, cuelistId, id, 'Q1 renamed', 'op2');
    expect(cue.get('label')).toBe('Q1 renamed');
    expect(cue.get('modified_by')).toBe('op2');
    expect(cue.get('modified_at') as string).not.toBe(prevModifiedAt);
  });
});

describe('setCueDepartments', () => {
  it('rejects empty department array with ValidationError', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    expect(() => setCueDepartments(doc, cuelistId, id, [], 'op1')).toThrow(ValidationError);
  });

  it('accepts valid department list', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    setCueDepartments(doc, cuelistId, id, ['LX', 'SX'], 'op1');
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('department')).toEqual(['LX', 'SX']);
  });

  it('rejects duplicate departments via invariant wiring (regression: wires assertCueInvariants)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    expect(() => setCueDepartments(doc, cuelistId, id, ['LX', 'LX'], 'op1')).toThrow(InvariantError);
  });
});

describe('setCueTrigger', () => {
  it('accepts auto_continue trigger with delay_ms', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    setCueTrigger(doc, cuelistId, id, { kind: 'auto_continue', delay_ms: 500 }, 'op1');
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('trigger')).toEqual({ kind: 'auto_continue', delay_ms: 500 });
  });

  it('accepts auto_follow trigger with prev_cue_id', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id1 = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const id2 = addCue(doc, cuelistId, { label: 'Q2', department: ['LX'], created_by: 'op1' });
    setCueTrigger(doc, cuelistId, id2, { kind: 'auto_follow', prev_cue_id: id1 }, 'op1');
    const cuelist = getCuelist(doc, cuelistId)!;
    const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id2)!;
    expect(cue.get('trigger')).toEqual({ kind: 'auto_follow', prev_cue_id: id1 });
  });
});

describe('setCueDescription / setCueStandbyNote / setCueNotes', () => {
  it('setCueDescription updates field', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    setCueDescription(doc, cuelistId, id, 'House to half', 'op1');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('description')).toBe('House to half');
  });

  it('setCueStandbyNote updates field', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    setCueStandbyNote(doc, cuelistId, id, 'Standby LX 11', 'op1');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('standby_note')).toBe('Standby LX 11');
  });

  it('setCueNotes updates field', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    setCueNotes(doc, cuelistId, id, 'Long note about Q1', 'op1');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('notes')).toBe('Long note about Q1');
  });
});
