// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { WaitPayloadEditor } from '../../../../../../pwa/src/components/cuelist/payloadEditors/WaitPayloadEditor.js';
import { ConnectionContext } from '../../../helpers/connectionContext.js';
import { makeTestConnection } from '../../../helpers/makeTestConnection.js';
import type { WaitPayload } from 'showx-shared';

afterEach(() => cleanup());

function makeWaitPayload(overrides: Partial<WaitPayload> = {}): WaitPayload {
  return { id: 'p1', type: 'wait', tag: null, note: '', duration_ms: 1000, ...overrides };
}

function setupCueInDoc(conn: ReturnType<typeof makeTestConnection>, payload: WaitPayload) {
  const doc = conn.doc;
  const cl = new Y.Map<unknown>();
  cl.set('id', 'cl1');
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.getArray('cuelists').push([cl]);
  const cue = new Y.Map<unknown>();
  cue.set('id', 'q1'); cue.set('label', 'Q1'); cue.set('department', ['SM']);
  cue.set('trigger', { kind: 'manual' }); cue.set('notes', ''); cue.set('description', '');
  cue.set('standby_note', ''); cue.set('script_line_ref', null); cue.set('duration_hint_ms', null);
  cue.set('payload_frozen_at', null); cue.set('sort_key', 1000);
  cue.set('created_at', '2026-01-01T00:00:00Z'); cue.set('created_by', 'test');
  cue.set('modified_at', '2026-01-01T00:00:00Z'); cue.set('modified_by', 'test');
  const payloads = new Y.Array<Y.Map<unknown>>();
  const pm = new Y.Map<unknown>();
  pm.set('id', payload.id); pm.set('type', payload.type); pm.set('tag', payload.tag);
  pm.set('note', payload.note); pm.set('duration_ms', payload.duration_ms);
  payloads.push([pm]);
  cue.set('payloads', payloads);
  (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]);
}

function Wrapper({ payload, conn }: { payload: WaitPayload; conn: ReturnType<typeof makeTestConnection> }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <WaitPayloadEditor payload={payload} cuelistId="cl1" cueId="q1" locked={false} />
    </ConnectionContext.Provider>
  );
}

describe('WaitPayloadEditor', () => {
  it('valid duration_ms 100 accepted — no error', async () => {
    const conn = makeTestConnection();
    const payload = makeWaitPayload({ duration_ms: 1000 });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('spinbutton', { name: /wait duration ms/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: '100' } });
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('negative duration_ms shows error', async () => {
    const conn = makeTestConnection();
    const payload = makeWaitPayload({ duration_ms: 1000 });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('spinbutton', { name: /wait duration ms/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: '-1' } });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/0–600000/);
  });

  it('duration_ms > 600000 shows error', async () => {
    const conn = makeTestConnection();
    const payload = makeWaitPayload({ duration_ms: 1000 });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('spinbutton', { name: /wait duration ms/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: '700000' } });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/0–600000/);
  });
});
