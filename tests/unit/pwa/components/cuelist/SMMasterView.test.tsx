// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup, within } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { SMMasterView } from '../../../../../pwa/src/components/cuelist/SMMasterView.js';
import { ConnectionContext } from '../../helpers/connectionContext.js';
import { makeTestConnection } from '../../helpers/makeTestConnection.js';

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

function addCuelist(doc: Y.Doc, id: string, name = 'Show A') {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', name);
  cl.set('default_trigger', 'manual');
  cl.set('go_authority', 'sm');
  cl.set('playhead', { cue_id: null, armed_cue_id: null });
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(
  doc: Y.Doc,
  cuelistId: string,
  id: string,
  label: string,
  opts: { dept?: string[]; description?: string; standbyNote?: string } = {},
) {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', id);
  cue.set('label', label);
  cue.set('description', opts.description ?? '');
  cue.set('department', opts.dept ?? ['SM']);
  cue.set('standby_note', opts.standbyNote ?? '');
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

function Wrapper({ cuelistId, conn }: { cuelistId: string; conn: ReturnType<typeof makeTestConnection> }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <SMMasterView cuelistId={cuelistId} />
    </ConnectionContext.Provider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SMMasterView', () => {
  it('renders all cues from useCuelist', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Overture');
    addCue(conn.doc, 'cl1', 'q2', 'Scene 1');
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    // Labels appear in the cue list (as 24px bold elements)
    const grid = screen.getByRole('grid');
    expect(within(grid).getByText('Overture')).toBeInTheDocument();
    expect(within(grid).getByText('Scene 1')).toBeInTheDocument();
  });

  it('filters cues by label when searching', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Overture');
    addCue(conn.doc, 'cl1', 'q2', 'Blackout');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    const input = screen.getByRole('searchbox', { name: /search cues/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'over' } });
    });

    const grid = screen.getByRole('grid');
    expect(within(grid).getByText('Overture')).toBeInTheDocument();
    expect(within(grid).queryByText('Blackout')).toBeNull();
  });

  it('filters cues by description when searching', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue A', { description: 'house to half' });
    addCue(conn.doc, 'cl1', 'q2', 'Cue B', { description: 'spots on' });
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    const input = screen.getByRole('searchbox', { name: /search cues/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'house' } });
    });

    const grid = screen.getByRole('grid');
    expect(within(grid).getByText('Cue A')).toBeInTheDocument();
    expect(within(grid).queryByText('Cue B')).toBeNull();
  });

  it('shows empty state when cuelist has no cues', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByText(/No cues yet/)).toBeInTheDocument();
  });

  it('ArrowDown moves playhead to first cue', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'First Cue');
    addCue(conn.doc, 'cl1', 'q2', 'Second Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
    });

    // First row should now be selected
    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    expect(rows[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowDown then ArrowDown moves playhead to second cue', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'First Cue');
    addCue(conn.doc, 'cl1', 'q2', 'Second Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
    });

    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveAttribute('aria-selected', 'false');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowUp from first cue stays on first cue', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'First Cue');
    addCue(conn.doc, 'cl1', 'q2', 'Second Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    // Move to first cue then up
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowUp' });
    });

    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('Q key calls sendArmRequest for playhead cue', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Target Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    // Navigate to first cue
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
    });
    // Press Q to arm
    await act(async () => {
      fireEvent.keyDown(window, { code: 'KeyQ' });
    });

    expect(conn.sideChannel.sendArmRequest).toHaveBeenCalledWith('cl1', 'q1');
  });

  it('Space fires the armed cue via sendGoRequest', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Fire This');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    // Navigate and arm
    await act(async () => {
      fireEvent.keyDown(window, { code: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(window, { code: 'KeyQ' });
    });
    // Fire
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space' });
    });

    expect(conn.sideChannel.sendGoRequest).toHaveBeenCalledWith('cl1', 'q1', false);
  });

  it('clicking a row sets it as selected (aria-selected="true")', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Click Me');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    const rows = screen.getAllByRole('row');
    await act(async () => {
      fireEvent.click(rows[0]);
    });
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('renders lock icons when mode is show', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Locked Cue');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    await act(async () => {
      conn.doc.transact(() => conn.doc.getMap('meta').set('mode', 'show'));
    });

    expect(screen.getByLabelText('Payload locked')).toBeInTheDocument();
  });

  it('keyboard shortcuts do not fire when typing in search box', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'First');
    addCue(conn.doc, 'cl1', 'q2', 'Second');
    render(<Wrapper cuelistId="cl1" conn={conn} />);

    const input = screen.getByRole('searchbox', { name: /search cues/i });
    input.focus();

    await act(async () => {
      // Fire ArrowDown with target = the INPUT element
      fireEvent.keyDown(input, { code: 'ArrowDown' });
    });

    // Playhead should not have moved — all rows remain unselected
    const rows = screen.getAllByRole('row');
    rows.forEach((row) => {
      expect(row).toHaveAttribute('aria-selected', 'false');
    });
  });

  it('renders search input with aria-label', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    render(<Wrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByRole('searchbox', { name: /search cues/i })).toBeInTheDocument();
  });
});
