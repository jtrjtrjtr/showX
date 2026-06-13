import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  initShowDoc,
  setMode,
  getCuelists,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import {
  addProposal,
  listProposals,
  resolveProposal,
  pendingProposalCount,
} from '../../../../../src/modules/cuelist-core/src/document/proposals.js';

function makeDoc() {
  return initShowDoc({ title: 'Test Show', venue: 'Venue', date: '2026-06-17', created_by: 'op1' });
}

function getDefaultCuelistId(doc: Y.Doc): string {
  const cuelists = getCuelists(doc);
  return cuelists.get(0).get('id') as string;
}

describe('proposals — add/list', () => {
  it('addProposal creates a pending proposal in the Y.Array', () => {
    const doc = makeDoc();
    const cuelistId = getDefaultCuelistId(doc);
    const cueId = addCue(doc, cuelistId, { label: 'Cue 1', department: ['LX'], created_by: 'op1' });

    const id = addProposal(doc, {
      cue_id: cueId,
      cuelist_id: cuelistId,
      author_operator_id: 'op2',
      kind: 'cue',
      target_field: 'label',
      proposed_value: 'Updated label',
    });

    expect(typeof id).toBe('string');
    const all = listProposals(doc);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id,
      cue_id: cueId,
      cuelist_id: cuelistId,
      author_operator_id: 'op2',
      kind: 'cue',
      target_field: 'label',
      proposed_value: JSON.stringify('Updated label'),
      status: 'pending',
    });
    expect(all[0].resolved_by).toBeUndefined();
    expect(all[0].resolved_at).toBeUndefined();
  });

  it('pendingProposalCount tracks only pending proposals', () => {
    const doc = makeDoc();
    const cuelistId = getDefaultCuelistId(doc);
    const cueId = addCue(doc, cuelistId, { label: 'Cue 1', department: ['LX'], created_by: 'op1' });

    expect(pendingProposalCount(doc)).toBe(0);
    const id1 = addProposal(doc, { cue_id: cueId, cuelist_id: cuelistId, author_operator_id: 'op2', kind: 'cue', target_field: 'label', proposed_value: 'A' });
    const _id2 = addProposal(doc, { cue_id: cueId, cuelist_id: cuelistId, author_operator_id: 'op2', kind: 'cue', target_field: 'description', proposed_value: 'B' });

    expect(pendingProposalCount(doc)).toBe(2);
    resolveProposal(doc, id1, 'accepted', 'sm1');
    expect(pendingProposalCount(doc)).toBe(1);
  });

  it('listProposals returns all proposals (pending + resolved)', () => {
    const doc = makeDoc();
    const cuelistId = getDefaultCuelistId(doc);
    const cueId = addCue(doc, cuelistId, { label: 'Cue 1', department: ['LX'], created_by: 'op1' });

    addProposal(doc, { cue_id: cueId, cuelist_id: cuelistId, author_operator_id: 'op2', kind: 'cue', target_field: 'label', proposed_value: 'New label' });
    addProposal(doc, { cue_id: cueId, cuelist_id: cuelistId, author_operator_id: 'op2', kind: 'cue', target_field: 'description', proposed_value: 'Desc' });
    expect(listProposals(doc)).toHaveLength(2);
  });
});

describe('proposals — resolve: accept applies change', () => {
  it('accept of kind=cue applies label change to the cue', () => {
    const doc = makeDoc();
    const cuelistId = getDefaultCuelistId(doc);
    const cueId = addCue(doc, cuelistId, { label: 'Original', department: ['LX'], created_by: 'op1' });

    const id = addProposal(doc, {
      cue_id: cueId,
      cuelist_id: cuelistId,
      author_operator_id: 'op2',
      kind: 'cue',
      target_field: 'label',
      proposed_value: 'Proposed label',
    });

    resolveProposal(doc, id, 'accepted', 'sm1');

    // Check cue label updated
    const cuelistMap = getCuelists(doc).get(0);
    const cueMap = (cuelistMap.get('cues') as Y.Array<Y.Map<unknown>>)
      .toArray()
      .find((c) => c.get('id') === cueId);
    expect(cueMap?.get('label')).toBe('Proposed label');

    // Proposal marked accepted
    const proposal = listProposals(doc)[0];
    expect(proposal.status).toBe('accepted');
    expect(proposal.resolved_by).toBe('sm1');
    expect(proposal.resolved_at).toBeTruthy();
  });

  it('accept of kind=cue in SHOW mode applies (meta allowed in SHOW)', () => {
    const doc = makeDoc();
    const cuelistId = getDefaultCuelistId(doc);
    const cueId = addCue(doc, cuelistId, { label: 'Original', department: ['SX'], created_by: 'op1' });
    setMode(doc, 'show');

    const id = addProposal(doc, {
      cue_id: cueId,
      cuelist_id: cuelistId,
      author_operator_id: 'op2',
      kind: 'cue',
      target_field: 'description',
      proposed_value: 'Show-mode description',
    });

    // Must not throw — meta edits allowed in SHOW
    expect(() => resolveProposal(doc, id, 'accepted', 'sm1')).not.toThrow();

    const cuelistMap = getCuelists(doc).get(0);
    const cueMap = (cuelistMap.get('cues') as Y.Array<Y.Map<unknown>>)
      .toArray()
      .find((c) => c.get('id') === cueId);
    expect(cueMap?.get('description')).toBe('Show-mode description');
  });

  it('accept of kind=payload adds payload to cue in SHOW mode', () => {
    const doc = makeDoc();
    const cuelistId = getDefaultCuelistId(doc);
    const cueId = addCue(doc, cuelistId, { label: 'Cue 1', department: ['SX'], created_by: 'op1' });
    setMode(doc, 'show');

    const id = addProposal(doc, {
      cue_id: cueId,
      cuelist_id: cuelistId,
      author_operator_id: 'op2',
      kind: 'payload',
      target_field: 'osc',
      proposed_value: { type: 'osc', address: '/show/cue', args: [] },
    });

    // Should apply even in SHOW mode (acceptance = authorized)
    expect(() => resolveProposal(doc, id, 'accepted', 'sm1')).not.toThrow();

    const cuelistMap = getCuelists(doc).get(0);
    const cueMap = (cuelistMap.get('cues') as Y.Array<Y.Map<unknown>>)
      .toArray()
      .find((c) => c.get('id') === cueId);
    const payloads = (cueMap?.get('payloads') as Y.Array<Y.Map<unknown>>).toArray();
    expect(payloads).toHaveLength(1);
    expect(payloads[0].get('type')).toBe('osc');
    expect(payloads[0].get('address')).toBe('/show/cue');
  });

  it('reject marks proposal rejected without applying change', () => {
    const doc = makeDoc();
    const cuelistId = getDefaultCuelistId(doc);
    const cueId = addCue(doc, cuelistId, { label: 'Cue 1', department: ['LX'], created_by: 'op1' });

    const id = addProposal(doc, {
      cue_id: cueId,
      cuelist_id: cuelistId,
      author_operator_id: 'op2',
      kind: 'cue',
      target_field: 'label',
      proposed_value: 'Should not apply',
    });

    resolveProposal(doc, id, 'rejected', 'sm1');

    const cuelistMap = getCuelists(doc).get(0);
    const cueMap = (cuelistMap.get('cues') as Y.Array<Y.Map<unknown>>)
      .toArray()
      .find((c) => c.get('id') === cueId);
    expect(cueMap?.get('label')).toBe('Cue 1'); // unchanged

    const proposal = listProposals(doc)[0];
    expect(proposal.status).toBe('rejected');
    expect(proposal.resolved_by).toBe('sm1');
  });

  it('resolveProposal throws if proposal not found', () => {
    const doc = makeDoc();
    expect(() => resolveProposal(doc, 'nonexistent-id', 'accepted', 'sm1')).toThrow('not found');
  });

  it('resolveProposal throws if proposal already resolved', () => {
    const doc = makeDoc();
    const cuelistId = getDefaultCuelistId(doc);
    const cueId = addCue(doc, cuelistId, { label: 'Cue 1', department: ['LX'], created_by: 'op1' });

    const id = addProposal(doc, {
      cue_id: cueId,
      cuelist_id: cuelistId,
      author_operator_id: 'op2',
      kind: 'cue',
      target_field: 'label',
      proposed_value: 'New label',
    });

    resolveProposal(doc, id, 'rejected', 'sm1');
    expect(() => resolveProposal(doc, id, 'accepted', 'sm1')).toThrow('already resolved');
  });
});

describe('proposals — SHOW mode submit allowed', () => {
  it('addProposal is allowed in SHOW mode (proposals are the sanctioned edit path)', () => {
    const doc = makeDoc();
    const cuelistId = getDefaultCuelistId(doc);
    const cueId = addCue(doc, cuelistId, { label: 'Cue 1', department: ['SX'], created_by: 'op1' });
    setMode(doc, 'show');

    // Should not throw even in SHOW mode
    expect(() =>
      addProposal(doc, {
        cue_id: cueId,
        cuelist_id: cuelistId,
        author_operator_id: 'op2',
        kind: 'payload',
        target_field: 'osc',
        proposed_value: { type: 'osc', address: '/test', args: [] },
      }),
    ).not.toThrow();

    expect(pendingProposalCount(doc)).toBe(1);
  });
});

describe('proposals — Yjs sync (CRDT)', () => {
  it('proposals sync between two Y.Doc instances via state vectors', () => {
    const doc1 = makeDoc();
    const doc2 = new Y.Doc();
    const update = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update);

    const cuelistId = (doc2.getArray('cuelists').get(0) as Y.Map<unknown>).get('id') as string;
    const cueId = addCue(doc1, cuelistId, { label: 'Cue 1', department: ['LX'], created_by: 'op1' });

    addProposal(doc1, {
      cue_id: cueId,
      cuelist_id: cuelistId,
      author_operator_id: 'op2',
      kind: 'cue',
      target_field: 'label',
      proposed_value: 'Synced label',
    });

    // Sync doc1 → doc2
    const update2 = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update2);

    const proposals2 = listProposals(doc2);
    expect(proposals2).toHaveLength(1);
    expect(proposals2[0].status).toBe('pending');
    expect(proposals2[0].target_field).toBe('label');
  });
});
