import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import {
  initShowDoc,
  getMeta,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { addPayload, getPayloads } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { getCuelist, getCues } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import {
  payloadsByDepartment,
  addPayloadWithDepartmentTag,
  reorderPayloads,
} from '../../../../../src/modules/cuelist-core/src/cue/payloadOps.js';

function makeDocWithCuelist() {
  const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

function makeCueFromDoc(doc: Y.Doc, cuelistId: string, id: string): Cue {
  const cuelist = getCuelist(doc, cuelistId)!;
  const cue = getCues(cuelist).toArray().find((c) => c.get('id') === id)!;
  return cue.toJSON() as Cue;
}

function oscPayload(tag: string | null = null) {
  return {
    type: 'osc' as const,
    tag,
    note: '',
    device_id: 'qlab',
    address: '/cue/1/start',
    args: [],
  };
}

function waitPayload(tag: string | null = null) {
  return { type: 'wait' as const, tag, note: '', duration_ms: 500 };
}

describe('payloadsByDepartment', () => {
  it('single-dept cue: all payloads under that dept (test 12)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    addPayload(doc, cuelistId, cueId, oscPayload(null));
    addPayload(doc, cuelistId, cueId, waitPayload(null));
    const cue = makeCueFromDoc(doc, cuelistId, cueId);
    const map = payloadsByDepartment(cue);
    expect(map.get('LX')).toHaveLength(2);
    expect(map.get('unassigned')).toBeUndefined();
  });

  it('compound cue + tagged payloads: correct grouping (test 13)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = addCue(doc, cuelistId, {
      label: 'Q1',
      department: ['LX', 'SX'],
      created_by: 'op1',
    });
    addPayload(doc, cuelistId, cueId, oscPayload('SX'));
    addPayload(doc, cuelistId, cueId, {
      type: 'lx_ref', tag: 'LX', note: '', device_id: 'eos', cue_list: 1, cue_number: 1,
    });
    const cue = makeCueFromDoc(doc, cuelistId, cueId);
    const map = payloadsByDepartment(cue);
    expect(map.get('LX')).toHaveLength(1);
    expect(map.get('SX')).toHaveLength(1);
    expect(map.get('unassigned')).toBeUndefined();
  });

  it('compound cue + untagged payload: ends up in unassigned (test 14)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = addCue(doc, cuelistId, {
      label: 'Q1',
      department: ['LX', 'SX'],
      created_by: 'op1',
    });
    addPayload(doc, cuelistId, cueId, oscPayload('SX'));
    addPayload(doc, cuelistId, cueId, waitPayload(null)); // no tag
    const cue = makeCueFromDoc(doc, cuelistId, cueId);
    const map = payloadsByDepartment(cue);
    expect(map.get('SX')).toHaveLength(1);
    expect(map.get('unassigned')).toHaveLength(1);
    expect(map.get('LX')).toBeUndefined();
  });
});

describe('addPayloadWithDepartmentTag', () => {
  it('rejects non-canonical departmentTag (test 15)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    expect(() =>
      addPayloadWithDepartmentTag(doc, cuelistId, cueId, oscPayload(null), 'AUDIO' as any),
    ).toThrow('canonical');
  });

  it('sets tag correctly on the resulting payload (test 16)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const pid = addPayloadWithDepartmentTag(doc, cuelistId, cueId, oscPayload(null), 'LX');
    const cuelist = getCuelist(doc, cuelistId)!;
    const cueMap = getCues(cuelist).toArray().find((c) => c.get('id') === cueId)!;
    const payloadsArr = getPayloads(cueMap);
    const p = payloadsArr.toArray().find((m) => m.get('id') === pid);
    expect(p).toBeDefined();
    expect(p!.get('tag')).toBe('LX');
  });
});

describe('reorderPayloads', () => {
  it('rejects newOrder with missing id (test 17)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const pid1 = addPayload(doc, cuelistId, cueId, oscPayload(null));
    const pid2 = addPayload(doc, cuelistId, cueId, waitPayload(null));
    const pid3 = addPayload(doc, cuelistId, cueId, oscPayload(null));
    // omit pid3
    expect(() => reorderPayloads(doc, cuelistId, cueId, [pid1, pid2])).toThrow(
      'exactly the same payload ids',
    );
  });

  it('rejects newOrder with extra id (test 18)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const pid1 = addPayload(doc, cuelistId, cueId, oscPayload(null));
    const pid2 = addPayload(doc, cuelistId, cueId, waitPayload(null));
    // pass extra id
    expect(() =>
      reorderPayloads(doc, cuelistId, cueId, [pid1, pid2, 'non-existent-id']),
    ).toThrow('exactly the same payload ids');
  });

  it('produces correct final order and preserves ids (test 19)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const pid1 = addPayload(doc, cuelistId, cueId, oscPayload(null));
    const pid2 = addPayload(doc, cuelistId, cueId, waitPayload(null));
    const pid3 = addPayload(doc, cuelistId, cueId, oscPayload('LX'));

    // Reorder to [pid3, pid1, pid2]
    reorderPayloads(doc, cuelistId, cueId, [pid3, pid1, pid2]);

    const cuelist = getCuelist(doc, cuelistId)!;
    const cueMap = getCues(cuelist).toArray().find((c) => c.get('id') === cueId)!;
    const payloadsArr = getPayloads(cueMap).toArray();

    expect(payloadsArr).toHaveLength(3);
    expect(payloadsArr[0].get('id')).toBe(pid3);
    expect(payloadsArr[1].get('id')).toBe(pid1);
    expect(payloadsArr[2].get('id')).toBe(pid2);
    // Verify other fields preserved
    expect(payloadsArr[0].get('type')).toBe('osc');
    expect(payloadsArr[1].get('type')).toBe('osc');
    expect(payloadsArr[2].get('type')).toBe('wait');
  });
});
