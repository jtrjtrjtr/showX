// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { DmxPayloadEditor } from '../../../../../../pwa/src/components/cuelist/payloadEditors/DmxPayloadEditor.js';
import { ConnectionContext } from '../../../helpers/connectionContext.js';
import { makeTestConnection } from '../../../helpers/makeTestConnection.js';
import type { DmxPayload } from 'showx-shared';

afterEach(() => cleanup());

function makeDmxPayload(overrides: Partial<DmxPayload> = {}): DmxPayload {
  return {
    id: 'p1',
    type: 'dmx',
    tag: null,
    note: '',
    device_id: '',
    universe: 0,
    channels: [{ channel: 1, value: 0 }],
    ...overrides,
  };
}

function Wrapper({ payload, conn, locked = false }: { payload: DmxPayload; conn: ReturnType<typeof makeTestConnection>; locked?: boolean }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <DmxPayloadEditor payload={payload} cuelistId="cl1" cueId="q1" locked={locked} />
    </ConnectionContext.Provider>
  );
}

function setupCueInDoc(conn: ReturnType<typeof makeTestConnection>, payload: DmxPayload) {
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
  pm.set('universe', payload.universe);
  pm.set('channels', payload.channels);
  payloads.push([pm]);
  cue.set('payloads', payloads);
  (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]);
}

function getPayloadFromDoc(conn: ReturnType<typeof makeTestConnection>) {
  const cl = conn.doc.getArray<Y.Map<unknown>>('cuelists').toArray().find((m) => m.get('id') === 'cl1')!;
  const q1 = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray().find((c) => c.get('id') === 'q1')!;
  return (q1.get('payloads') as Y.Array<Y.Map<unknown>>).toArray()[0];
}

describe('DmxPayloadEditor', () => {
  it('renders device select and universe input', () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload();
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    expect(screen.getByRole('combobox', { name: /DMX device/i })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /DMX universe/i })).toBeInTheDocument();
  });

  it('renders existing channel rows', () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload({ channels: [{ channel: 5, value: 128 }, { channel: 10, value: 255 }] });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    expect(screen.getByRole('spinbutton', { name: /Channel 1 number/i })).toHaveValue(5);
    expect(screen.getByRole('spinbutton', { name: /Channel 1 value/i })).toHaveValue(128);
    expect(screen.getByRole('spinbutton', { name: /Channel 2 number/i })).toHaveValue(10);
    expect(screen.getByRole('spinbutton', { name: /Channel 2 value/i })).toHaveValue(255);
  });

  it('add channel row button updates Y.Doc with new row', async () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload({ channels: [{ channel: 1, value: 0 }] });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add DMX channel/i }));
    });

    const pm = getPayloadFromDoc(conn);
    const channels = pm.get('channels') as Array<{ channel: number; value: number }>;
    expect(channels).toHaveLength(2);
    expect(channels[1]).toEqual({ channel: 1, value: 0 });
  });

  it('remove channel row button removes row from Y.Doc', async () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload({ channels: [{ channel: 3, value: 100 }, { channel: 7, value: 200 }] });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Remove channel 1/i }));
    });

    const pm = getPayloadFromDoc(conn);
    const channels = pm.get('channels') as Array<{ channel: number; value: number }>;
    expect(channels).toHaveLength(1);
    expect(channels[0]).toEqual({ channel: 7, value: 200 });
  });

  it('shows error when channel is out of bounds (> 512)', async () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload({ channels: [{ channel: 1, value: 0 }] });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton', { name: /Channel 1 number/i }), { target: { value: '600' } });
    });

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => /1.512/.test(a.textContent ?? '') || /must be/.test(a.textContent ?? ''))).toBe(true);
  });

  it('shows error when value is out of bounds (> 255)', async () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload({ channels: [{ channel: 1, value: 0 }] });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton', { name: /Channel 1 value/i }), { target: { value: '300' } });
    });

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => /0.255/.test(a.textContent ?? '') || /must be/.test(a.textContent ?? ''))).toBe(true);
  });

  it('valid channel update clears error and stores value in Y.Doc', async () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload({ channels: [{ channel: 1, value: 0 }] });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const chInput = screen.getByRole('spinbutton', { name: /Channel 1 number/i });

    await act(async () => {
      fireEvent.change(chInput, { target: { value: '600' } });
    });
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.change(chInput, { target: { value: '100' } });
    });
    expect(screen.queryByRole('alert')).toBeNull();

    const pm = getPayloadFromDoc(conn);
    const channels = pm.get('channels') as Array<{ channel: number; value: number }>;
    expect(channels[0].channel).toBe(100);
  });

  it('locked=true disables all inputs and hides add/remove buttons', () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload({ channels: [{ channel: 1, value: 0 }] });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} locked={true} />);

    expect(screen.getByRole('combobox', { name: /DMX device/i })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: /DMX universe/i })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: /Channel 1 number/i })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: /Channel 1 value/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Add DMX channel/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove channel 1/i })).toBeNull();
  });

  it('does not allow removing the last channel row', async () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload({ channels: [{ channel: 1, value: 0 }] });
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    expect(screen.queryByRole('button', { name: /Remove channel 1/i })).toBeNull();

    const pm = getPayloadFromDoc(conn);
    const channels = pm.get('channels') as Array<{ channel: number; value: number }>;
    expect(channels).toHaveLength(1);
  });

  it('device select shows none option when no devices in doc', () => {
    const conn = makeTestConnection();
    const payload = makeDmxPayload();
    setupCueInDoc(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const select = screen.getByRole('combobox', { name: /DMX device/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /— none —/i })).toBeInTheDocument();
  });
});
