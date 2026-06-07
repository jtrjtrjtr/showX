// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';

// Mock y-websocket + y-indexeddb so syncClient / connectToShow don't try real connections
const mockAwareness = {
  setLocalState: vi.fn(),
  setLocalStateField: vi.fn(),
  getStates: vi.fn(() => new Map()),
  on: vi.fn(),
  off: vi.fn(),
};
vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    awareness: mockAwareness,
  })),
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn(() => ({ destroy: vi.fn(), whenSynced: Promise.resolve() })),
}));

// Mock auth module — includes getOrCreateClientPubkey used by PairingView
vi.mock('../../../pwa/src/lib/auth.js', () => ({
  listSessions: vi.fn(async () => []),
  saveSession: vi.fn(async () => {}),
  loadSession: vi.fn(async () => null),
  clearSession: vi.fn(async () => {}),
  getOrCreateClientPubkey: vi.fn(async () => 'mock-pubkey-base64'),
}));

// Mock discovery
vi.mock('../../../pwa/src/lib/discovery.js', () => ({
  discoverFromOrigin: vi.fn(async () => null),
  probeLan: vi.fn(async () => []),
  manualHost: vi.fn((host: string, port: number) => ({ host, port, pairingAvailable: true })),
}));

import { fireEvent } from '@testing-library/react';
import { App } from '../../../pwa/src/App.js';
import * as authMod from '../../../pwa/src/lib/auth.js';

function makeMockWs() {
  return { onmessage: null as unknown, onclose: null as unknown, close: vi.fn() };
}

describe('App mode router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub WebSocket globally — prevents sideChannel from throwing in jsdom
    vi.stubGlobal('WebSocket', vi.fn(() => makeMockWs()));
    // Reset URL to no params
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { search: '', hostname: 'localhost', port: '', origin: 'http://localhost', reload: vi.fn() },
    });
  });

  afterEach(() => {
    cleanup(); // unmount all React trees after each test
    vi.unstubAllGlobals();
  });

  it('renders DiscoveryView when no saved sessions', async () => {
    vi.mocked(authMod.listSessions).mockResolvedValue([]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/ShowX/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Pair with/i)).toBeNull();
  });

  it('renders ShellRouter in shell mode (Loading when showxApi absent)', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?mode=shell', hostname: 'localhost', port: '', origin: 'http://localhost', reload: vi.fn() },
    });
    render(<App />);
    // ShellRouter renders Loading when showxApi is not available (not in Electron)
    await waitFor(() => {
      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });
  });

  it('renders StationRouter (station-loading) when saved session exists', async () => {
    const session = {
      host: '192.168.1.10', port: 8088, token: 'tok', display_name: 'LX', device_id: 'dev1', paired_at: 1000,
    };
    vi.mocked(authMod.listSessions).mockResolvedValue([session]);
    render(<App />);
    // StationRouter renders ConnectionProvider → StationContent.
    // With empty Y.Doc (no cuelists), StationContent shows station-loading.
    // ConnectionProvider shows "Connecting…" while connectToShow is pending (async);
    // either state is acceptable here — both indicate StationRouter is active.
    await waitFor(() => {
      const loading = screen.queryByTestId('station-loading');
      const connecting = screen.queryByText(/Connecting/i);
      expect(loading ?? connecting).not.toBeNull();
    });
  });

  it('switches to show mode after successful pairing', async () => {
    vi.mocked(authMod.listSessions).mockResolvedValue([]);
    // PairingView sends POST /claim and expects { token, device } back
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ token: 'new-tok', device: { device_id: 'dev-new' } }),
    })));

    render(<App />);

    // Wait for DiscoveryView
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Connect/i })).toBeInTheDocument();
    });

    // Fill manual host form and submit
    const hostInput = screen.getByPlaceholderText(/Host \(e\.g\./i);
    fireEvent.change(hostInput, { target: { value: '10.0.0.5' } });
    fireEvent.submit(hostInput.closest('form')!);

    // PairingView appears
    await waitFor(() => {
      expect(screen.getByText(/Pair with 10\.0\.0\.5/i)).toBeInTheDocument();
    });

    // Fill pairing form and submit — wrap in act so async handleSubmit state updates flush
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. LX Op/i), { target: { value: 'Test Op' } });
      fireEvent.change(screen.getByPlaceholderText(/6-digit PIN/i), { target: { value: '123456' } });
      fireEvent.submit(screen.getByRole('button', { name: /Pair/i }).closest('form')!);
    });

    // After pairing resolves, StationRouter is active
    await waitFor(() => {
      const loading = screen.queryByTestId('station-loading');
      const connecting = screen.queryByText(/Connecting/i);
      expect(loading ?? connecting).not.toBeNull();
    }, { timeout: 5000 });
  });
});
