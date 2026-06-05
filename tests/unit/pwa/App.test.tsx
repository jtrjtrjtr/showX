// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock y-websocket + y-indexeddb so syncClient doesn't try real connections
vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn(() => ({ on: vi.fn(), destroy: vi.fn() })),
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn(() => ({ destroy: vi.fn() })),
}));

// Mock auth module
vi.mock('../../../pwa/src/lib/auth.js', () => ({
  listSessions: vi.fn(async () => []),
  saveSession: vi.fn(async () => {}),
  loadSession: vi.fn(async () => null),
  clearSession: vi.fn(async () => {}),
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

describe('App mode router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset URL to no params
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { search: '', hostname: 'localhost', port: '', origin: 'http://localhost', reload: vi.fn() },
    });
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

  it('switches to show mode after successful pairing', async () => {
    vi.mocked(authMod.listSessions).mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: 'new-tok', device: { device_id: 'dev-new' } }),
    })));

    render(<App />);

    // Wait for DiscoveryView
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Host/i)).toBeInTheDocument();
    });

    // Fill manual host form and connect
    fireEvent.change(screen.getByPlaceholderText(/Host/i), { target: { value: '10.0.0.5' } });
    fireEvent.submit(screen.getByPlaceholderText(/Host/i).closest('form')!);

    // PairingView appears
    await waitFor(() => {
      expect(screen.getByText(/Pair with 10\.0\.0\.5/i)).toBeInTheDocument();
    });

    // Fill pairing form
    fireEvent.change(screen.getByPlaceholderText(/Display name/i), { target: { value: 'Test Op' } });
    fireEvent.change(screen.getByPlaceholderText(/6-digit PIN/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Pair/i }));

    // After pairing, show view appears
    await waitFor(() => {
      expect(screen.getByText(/Connected to 10\.0\.0\.5/i)).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });
});
