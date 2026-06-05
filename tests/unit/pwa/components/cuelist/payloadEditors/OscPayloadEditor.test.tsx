// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { OscPayloadEditor } from '../../../../../../pwa/src/components/cuelist/payloadEditors/OscPayloadEditor.js';
import { ConnectionContext } from '../../../helpers/connectionContext.js';
import { makeTestConnection } from '../../../helpers/makeTestConnection.js';
import type { OscPayload } from 'showx-shared';

afterEach(() => cleanup());

function makeOscPayload(overrides: Partial<OscPayload> = {}): OscPayload {
  return {
    id: 'p1',
    type: 'osc',
    tag: null,
    note: '',
    device_id: '',
    address: '/test/address',
    args: [],
    ...overrides,
  };
}

function Wrapper({ payload, conn }: { payload: OscPayload; conn: ReturnType<typeof makeTestConnection> }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <OscPayloadEditor payload={payload} cuelistId="cl1" cueId="q1" locked={false} />
    </ConnectionContext.Provider>
  );
}

function setupCueInDoc(conn: ReturnType<typeof makeTestConnection>, payload: OscPayload) {
  const doc = conn.doc;
  const cl = new Y.Map<unknown>();
  cl.set('id', 'cl1');
  cl.set('name', 'Test');
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.getArray('cuelists').push([cl]);

  const cue = new Y.Map<unknown>();
  cue.set('id', 'q1');
  cue.set('label', 'Q1');
  cue.set('department', ['SM']);
  cue.set('trigger', { kind: 'manual' });
  cue.set('notes', '');
  cue.set('description', '');
  cue.set('standby_note', '');
  cue.set('script_line_ref', null);
  cue.set('duration_hint_ms', null);
  cue.set('payload_frozen_at', null);
  cue.set('sort_key', 1000);
  cue.set('created_at', '2026-01-01T00:00:00Z');
  cue.set('created_by', 'test');
  cue.set('modified_at', '2026-01-01T00:00:00Z');
  cue.set('modified_by', 'test');

  const payloads = new Y.Array<Y.Map<unknown>>();
  const pm = new Y.Map<unknown>();
  pm.set('id', payload.id);
  pm.set('type', payload.type);
  pm.set('tag', payload.tag);
  pm.set('note', payload.note);
  pm.set('device_id', payload.device_id);
  pm.set('address', payload.address);
  pm.set('args', payload.args);
  payloads.push([pm]);
  cue.set('payloads', payloads);
  (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]);
}

describe('OscPayloadEditor', () => {
  it('renders address input with current value', () => {
    const conn = makeTestConnection();
    const payload = makeOscPayload({ address: '/lights/dim' });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);
    const input = screen.getByRole('textbox', { name: /OSC address/i });
    expect(input).toHaveValue('/lights/dim');
  });

  it('shows error when address does not start with /', async () => {
    const conn = makeTestConnection();
    const payload = makeOscPayload({ address: '/valid' });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('textbox', { name: /OSC address/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'invalid-no-slash' } });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/must start with \//i);
  });

  it('valid address update clears error and stores value', async () => {
    const conn = makeTestConnection();
    const payload = makeOscPayload({ address: '/old' });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('textbox', { name: /OSC address/i });
    // First make invalid
    await act(async () => {
      fireEvent.change(input, { target: { value: 'bad' } });
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Then fix it
    await act(async () => {
      fireEvent.change(input, { target: { value: '/new/addr' } });
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows device selector with no devices when devices map is empty', () => {
    const conn = makeTestConnection();
    const payload = makeOscPayload();
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);
    const select = screen.getByRole('combobox', { name: /OSC device/i });
    expect(select).toBeInTheDocument();
    // Only the "none" option
    expect(screen.getAllByRole('option', { name: /— none —/i })).toHaveLength(1);
  });

  it('add arg button updates Y.Doc with a new arg entry', async () => {
    const conn = makeTestConnection();
    const payload = makeOscPayload({ args: [] });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    // No args visible initially (+ arg button present)
    expect(screen.getByText('+ arg')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('+ arg'));
    });

    // Y.Doc payload should now have 1 arg
    const cl = conn.doc.getArray<Y.Map<unknown>>('cuelists').toArray().find((m) => m.get('id') === 'cl1')!;
    const q1 = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray().find((c) => c.get('id') === 'q1')!;
    const pm = (q1.get('payloads') as Y.Array<Y.Map<unknown>>).toArray()[0];
    const args = pm.get('args') as unknown[];
    expect(args).toHaveLength(1);
  });
});
