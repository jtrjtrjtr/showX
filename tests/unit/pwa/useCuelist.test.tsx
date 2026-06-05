// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

afterEach(() => cleanup());
import React from 'react';
import * as Y from 'yjs';
import { useCuelist } from '../../../pwa/src/hooks/useCuelist.js';
import { ConnectionContext } from './helpers/connectionContext.js';
import { makeTestConnection } from './helpers/makeTestConnection.js';

function addCuelistToDoc(doc: Y.Doc, id: string, name = 'Test Cuelist') {
  const cl = new Y.Map<unknown>();
  cl.set('id', id);
  cl.set('name', name);
  cl.set('cues', new Y.Array<Y.Map<unknown>>());
  doc.transact(() => doc.getArray('cuelists').push([cl]));
  return cl;
}

function addCueToDoc(doc: Y.Doc, cuelistId: string, cueId: string, label: string) {
  const cl = doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId)!;
  const cue = new Y.Map<unknown>();
  cue.set('id', cueId);
  cue.set('label', label);
  cue.set('department', ['SM']);
  cue.set('payloads', []);
  doc.transact(() => (cl.get('cues') as Y.Array<Y.Map<unknown>>).push([cue]));
}

function CuelistDisplay({ cuelistId }: { cuelistId: string }) {
  const { cuelist, cues } = useCuelist(cuelistId);
  if (!cuelist) return <div>no-cuelist</div>;
  return (
    <div>
      <span data-testid="name">{cuelist.name}</span>
      <span data-testid="count">{cues.length}</span>
      {cues.map((c) => (
        <span key={c.id} data-testid="cue-label">{c.label}</span>
      ))}
    </div>
  );
}

describe('useCuelist', () => {
  it('returns null for unknown cuelist ID', () => {
    const conn = makeTestConnection();
    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistDisplay cuelistId="missing" />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByText('no-cuelist')).toBeInTheDocument();
  });

  it('returns cuelist and empty cues when cuelist exists with no cues', () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-1', 'My List');
    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistDisplay cuelistId="cl-1" />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('name')).toHaveTextContent('My List');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('renders cue labels from cuelist', () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-2');
    addCueToDoc(conn.doc, 'cl-2', 'q1', 'Overture');
    addCueToDoc(conn.doc, 'cl-2', 'q2', 'Act 1 Start');
    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistDisplay cuelistId="cl-2" />
      </ConnectionContext.Provider>,
    );
    expect(screen.getAllByTestId('cue-label')).toHaveLength(2);
    expect(screen.getByText('Overture')).toBeInTheDocument();
  });

  it('re-renders when a cue is added to the cuelist', async () => {
    const conn = makeTestConnection();
    addCuelistToDoc(conn.doc, 'cl-3');
    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistDisplay cuelistId="cl-3" />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    await act(async () => {
      addCueToDoc(conn.doc, 'cl-3', 'q1', 'First Cue');
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByText('First Cue')).toBeInTheDocument();
  });

  it('returns null when cuelist is absent from doc', () => {
    const conn = makeTestConnection();
    render(
      <ConnectionContext.Provider value={conn}>
        <CuelistDisplay cuelistId="not-present" />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByText('no-cuelist')).toBeInTheDocument();
  });
});
