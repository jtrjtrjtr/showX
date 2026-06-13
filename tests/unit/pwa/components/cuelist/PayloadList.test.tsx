// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import type { Cue, OscPayload } from 'showx-shared';
import { PayloadList } from '../../../../../pwa/src/components/cuelist/PayloadList.js';
import { ConnectionContext } from '../../helpers/connectionContext.js';
import { makeTestConnection } from '../../helpers/makeTestConnection.js';

afterEach(() => cleanup());

function makeCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: 'q1',
    label: 'Cue 1',
    description: '',
    department: ['SM'],
    standby_note: '',
    script_line_ref: null,
    trigger: { kind: 'manual' },
    payloads: [],
    duration_hint_ms: null,
    notes: '',
    payload_frozen_at: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: 'test',
    modified_at: '2026-01-01T00:00:00Z',
    modified_by: 'test',
    ...overrides,
  };
}

function setupCueInDoc(conn: ReturnType<typeof makeTestConnection>, cue: Cue) {
  const doc = conn.doc;
  const cl = new Y.Map<unknown>();
  cl.set('id', 'cl1');
  const cuesArr = new Y.Array<Y.Map<unknown>>();
  cl.set('cues', cuesArr);
  doc.getArray('cuelists').push([cl]);

  const cueMap = new Y.Map<unknown>();
  cueMap.set('id', cue.id); cueMap.set('label', cue.label); cueMap.set('department', cue.department);
  cueMap.set('trigger', cue.trigger); cueMap.set('notes', cue.notes); cueMap.set('description', cue.description);
  cueMap.set('standby_note', cue.standby_note); cueMap.set('script_line_ref', null);
  cueMap.set('duration_hint_ms', null); cueMap.set('payload_frozen_at', null); cueMap.set('sort_key', 1000);
  cueMap.set('created_at', cue.created_at); cueMap.set('created_by', cue.created_by);
  cueMap.set('modified_at', cue.modified_at); cueMap.set('modified_by', cue.modified_by);

  const payloadsArr = new Y.Array<Y.Map<unknown>>();
  for (const p of cue.payloads) {
    const pm = new Y.Map<unknown>();
    Object.entries(p).forEach(([k, v]) => pm.set(k, v));
    payloadsArr.push([pm]);
  }
  cueMap.set('payloads', payloadsArr);
  cuesArr.push([cueMap]);
}

function Wrapper({ cue, locked, conn }: { cue: Cue; locked: boolean; conn: ReturnType<typeof makeTestConnection> }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <PayloadList cue={cue} cuelistId="cl1" locked={locked} />
    </ConnectionContext.Provider>
  );
}

describe('PayloadList', () => {
  it('shows empty state when no payloads', () => {
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={false} conn={conn} />);
    expect(screen.getByTestId('payload-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/No payloads yet/i)).toBeInTheDocument();
  });

  it('shows + Add payload button when not locked', () => {
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={false} conn={conn} />);
    expect(screen.getByRole('button', { name: /\+ add payload/i })).toBeInTheDocument();
  });

  it('add payload menu lists 8 types including DMX', async () => {
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={false} conn={conn} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /\+ add payload/i }));
    });

    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems).toHaveLength(8);
    expect(screen.getByRole('menuitem', { name: 'DMX' })).toBeInTheDocument();
  });

  it('adding OSC payload via menu creates payload in Y.Doc', async () => {
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={false} conn={conn} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /\+ add payload/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'OSC' }));
    });

    const cl = conn.doc.getArray<Y.Map<unknown>>('cuelists').toArray().find((m) => m.get('id') === 'cl1')!;
    const q1 = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray().find((c) => c.get('id') === 'q1')!;
    const payloads = (q1.get('payloads') as Y.Array<Y.Map<unknown>>).toArray();
    expect(payloads).toHaveLength(1);
    expect(payloads[0].get('type')).toBe('osc');
  });

  it('adding DMX payload via menu creates dmx payload with universe 0 and 1 channel', async () => {
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={false} conn={conn} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /\+ add payload/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'DMX' }));
    });

    const cl = conn.doc.getArray<Y.Map<unknown>>('cuelists').toArray().find((m) => m.get('id') === 'cl1')!;
    const q1 = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray().find((c) => c.get('id') === 'q1')!;
    const payloads = (q1.get('payloads') as Y.Array<Y.Map<unknown>>).toArray();
    expect(payloads).toHaveLength(1);
    expect(payloads[0].get('type')).toBe('dmx');
    expect(payloads[0].get('universe')).toBe(0);
    const channels = payloads[0].get('channels') as Array<{ channel: number; value: number }>;
    expect(channels).toHaveLength(1);
    expect(channels[0]).toEqual({ channel: 1, value: 0 });
  });

  it('renders payload type badge for each payload', () => {
    const osc: OscPayload = { id: 'p1', type: 'osc', tag: null, note: '', device_id: '', address: '/test', args: [] };
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [osc] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={false} conn={conn} />);
    // Badge shown in collapsed row
    expect(screen.getByText('osc')).toBeInTheDocument();
  });

  it('locked list disables add payload button', () => {
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={true} conn={conn} />);
    expect(screen.getByRole('button', { name: /\+ add payload/i })).toBeDisabled();
  });

  it('empty state shows hint text about payload types', () => {
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={false} conn={conn} />);
    expect(screen.getByText(/OSC, MIDI, DMX, MSC/i)).toBeInTheDocument();
  });

  it('empty state hint not shown when locked', () => {
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={true} conn={conn} />);
    expect(screen.queryByText(/OSC, MIDI, DMX, MSC/i)).toBeNull();
  });

  it('add payload button is reachable from empty state', () => {
    const conn = makeTestConnection();
    const cue = makeCue({ payloads: [] });
    setupCueInDoc(conn, cue);
    render(<Wrapper cue={cue} locked={false} conn={conn} />);
    const addBtn = screen.getByRole('button', { name: /\+ add payload/i });
    expect(addBtn).toBeInTheDocument();
    expect(addBtn).not.toBeDisabled();
  });
});
