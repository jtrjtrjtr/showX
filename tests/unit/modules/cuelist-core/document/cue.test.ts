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
  updateCueFields,
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

describe('updateCueFields', () => {
  it('updates label, description, and standby_note in one transaction', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', description: 'Old desc', department: ['LX'], created_by: 'op1' });
    updateCueFields(doc, cuelistId, id, { label: 'Q1 new', description: 'New desc', standby_note: 'Standby LX' }, 'op2');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('label')).toBe('Q1 new');
    expect(cue.get('description')).toBe('New desc');
    expect(cue.get('standby_note')).toBe('Standby LX');
    expect(cue.get('modified_by')).toBe('op2');
  });

  it('silently skips undefined patch keys', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', description: 'Keep me', department: ['SM'], created_by: 'op1' });
    updateCueFields(doc, cuelistId, id, { label: 'Q1 renamed' }, 'op1');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('label')).toBe('Q1 renamed');
    expect(cue.get('description')).toBe('Keep me');
  });

  it('throws ValidationError when label is empty string', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    expect(() => updateCueFields(doc, cuelistId, id, { label: '' }, 'op1')).toThrow(ValidationError);
  });

  it('throws ValidationError when label is whitespace-only', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    expect(() => updateCueFields(doc, cuelistId, id, { label: '   ' }, 'op1')).toThrow(ValidationError);
  });

  it('throws on unknown cue id', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    expect(() =>
      updateCueFields(doc, cuelistId, 'no-such-cue', { label: 'X' }, 'op1'),
    ).toThrow(/not found/);
  });

  it('does not modify payloads', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    const payloadsBefore = cue.get('payloads');
    updateCueFields(doc, cuelistId, id, { label: 'Q1 new' }, 'op1');
    expect(cue.get('payloads')).toBe(payloadsBefore);
  });

  it('updates trigger via patch (manual)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1',
      trigger: { kind: 'auto_continue', delay_ms: 500 } });
    updateCueFields(doc, cuelistId, id, { trigger: { kind: 'manual' } }, 'op1');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('trigger')).toEqual({ kind: 'manual' });
  });

  it('updates trigger to auto_continue with delay_ms', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    updateCueFields(doc, cuelistId, id, { trigger: { kind: 'auto_continue', delay_ms: 1500 } }, 'op1');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('trigger')).toEqual({ kind: 'auto_continue', delay_ms: 1500 });
  });

  it('throws ValidationError when auto_continue.delay_ms is negative', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    expect(() =>
      updateCueFields(doc, cuelistId, id, { trigger: { kind: 'auto_continue', delay_ms: -1 } }, 'op1'),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when timecode.time_ms is negative', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    expect(() =>
      updateCueFields(doc, cuelistId, id, { trigger: { kind: 'timecode', time_ms: -100, source: 'internal' } }, 'op1'),
    ).toThrow(ValidationError);
  });

  it('updates trigger to auto_follow when prev_cue_id exists in cuelist', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id1 = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const id2 = addCue(doc, cuelistId, { label: 'Q2', department: ['LX'], created_by: 'op1' });
    updateCueFields(doc, cuelistId, id2, { trigger: { kind: 'auto_follow', prev_cue_id: id1 } }, 'op1');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id2)!;
    expect(cue.get('trigger')).toEqual({ kind: 'auto_follow', prev_cue_id: id1 });
  });

  it('throws ValidationError when auto_follow.prev_cue_id does not exist in cuelist', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    expect(() =>
      updateCueFields(doc, cuelistId, id, { trigger: { kind: 'auto_follow', prev_cue_id: 'ghost-id' } }, 'op1'),
    ).toThrow(ValidationError);
  });

  it('updates duration_hint_ms to a positive value', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    updateCueFields(doc, cuelistId, id, { duration_hint_ms: 5000 }, 'op1');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('duration_hint_ms')).toBe(5000);
  });

  it('updates duration_hint_ms to null (clears it)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    updateCueFields(doc, cuelistId, id, { duration_hint_ms: 3000 }, 'op1');
    updateCueFields(doc, cuelistId, id, { duration_hint_ms: null }, 'op1');
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('duration_hint_ms')).toBeNull();
  });

  it('throws ValidationError when duration_hint_ms is negative', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    expect(() =>
      updateCueFields(doc, cuelistId, id, { duration_hint_ms: -1 }, 'op1'),
    ).toThrow(ValidationError);
  });
});
