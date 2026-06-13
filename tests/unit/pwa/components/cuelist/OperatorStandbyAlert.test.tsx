// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup, within } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { OperatorView } from '../../../../../pwa/src/components/cuelist/OperatorView.js';
import { ConnectionContext } from '../../helpers/connectionContext.js';
import { makeTestConnection } from '../../helpers/makeTestConnection.js';
import type { StandbyBroadcast, GoDispatched } from '../../../../../pwa/src/lib/sideChannel.js';

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

function addCuelist(doc: Y.Doc, id: string) {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', 'Test Show');
  cl.set('default_trigger', 'manual');
  cl.set('go_authority', 'sm_called');
  cl.set('playhead', { cue_id: null, armed_cue_id: null });
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(doc: Y.Doc, cuelistId: string, id: string, label: string, dept: string[] = ['SM']) {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', id);
  cue.set('label', label);
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
  conn,
  owned,
  cuelistId = 'cl1',
}: {
  conn: ReturnType<typeof makeTestConnection>;
  owned: string[];
  cuelistId?: string;
}) {
  return (
    <ConnectionContext.Provider value={conn}>
      <OperatorView cuelistId={cuelistId} owned={owned} watched={['SM']} />
    </ConnectionContext.Provider>
  );
}

// Fire a side channel event through the vi.fn mock
function fireEvent_sideChannel<T>(
  conn: ReturnType<typeof makeTestConnection>,
  event: string,
  payload: T,
) {
  const calls = (conn.sideChannel.on as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    (p: T) => void,
  ][];
  for (const [evt, handler] of calls) {
    if (evt === event) handler(payload);
  }
}

function fireStandby(
  conn: ReturnType<typeof makeTestConnection>,
  payload: Omit<StandbyBroadcast, 'topic'>,
) {
  fireEvent_sideChannel<StandbyBroadcast>(conn, 'standby.broadcast', {
    topic: 'standby.broadcast',
    ...payload,
  });
}

function fireGoDispatched(
  conn: ReturnType<typeof makeTestConnection>,
  cueId: string,
) {
  fireEvent_sideChannel<GoDispatched>(conn, 'go.dispatched', {
    topic: 'go.dispatched',
    request_id: 'req-1',
    cue_id: cueId,
    cuelist_id: 'cl1',
    sequence: 1,
    dispatched_at: new Date().toISOString(),
    payloads_dispatched: 1,
    payloads_failed: [],
    fired_by: { station_id: 'st1', operator_id: 'op1' },
    historic: false,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OperatorStandbyAlert — standby for owned dept shows panel + Acknowledge', () => {
  it('shows standby alert with cue label when standby arrives for owned dept', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Act One Lights', ['LX']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    expect(screen.queryByTestId('operator-standby-alert')).toBeNull();

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });

    const alert = screen.getByTestId('operator-standby-alert');
    expect(alert).toBeInTheDocument();
    expect(within(alert).getByText('Act One Lights')).toBeInTheDocument();
    expect(within(alert).getByTestId('operator-ack-btn')).toBeInTheDocument();
  });

  it('shows department label in standby alert', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Scene 1', ['SX']);
    render(<Wrapper conn={conn} owned={['SX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['SX'], standby: true });
    });

    expect(screen.getByText(/SX.*STANDBY/i)).toBeInTheDocument();
  });
});

describe('OperatorStandbyAlert — Acknowledge publishes correct message', () => {
  it('clicking Acknowledge sends operator.acknowledge with correct fields', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q2', 'Preshow', ['LX']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q2', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('operator-ack-btn'));
    });

    expect(conn.sideChannel.sendAcknowledgeRequest).toHaveBeenCalledWith('cl1', 'q2', 'LX');
  });

  it('after acknowledge, panel shows READY state (not the ACKNOWLEDGE button)', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q3', 'Blackout', ['LX']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q3', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('operator-ack-btn'));
    });

    expect(screen.getByTestId('operator-standby-ready')).toBeInTheDocument();
    expect(screen.getByText(/READY.*waiting for GO/i)).toBeInTheDocument();
    expect(screen.queryByTestId('operator-ack-btn')).toBeNull();
  });
});

describe('OperatorStandbyAlert — standby for non-owned dept shows nothing', () => {
  it('standby for VIDEO dept not shown to LX operator', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Video Cue', ['VIDEO']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['VIDEO'], standby: true });
    });

    expect(screen.queryByTestId('operator-standby-alert')).toBeNull();
    expect(screen.queryByTestId('operator-standby-ready')).toBeNull();
  });

  it('standby for SM dept not shown to LX operator', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'SM Cue', ['SM']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['SM'], standby: true });
    });

    expect(screen.queryByTestId('operator-standby-alert')).toBeNull();
  });
});

describe('OperatorStandbyAlert — GO/clear returns panel to idle', () => {
  it('standby=false clears the alert', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'House Open', ['LX']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });
    expect(screen.getByTestId('operator-standby-alert')).toBeInTheDocument();

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['LX'], standby: false });
    });
    expect(screen.queryByTestId('operator-standby-alert')).toBeNull();
    expect(screen.queryByTestId('operator-standby-ready')).toBeNull();
  });

  it('go.dispatched clears the alert', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Finale', ['LX']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });
    expect(screen.getByTestId('operator-standby-alert')).toBeInTheDocument();

    await act(async () => {
      fireGoDispatched(conn, 'q1');
    });
    expect(screen.queryByTestId('operator-standby-alert')).toBeNull();
    expect(screen.queryByTestId('operator-standby-ready')).toBeNull();
  });

  it('go.dispatched clears acknowledged READY state', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Act Two', ['LX']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('operator-ack-btn'));
    });
    expect(screen.getByTestId('operator-standby-ready')).toBeInTheDocument();

    await act(async () => {
      fireGoDispatched(conn, 'q1');
    });
    expect(screen.queryByTestId('operator-standby-ready')).toBeNull();
  });
});

describe('OperatorStandbyAlert — multiple sequential standbys', () => {
  it('second standby replaces first standby', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Cue Alpha', ['LX']);
    addCue(conn.doc, 'cl1', 'q2', 'Cue Beta', ['LX']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });
    const alert1 = screen.getByTestId('operator-standby-alert');
    expect(within(alert1).getByText('Cue Alpha')).toBeInTheDocument();

    await act(async () => {
      fireStandby(conn, { cue_id: 'q2', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });
    const alert2 = screen.getByTestId('operator-standby-alert');
    expect(within(alert2).queryByText('Cue Alpha')).toBeNull();
    expect(within(alert2).getByText('Cue Beta')).toBeInTheDocument();
  });

  it('second standby resets acknowledged state', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'First Cue', ['LX']);
    addCue(conn.doc, 'cl1', 'q2', 'Second Cue', ['LX']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    // First standby → ack
    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('operator-ack-btn'));
    });
    expect(screen.getByTestId('operator-standby-ready')).toBeInTheDocument();

    // Second standby → alert reappears (not READY)
    await act(async () => {
      fireStandby(conn, { cue_id: 'q2', cuelist_id: 'cl1', departments: ['LX'], standby: true });
    });
    const alert = screen.getByTestId('operator-standby-alert');
    expect(alert).toBeInTheDocument();
    expect(screen.queryByTestId('operator-standby-ready')).toBeNull();
    expect(within(alert).getByText('Second Cue')).toBeInTheDocument();
  });

  it('compound dept standby: LX operator sees LX dept from [LX, SX] broadcast', async () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Compound Cue', ['LX', 'SX']);
    render(<Wrapper conn={conn} owned={['LX']} />);

    await act(async () => {
      fireStandby(conn, { cue_id: 'q1', cuelist_id: 'cl1', departments: ['LX', 'SX'], standby: true });
    });

    const alert = screen.getByTestId('operator-standby-alert');
    expect(alert).toBeInTheDocument();
    // Department shown is LX (first match)
    expect(within(alert).getByText(/LX.*STANDBY/i)).toBeInTheDocument();
    // Ack sends LX specifically
    await act(async () => {
      fireEvent.click(within(alert).getByTestId('operator-ack-btn'));
    });
    expect(conn.sideChannel.sendAcknowledgeRequest).toHaveBeenCalledWith('cl1', 'q1', 'LX');
  });
});
