// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { WebhookPayloadEditor } from '../../../../../../pwa/src/components/cuelist/payloadEditors/WebhookPayloadEditor.js';
import { ConnectionContext } from '../../../helpers/connectionContext.js';
import { makeTestConnection } from '../../../helpers/makeTestConnection.js';
import type { WebhookPayload } from 'showx-shared';

afterEach(() => cleanup());

function makeWebhookPayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    id: 'p1',
    type: 'webhook',
    tag: null,
    note: '',
    url: 'https://example.com/hook',
    method: 'POST',
    headers: {},
    body: null,
    timeout_ms: 5000,
    ...overrides,
  };
}

function setupCueInDoc(conn: ReturnType<typeof makeTestConnection>, payload: WebhookPayload) {
  const doc = conn.doc;
  const cl = new Y.Map<unknown>();
  cl.set('id', 'cl1');
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.getArray('cuelists').push([cl]);
  const cue = new Y.Map<unknown>();
  cue.set('id', 'q1');
  cue.set('label', 'Q1');
  cue.set('department', ['SM']);
  cue.set('trigger', { kind: 'manual' });
  cue.set('notes', ''); cue.set('description', ''); cue.set('standby_note', '');
  cue.set('script_line_ref', null); cue.set('duration_hint_ms', null); cue.set('payload_frozen_at', null);
  cue.set('sort_key', 1000); cue.set('created_at', '2026-01-01T00:00:00Z'); cue.set('created_by', 'test');
  cue.set('modified_at', '2026-01-01T00:00:00Z'); cue.set('modified_by', 'test');
  const payloads = new Y.Array<Y.Map<unknown>>();
  const pm = new Y.Map<unknown>();
  pm.set('id', payload.id); pm.set('type', payload.type); pm.set('tag', payload.tag);
  pm.set('note', payload.note); pm.set('url', payload.url); pm.set('method', payload.method);
  pm.set('headers', payload.headers); pm.set('body', payload.body); pm.set('timeout_ms', payload.timeout_ms);
  payloads.push([pm]);
  cue.set('payloads', payloads);
  (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]);
}

function Wrapper({ payload, conn }: { payload: WebhookPayload; conn: ReturnType<typeof makeTestConnection> }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <WebhookPayloadEditor payload={payload} cuelistId="cl1" cueId="q1" locked={false} />
    </ConnectionContext.Provider>
  );
}

describe('WebhookPayloadEditor', () => {
  it('https URL accepted — no error shown', async () => {
    const conn = makeTestConnection();
    const payload = makeWebhookPayload({ url: 'https://start.com' });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('textbox', { name: /Webhook URL/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://api.example.com/webhook' } });
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('http://example.com rejected with error', async () => {
    const conn = makeTestConnection();
    const payload = makeWebhookPayload({ url: 'https://start.com' });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('textbox', { name: /Webhook URL/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'http://evil.com/webhook' } });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/must be https/i);
  });

  it('http://127.0.0.1 loopback accepted', async () => {
    const conn = makeTestConnection();
    const payload = makeWebhookPayload({ url: 'https://start.com' });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('textbox', { name: /Webhook URL/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'http://127.0.0.1:8080/hook' } });
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('http://localhost loopback accepted', async () => {
    const conn = makeTestConnection();
    const payload = makeWebhookPayload({ url: 'https://start.com' });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const input = screen.getByRole('textbox', { name: /Webhook URL/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'http://localhost:3000/hook' } });
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('timeout_ms input is rendered and editable', () => {
    const conn = makeTestConnection();
    const payload = makeWebhookPayload({ timeout_ms: 3000 });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);
    const input = screen.getByRole('spinbutton', { name: /timeout ms/i });
    expect(input).toHaveValue(3000);
  });
});
