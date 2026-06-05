import { describe, it, expect } from 'vitest';
import { initShowDoc } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { setMode } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import {
  getMode,
  assertRehearsal,
  assertShow,
} from '../../../../../src/modules/cuelist-core/src/mode/rehearsalState.js';

function makeDoc() {
  return initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
}

describe('getMode', () => {
  it('fresh doc returns rehearsal', () => {
    const doc = makeDoc();
    expect(getMode(doc)).toBe('rehearsal');
  });

  it('returns show after setMode show', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(getMode(doc)).toBe('show');
  });

  it('returns rehearsal after toggling back', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    setMode(doc, 'rehearsal');
    expect(getMode(doc)).toBe('rehearsal');
  });
});

describe('assertRehearsal', () => {
  it('no-op when in REHEARSAL', () => {
    const doc = makeDoc();
    expect(() => assertRehearsal(doc)).not.toThrow();
  });

  it('throws when in SHOW', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(() => assertRehearsal(doc)).toThrow('expected REHEARSAL mode');
  });
});

describe('assertShow', () => {
  it('throws when in REHEARSAL', () => {
    const doc = makeDoc();
    expect(() => assertShow(doc)).toThrow('expected SHOW mode');
  });

  it('no-op when in SHOW', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(() => assertShow(doc)).not.toThrow();
  });
});
