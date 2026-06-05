import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  initShowDoc,
  getMeta,
  getCuelist,
  getCues,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import {
  ValidationError,
  makePayloadMap,
  addPayload,
  updatePayload,
  inferPayloadDepartment,
  getPayloads,
} from '../../../../../src/modules/cuelist-core/src/document/payload.js';

function makeDocWithCue() {
  const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
  return { doc, cuelistId, cueId };
}

describe('OSC payload validation', () => {
  it('throws when address does not start with /', () => {
    expect(() =>
      makePayloadMap({ type: 'osc', device_id: 'dev', address: 'cue/start', args: [], tag: null, note: '' }),
    ).toThrow(ValidationError);
  });

  it('accepts address starting with /', () => {
    expect(() =>
      makePayloadMap({ type: 'osc', device_id: 'dev', address: '/cue/start', args: [], tag: null, note: '' }),
    ).not.toThrow();
  });
});

describe('Webhook payload validation', () => {
  it('throws for non-https, non-loopback URL', () => {
    expect(() =>
      makePayloadMap({
        type: 'webhook',
        url: 'http://example.com/webhook',
        method: 'POST',
        headers: {},
        body: null,
        timeout_ms: 5000,
        tag: null,
        note: '',
      }),
    ).toThrow(ValidationError);
  });

  it('accepts loopback http URL', () => {
    expect(() =>
      makePayloadMap({
        type: 'webhook',
        url: 'http://127.0.0.1:8080/hook',
        method: 'POST',
        headers: {},
        body: null,
        timeout_ms: 5000,
        tag: null,
        note: '',
      }),
    ).not.toThrow();
  });

  it('accepts https URL', () => {
    expect(() =>
      makePayloadMap({
        type: 'webhook',
        url: 'https://api.example.com/hook',
        method: 'POST',
        headers: {},
        body: null,
        timeout_ms: 5000,
        tag: null,
        note: '',
      }),
    ).not.toThrow();
  });
});

describe('Wait payload validation', () => {
  it('throws when duration_ms is negative', () => {
    expect(() =>
      makePayloadMap({ type: 'wait', duration_ms: -1, tag: null, note: '' }),
    ).toThrow(ValidationError);
  });

  it('throws when duration_ms exceeds 600000', () => {
    expect(() =>
      makePayloadMap({ type: 'wait', duration_ms: 600_001, tag: null, note: '' }),
    ).toThrow(ValidationError);
  });

  it('accepts duration_ms = 0', () => {
    expect(() =>
      makePayloadMap({ type: 'wait', duration_ms: 0, tag: null, note: '' }),
    ).not.toThrow();
  });

  it('accepts duration_ms = 600000', () => {
    expect(() =>
      makePayloadMap({ type: 'wait', duration_ms: 600_000, tag: null, note: '' }),
    ).not.toThrow();
  });
});

describe('MSC payload validation', () => {
  it('throws when device_id_msc is 128 (out of range)', () => {
    expect(() =>
      makePayloadMap({
        type: 'msc',
        device_id: 'dev',
        command: 'go',
        cue_list: null,
        cue_number: null,
        device_id_msc: 128,
        tag: null,
        note: '',
      }),
    ).toThrow(ValidationError);
  });

  it('accepts device_id_msc = 127 (all devices)', () => {
    expect(() =>
      makePayloadMap({
        type: 'msc',
        device_id: 'dev',
        command: 'go',
        cue_list: null,
        cue_number: null,
        device_id_msc: 127,
        tag: null,
        note: '',
      }),
    ).not.toThrow();
  });
});

describe('LX ref payload validation', () => {
  it('throws when cue_list is 0 (must be ≥ 1)', () => {
    expect(() =>
      makePayloadMap({
        type: 'lx_ref',
        device_id: 'dev_eos',
        cue_list: 0,
        cue_number: 1,
        tag: null,
        note: '',
      }),
    ).toThrow(ValidationError);
  });

  it('accepts cue_list = 1 and cue_number = 0', () => {
    expect(() =>
      makePayloadMap({
        type: 'lx_ref',
        device_id: 'dev_eos',
        cue_list: 1,
        cue_number: 0,
        tag: null,
        note: '',
      }),
    ).not.toThrow();
  });
});

describe('MIDI payload validation', () => {
  it('throws when channel is 0 (must be 1..16)', () => {
    expect(() =>
      makePayloadMap({
        type: 'midi',
        device_id: 'dev',
        message: { kind: 'note_on', channel: 0, note: 60, velocity: 100 },
        tag: null,
        note: '',
      }),
    ).toThrow(ValidationError);
  });

  it('throws when channel is 17', () => {
    expect(() =>
      makePayloadMap({
        type: 'midi',
        device_id: 'dev',
        message: { kind: 'note_on', channel: 17, note: 60, velocity: 100 },
        tag: null,
        note: '',
      }),
    ).toThrow(ValidationError);
  });

  it('accepts channel 1..16', () => {
    expect(() =>
      makePayloadMap({
        type: 'midi',
        device_id: 'dev',
        message: { kind: 'note_on', channel: 1, note: 60, velocity: 100 },
        tag: null,
        note: '',
      }),
    ).not.toThrow();
  });
});

describe('Group payload validation', () => {
  it('throws when child_cue_ids exceeds 32', () => {
    const ids = Array.from({ length: 33 }, (_, i) => `cue_${i}`);
    expect(() =>
      makePayloadMap({ type: 'group', child_cue_ids: ids, fire_mode: 'parallel', tag: null, note: '' }),
    ).toThrow(ValidationError);
  });

  it('accepts 32 child_cue_ids', () => {
    const ids = Array.from({ length: 32 }, (_, i) => `cue_${i}`);
    expect(() =>
      makePayloadMap({ type: 'group', child_cue_ids: ids, fire_mode: 'parallel', tag: null, note: '' }),
    ).not.toThrow();
  });
});

describe('updatePayload type immutability', () => {
  it('throws when updating type from osc to midi', () => {
    const { doc, cuelistId, cueId } = makeDocWithCue();
    const payloadId = addPayload(doc, cuelistId, cueId, {
      type: 'osc',
      device_id: 'dev',
      address: '/cue/start',
      args: [],
      tag: null,
      note: '',
    });
    expect(() =>
      updatePayload(doc, cuelistId, cueId, payloadId, { type: 'midi' } as never),
    ).toThrow(ValidationError);
  });

  it('allows updating non-type fields', () => {
    const { doc, cuelistId, cueId } = makeDocWithCue();
    const payloadId = addPayload(doc, cuelistId, cueId, {
      type: 'osc',
      device_id: 'dev',
      address: '/cue/start',
      args: [],
      tag: null,
      note: '',
    });
    expect(() =>
      updatePayload(doc, cuelistId, cueId, payloadId, { address: '/cue/new' }),
    ).not.toThrow();
    const cue = getCues(getCuelist(doc, cuelistId)!).toArray().find((c) => c.get('id') === cueId)!;
    const payload = getPayloads(cue).toArray().find((p) => p.get('id') === payloadId)!;
    expect(payload.get('address')).toBe('/cue/new');
  });
});

/** Integrate two standalone Y.Maps into a shared temp doc so .get() works. */
function integratePair(cueMap: Y.Map<unknown>, payloadMap: Y.Map<unknown>): void {
  const doc = new Y.Doc();
  doc.transact(() => {
    doc.getArray<Y.Map<unknown>>('_t').push([cueMap, payloadMap]);
  });
}

describe('inferPayloadDepartment', () => {
  it('returns the single dept when cue.department.length === 1', () => {
    const cueMap = new Y.Map<unknown>();
    const payloadMap = new Y.Map<unknown>();
    // Set prelim values before integration — they are applied via _integrate
    cueMap.set('department', ['LX']);
    payloadMap.set('tag', null);
    integratePair(cueMap, payloadMap);
    expect(inferPayloadDepartment(cueMap, payloadMap)).toBe('LX');
  });

  it('returns tag-derived dept when cue is compound and tag is canonical', () => {
    const cueMap = new Y.Map<unknown>();
    const payloadMap = new Y.Map<unknown>();
    cueMap.set('department', ['LX', 'SX']);
    payloadMap.set('tag', 'LX');
    integratePair(cueMap, payloadMap);
    expect(inferPayloadDepartment(cueMap, payloadMap)).toBe('LX');
  });

  it('returns null when cue is compound and tag is not canonical', () => {
    const cueMap = new Y.Map<unknown>();
    const payloadMap = new Y.Map<unknown>();
    cueMap.set('department', ['LX', 'SX']);
    payloadMap.set('tag', 'custom');
    integratePair(cueMap, payloadMap);
    expect(inferPayloadDepartment(cueMap, payloadMap)).toBeNull();
  });

  it('returns null when cue is compound and tag is null', () => {
    const cueMap = new Y.Map<unknown>();
    const payloadMap = new Y.Map<unknown>();
    cueMap.set('department', ['LX', 'SX']);
    payloadMap.set('tag', null);
    integratePair(cueMap, payloadMap);
    expect(inferPayloadDepartment(cueMap, payloadMap)).toBeNull();
  });
});
