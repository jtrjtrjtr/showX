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
});
