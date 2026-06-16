// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

// Mock qrcode to return a simple data URL without actually generating PNG
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async (_url: string) => `data:image/png;base64,MOCKQR`),
  },
}));

afterEach(() => cleanup());

import { StationsPanel } from '../../../pwa/src/components/StationsPanel.js';

describe('StationsPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing while fetch is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
    const { container } = render(<StationsPanel />);
    expect(container.firstChild).toBeNull();
    vi.unstubAllGlobals();
  });

  it('renders station URLs and QR images after server-info fetch', async () => {
    const mockInfo = {
      lan_ip: '192.168.1.42',
      port: 5300,
      mdns_name: 'my-mac.local',
      test_pin: null,
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => mockInfo,
    })));

    render(<StationsPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('stations-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('qr-lan')).toBeInTheDocument();
    expect(screen.getByTestId('qr-mdns')).toBeInTheDocument();
    expect(screen.getByTestId('open-station-browser')).toBeInTheDocument();

    // URLs should contain the LAN IP
    const panelText = screen.getByTestId('stations-panel').textContent ?? '';
    expect(panelText).toContain('192.168.1.42');
    expect(panelText).toContain('my-mac.local');

    vi.unstubAllGlobals();
  });

  it('embeds test_pin in URL when server returns test_pin', async () => {
    const mockInfo = {
      lan_ip: '10.0.0.1',
      port: 5300,
      mdns_name: 'test-mac.local',
      test_pin: '000000',
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => mockInfo,
    })));

    render(<StationsPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('stations-panel')).toBeInTheDocument();
    });

    const panelText = screen.getByTestId('stations-panel').textContent ?? '';
    expect(panelText).toContain('?pin=000000');

    vi.unstubAllGlobals();
  });

  it('renders nothing when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const { container } = render(<StationsPanel />);

    // After a tick the error is caught and component stays null
    await new Promise((r) => setTimeout(r, 20));
    expect(container.firstChild).toBeNull();

    vi.unstubAllGlobals();
  });

  // Regression: secure-context bug — "Open station in this Mac's browser" must use
  // localhost, NOT the LAN IP. http://<lan-ip> is not a secure context, so
  // crypto.subtle (used by pairing AES-GCM) is undefined → pairing fails with
  // "Network error". Fixed in StationsPanel.tsx (urlLocal = buildStationUrl(info, 'localhost')).
  it('open-station-browser button calls openExternal with localhost URL (not LAN IP)', async () => {
    const mockInfo = {
      lan_ip: '192.168.1.42',
      port: 5300,
      mdns_name: 'my-mac.local',
      test_pin: null,
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => mockInfo })));

    // Inject showxApi directly on window without replacing the whole object
    // (replacing window breaks React DOM internals in jsdom)
    const openExternalMock = vi.fn(async () => undefined);
    const win = window as unknown as Record<string, unknown>;
    win['showxApi'] = { shell: { openExternal: openExternalMock } };

    render(<StationsPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('open-station-browser')).toBeInTheDocument();
    });

    screen.getByTestId('open-station-browser').click();

    // Button must open with localhost — not the LAN IP
    expect(openExternalMock).toHaveBeenCalledOnce();
    const calledUrl: string = openExternalMock.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^http:\/\/localhost:/);
    expect(calledUrl).not.toContain('192.168.1.42');

    delete win['showxApi'];
    vi.unstubAllGlobals();
  });

  it('open-station-browser button includes test_pin in localhost URL when env pin set', async () => {
    const mockInfo = {
      lan_ip: '10.0.0.5',
      port: 5300,
      mdns_name: 'dev-mac.local',
      test_pin: '000000',
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => mockInfo })));

    const openExternalMock = vi.fn(async () => undefined);
    const win = window as unknown as Record<string, unknown>;
    win['showxApi'] = { shell: { openExternal: openExternalMock } };

    render(<StationsPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('open-station-browser')).toBeInTheDocument();
    });

    screen.getByTestId('open-station-browser').click();

    expect(openExternalMock).toHaveBeenCalledOnce();
    const calledUrl: string = openExternalMock.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^http:\/\/localhost:/);
    expect(calledUrl).toContain('?pin=000000');
    expect(calledUrl).not.toContain('10.0.0.5');

    delete win['showxApi'];
    vi.unstubAllGlobals();
  });
});
