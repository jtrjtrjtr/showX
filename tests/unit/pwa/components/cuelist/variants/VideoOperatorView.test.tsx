// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { VideoOperatorView } from '../../../../../../pwa/src/components/cuelist/variants/VideoOperatorView.js';
import { ConnectionContext } from '../../../helpers/connectionContext.js';
import { makeTestConnection } from '../../../helpers/makeTestConnection.js';

afterEach(() => cleanup());

type CueOpts = {
  dept?: string[];
  payloads?: unknown[];
  duration_hint_ms?: number | null;
};

function addCuelist(doc: Y.Doc, id: string, opts: { go_authority?: string } = {}) {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', 'Test');
  cl.set('default_trigger', 'manual');
  cl.set('go_authority', opts.go_authority ?? 'sm_called');
  cl.set('playhead', { cue_id: null, armed_cue_id: null });
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(
  doc: Y.Doc,
  cuelistId: string,
  id: string,
  label: string,
  opts: CueOpts = {},
) {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', id);
  cue.set('label', label);
  cue.set('description', '');
  cue.set('department', opts.dept ?? ['VIDEO']);
  cue.set('standby_note', '');
  cue.set('trigger', { kind: 'manual' });
  cue.set('payloads', opts.payloads ?? []);
  cue.set('notes', '');
  cue.set('script_line_ref', null);
  cue.set('duration_hint_ms', opts.duration_hint_ms ?? null);
  cue.set('payload_frozen_at', null);
  cue.set('created_at', '2026-01-01T00:00:00Z');
  cue.set('created_by', 'test');
  cue.set('modified_at', '2026-01-01T00:00:00Z');
  cue.set('modified_by', 'test');
  doc.transact(() => (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]));
}

function Wrapper({
  cuelistId,
  conn,
  watched = ['SM'],
}: {
  cuelistId: string;
  conn: ReturnType<typeof makeTestConnection>;
  watched?: string[];
}) {
  return (
    <ConnectionContext.Provider value={conn}>
      <VideoOperatorView cuelistId={cuelistId} watched={watched} />
    </ConnectionContext.Provider>
  );
}

describe('VideoOperatorView', () => {
  it('renders VIDEO cues; hides non-VIDEO non-watched cues', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Trailer', { dept: ['VIDEO'] });
    addCue(conn.doc, 'cl1', 'q2', 'LX Only', { dept: ['LX'] });
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    const grid = screen.getByRole('grid', { name: /VIDEO operator view/i });
    expect(within(grid).getByText('Trailer')).toBeInTheDocument();
    expect(within(grid).queryByText('LX Only')).toBeNull();
  });

  it('OSC address /cue/preshow/start → Asset column shows "start"', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Preshow', {
      dept: ['VIDEO'],
      payloads: [
        {
          id: 'p1',
          type: 'osc',
          tag: null,
          note: '',
          device_id: 'd1',
          address: '/cue/preshow/start',
          args: [],
        },
      ],
    });
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByText('start')).toBeInTheDocument();
  });

  it('duration_hint_ms=5000 shows "5s" in Duration column', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Long Clip', {
      dept: ['VIDEO'],
      duration_hint_ms: 5000,
    });
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByText('5s')).toBeInTheDocument();
  });

  it('duration_hint_ms=null shows no Duration column', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Short Clip', {
      dept: ['VIDEO'],
      duration_hint_ms: null,
    });
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    expect(screen.queryByText('Duration:')).toBeNull();
  });

  it('non-VIDEO cue (SM watched) is greyed (opacity 0.4)', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'SM Cue', { dept: ['SM'] });
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    const row = screen.getByRole('row', { name: /Cue SM Cue/i });
    expect(row.style.opacity).toBe('0.4');
  });

  it('VIDEO cue row has opacity 1', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'My Video', { dept: ['VIDEO'] });
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    const row = screen.getByRole('row', { name: /Cue My Video/i });
    expect(row.style.opacity).toBe('1');
  });

  it('go_authority=per_dept → button label "GO"', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1', { go_authority: 'per_dept' });
    addCue(conn.doc, 'cl1', 'q1', 'Clip A', { dept: ['VIDEO'] });
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByRole('button', { name: /^GO Clip A$/i })).toBeInTheDocument();
  });

  it('go_authority=sm_called → button label "Confirm"', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1', { go_authority: 'sm_called' });
    addCue(conn.doc, 'cl1', 'q1', 'Clip B', { dept: ['VIDEO'] });
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByRole('button', { name: /Confirm Clip B/i })).toBeInTheDocument();
  });
});
