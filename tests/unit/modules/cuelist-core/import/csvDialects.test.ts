import { describe, it, expect } from 'vitest';
import { detectDialect } from '../../../../../src/modules/cuelist-core/src/import/csvDialects.js';

describe('detectDialect', () => {
  it('detects QLab when pre-wait + number columns present (test 1)', () => {
    const records = [{ Number: 'Q1', Name: 'Test', Type: 'Audio', 'Pre-wait': '0', Continue: '' }];
    expect(detectDialect(records)).toBe('qlab');
  });

  it('detects QLab when pre-wait + Q# columns present (test 2)', () => {
    const records = [{ 'Q#': 'Q1', Name: 'Test', Type: 'Audio', 'Pre-wait': '0.5', Continue: '' }];
    expect(detectDialect(records)).toBe('qlab');
  });

  it('detects Eos when cue + label columns present (test 3)', () => {
    const records = [{ Cue: '1', Label: 'House half', FollowTime: '0', Notes: '' }];
    expect(detectDialect(records)).toBe('eos');
  });

  it('detects Eos when cue + linkcue columns present', () => {
    const records = [{ Cue: '1', LinkCue: '2', Label: '' }];
    expect(detectDialect(records)).toBe('eos');
  });

  it('returns generic for unrecognised columns (test 4)', () => {
    const records = [{ 'Q#': 'Q1', Label: 'Test', Department: 'LX' }];
    expect(detectDialect(records)).toBe('generic');
  });

  it('returns generic for empty records (test 5)', () => {
    expect(detectDialect([])).toBe('generic');
  });

  it('prefers qlab over eos when pre-wait is present alongside cue column', () => {
    // Edge case: sheet has both "Cue" and "Pre-wait" + "Number" — QLab wins
    const records = [{ Number: 'Q1', Cue: '1', 'Pre-wait': '0', Label: '' }];
    expect(detectDialect(records)).toBe('qlab');
  });
});
