// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { usePlayhead, type PlayheadState } from '../../../../pwa/src/hooks/usePlayhead.js';
import { ConnectionContext } from '../helpers/connectionContext.js';
import { makeTestConnection } from '../helpers/makeTestConnection.js';

afterEach(() => cleanup());

function addCuelist(doc: Y.Doc, id: string): Y.Map<unknown> {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', 'Test');
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  cl.set('playhead', { cue_id: null, armed_cue_id: null });
  doc.transact(() => doc.getArray('cuelists').push([cl]));
  return cl;
}

function addCue(doc: Y.Doc, clId: string, cueId: string, label: string) {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === clId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', cueId);
  cue.set('label', label);
  cue.set('department', ['SM']);
  cue.set('payloads', []);
  cue.set('description', '');
  cue.set('standby_note', '');
  cue.set('trigger', { kind: 'manual' });
  cue.set('notes', '');
  cue.set('script_line_ref', null);
  cue.set('duration_hint_ms', null);
  cue.set('payload_frozen_at', null);
  cue.set('created_at', '2026-01-01T00:00:00Z');
  cue.set('created_by', 'test');
  cue.set('modified_at', '2026-01-01T00:00:00Z');
  cue.set('modified_by', 'test');
  doc.transact(() => (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]));
}

function getPlayhead(doc: Y.Doc, clId: string): { cue_id: string | null; armed_cue_id: string | null } {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === clId)!;
  return cl.get('playhead') as { cue_id: string | null; armed_cue_id: string | null };
}

function PlayheadCapture({
  cuelistId,
  onState,
}: {
  cuelistId: string;
  onState: (s: PlayheadState) => void;
}) {
  const state = usePlayhead(cuelistId);
  onState(state);
  return null;
}

describe('usePlayhead', () => {
  it('advance moves to next cue and wraps at end', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');
    addCue(conn.doc, 'cl1', 'q2', 'Cue 2');

    let state: PlayheadState | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { state = s; }} />
      </ConnectionContext.Provider>,
    );

    // Start: playhead null → advance → q1
    await act(async () => { state!.advance(); });
    expect(getPlayhead(conn.doc, 'cl1').cue_id).toBe('q1');

    // advance again → q2
    await act(async () => { state!.advance(); });
    expect(getPlayhead(conn.doc, 'cl1').cue_id).toBe('q2');

    // advance from last → wraps to q1
    await act(async () => { state!.advance(); });
    expect(getPlayhead(conn.doc, 'cl1').cue_id).toBe('q1');
  });

  it('retreat moves to prev and wraps at beginning', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');
    addCue(conn.doc, 'cl1', 'q2', 'Cue 2');

    let state: PlayheadState | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { state = s; }} />
      </ConnectionContext.Provider>,
    );

    // advance to q1 first
    await act(async () => { state!.advance(); });
    expect(getPlayhead(conn.doc, 'cl1').cue_id).toBe('q1');

    // retreat from q1 (idx=0) → wraps to last cue (q2)
    await act(async () => { state!.retreat(); });
    expect(getPlayhead(conn.doc, 'cl1').cue_id).toBe('q2');
  });

  it('arm sets cuelist.playhead.armed_cue_id in Yjs', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');

    let state: PlayheadState | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { state = s; }} />
      </ConnectionContext.Provider>,
    );

    await act(async () => { state!.arm('q1'); });
    expect(getPlayhead(conn.doc, 'cl1').armed_cue_id).toBe('q1');
  });

  it('unarm sets cuelist.playhead.armed_cue_id to null', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');

    let state: PlayheadState | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { state = s; }} />
      </ConnectionContext.Provider>,
    );

    await act(async () => { state!.arm('q1'); });
    expect(getPlayhead(conn.doc, 'cl1').armed_cue_id).toBe('q1');

    await act(async () => { state!.unarm(); });
    expect(getPlayhead(conn.doc, 'cl1').armed_cue_id).toBeNull();
  });

  it('setPlayhead updates cuelist.playhead.cue_id via Yjs', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue 1');
    addCue(conn.doc, 'cl1', 'q2', 'Cue 2');

    let state: PlayheadState | null = null;
    render(
      <ConnectionContext.Provider value={conn}>
        <PlayheadCapture cuelistId="cl1" onState={(s) => { state = s; }} />
      </ConnectionContext.Provider>,
    );

    await act(async () => { state!.setPlayhead('q2'); });
    expect(getPlayhead(conn.doc, 'cl1').cue_id).toBe('q2');
  });

  it('playhead changes propagate from one Yjs doc to another (two stations)', async () => {
    const conn1 = makeTestConnection();
    const conn2 = makeTestConnection();

    // Wire the two docs: any update from doc1 applied to doc2 and vice versa
    conn1.doc.on('update', (update: Uint8Array) => Y.applyUpdate(conn2.doc, update));
    conn2.doc.on('update', (update: Uint8Array) => Y.applyUpdate(conn1.doc, update));

    // Seed doc1 with a cuelist
    addCuelist(conn1.doc, 'cl1');
    addCue(conn1.doc, 'cl1', 'q1', 'Cue 1');
    addCue(conn1.doc, 'cl1', 'q2', 'Cue 2');

    let state1: PlayheadState | null = null;
    let state2: PlayheadState | null = null;

    render(
      <>
        <ConnectionContext.Provider value={conn1}>
          <PlayheadCapture cuelistId="cl1" onState={(s) => { state1 = s; }} />
        </ConnectionContext.Provider>
        <ConnectionContext.Provider value={conn2}>
          <PlayheadCapture cuelistId="cl1" onState={(s) => { state2 = s; }} />
        </ConnectionContext.Provider>
      </>,
    );

    // Station 1 advances playhead
    await act(async () => { state1!.advance(); });

    // Station 2 should see the change via Yjs sync
    expect(getPlayhead(conn2.doc, 'cl1').cue_id).toBe('q1');
    expect(state2!.playheadCueId).toBe('q1');
  });
});
