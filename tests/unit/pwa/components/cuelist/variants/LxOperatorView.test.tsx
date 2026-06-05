// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { LxOperatorView } from '../../../../../../pwa/src/components/cuelist/variants/LxOperatorView.js';
import { VideoOperatorView } from '../../../../../../pwa/src/components/cuelist/variants/VideoOperatorView.js';
import { ConnectionContext } from '../../../helpers/connectionContext.js';
import { makeTestConnection } from '../../../helpers/makeTestConnection.js';

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

type CueOpts = {
  dept?: string[];
  payloads?: unknown[];
  duration_hint_ms?: number | null;
};

function addCuelist(
  doc: Y.Doc,
  id: string,
  opts: { go_authority?: string } = {},
) {
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
  cue.set('department', opts.dept ?? ['SM']);
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

function LxWrapper({
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
      <LxOperatorView cuelistId={cuelistId} watched={watched} />
    </ConnectionContext.Provider>
  );
}

function VideoWrapper({
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

// ── LxOperatorView tests ──────────────────────────────────────────────────────

describe('LxOperatorView', () => {
  it('renders LX cues; hides pure-SX cues', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Scene 1', { dept: ['LX'] });
    addCue(conn.doc, 'cl1', 'q2', 'SX Only', { dept: ['SX'] });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    const grid = screen.getByRole('grid', { name: /LX operator view/i });
    expect(within(grid).getByText('Scene 1')).toBeInTheDocument();
    expect(within(grid).queryByText('SX Only')).toBeNull();
  });

  it('renders SM cues as context (watched)', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'SM Cue', { dept: ['SM'] });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    const grid = screen.getByRole('grid', { name: /LX operator view/i });
    expect(within(grid).getByText('SM Cue')).toBeInTheDocument();
  });

  it('LX-owned cue GO button enabled; SM-watched cue GO button disabled', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'LX Cue', { dept: ['LX'] });
    addCue(conn.doc, 'cl1', 'q2', 'SM Cue', { dept: ['SM'] });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    const rows = screen.getAllByRole('row');
    const lxRow = rows.find((r) => within(r).queryByText('LX Cue'));
    const smRow = rows.find((r) => within(r).queryByText('SM Cue'));
    // LX row: GO button enabled
    const lxGoBtn = within(lxRow!).getByRole('button', { name: /Confirm LX Cue/i });
    expect(lxGoBtn).not.toBeDisabled();
    // SM row: GO button disabled (not actionable)
    const smGoBtn = within(smRow!).getByRole('button', { name: /Confirm SM Cue/i });
    expect(smGoBtn).toBeDisabled();
  });

  it('cue with lx_ref payload shows Eos cue ref in Eos column', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Act 1', {
      dept: ['LX'],
      payloads: [
        {
          id: 'p1',
          type: 'lx_ref',
          tag: 'LX',
          note: '',
          device_id: 'd1',
          cue_list: 1,
          cue_number: 47,
        },
      ],
    });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByText('Cue 1/47')).toBeInTheDocument();
  });

  it('compound cue (LX+SX): LX payload highlighted, SX payload dimmed', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Compound', {
      dept: ['LX', 'SX'],
      payloads: [
        { id: 'p1', type: 'lx_ref', tag: 'LX', note: '', device_id: 'd1', cue_list: 1, cue_number: 100 },
        { id: 'p2', type: 'osc', tag: 'SX', note: '', device_id: 'd2', address: '/sx/go', args: [] },
      ],
    });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    // LX payload chip (Eos 1/100) should be highlighted (fontWeight 700)
    const lxChip = screen.getByText('Eos 1/100');
    expect(lxChip.style.fontWeight).toBe('700');
    // SX payload chip (/sx/go) should be dimmed (fontWeight 400)
    const sxChip = screen.getByText('/sx/go');
    expect(sxChip.style.fontWeight).toBe('400');
  });

  it('go_authority=sm_called → button label "Confirm"', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1', { go_authority: 'sm_called' });
    addCue(conn.doc, 'cl1', 'q1', 'LX Cue', { dept: ['LX'] });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByRole('button', { name: /Confirm LX Cue/i })).toBeInTheDocument();
  });

  it('go_authority=per_dept → button label "GO"', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1', { go_authority: 'per_dept' });
    addCue(conn.doc, 'cl1', 'q1', 'LX Cue', { dept: ['LX'] });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByRole('button', { name: /^GO LX Cue$/i })).toBeInTheDocument();
  });

  it('non-LX-owned cue row has opacity 0.4', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'SM Context', { dept: ['SM'] });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    const row = screen.getByRole('row', { name: /Cue SM Context/i });
    expect(row.style.opacity).toBe('0.4');
  });

  it('LX-owned cue row has opacity 1', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'My LX Cue', { dept: ['LX'] });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    const row = screen.getByRole('row', { name: /Cue My LX Cue/i });
    expect(row.style.opacity).toBe('1');
  });
});

// ── Multi-operator interaction ────────────────────────────────────────────────

describe('Multi-operator isolation', () => {
  it('LX op sees LX cues; VIDEO op sees VIDEO cues; both see SM cues', () => {
    const lxConn = makeTestConnection();
    const videoConn = makeTestConnection();

    // Sync both conns to same document state
    addCuelist(lxConn.doc, 'cl1');
    addCue(lxConn.doc, 'cl1', 'q1', 'LX Only', { dept: ['LX'] });
    addCue(lxConn.doc, 'cl1', 'q2', 'VIDEO Only', { dept: ['VIDEO'] });
    addCue(lxConn.doc, 'cl1', 'q3', 'SM Global', { dept: ['SM'] });

    // Simulate same doc in video conn
    addCuelist(videoConn.doc, 'cl1');
    addCue(videoConn.doc, 'cl1', 'q1', 'LX Only', { dept: ['LX'] });
    addCue(videoConn.doc, 'cl1', 'q2', 'VIDEO Only', { dept: ['VIDEO'] });
    addCue(videoConn.doc, 'cl1', 'q3', 'SM Global', { dept: ['SM'] });

    const { unmount: unmountLx } = render(
      <ConnectionContext.Provider value={lxConn}>
        <LxOperatorView cuelistId="cl1" watched={['SM']} />
      </ConnectionContext.Provider>,
    );
    const lxGrid = screen.getByRole('grid', { name: /LX operator view/i });
    expect(within(lxGrid).getByText('LX Only')).toBeInTheDocument();
    expect(within(lxGrid).queryByText('VIDEO Only')).toBeNull();
    expect(within(lxGrid).getByText('SM Global')).toBeInTheDocument();
    unmountLx();
    cleanup();

    render(
      <ConnectionContext.Provider value={videoConn}>
        <VideoOperatorView cuelistId="cl1" watched={['SM']} />
      </ConnectionContext.Provider>,
    );
    const videoGrid = screen.getByRole('grid', { name: /VIDEO operator view/i });
    expect(within(videoGrid).queryByText('LX Only')).toBeNull();
    expect(within(videoGrid).getByText('VIDEO Only')).toBeInTheDocument();
    expect(within(videoGrid).getByText('SM Global')).toBeInTheDocument();
  });

  it('SM-only cue greyed in LX view (not owned)', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'SM Only', { dept: ['SM'] });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    const row = screen.getByRole('row', { name: /Cue SM Only/i });
    expect(row.style.opacity).toBe('0.4');
  });

  it('compound cue [LX,SX] visible in LX view; highlights LX payload only', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Shared', {
      dept: ['LX', 'SX'],
      payloads: [
        { id: 'p1', type: 'lx_ref', tag: 'LX', note: '', device_id: 'd1', cue_list: 2, cue_number: 5 },
        { id: 'p2', type: 'osc', tag: 'SX', note: '', device_id: 'd2', address: '/sfx/go', args: [] },
      ],
    });
    render(<LxWrapper cuelistId="cl1" conn={conn} />);
    const grid = screen.getByRole('grid', { name: /LX operator view/i });
    expect(within(grid).getByText('Shared')).toBeInTheDocument();
    // LX payload highlighted
    const lxChip = screen.getByText('Eos 2/5');
    expect(lxChip.style.fontWeight).toBe('700');
    // SX payload dimmed
    const sxChip = screen.getByText('/sfx/go');
    expect(sxChip.style.fontWeight).toBe('400');
  });
});

// ── VideoOperatorView tests ───────────────────────────────────────────────────

describe('VideoOperatorView', () => {
  it('cue with OSC /cue/preshow/start shows "start" in Asset column', () => {
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
    render(<VideoWrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByText('start')).toBeInTheDocument();
  });

  it('cue with duration_hint_ms=5000 shows "5s" Duration column', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Long Clip', {
      dept: ['VIDEO'],
      duration_hint_ms: 5000,
    });
    render(<VideoWrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByText('5s')).toBeInTheDocument();
  });
});

// ── PyroOperatorView tests ────────────────────────────────────────────────────

import { PyroOperatorView } from '../../../../../../pwa/src/components/cuelist/variants/PyroOperatorView.js';
import { act, fireEvent } from '@testing-library/react';

function PyroWrapper({ cuelistId, conn }: { cuelistId: string; conn: ReturnType<typeof makeTestConnection> }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <PyroOperatorView cuelistId={cuelistId} watched={['SM']} />
    </ConnectionContext.Provider>
  );
}

describe('PyroOperatorView', () => {
  it('renders safety warning header', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    render(<PyroWrapper cuelistId="cl1" conn={conn} />);
    expect(screen.getByText(/DOUBLE-TAP FIRE/i)).toBeInTheDocument();
  });

  it('Fire button disabled until Arm is pressed', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1', { go_authority: 'sm_called' });
    addCue(conn.doc, 'cl1', 'q1', 'Shot 1', { dept: ['PYRO'] });
    render(<PyroWrapper cuelistId="cl1" conn={conn} />);
    const fireBtn = screen.getByRole('button', { name: /Fire Shot 1/i });
    expect(fireBtn).toBeDisabled();
  });

  it('Arm then Fire dispatches go; arm state cleared', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1', { go_authority: 'sm_called' });
    addCue(conn.doc, 'cl1', 'q1', 'Finale', { dept: ['PYRO'] });
    render(<PyroWrapper cuelistId="cl1" conn={conn} />);

    const armBtn = screen.getByRole('button', { name: /Arm Finale/i });
    const fireBtn = screen.getByRole('button', { name: /Fire Finale/i });

    await act(async () => { fireEvent.click(armBtn); });
    expect(fireBtn).not.toBeDisabled();

    await act(async () => { fireEvent.click(fireBtn); });
    expect(conn.sideChannel.sendGoRequest).toHaveBeenCalledWith('cl1', 'q1', false);
    // After fire, arm state cleared → fire button disabled again
    expect(fireBtn).toBeDisabled();
  });

  it('Fire without Arm does not dispatch go', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1', { go_authority: 'sm_called' });
    addCue(conn.doc, 'cl1', 'q1', 'Shot 2', { dept: ['PYRO'] });
    render(<PyroWrapper cuelistId="cl1" conn={conn} />);
    const fireBtn = screen.getByRole('button', { name: /Fire Shot 2/i });
    // Attempt click while disabled
    await act(async () => { fireEvent.click(fireBtn); });
    expect(conn.sideChannel.sendGoRequest).not.toHaveBeenCalled();
  });
});
