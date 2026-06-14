import { describe, it, expect } from 'vitest';
import { aggregateCallerLines } from '../../../../../src/modules/cuelist-core/src/caller/aggregate.js';
import type { Cue } from '../../../../../src/shared/src/types/cue.js';

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'cue-1',
    label: 'Opening',
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

describe('aggregateCallerLines — empty input', () => {
  it('returns empty result for empty array', () => {
    const result = aggregateCallerLines([]);
    expect(result.standby).toEqual({});
    expect(result.go).toBe('GO');
    expect(result.aggregate).toBeNull();
  });
});

describe('aggregateCallerLines — single cue', () => {
  it('delegates to single-cue generation (no aggregate field)', () => {
    const cue = makeCue({ department: ['LX'], label: 'Opening', cue_number: '1' });
    const result = aggregateCallerLines([cue]);
    expect(result.standby['LX']).toBe('LX — standby for 1 Opening');
    expect(result.go).toBe('LX — GO');
    // No aggregate field on single-cue path (matches generateCallerLines output)
    expect(result.aggregate).toBeUndefined();
  });
});

describe('aggregateCallerLines — multiple simultaneous cues', () => {
  it('merges departments from all cues', () => {
    const cues: Cue[] = [
      makeCue({ id: 'c1', department: ['LX'], label: 'Lights', cue_number: '5' }),
      makeCue({ id: 'c2', department: ['PYRO'], label: 'Pyro', cue_number: '5a' }),
    ];
    const result = aggregateCallerLines(cues);
    expect(Object.keys(result.standby).sort()).toEqual(['LX', 'PYRO']);
  });

  it('standby for each dept references all combined departments + cue refs', () => {
    const cues: Cue[] = [
      makeCue({ id: 'c1', department: ['LX'], label: 'Lights', cue_number: '5' }),
      makeCue({ id: 'c2', department: ['SX'], label: 'Sound', cue_number: '6' }),
    ];
    const result = aggregateCallerLines(cues);
    expect(result.standby['LX']).toBe('LX, SX — standby for 5 Lights, 6 Sound');
    expect(result.standby['SX']).toBe('LX, SX — standby for 5 Lights, 6 Sound');
  });

  it('GO call includes all departments', () => {
    const cues: Cue[] = [
      makeCue({ id: 'c1', department: ['LX'], label: 'L' }),
      makeCue({ id: 'c2', department: ['PYRO', 'SX'], label: 'P' }),
    ];
    const result = aggregateCallerLines(cues);
    expect(result.go).toBe('LX, PYRO, SX — GO');
  });

  it('aggregate field is a combined summary string', () => {
    const cues: Cue[] = [
      makeCue({ id: 'c1', department: ['LX'], label: 'Lights', cue_number: '5' }),
      makeCue({ id: 'c2', department: ['PYRO'], label: 'Pyro', cue_number: '5a' }),
    ];
    const result = aggregateCallerLines(cues);
    expect(result.aggregate).toBe('LX, PYRO — standby for 5 Lights, 5a Pyro → GO');
  });

  it('deduplicates departments that appear in multiple cues', () => {
    const cues: Cue[] = [
      makeCue({ id: 'c1', department: ['LX', 'SX'], label: 'A' }),
      makeCue({ id: 'c2', department: ['SX', 'PYRO'], label: 'B' }),
    ];
    const result = aggregateCallerLines(cues);
    // SX appears in both — should only be listed once
    const depts = Object.keys(result.standby);
    const sxCount = depts.filter((d) => d === 'SX').length;
    expect(sxCount).toBe(1);
    expect(depts.sort()).toEqual(['LX', 'PYRO', 'SX']);
  });

  it('handles cues with no departments gracefully', () => {
    const cues: Cue[] = [
      makeCue({ id: 'c1', department: [], label: 'Empty' }),
      makeCue({ id: 'c2', department: ['LX'], label: 'L' }),
    ];
    const result = aggregateCallerLines(cues);
    expect(Object.keys(result.standby)).toEqual(['LX']);
  });
});

describe('aggregateCallerLines — compound cue (multi-dept single cue)', () => {
  it('single cue with multiple departments delegates to generateCallerLines', () => {
    const cue = makeCue({ department: ['LX', 'PYRO', 'SX'], label: 'Big finish', cue_number: '99' });
    const result = aggregateCallerLines([cue]);
    // For a single cue with multiple depts, generateCallerLines handles it
    expect(result.standby['LX']).toBe('LX — standby for 99 Big finish');
    expect(result.standby['PYRO']).toBe('PYRO — standby for 99 Big finish');
    expect(result.standby['SX']).toBe('SX — standby for 99 Big finish');
    expect(result.go).toBe('LX, PYRO, SX — GO');
  });
});
