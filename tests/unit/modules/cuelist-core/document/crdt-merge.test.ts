import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  initShowDoc,
  getMeta,
  getCuelists,
  getCuelist,
  getCues,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import {
  addCue,
  setCueLabel,
  reorderCues,
} from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import {
  addPayload,
  getPayloads,
} from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { getCuesSorted } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';

function makeClone(doc: Y.Doc): Y.Doc {
  const clone = new Y.Doc();
  Y.applyUpdate(clone, Y.encodeStateAsUpdate(doc));
  return clone;
}

function syncBoth(doc1: Y.Doc, doc2: Y.Doc): void {
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
}

describe('CRDT merge tests', () => {
  it('two clones adding different cues concurrently — both appear after sync', () => {
    const doc1 = initShowDoc({ title: 'Show', venue: null, date: null, created_by: 'op1' });
    const doc2 = makeClone(doc1);

    const cuelistId1 = getMeta(doc1).get('active_cuelist_id') as string;
    const cuelistId2 = getMeta(doc2).get('active_cuelist_id') as string;

    const id1 = addCue(doc1, cuelistId1, { label: 'Cue A', department: ['LX'], created_by: 'op1' });
    const id2 = addCue(doc2, cuelistId2, { label: 'Cue B', department: ['SX'], created_by: 'op2' });

    syncBoth(doc1, doc2);

    const cuelist1 = getCuelist(doc1, cuelistId1)!;
    const cuelist2 = getCuelist(doc2, cuelistId2)!;
    const ids1 = getCues(cuelist1).toArray().map((c) => c.get('id'));
    const ids2 = getCues(cuelist2).toArray().map((c) => c.get('id'));

    expect(ids1).toContain(id1);
    expect(ids1).toContain(id2);
    expect(ids1).toEqual(ids2);
    expect(ids1).toHaveLength(2);
  });

  it('two clones editing cue.label concurrently — one winner, both docs agree', async () => {
    const doc1 = initShowDoc({ title: 'Show', venue: null, date: null, created_by: 'op1' });
    const cuelistId = getMeta(doc1).get('active_cuelist_id') as string;
    const cueId = addCue(doc1, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });

    const doc2 = makeClone(doc1);
    const cuelistId2 = getMeta(doc2).get('active_cuelist_id') as string;

    // Concurrent label edits
    setCueLabel(doc1, cuelistId, cueId, 'Alpha', 'op1');
    setCueLabel(doc2, cuelistId2, cueId, 'Beta', 'op2');

    syncBoth(doc1, doc2);

    const cuelist1 = getCuelist(doc1, cuelistId)!;
    const cuelist2 = getCuelist(doc2, cuelistId2)!;
    const label1 = getCues(cuelist1).toArray().find((c) => c.get('id') === cueId)!.get('label') as string;
    const label2 = getCues(cuelist2).toArray().find((c) => c.get('id') === cueId)!.get('label') as string;

    // Both docs converge to the same value
    expect(label1).toBe(label2);
    expect(['Alpha', 'Beta']).toContain(label1);
  });

  it('concurrent reorder ops on two clones — deterministic final order, both agree', () => {
    const doc1 = initShowDoc({ title: 'Show', venue: null, date: null, created_by: 'op1' });
    const cuelistId = getMeta(doc1).get('active_cuelist_id') as string;

    const id1 = addCue(doc1, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
    const id2 = addCue(doc1, cuelistId, { label: 'Q2', department: ['LX'], created_by: 'op1' });
    const id3 = addCue(doc1, cuelistId, { label: 'Q3', department: ['LX'], created_by: 'op1' });

    const doc2 = makeClone(doc1);
    const cuelistId2 = getMeta(doc2).get('active_cuelist_id') as string;

    // doc1 reverses order; doc2 does different reorder
    reorderCues(doc1, cuelistId, [id3, id2, id1]);
    reorderCues(doc2, cuelistId2, [id2, id3, id1]);

    syncBoth(doc1, doc2);

    const cuelist1 = getCuelist(doc1, cuelistId)!;
    const cuelist2 = getCuelist(doc2, cuelistId2)!;

    // Use getCuesSorted — sort_key fields are LWW; after sync both docs converge to
    // the same per-cue sort_key values → same visual order.
    const order1 = getCuesSorted(cuelist1).map((c) => c.get('id') as string);
    const order2 = getCuesSorted(cuelist2).map((c) => c.get('id') as string);

    // Both docs must agree on the same visual order
    expect(order1).toEqual(order2);
    // All three cues still present (reorderCues only mutates sort_key — no Y.Array items added/removed)
    expect(order1).toHaveLength(3);
    expect(order1).toContain(id1);
    expect(order1).toContain(id2);
    expect(order1).toContain(id3);
  });

  it('concurrent payload adds to same cue — both payloads present after sync', () => {
    const doc1 = initShowDoc({ title: 'Show', venue: null, date: null, created_by: 'op1' });
    const cuelistId = getMeta(doc1).get('active_cuelist_id') as string;
    const cueId = addCue(doc1, cuelistId, { label: 'Q1', department: ['LX', 'SX'], created_by: 'op1' });

    const doc2 = makeClone(doc1);
    const cuelistId2 = getMeta(doc2).get('active_cuelist_id') as string;

    const pid1 = addPayload(doc1, cuelistId, cueId, {
      type: 'osc',
      device_id: 'dev_qlab',
      address: '/cue/q1',
      args: [],
      tag: null,
      note: '',
    });
    const pid2 = addPayload(doc2, cuelistId2, cueId, {
      type: 'lx_ref',
      device_id: 'dev_eos',
      cue_list: 1,
      cue_number: 1,
      tag: null,
      note: '',
    });

    syncBoth(doc1, doc2);

    const cue = getCues(getCuelist(doc1, cuelistId)!).toArray().find((c) => c.get('id') === cueId)!;
    const payloadIds = getPayloads(cue).toArray().map((p) => p.get('id'));
    expect(payloadIds).toContain(pid1);
    expect(payloadIds).toContain(pid2);
    expect(payloadIds).toHaveLength(2);
  });

  it('Y.encodeStateAsUpdate produces Uint8Array; size scales with cue count', () => {
    const doc = initShowDoc({ title: 'Show', venue: null, date: null, created_by: 'op1' });
    const cuelistId = getMeta(doc).get('active_cuelist_id') as string;

    const updateEmpty = Y.encodeStateAsUpdate(doc);
    expect(updateEmpty).toBeInstanceOf(Uint8Array);
    expect(updateEmpty.byteLength).toBeGreaterThan(0);

    for (let i = 0; i < 20; i++) {
      addCue(doc, cuelistId, { label: `Q${i}`, department: ['LX'], created_by: 'op1' });
    }
    const update20 = Y.encodeStateAsUpdate(doc);
    expect(update20.byteLength).toBeGreaterThan(updateEmpty.byteLength);

    for (let i = 20; i < 40; i++) {
      addCue(doc, cuelistId, { label: `Q${i}`, department: ['LX'], created_by: 'op1' });
    }
    const update40 = Y.encodeStateAsUpdate(doc);
    expect(update40.byteLength).toBeGreaterThan(update20.byteLength);
  });
});
