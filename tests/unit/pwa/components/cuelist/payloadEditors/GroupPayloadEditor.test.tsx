// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { GroupPayloadEditor } from '../../../../../../pwa/src/components/cuelist/payloadEditors/GroupPayloadEditor.js';
import { ConnectionContext } from '../../../helpers/connectionContext.js';
import { makeTestConnection } from '../../../helpers/makeTestConnection.js';
import type { GroupPayload } from 'showx-shared';

afterEach(() => cleanup());

function makeGroupPayload(overrides: Partial<GroupPayload> = {}): GroupPayload {
  return { id: 'p1', type: 'group', tag: null, note: '', child_cue_ids: [], fire_mode: 'parallel', ...overrides };
}

function setupDocWithCues(conn: ReturnType<typeof makeTestConnection>, groupPayload: GroupPayload) {
  const doc = conn.doc;
  const cl = new Y.Map<unknown>();
  cl.set('id', 'cl1');
  const cuesArr = new Y.Array<Y.Map<unknown>>();
  cl.set('cues', cuesArr);
  doc.getArray('cuelists').push([cl]);

  // Add group cue (q1) + two other cues (q2, q3)
  const ids = ['q1', 'q2', 'q3'];
  const labels = ['Group Cue', 'Target A', 'Target B'];
  ids.forEach((id, i) => {
    const cue = new Y.Map<unknown>();
    cue.set('id', id); cue.set('label', labels[i]); cue.set('department', ['SM']);
    cue.set('trigger', { kind: 'manual' }); cue.set('notes', ''); cue.set('description', '');
    cue.set('standby_note', ''); cue.set('script_line_ref', null); cue.set('duration_hint_ms', null);
    cue.set('payload_frozen_at', null); cue.set('sort_key', (i + 1) * 1000);
    cue.set('created_at', '2026-01-01T00:00:00Z'); cue.set('created_by', 'test');
    cue.set('modified_at', '2026-01-01T00:00:00Z'); cue.set('modified_by', 'test');

    if (id === 'q1') {
      const payloads = new Y.Array<Y.Map<unknown>>();
      const pm = new Y.Map<unknown>();
      pm.set('id', groupPayload.id); pm.set('type', groupPayload.type); pm.set('tag', groupPayload.tag);
      pm.set('note', groupPayload.note); pm.set('child_cue_ids', groupPayload.child_cue_ids);
      pm.set('fire_mode', groupPayload.fire_mode);
      payloads.push([pm]);
      cue.set('payloads', payloads);
    } else {
      cue.set('payloads', new Y.Array<Y.Map<unknown>>());
    }

    cuesArr.push([cue]);
  });
}

function Wrapper({ payload, conn }: { payload: GroupPayload; conn: ReturnType<typeof makeTestConnection> }) {
  return (
    <ConnectionContext.Provider value={conn}>
      <GroupPayloadEditor payload={payload} cuelistId="cl1" cueId="q1" locked={false} />
    </ConnectionContext.Provider>
  );
}

describe('GroupPayloadEditor', () => {
  it('lists other cues (excludes self) as checkboxes', () => {
    const conn = makeTestConnection();
    const payload = makeGroupPayload();
    setupDocWithCues(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    // Should see Target A and Target B but NOT Group Cue (self)
    expect(screen.getByRole('checkbox', { name: /include cue Target A/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /include cue Target B/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /include cue Group Cue/i })).toBeNull();
  });

  it('fire_mode select has parallel and series options', () => {
    const conn = makeTestConnection();
    const payload = makeGroupPayload({ fire_mode: 'parallel' });
    setupDocWithCues(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const select = screen.getByRole('combobox', { name: /group fire mode/i });
    expect(select).toHaveValue('parallel');

    const options = select.querySelectorAll('option');
    const values = Array.from(options).map((o) => o.value);
    expect(values).toContain('parallel');
    expect(values).toContain('series');
  });

  it('toggling child cue checkbox calls updatePayload', async () => {
    const conn = makeTestConnection();
    const payload = makeGroupPayload({ child_cue_ids: [] });
    setupDocWithCues(conn, payload);
    render(<Wrapper payload={payload} conn={conn} />);

    const checkbox = screen.getByRole('checkbox', { name: /include cue Target A/i });
    expect(checkbox).not.toBeChecked();

    await act(async () => {
      fireEvent.click(checkbox);
    });

    // Doc should have been updated — check that the payload map was updated
    const cl = conn.doc.getArray<Y.Map<unknown>>('cuelists').toArray().find((m) => m.get('id') === 'cl1')!;
    const q1 = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray().find((c) => c.get('id') === 'q1')!;
    const pm = (q1.get('payloads') as Y.Array<Y.Map<unknown>>).toArray()[0];
    const childIds = pm.get('child_cue_ids') as string[];
    expect(childIds).toContain('q2');
  });
});
