import { describe, it, expect } from 'vitest';
import {
  generateCallerLines,
  generateAllCallerLines,
} from '../../../../../src/modules/cuelist-core/src/caller/generateCallerLines.js';
import type { Cue } from '../../../../../src/shared/src/types/cue.js';

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'cue-1',
    label: 'Opening scene',
    description: '',
    department: ['LX'],
    standby_note: '',
    script_line_ref: null,
    trigger: { kind: 'manual' },
    payloads: [],
    duration_hint_ms: null,
    notes: '',
    payload_frozen_at: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: 'op1',
    modified_at: '2026-01-01T00:00:00Z',
    modified_by: 'op1',
    ...overrides,
  };
}

describe('generateCallerLines — single department', () => {
  it('generates standby text with dept and label', () => {
    const cue = makeCue({ department: ['LX'], label: 'Opening scene', cue_number: undefined });
    const result = generateCallerLines(cue);
    expect(result.standby['LX']).toBe('LX — standby for Opening scene');
  });

  it('includes cue_number before label when both present', () => {
    const cue = makeCue({ department: ['SX'], label: 'Intro music', cue_number: '5' });
    const result = generateCallerLines(cue);
    expect(result.standby['SX']).toBe('SX — standby for 5 Intro music');
  });

  it('uses only cue_number when label is empty', () => {
    const cue = makeCue({ department: ['PYRO'], label: '', cue_number: '10' });
    const result = generateCallerLines(cue);
    expect(result.standby['PYRO']).toBe('PYRO — standby for 10');
  });

  it('uses only label when cue_number is null', () => {
    const cue = makeCue({ department: ['VIDEO'], label: 'Curtain', cue_number: null });
    const result = generateCallerLines(cue);
    expect(result.standby['VIDEO']).toBe('VIDEO — standby for Curtain');
  });

  it('generates GO text for single department', () => {
    const cue = makeCue({ department: ['LX'] });
    const result = generateCallerLines(cue);
    expect(result.go).toBe('LX — GO');
  });
});

describe('generateCallerLines — multiple departments', () => {
  it('generates standby for each department', () => {
    const cue = makeCue({ department: ['LX', 'SX'], label: 'Finale', cue_number: '99' });
    const result = generateCallerLines(cue);
    expect(result.standby['LX']).toBe('LX — standby for 99 Finale');
    expect(result.standby['SX']).toBe('SX — standby for 99 Finale');
  });

  it('GO text joins all departments with comma', () => {
    const cue = makeCue({ department: ['LX', 'PYRO', 'SX'] });
    const result = generateCallerLines(cue);
    expect(result.go).toBe('LX, PYRO, SX — GO');
  });

  it('only lists departments that are present in standby map', () => {
    const cue = makeCue({ department: ['AUTO', 'FS'], label: 'Big finish' });
    const result = generateCallerLines(cue);
    expect(Object.keys(result.standby)).toEqual(['AUTO', 'FS']);
    expect(result.standby['LX']).toBeUndefined();
  });
});

describe('generateCallerLines — empty departments', () => {
  it('returns empty standby and bare GO for empty department array', () => {
    const cue = makeCue({ department: [] });
    const result = generateCallerLines(cue);
    expect(result.standby).toEqual({});
    expect(result.go).toBe('GO');
  });
});

describe('generateCallerLines — cue_number interpolation', () => {
  it('includes cue_number in standby ref when set', () => {
    const cue = makeCue({ cue_number: '1A', label: 'Pyro flash', department: ['PYRO'] });
    const result = generateCallerLines(cue);
    expect(result.standby['PYRO']).toBe('PYRO — standby for 1A Pyro flash');
  });

  it('omits cue_number from ref when undefined', () => {
    const cue = makeCue({ cue_number: undefined, label: 'Sound cue', department: ['SX'] });
    const result = generateCallerLines(cue);
    expect(result.standby['SX']).toBe('SX — standby for Sound cue');
  });
});

describe('generateAllCallerLines', () => {
  it('returns a Map entry per cue', () => {
    const cues: Cue[] = [
      makeCue({ id: 'c1', label: 'Cue 1', department: ['LX'], cue_number: '1' }),
      makeCue({ id: 'c2', label: 'Cue 2', department: ['SX'], cue_number: '2' }),
    ];
    const result = generateAllCallerLines(cues);
    expect(result.size).toBe(2);
    expect(result.get('c1')?.standby['LX']).toBe('LX — standby for 1 Cue 1');
    expect(result.get('c2')?.standby['SX']).toBe('SX — standby for 2 Cue 2');
  });

  it('returns empty Map for empty array', () => {
    expect(generateAllCallerLines([]).size).toBe(0);
  });
});
