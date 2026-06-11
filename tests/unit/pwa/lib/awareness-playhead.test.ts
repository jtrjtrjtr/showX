import { describe, it, expect } from 'vitest';
import {
  getPlayheadAuthorityClientId,
  getPlayheadState,
  isSmPresent,
  type PlayheadAwareness,
  type StationAwareness,
} from '../../../../pwa/src/lib/awareness.js';

type MockAwareness = {
  getStates(): Map<number, Record<string, unknown>>;
  clientID: number;
};

function makeAwareness(
  clientID: number,
  states: [number, Partial<StationAwareness>][] = [],
): MockAwareness {
  const map = new Map<number, Record<string, unknown>>();
  for (const [id, state] of states) {
    map.set(id, state as Record<string, unknown>);
  }
  return {
    clientID,
    getStates: () => map,
  };
}

const baseState = (role?: 'sm' | 'operator'): Partial<StationAwareness> => ({
  operator_id: 'op1',
  station_id: 'st1',
  display_name: 'Test',
  role,
  owned_departments: [],
  watched_departments: [],
  presence_color: '#fff',
  current_view: { cuelist_id: '', focus_cue_id: null },
  cursor: { cue_id: null, field: null },
  last_heartbeat_at: new Date().toISOString(),
});

const samplePlayhead: PlayheadAwareness = {
  cuelist_id: 'cl1',
  cue_id: 'q5',
  armed_cue_id: null,
  updated_at: new Date().toISOString(),
  updated_by: '100',
};

describe('isSmPresent', () => {
  it('returns false when no states', () => {
    const aw = makeAwareness(10, []);
    expect(isSmPresent(aw)).toBe(false);
  });

  it('returns true when a remote state has role=sm', () => {
    const aw = makeAwareness(10, [[100, baseState('sm')]]);
    expect(isSmPresent(aw)).toBe(true);
  });

  it('returns true when the LOCAL state has role=sm (self is SM)', () => {
    const aw = makeAwareness(10, [[10, baseState('sm')]]);
    expect(isSmPresent(aw)).toBe(true);
  });

  it('returns false when all states have role=operator', () => {
    const aw = makeAwareness(10, [
      [100, baseState('operator')],
      [200, baseState('operator')],
    ]);
    expect(isSmPresent(aw)).toBe(false);
  });

  it('returns false after SM state is removed', () => {
    const map = new Map<number, Record<string, unknown>>();
    map.set(100, baseState('sm') as Record<string, unknown>);
    const aw = { clientID: 10, getStates: () => map };
    expect(isSmPresent(aw)).toBe(true);
    map.delete(100);
    expect(isSmPresent(aw)).toBe(false);
  });
});

describe('getPlayheadAuthorityClientId', () => {
  it('returns null when no states', () => {
    const aw = makeAwareness(10, []);
    expect(getPlayheadAuthorityClientId(aw)).toBeNull();
  });

  it('returns SM clientID when SM station is connected', () => {
    const aw = makeAwareness(10, [
      [200, baseState('operator')],
      [100, { ...baseState('sm'), operator_id: 'sm1' }],
    ]);
    expect(getPlayheadAuthorityClientId(aw)).toBe(100);
  });

  it('returns lowest clientID as fallback when no SM', () => {
    const aw = makeAwareness(10, [
      [300, baseState('operator')],
      [200, baseState('operator')],
      [100, baseState('operator')],
    ]);
    expect(getPlayheadAuthorityClientId(aw)).toBe(100);
  });

  it('SM role wins over lower clientID', () => {
    const aw = makeAwareness(10, [
      [50, baseState('operator')],   // lower ID but not SM
      [200, baseState('sm')],        // SM role
    ]);
    expect(getPlayheadAuthorityClientId(aw)).toBe(200);
  });

  it('returns single station clientID when only one station', () => {
    const aw = makeAwareness(10, [[42, baseState('operator')]]);
    expect(getPlayheadAuthorityClientId(aw)).toBe(42);
  });
});

describe('getPlayheadState', () => {
  it('returns null when no states', () => {
    const aw = makeAwareness(10, []);
    expect(getPlayheadState(aw)).toBeNull();
  });

  it('returns playhead from SM authority station', () => {
    const aw = makeAwareness(10, [
      [100, { ...baseState('sm'), playhead: samplePlayhead }],
      [200, baseState('operator')],
    ]);
    const ph = getPlayheadState(aw);
    expect(ph).not.toBeNull();
    expect(ph!.cue_id).toBe('q5');
    expect(ph!.cuelist_id).toBe('cl1');
  });

  it('returns null when authority station has no playhead field', () => {
    const aw = makeAwareness(10, [
      [100, baseState('sm')],  // SM but no playhead set yet
    ]);
    expect(getPlayheadState(aw)).toBeNull();
  });

  it('returns playhead from lowest-clientID fallback when no SM', () => {
    const aw = makeAwareness(10, [
      [100, { ...baseState('operator'), playhead: samplePlayhead }],
      [200, baseState('operator')],
    ]);
    const ph = getPlayheadState(aw);
    expect(ph!.cue_id).toBe('q5');
  });

  it('falls back to any state with playhead when authority has none (freshly-promoted authority)', () => {
    // SM (authority) was just promoted and has not yet written a playhead.
    // A previous state in another client carries the last-known playhead.
    const aw = makeAwareness(10, [
      [100, baseState('sm')],  // authority — no playhead
      [200, { ...baseState('operator'), playhead: samplePlayhead }],  // non-authority has one
    ]);
    const ph = getPlayheadState(aw);
    expect(ph).not.toBeNull();
    expect(ph!.cue_id).toBe('q5');
  });

  it('does NOT return playhead from non-authority station', () => {
    const nonAuthorityPlayhead: PlayheadAwareness = {
      ...samplePlayhead,
      cue_id: 'q99',
    };
    const aw = makeAwareness(10, [
      [100, { ...baseState('sm'), playhead: samplePlayhead }],  // SM authority — q5
      [200, { ...baseState('operator'), playhead: nonAuthorityPlayhead }],  // non-authority — q99
    ]);
    const ph = getPlayheadState(aw);
    expect(ph!.cue_id).toBe('q5');  // authority's value wins
  });
});

describe('authority determinism with two observers', () => {
  it('both observers agree on the same authority when no SM', () => {
    const states: [number, Partial<StationAwareness>][] = [
      [50, baseState('operator')],
      [30, baseState('operator')],
      [70, baseState('operator')],
    ];
    const awA = makeAwareness(50, states);
    const awB = makeAwareness(30, states);
    expect(getPlayheadAuthorityClientId(awA)).toBe(getPlayheadAuthorityClientId(awB));
    expect(getPlayheadAuthorityClientId(awA)).toBe(30);  // lowest
  });

  it('two SM clients both elect lowest SM clientID as authority (split-brain fix)', () => {
    // SM-A has clientID 50, SM-B has clientID 90
    const states: [number, Partial<StationAwareness>][] = [
      [50, baseState('sm')],
      [90, baseState('sm')],
      [70, baseState('operator')],
    ];
    // Client A (local=90) and client B (local=50) see identical state sets but
    // different Map insertion order (local state is inserted first on each client).
    // Both must agree on the same authority = lowest SM = 50.
    const awA = makeAwareness(90, states);
    const awB = makeAwareness(50, states);
    expect(getPlayheadAuthorityClientId(awA)).toBe(50);
    expect(getPlayheadAuthorityClientId(awB)).toBe(50);
  });

  it('SM disconnect → authority falls back to lowest clientID', () => {
    const withSm: [number, Partial<StationAwareness>][] = [
      [100, baseState('sm')],
      [30, baseState('operator')],
    ];
    const awWithSm = makeAwareness(30, withSm);
    expect(getPlayheadAuthorityClientId(awWithSm)).toBe(100);  // SM wins

    const withoutSm: [number, Partial<StationAwareness>][] = [
      [30, baseState('operator')],
    ];
    const awWithoutSm = makeAwareness(30, withoutSm);
    expect(getPlayheadAuthorityClientId(awWithoutSm)).toBe(30);  // fallback to lowest
  });
});
