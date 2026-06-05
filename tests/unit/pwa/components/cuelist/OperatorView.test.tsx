// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { OperatorView } from '../../../../../pwa/src/components/cuelist/OperatorView.js';
import { ConnectionContext } from '../../helpers/connectionContext.js';
import { makeTestConnection } from '../../helpers/makeTestConnection.js';

afterEach(() => cleanup());

function addCuelist(doc: Y.Doc, id: string) {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', 'Test');
  cl.set('default_trigger', 'manual');
  cl.set('go_authority', 'sm_called');
  cl.set('playhead', { cue_id: null, armed_cue_id: null });
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(doc: Y.Doc, cuelistId: string, id: string, dept: string[]) {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', id);
  cue.set('label', id);
  cue.set('description', '');
  cue.set('department', dept);
  cue.set('standby_note', '');
  cue.set('trigger', { kind: 'manual' });
  cue.set('payloads', []);
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

function Wrapper({
  cuelistId,
  owned,
  watched,
  conn,
}: {
  cuelistId: string;
  owned: string[];
  watched: string[];
  conn: ReturnType<typeof makeTestConnection>;
}) {
  return (
    <ConnectionContext.Provider value={conn}>
      <OperatorView cuelistId={cuelistId} owned={owned} watched={watched} />
    </ConnectionContext.Provider>
  );
}

describe('OperatorView — variant routing', () => {
  it('single-owned LX renders LX operator view', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', ['LX']);
    render(<Wrapper cuelistId="cl1" owned={['LX']} watched={['SM']} conn={conn} />);
    expect(screen.getByRole('grid', { name: /LX operator view/i })).toBeInTheDocument();
  });

  it('single-owned SX renders SX operator view', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    render(<Wrapper cuelistId="cl1" owned={['SX']} watched={['SM']} conn={conn} />);
    expect(screen.getByRole('grid', { name: /SX operator view/i })).toBeInTheDocument();
  });

  it('multi-owned [LX, SX, VIDEO] renders generic operator view', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    render(
      <Wrapper cuelistId="cl1" owned={['LX', 'SX', 'VIDEO']} watched={['SM']} conn={conn} />,
    );
    expect(screen.getByRole('grid', { name: /LX · SX · VIDEO operator view/i })).toBeInTheDocument();
  });

  it('owned=[] renders generic operator view (read-only/watcher)', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    render(<Wrapper cuelistId="cl1" owned={[]} watched={['SM', 'LX']} conn={conn} />);
    expect(screen.getByRole('grid', { name: /operator view/i })).toBeInTheDocument();
  });
});
