// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

// Mock y-websocket + y-indexeddb so syncClient doesn't try real connections
vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn(() => ({ on: vi.fn(), destroy: vi.fn() })),
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn(() => ({ destroy: vi.fn() })),
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

  it('renders AppShell when ?mode=shell', async () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?mode=shell', hostname: 'localhost', port: '', origin: 'http://localhost', reload: vi.fn() },
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/ShowX Shell/i)).toBeInTheDocument();
    });
  });

  it('renders PlaceholderShowView when saved session exists', async () => {
    const session = {
      host: '192.168.1.10', port: 8088, token: 'tok', display_name: 'LX', device_id: 'dev1', paired_at: 1000,
    };
    vi.mocked(authMod.listSessions).mockResolvedValue([session]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Connected to 192\.168\.1\.10:8088/i)).toBeInTheDocument();
    });
  });

  it('switches to show mode after successful two-phase pairing', async () => {
    vi.mocked(authMod.listSessions).mockResolvedValue([]);
    // Two-phase fetch mock: POST /claim → {request_id}, GET /status → {status:'allowed',...}
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (...args: unknown[]) => {
      const url = args[0] as string;
      if (url.includes('/status')) {
        return {
          ok: true,
          json: async () => ({ status: 'allowed', token: 'new-tok', device: { device_id: 'dev-new' } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ request_id: 'req-1' }),
      };
    }));

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

    // Fill pairing form and submit
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. LX Op/i), { target: { value: 'Test Op' } });
    fireEvent.change(screen.getByPlaceholderText(/6-digit PIN/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Pair/i }));

    // After two-phase pairing resolves, show view appears
    await waitFor(() => {
      expect(screen.getByText(/Connected to 10\.0\.0\.5/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
