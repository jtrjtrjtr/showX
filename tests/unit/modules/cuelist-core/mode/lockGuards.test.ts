import { describe, it, expect } from 'vitest';
import { initShowDoc } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { setMode } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCuelist } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import { addCue, setCueLabel } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import {
  isLockedForEdit,
  assertEditAllowed,
  LockedError,
} from '../../../../../src/modules/cuelist-core/src/mode/lockGuards.js';

function makeDoc() {
  return initShowDoc({ title: 'Lock Test', venue: null, date: null, created_by: 'op1' });
}

describe('isLockedForEdit', () => {
  it('payload: false in REHEARSAL', () => {
    const doc = makeDoc();
    expect(isLockedForEdit(doc, 'payload')).toBe(false);
  });

  it('payload: true in SHOW', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(isLockedForEdit(doc, 'payload')).toBe(true);
  });

  it('structure: false in REHEARSAL', () => {
    const doc = makeDoc();
    expect(isLockedForEdit(doc, 'structure')).toBe(false);
  });

  it('structure: true in SHOW', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(isLockedForEdit(doc, 'structure')).toBe(true);
  });

  it('meta: false in REHEARSAL', () => {
    const doc = makeDoc();
    expect(isLockedForEdit(doc, 'meta')).toBe(false);
  });

  it('meta: false in SHOW (Q7 — LWW meta allowed)', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(isLockedForEdit(doc, 'meta')).toBe(false);
  });
});

describe('assertEditAllowed', () => {
  it('payload: no-op in REHEARSAL', () => {
    const doc = makeDoc();
    expect(() => assertEditAllowed(doc, 'payload')).not.toThrow();
  });

  it('payload: throws LockedError in SHOW', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(() => assertEditAllowed(doc, 'payload')).toThrow(LockedError);
  });

  it('structure: no-op in REHEARSAL', () => {
    const doc = makeDoc();
    expect(() => assertEditAllowed(doc, 'structure')).not.toThrow();
  });

  it('structure: throws LockedError in SHOW', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(() => assertEditAllowed(doc, 'structure')).toThrow(LockedError);
  });

  it('meta: no-op in REHEARSAL', () => {
    const doc = makeDoc();
    expect(() => assertEditAllowed(doc, 'meta')).not.toThrow();
  });

  it('meta: no-op in SHOW', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(() => assertEditAllowed(doc, 'meta')).not.toThrow();
  });
});

describe('LockedError', () => {
  it('.kind is queryable', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    try {
      assertEditAllowed(doc, 'payload');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LockedError);
      expect((e as LockedError).kind).toBe('payload');
    }
  });

  it('.mode is queryable and equals "show"', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    try {
      assertEditAllowed(doc, 'structure');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LockedError);
      expect((e as LockedError).mode).toBe('show');
    }
  });

  it('.name is "LockedError"', () => {
    const err = new LockedError('payload', 'show');
    expect(err.name).toBe('LockedError');
  });
});

describe('B003-002 mutators wired', () => {
  it('addCue throws LockedError in SHOW mode', () => {
    const doc = makeDoc();
    const cuelistId = doc.getMap('meta').get('active_cuelist_id') as string;
    setMode(doc, 'show');
    expect(() =>
      addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' }),
    ).toThrow(LockedError);
  });

  it('setCueLabel does NOT throw in SHOW mode (meta allowed per Q7)', () => {
    const doc = makeDoc();
    const cuelistId = doc.getMap('meta').get('active_cuelist_id') as string;
    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    setMode(doc, 'show');
    expect(() => setCueLabel(doc, cuelistId, cueId, 'Q1-renamed', 'op1')).not.toThrow();
  });
});
