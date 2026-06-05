// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { LxRefPayloadEditor } from '../../../../../../pwa/src/components/cuelist/payloadEditors/LxRefPayloadEditor.js';
import { ConnectionContext } from '../../../helpers/connectionContext.js';
import { makeTestConnection } from '../../../helpers/makeTestConnection.js';
import type { LxRefPayload } from 'showx-shared';

afterEach(() => cleanup());

function makeLxRefPayload(overrides: Partial<LxRefPayload> = {}): LxRefPayload {
  return { id: 'p1', type: 'lx_ref', tag: null, note: '', device_id: '', cue_list: 1, cue_number: 1, ...overrides };
}

function setupCueInDoc(conn: ReturnType<typeof makeTestConnection>, payload: LxRefPayload) {
  const doc = conn.doc;
  const cl = new Y.Map<unknown>();
  cl.set('id', 'cl1');
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.getArray('cuelists').push([cl]);
  const cue = new Y.Map<unknown>();
  cue.set('id', 'q1'); cue.set('label', 'Q1'); cue.set('department', ['LX']);
  cue.set('trigger', { kind: 'manual' }); cue.set('notes', ''); cue.set('description', '');
  cue.set('standby_note', ''); cue.set('script_line_ref', null); cue.set('duration_hint_ms', null);
  cue.set('payload_frozen_at', null); cue.set('sort_key', 1000);
  cue.set('created_at', '2026-01-01T00:00:00Z'); cue.set('created_by', 'test');
  cue.set('modified_at', '2026-01-01T00:00:00Z'); cue.set('modified_by', 'test');
  const payloads = new Y.Array<Y.Map<unknown>>();
  const pm = new Y.Map<unknown>();
  pm.set('id', payload.id); pm.set('type', payload.type); pm.set('tag', payload.tag);
  pm.set('note', payload.note); pm.set('device_id', payload.device_id);
  pm.set('cue_list', payload.cue_list); pm.set('cue_number', payload.cue_number);
  payloads.push([pm]);
  cue.set('payloads', payloads);
  (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]);
}

function Wrapper({ payload, conn }: { payload: LxRefPayload; conn: ReturnType<typeof makeTestConnection> }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <LxRefPayloadEditor payload={payload} cuelistId="cl1" cueId="q1" locked={false} />
    </ConnectionContext.Provider>
  );
}

describe('LxRefPayloadEditor', () => {
  it('cue_list 0 rejected with error', async () => {
    const conn = makeTestConnection();
    const payload = makeLxRefPayload({ cue_list: 1 });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('spinbutton', { name: /LX Ref cue list/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: '0' } });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/≥ 1/);
  });

  it('cue_number fractional 1.5 accepted — no error', async () => {
    const conn = makeTestConnection();
    const payload = makeLxRefPayload({ cue_number: 1 });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('spinbutton', { name: /LX Ref cue number/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: '1.5' } });
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cue_number negative rejected with error', async () => {
    const conn = makeTestConnection();
    const payload = makeLxRefPayload({ cue_number: 1 });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('spinbutton', { name: /LX Ref cue number/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: '-0.5' } });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/≥ 0/);
  });

  it('device selector renders with no devices', () => {
    const conn = makeTestConnection();
    const payload = makeLxRefPayload();
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);
    expect(screen.getByRole('combobox', { name: /LX Ref device/i })).toBeInTheDocument();
  });
});
