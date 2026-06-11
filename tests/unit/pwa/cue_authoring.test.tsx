// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import * as Y from 'yjs';
import { useCuelist } from '../../../pwa/src/hooks/useCuelist.js';
import { AddCueButton } from '../../../pwa/src/components/cuelist/AddCueButton.js';
import { ConnectionContext } from './helpers/connectionContext.js';
import { makeTestConnection } from './helpers/makeTestConnection.js';
import { getMode } from '../../../src/modules/cuelist-core/src/mode/modeState.js';

afterEach(() => cleanup());

// ── Test helpers ─────────────────────────────────────────────────────────────

function addCuelistToDoc(doc: Y.Doc, id: string, name = 'Test Cuelist') {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', name);
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  cl.set('playhead', { cue_id: null, armed_cue_id: null });
  doc.transact(() => doc.getArray('cuelists').push([cl]));
  return cl;
}

function setDocMode(doc: Y.Doc, mode: 'rehearsal' | 'show') {
  doc.getMap('meta').set('mode', mode);
}

// ── Harness that exposes authoring functions and captured cue state ───────────

interface AuthoringCapture {
  addCue: ReturnType<typeof useCuelist>['addCue'];
  insertCueAfter: ReturnType<typeof useCuelist>['insertCueAfter'];
  removeCue: ReturnType<typeof useCuelist>['removeCue'];
  reorderCues: ReturnType<typeof useCuelist>['reorderCues'];
  cueLabels: string[];
}

let lastCapture: AuthoringCapture | null = null;

function CuelistHarness({ cuelistId }: { cuelistId: string }) {
  const { cues, addCue, insertCueAfter, removeCue, reorderCues } = useCuelist(cuelistId);
  lastCapture = {
    addCue,
    insertCueAfter,
    removeCue,
    reorderCues,
    cueLabels: cues.map((c) => c.label),
  };
  return (
    <div>
      <span data-testid="cue-count">{cues.length}</span>
      {cues.map((c) => (
        <span key={c.id} data-testid="rendered-cue" data-cue-id={c.id} data-label={c.label}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ── useCuelist authoring API ──────────────────────────────────────────────────

describe('useCuelist authoring API', () => {
  it('addCue creates a cue and it appears in the list', async () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-1');

    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistHarness cuelistId="cl-1" />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('cue-count')).toHaveTextContent('0');

    await act(async () => {
      lastCapture!.addCue({ label: 'Scene 1', department: ['LX'] });
    });

    expect(screen.getByTestId('cue-count')).toHaveTextContent('1');
    expect(screen.getByText('Scene 1')).toBeInTheDocument();
  });

  it('insertCueAfter inserts between two existing cues', async () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-2');

    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistHarness cuelistId="cl-2" />
      </ConnectionContext.Provider>,
    );

    let id1: string;
    await act(async () => {
      id1 = lastCapture!.addCue({ label: 'First', department: ['SM'] });
      lastCapture!.addCue({ label: 'Third', department: ['SM'] });
    });

    await act(async () => {
      lastCapture!.insertCueAfter(id1!, { label: 'Second', department: ['SM'] });
    });

    expect(screen.getByTestId('cue-count')).toHaveTextContent('3');
    const labels = lastCapture!.cueLabels;
    expect(labels[0]).toBe('First');
    expect(labels[1]).toBe('Second');
    expect(labels[2]).toBe('Third');
  });

  it('insertCueAfter(null, ...) prepends before all cues', async () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-prepend');

    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistHarness cuelistId="cl-prepend" />
      </ConnectionContext.Provider>,
    );

    await act(async () => {
      lastCapture!.addCue({ label: 'B', department: ['SM'] });
    });
    await act(async () => {
      lastCapture!.insertCueAfter(null, { label: 'A', department: ['SM'] });
    });

    expect(lastCapture!.cueLabels[0]).toBe('A');
    expect(lastCapture!.cueLabels[1]).toBe('B');
  });

  it('removeCue removes the correct cue from the list', async () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-3');

    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistHarness cuelistId="cl-3" />
      </ConnectionContext.Provider>,
    );

    let deleteId: string;
    await act(async () => {
      lastCapture!.addCue({ label: 'Keep', department: ['SM'] });
      deleteId = lastCapture!.addCue({ label: 'Delete me', department: ['SM'] });
    });
    expect(screen.getByTestId('cue-count')).toHaveTextContent('2');

    await act(async () => {
      lastCapture!.removeCue(deleteId!);
    });

    expect(screen.getByTestId('cue-count')).toHaveTextContent('1');
    expect(screen.getByText('Keep')).toBeInTheDocument();
    expect(screen.queryByText('Delete me')).not.toBeInTheDocument();
  });

  it('reorderCues changes the display order', async () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-4');

    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistHarness cuelistId="cl-4" />
      </ConnectionContext.Provider>,
    );

    const ids: string[] = [];
    await act(async () => {
      ids.push(lastCapture!.addCue({ label: 'A', department: ['SM'] }));
      ids.push(lastCapture!.addCue({ label: 'B', department: ['SM'] }));
      ids.push(lastCapture!.addCue({ label: 'C', department: ['SM'] }));
    });

    expect(lastCapture!.cueLabels).toEqual(['A', 'B', 'C']);

    await act(async () => {
      // Move A to end: B, C, A
      lastCapture!.reorderCues([ids[1], ids[2], ids[0]]);
    });

    expect(lastCapture!.cueLabels).toEqual(['B', 'C', 'A']);
  });

  it('addCue throws LockedError in show mode', async () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-locked');
    setDocMode(conn.doc, 'show');

    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistHarness cuelistId="cl-locked" />
      </ConnectionContext.Provider>,
    );

    expect(() => {
      lastCapture!.addCue({ label: 'Not allowed', department: ['SM'] });
    }).toThrow();

    expect(getMode(conn.doc)).toBe('show');
    expect(screen.getByTestId('cue-count')).toHaveTextContent('0');
  });

  it('removeCue throws LockedError in show mode', async () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-locked2');

    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistHarness cuelistId="cl-locked2" />
      </ConnectionContext.Provider>,
    );

    let cueId: string;
    await act(async () => {
      cueId = lastCapture!.addCue({ label: 'Stay', department: ['SM'] });
    });

    setDocMode(conn.doc, 'show');

    expect(() => {
      lastCapture!.removeCue(cueId!);
    }).toThrow();

    expect(screen.getByTestId('cue-count')).toHaveTextContent('1');
  });
});

// ── AddCueButton component ────────────────────────────────────────────────────

describe('AddCueButton component', () => {
  it('renders with default text and fires onClick', () => {
    let clicked = false;
    render(<AddCueButton onClick={() => { clicked = true; }} />);
    const btn = screen.getByTestId('add-cue-btn');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('+ Add cue');
    fireEvent.click(btn);
    expect(clicked).toBe(true);
  });

  it('renders compact variant with custom label', () => {
    render(<AddCueButton onClick={() => {}} compact label="+ Add" />);
    expect(screen.getByText('+ Add')).toBeInTheDocument();
  });
});
