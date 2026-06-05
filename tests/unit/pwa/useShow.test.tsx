// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';

afterEach(() => cleanup());
import React from 'react';
import * as Y from 'yjs';
import { useShow } from '../../../pwa/src/hooks/useShow.js';
import { ConnectionContext } from './helpers/connectionContext.js';
import { makeTestConnection } from './helpers/makeTestConnection.js';

function ShowDisplay() {
  const show = useShow();
  if (!show) return <div>no-show</div>;
  return <div>{show.title}</div>;
}

describe('useShow', () => {
  it('returns null when meta has no show_id', () => {
    const conn = makeTestConnection();
    render(
      <ConnectionContext.Provider value={conn}>
        <ShowDisplay />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByText('no-show')).toBeInTheDocument();
  });

  it('renders title once meta is populated', () => {
    const conn = makeTestConnection();
    conn.doc.transact(() => {
      conn.doc.getMap('meta').set('show_id', 's1');
      conn.doc.getMap('meta').set('title', 'My Show');
    });

    render(
      <ConnectionContext.Provider value={conn}>
        <ShowDisplay />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByText('My Show')).toBeInTheDocument();
  });

  it('re-renders when meta title changes', async () => {
    const conn = makeTestConnection();
    conn.doc.transact(() => {
      conn.doc.getMap('meta').set('show_id', 's1');
      conn.doc.getMap('meta').set('title', 'Old Title');
    });

    render(
      <ConnectionContext.Provider value={conn}>
        <ShowDisplay />
      </ConnectionContext.Provider>,
    );
    expect(screen.getByText('Old Title')).toBeInTheDocument();

    await act(async () => {
      conn.doc.transact(() => conn.doc.getMap('meta').set('title', 'New Title'));
    });
    expect(screen.getByText('New Title')).toBeInTheDocument();
  });
});
