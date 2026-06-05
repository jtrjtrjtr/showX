// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { CueEditor } from '../../../../../pwa/src/components/cuelist/CueEditor.js';
import { ConnectionContext } from '../../helpers/connectionContext.js';
import { makeTestConnection } from '../../helpers/makeTestConnection.js';

afterEach(() => cleanup());

function addCuelist(doc: Y.Doc, id: string) {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', 'Test Show');
  cl.set('default_trigger', 'manual');
  cl.set('go_authority', 'sm');
  cl.set('playhead', { cue_id: null, armed_cue_id: null });
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(doc: Y.Doc, cuelistId: string, id: string, label: string) {
  const cl = doc.getArray<Y.Map<unknown>>('cuelists').toArray().find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', id);
  cue.set('label', label);
  cue.set('description', '');
  cue.set('department', ['SM']);
  cue.set('standby_note', '');
  cue.set('trigger', { kind: 'manual' });
  cue.set('payloads', new Y.Array<Y.Map<unknown>>());
  cue.set('notes', '');
  cue.set('script_line_ref', null);
  cue.set('duration_hint_ms', null);
  cue.set('payload_frozen_at', null);
  cue.set('created_at', '2026-01-01T00:00:00Z');
  cue.set('created_by', 'test');
  cue.set('modified_at', '2026-01-01T00:00:00Z');
  cue.set('modified_by', 'test');
  cue.set('sort_key', 1000);
  doc.transact(() => (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]));
}

function Wrapper({ cuelistId, cueId, onClose, conn }: {
  cuelistId: string;
  cueId: string;
  onClose: () => void;
  conn: ReturnType<typeof makeTestConnection>;
}) {
  return (
    <ConnectionContext.Provider value={conn}>
      <CueEditor cuelistId={cuelistId} cueId={cueId} onClose={onClose} />
    </ConnectionContext.Provider>
  );
}

describe('CueEditor', () => {
  it('renders cue label in header', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Opening Lights');
    render(<Wrapper cuelistId="cl1" cueId="q1" onClose={() => {}} conn={conn} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Opening Lights')).toBeInTheDocument();
  });

  it('shows SHOW mode lock banner when mode is show', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Scene 1');

    await act(async () => {
      conn.doc.transact(() => conn.doc.getMap('meta').set('mode', 'show'));
    });

    render(<Wrapper cuelistId="cl1" cueId="q1" onClose={() => {}} conn={conn} />);
    expect(screen.getByRole('status', { name: /SHOW mode lock banner/i })).toBeInTheDocument();
    expect(screen.getByText(/Propose change/i)).toBeInTheDocument();
  });

  it('does not show lock banner in rehearsal mode', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Scene 1');
    render(<Wrapper cuelistId="cl1" cueId="q1" onClose={() => {}} conn={conn} />);
    expect(screen.queryByRole('status', { name: /SHOW mode lock banner/i })).toBeNull();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue A');
    render(<Wrapper cuelistId="cl1" cueId="q1" onClose={onClose} conn={conn} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /close editor/i }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('delete button opens DeleteConfirmDialog', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue to Delete');
    render(<Wrapper cuelistId="cl1" cueId="q1" onClose={() => {}} conn={conn} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete cue/i }));
    });

    expect(screen.getByRole('dialog', { name: /confirm delete cue/i })).toBeInTheDocument();
    expect(screen.getByText(/"Cue to Delete"/)).toBeInTheDocument();
  });

  it('confirm delete removes cue and calls onClose', async () => {
    const onClose = vi.fn();
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Expendable Cue');
    render(<Wrapper cuelistId="cl1" cueId="q1" onClose={onClose} conn={conn} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete cue/i }));
    });

    // Confirm the deletion
    await act(async () => {
      const buttons = screen.getAllByRole('button', { name: /delete cue/i });
      // The last one is in the confirm dialog
      fireEvent.click(buttons[buttons.length - 1]);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    // Cue should be gone from the doc
    const cl = conn.doc.getArray<Y.Map<unknown>>('cuelists').toArray().find((m) => m.get('id') === 'cl1')!;
    const cues = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray();
    expect(cues.find((c) => c.get('id') === 'q1')).toBeUndefined();
  });

  it('returns null when cue does not exist', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    const { container } = render(<Wrapper cuelistId="cl1" cueId="nonexistent" onClose={() => {}} conn={conn} />);
    expect(container.firstChild).toBeNull();
  });
});
