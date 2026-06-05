import { describe, it, expect } from 'vitest';
import { authorise, type AuthorityCuelist, type OperatorContext } from '../../../../../src/modules/cuelist-core/src/go/authority.js';
import type { GoRequest } from '../../../../../src/modules/cuelist-core/src/go/goEventChannel.js';

function makeReq(overrides: Partial<GoRequest> = {}): GoRequest {
  return {
    topic: 'go.request',
    request_id: 'req-1',
    cue_id: 'cue-1',
    cuelist_id: 'cl-1',
    station_id: 'station-1',
    operator_id: 'op-sm',
    client_ts: new Date().toISOString(),
    override: false,
    ...overrides,
  };
}

function makeCuelist(go_authority: AuthorityCuelist['go_authority'], cueId = 'cue-1', dept = ['LX']): AuthorityCuelist {
  return {
    go_authority,
    cues: [{ id: cueId, department: dept }],
  };
}

const smOctx: OperatorContext = {
  operatorOwns: (id, dept) => id === 'op-sm' && dept === 'SM',
  operatorOwned: (id) => (id === 'op-sm' ? ['SM'] : []),
};

const lxOctx: OperatorContext = {
  operatorOwns: () => false,
  operatorOwned: (id) => (id === 'op-lx' ? ['LX'] : []),
};

describe('authorise — sm_called', () => {
  it('returns ok when operator is SM', () => {
    const result = authorise(makeReq({ operator_id: 'op-sm' }), makeCuelist('sm_called'), smOctx);
    expect(result).toEqual({ ok: true, mode: 'sm' });
  });

  it('returns not_sm when operator is not SM', () => {
    const result = authorise(makeReq({ operator_id: 'op-lx' }), makeCuelist('sm_called'), lxOctx);
    expect(result).toEqual({ ok: false, reason: 'not_sm' });
  });

  it('returns not_sm when no octx provided', () => {
    const result = authorise(makeReq(), makeCuelist('sm_called'));
    expect(result).toEqual({ ok: false, reason: 'not_sm' });
  });
});

describe('authorise — auto_cascade', () => {
  it('returns ok for any operator', () => {
    const result = authorise(makeReq({ operator_id: 'op-lx' }), makeCuelist('auto_cascade'));
    expect(result).toEqual({ ok: true, mode: 'cascade' });
  });

  it('returns ok even without octx', () => {
    const result = authorise(makeReq(), makeCuelist('auto_cascade'));
    expect(result).toEqual({ ok: true, mode: 'cascade' });
  });
});

describe('authorise — per_dept', () => {
  it('returns ok when operator owns a matching department', () => {
    const result = authorise(
      makeReq({ operator_id: 'op-lx', cue_id: 'cue-1' }),
      makeCuelist('per_dept', 'cue-1', ['LX']),
      lxOctx,
    );
    expect(result).toEqual({ ok: true, mode: 'dept' });
  });

  it('returns not_owner when operator does not own matching department', () => {
    const result = authorise(
      makeReq({ operator_id: 'op-lx', cue_id: 'cue-1' }),
      makeCuelist('per_dept', 'cue-1', ['SX']),
      lxOctx,
    );
    expect(result).toEqual({ ok: false, reason: 'not_owner' });
  });

  it('returns not_owner when cue not found in cuelist', () => {
    const result = authorise(
      makeReq({ operator_id: 'op-lx', cue_id: 'cue-missing' }),
      makeCuelist('per_dept', 'cue-1', ['LX']),
      lxOctx,
    );
    expect(result).toEqual({ ok: false, reason: 'not_owner' });
  });

  it('returns not_owner when no octx provided', () => {
    const result = authorise(makeReq({ cue_id: 'cue-1' }), makeCuelist('per_dept', 'cue-1', ['LX']));
    expect(result).toEqual({ ok: false, reason: 'not_owner' });
  });
});

describe('authorise — timecode', () => {
  it('returns timecode_only for non-override request', () => {
    const result = authorise(makeReq({ override: false }), makeCuelist('timecode'), smOctx);
    expect(result).toEqual({ ok: false, reason: 'timecode_only' });
  });

  it('returns sm_override when SM operator sends override=true', () => {
    const result = authorise(
      makeReq({ operator_id: 'op-sm', override: true }),
      makeCuelist('timecode'),
      smOctx,
    );
    expect(result).toEqual({ ok: true, mode: 'sm_override' });
  });

  it('returns timecode_only when non-SM sends override=true', () => {
    const result = authorise(
      makeReq({ operator_id: 'op-lx', override: true }),
      makeCuelist('timecode'),
      lxOctx,
    );
    expect(result).toEqual({ ok: false, reason: 'timecode_only' });
  });
});
