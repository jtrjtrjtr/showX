// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import * as Y from 'yjs';
import type { PairedSession } from '../../../pwa/src/lib/types.js';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockDoc = new Y.Doc();
// Pre-populate with one cuelist so StationContent resolves cuelistId immediately.
// Doc shape per cuelist-core document/cuelist.ts: Y.Array<Y.Map> under 'cuelists',
// each cuelist Y.Map carries scalar 'id'. (getMap here = 3.4 type-collision trap.)
function seedCuelist(id: string) {
  const list = new Y.Map();
  mockDoc.getArray<Y.Map<unknown>>('cuelists').insert(0, [list]);
  list.set('id', id);
}
seedCuelist('cuelist-1');

const mockAwareness = {
  setLocalState: vi.fn(),
  setLocalStateField: vi.fn(),
  getStates: vi.fn(() => new Map()),
  on: vi.fn(),
  off: vi.fn(),
};

const mockSideChannel = {
  on: vi.fn(() => () => {}),
  off: vi.fn(),
  disconnect: vi.fn(),
  sendGoRequest: vi.fn(),
  sendArmRequest: vi.fn(),
};

const mockConn = {
  doc: mockDoc,
  provider: {
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    awareness: mockAwareness,
  },
  persistence: { destroy: vi.fn(), whenSynced: Promise.resolve() },
  awareness: mockAwareness,
  sideChannel: mockSideChannel,
  disconnect: vi.fn(),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../pwa/src/lib/ConnectionProvider.js', () => {
  const React = require('react');
  const context = React.createContext(null);
  return {
    ConnectionProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(context.Provider, { value: mockConn }, children),
    useConnection: () => mockConn,
    ConnectionContext: context,
  };
});

vi.mock('../../../pwa/src/components/cuelist/SMMasterView.js', () => ({
  SMMasterView: ({ cuelistId }: { cuelistId: string }) => (
    <div data-testid="sm-master-view">{cuelistId}</div>
  ),
}));

vi.mock('../../../pwa/src/components/cuelist/OperatorView.js', () => ({
  OperatorView: ({ cuelistId, owned }: { cuelistId: string; owned: string[] }) => (
    <div data-testid="operator-view" data-cuelist-id={cuelistId} data-owned={owned.join(',')} />
  ),
}));

vi.mock('../../../pwa/src/components/cuelist/variants/GenericOperatorView.js', () => ({
  GenericOperatorView: ({ cuelistId }: { cuelistId: string }) => (
    <div data-testid="generic-operator-view" data-cuelist-id={cuelistId} />
  ),
}));

vi.mock('../../../pwa/src/components/DiscoveryView.js', () => ({
  DiscoveryView: () => <div data-testid="discovery-view" />,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

import { StationRouter } from '../../../pwa/src/components/StationRouter.js';

const baseSession: PairedSession = {
  host: '10.0.0.1',
  port: 5300,
  token: 'tok-abc',
  display_name: 'LX Op',
  device_id: 'dev-1',
  paired_at: 1000,
};

describe('StationRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-populate doc in case a test cleared it
    if (mockDoc.getArray<Y.Map<unknown>>('cuelists').length === 0) {
      seedCuelist('cuelist-1');
    }
    vi.stubGlobal('WebSocket', vi.fn(() => ({ onopen: null, onclose: null, onerror: null, close: vi.fn() })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders DiscoveryView when session is null', () => {
    render(<StationRouter session={null} />);
    expect(screen.getByTestId('discovery-view')).toBeInTheDocument();
  });

  it('renders SMMasterView when session.role === "sm"', async () => {
    const session: PairedSession = { ...baseSession, role: 'sm', show_id: 'show-1' };
    render(<StationRouter session={session} />);
    await waitFor(() => {
      expect(screen.getByTestId('sm-master-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('sm-master-view').textContent).toBe('cuelist-1');
  });

  it('renders OperatorView when session.role === "operator"', async () => {
    const session: PairedSession = {
      ...baseSession,
      role: 'operator',
      show_id: 'show-1',
      owned_departments: ['LX'],
      watched_departments: [],
    };
    render(<StationRouter session={session} />);
    await waitFor(() => {
      expect(screen.getByTestId('operator-view')).toBeInTheDocument();
    });
  });

  it('renders OperatorView when role is undefined (defaults to operator)', async () => {
    render(<StationRouter session={{ ...baseSession, show_id: 'show-1' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('operator-view')).toBeInTheDocument();
    });
  });

  it('renders GenericOperatorView for companion role', async () => {
    const session: PairedSession = { ...baseSession, role: 'companion', show_id: 'show-1' };
    render(<StationRouter session={session} />);
    await waitFor(() => {
      expect(screen.getByTestId('generic-operator-view')).toBeInTheDocument();
    });
  });

  it('renders GenericOperatorView for observer role', async () => {
    const session: PairedSession = { ...baseSession, role: 'observer', show_id: 'show-1' };
    render(<StationRouter session={session} />);
    await waitFor(() => {
      expect(screen.getByTestId('generic-operator-view')).toBeInTheDocument();
    });
  });

  it('shows station-loading when doc has no cuelists', () => {
    const emptyDoc = new Y.Doc();
    const emptyConn = { ...mockConn, doc: emptyDoc };
    vi.doMock('../../../pwa/src/lib/ConnectionProvider.js', () => {
      const React = require('react');
      const ctx = React.createContext(null);
      return {
        ConnectionProvider: ({ children }: { children: React.ReactNode }) =>
          React.createElement(ctx.Provider, { value: emptyConn }, children),
        useConnection: () => emptyConn,
        ConnectionContext: ctx,
      };
    });
    // Re-import after doMock is too complex in vi; instead remove the cuelist and restore
    const arr = mockDoc.getArray<Y.Map<unknown>>('cuelists');
    arr.delete(0, arr.length);

    render(<StationRouter session={{ ...baseSession, role: 'sm' }} />);
    expect(screen.getByTestId('station-loading')).toBeInTheDocument();

    // Restore
    seedCuelist('cuelist-1');
  });
});
