import { describe, it, expect } from 'vitest';
import type { Cue } from 'showx-shared';
import { assertCueInvariants, InvariantError } from '../../../../../src/modules/cuelist-core/src/cue/invariants.js';

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'cue-1',
    label: 'Q1',
    description: '',
    department: ['LX'],
    standby_note: '',
    script_line_ref: null,
    trigger: { kind: 'manual' },
    payloads: [],
    duration_hint_ms: null,
    notes: '',
    payload_frozen_at: null,
    created_at: new Date().toISOString(),
    created_by: 'op1',
    modified_at: new Date().toISOString(),
    modified_by: 'op1',
    ...overrides,
  };
}

function makeOscPayload(id: string, tag: string | null = null) {
  return {
    id,
    type: 'osc' as const,
    tag,
    note: '',
    device_id: 'qlab',
    address: '/cue/1/start',
    args: [],
  };
}

describe('assertCueInvariants', () => {
  it('passes for a valid single-dept cue with no payloads (test 20 baseline)', () => {
    expect(() => assertCueInvariants(makeCue())).not.toThrow();
  });

  it('rejects empty department (test 20)', () => {
    const cue = makeCue({ department: [] });
    expect(() => assertCueInvariants(cue)).toThrow(InvariantError);
    expect(() => assertCueInvariants(cue)).toThrow('department');
  });

  it('rejects duplicate departments (test 21)', () => {
    const cue = makeCue({ department: ['LX', 'SX', 'LX'] });
    expect(() => assertCueInvariants(cue)).toThrow(InvariantError);
    expect(() => assertCueInvariants(cue)).toThrow('duplicates');
  });

  it('rejects duplicate payload ids (test 22)', () => {
    const cue = makeCue({
      department: ['LX'],
      payloads: [
        makeOscPayload('pid-1'),
        makeOscPayload('pid-1'), // duplicate
      ],
    });
    expect(() => assertCueInvariants(cue)).toThrow(InvariantError);
    expect(() => assertCueInvariants(cue)).toThrow('pid-1');
  });

  it('rejects unknown payload.type (test 23)', () => {
    const cue = makeCue({
      payloads: [{ ...makeOscPayload('pid-1'), type: 'alien_blaster' as any }],
    });
    expect(() => assertCueInvariants(cue)).toThrow(InvariantError);
    expect(() => assertCueInvariants(cue)).toThrow('alien_blaster');
  });

  it('accepts forward-compat unknown_* payload type (test 24)', () => {
    const cue = makeCue({
      payloads: [{ ...makeOscPayload('pid-1'), type: 'unknown_audio_play' as any }],
    });
    expect(() => assertCueInvariants(cue)).not.toThrow();
  });

  it('passes for a valid compound cue with tagged payloads', () => {
    const cue = makeCue({
      department: ['LX', 'SX'],
      payloads: [
        makeOscPayload('pid-1', 'SX'),
        { id: 'pid-2', type: 'lx_ref' as const, tag: 'LX', note: '', device_id: 'eos', cue_list: 1, cue_number: 1 },
      ],
    });
    expect(() => assertCueInvariants(cue)).not.toThrow();
  });
});
