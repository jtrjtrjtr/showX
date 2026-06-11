// @vitest-environment jsdom
// Verifies that yellow-background buttons use tokens.color.bg (dark) as text color,
// not tokens.color.ink (light) — fixing the 1.55:1 contrast violation (B003-704).
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { OperatorCueRow } from '../../../../../pwa/src/components/cuelist/OperatorCueRow.js';
import { PyroOperatorView } from '../../../../../pwa/src/components/cuelist/variants/PyroOperatorView.js';
import { ConnectionContext } from '../../helpers/connectionContext.js';
import { makeTestConnection } from '../../helpers/makeTestConnection.js';
import type { Cue } from 'showx-shared';

// jsdom converts hex to rgb() — expected values in rgb form
const YELLOW_BG = 'rgb(245, 184, 61)'; // tokens.color.yellow = #F5B83D
const BG_DARK   = 'rgb(14, 15, 18)';   // tokens.color.bg     = #0E0F12
const INK_LIGHT = 'rgb(242, 240, 235)'; // tokens.color.ink    = #F2F0EB

afterEach(() => cleanup());

const STUB_CUE: Cue = {
  id: 'c1',
  label: '1',
  description: '',
  standby_note: '',
  department: ['LX'],
  trigger: { kind: 'manual' },
  payloads: [],
  notes: '',
  script_line_ref: null,
  duration_hint_ms: null,
  payload_frozen_at: null,
  created_at: '2026-01-01T00:00:00Z',
  created_by: 'test',
  modified_at: '2026-01-01T00:00:00Z',
  modified_by: 'test',
};

describe('OperatorCueRow — Standby button contrast', () => {
  it('Standby button has tokens.color.bg text on yellow background (contrast ≥4.5:1)', () => {
    render(
      <OperatorCueRow
        cue={STUB_CUE}
        isActionable={true}
        owned={new Set(['LX'])}
        extraColumns={[]}
        goLabel="GO"
        onGo={() => {}}
        onStandby={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: /Standby 1/i });
    expect(btn.style.background).toBe(YELLOW_BG);
    expect(btn.style.color).toBe(BG_DARK);
    expect(btn.style.color).not.toBe(INK_LIGHT);
  });
});

function addCuelist(doc: Y.Doc, id: string) {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', 'Test');
  cl.set('default_trigger', 'manual');
  cl.set('go_authority', 'sm_called');
  cl.set('playhead', { cue_id: null, armed_cue_id: null });
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
}

function addCue(doc: Y.Doc, cuelistId: string, id: string, label: string) {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', id);
  cue.set('label', label);
  cue.set('description', '');
  cue.set('department', ['PYRO']);
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

describe('PyroOperatorView — Arm button contrast', () => {
  it('Arm button has tokens.color.bg text on yellow background (contrast ≥4.5:1)', () => {
    const conn = makeTestConnection();
    addCuelist(conn.doc, 'cl1');
    addCue(conn.doc, 'cl1', 'q1', 'Shot A');

    render(
      <ConnectionContext.Provider value={conn}>
        <PyroOperatorView cuelistId="cl1" watched={['SM']} />
      </ConnectionContext.Provider>,
    );

    const armBtn = screen.getByRole('button', { name: /Arm Shot A/i });
    expect(armBtn.style.background).toBe(YELLOW_BG);
    expect(armBtn.style.color).toBe(BG_DARK);
    expect(armBtn.style.color).not.toBe(INK_LIGHT);
  });
});
