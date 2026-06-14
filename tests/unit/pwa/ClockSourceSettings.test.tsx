// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

type ClockSource = 'internal' | 'mtc' | 'ltc';

interface MockConfig {
  source: ClockSource;
  ltcOutEnabled: boolean;
  ltcOutDeviceId: number | null;
  ltcInDeviceId: number | null;
  locked?: boolean;
}

interface MockDeviceList {
  status: string;
  devices: Array<{
    id: number;
    name: string;
    inputChannels: number;
    outputChannels: number;
    isDefaultInput: boolean;
    isDefaultOutput: boolean;
  }>;
}

const MOCK_DEVICES: MockDeviceList = {
  status: 'ok',
  devices: [
    { id: 0, name: 'Built-in Mic', inputChannels: 2, outputChannels: 0, isDefaultInput: true, isDefaultOutput: false },
    { id: 1, name: 'Built-in Output', inputChannels: 0, outputChannels: 2, isDefaultInput: false, isDefaultOutput: true },
    { id: 2, name: 'USB Audio', inputChannels: 2, outputChannels: 2, isDefaultInput: false, isDefaultOutput: false },
  ],
};

function makeApi(
  config: MockConfig = { source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null, locked: false },
  setResult: { ok: boolean; fallback?: string | null } = { ok: true, fallback: null },
) {
  let lastSet: MockConfig | undefined;
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const api = {
    invoke: vi.fn(async (channel: string, ...args: unknown[]): Promise<unknown> => {
      if (channel === 'clock:source:get') return { ...config, locked: config.locked ?? false };
      if (channel === 'audio:devices:list') return MOCK_DEVICES;
      if (channel === 'clock:source:set') {
        lastSet = args[0] as MockConfig;
        return setResult;
      }
      return null;
    }),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => void): (() => void) => {
      if (!listeners.has(channel)) listeners.set(channel, []);
      listeners.get(channel)!.push(handler);
      return () => {
        const list = listeners.get(channel) ?? [];
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      };
    }),
    // helpers for tests
    _emit(channel: string, ...args: unknown[]) {
      for (const h of listeners.get(channel) ?? []) h(...args);
    },
    _lastSet() { return lastSet; },
  };

  return api;
}

function mountWithApi(api: ReturnType<typeof makeApi>) {
  // Expose mock api as window.showxApi.cuelistCore
  (window as Window & { showxApi?: unknown }).showxApi = { cuelistCore: api };
}

function unmountApi() {
  delete (window as Window & { showxApi?: unknown }).showxApi;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClockSourceSettings', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { unmountApi(); });

  it('renders nothing when showxApi is absent (station mode)', async () => {
    unmountApi();
    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    const { container } = render(<ClockSourceSettings />);
    expect(container.firstChild).toBeNull();
  });

  it('loads and displays current source (internal)', async () => {
    const api = makeApi({ source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('clock-source-settings')).toBeInTheDocument();
    });

    const internalRadio = screen.getByTestId('clock-source-radio-internal') as HTMLInputElement;
    expect(internalRadio.checked).toBe(true);
  });

  it('source switch from internal → ltc calls clock:source:set with source=ltc', async () => {
    const api = makeApi({ source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => screen.getByTestId('clock-source-radio-ltc'));

    fireEvent.click(screen.getByTestId('clock-source-radio-ltc'));

    await waitFor(() => {
      const lastSet = api._lastSet();
      expect(lastSet?.source).toBe('ltc');
    });
  });

  it('LTC source shows LTC-in device picker', async () => {
    const api = makeApi({ source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('ltc-in-device-select')).toBeInTheDocument();
    });

    // Only input devices visible
    const select = screen.getByTestId('ltc-in-device-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options.some((t) => t.includes('Built-in Mic'))).toBe(true);
    expect(options.some((t) => t.includes('USB Audio'))).toBe(true);
    // Output-only device should not appear
    expect(options.some((t) => t.includes('Built-in Output'))).toBe(false);
  });

  it('LTC-in device selection calls clock:source:set with ltcInDeviceId', async () => {
    const api = makeApi({ source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => screen.getByTestId('ltc-in-device-select'));

    fireEvent.change(screen.getByTestId('ltc-in-device-select'), { target: { value: '0' } });

    await waitFor(() => {
      const lastSet = api._lastSet();
      expect(lastSet?.ltcInDeviceId).toBe(0);
      expect(lastSet?.source).toBe('ltc');
    });
  });

  it('LTC-out picker only appears when LTC out checkbox is enabled', async () => {
    const api = makeApi({ source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => screen.getByTestId('clock-source-settings'));

    expect(screen.queryByTestId('ltc-out-device-select')).toBeNull();

    fireEvent.click(screen.getByTestId('ltc-out-enable'));

    await waitFor(() => {
      expect(screen.getByTestId('ltc-out-device-select')).toBeInTheDocument();
    });
  });

  it('LTC-out device picker shows only output devices', async () => {
    const api = makeApi({ source: 'internal', ltcOutEnabled: true, ltcOutDeviceId: null, ltcInDeviceId: null });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => screen.getByTestId('ltc-out-device-select'));

    const select = screen.getByTestId('ltc-out-device-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options.some((t) => t.includes('Built-in Output'))).toBe(true);
    expect(options.some((t) => t.includes('USB Audio'))).toBe(true);
    expect(options.some((t) => t.includes('Built-in Mic'))).toBe(false);
  });

  it('mutual exclusivity: switching to MTC hides LTC-in picker', async () => {
    const api = makeApi({ source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: 0 });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => screen.getByTestId('ltc-in-device-select'));

    fireEvent.click(screen.getByTestId('clock-source-radio-mtc'));

    await waitFor(() => {
      expect(screen.queryByTestId('ltc-in-device-select')).toBeNull();
    });

    const lastSet = api._lastSet();
    expect(lastSet?.source).toBe('mtc');
  });

  it('lock indicator shows green dot when chase locked', async () => {
    const api = makeApi({ source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: 0, locked: true });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => {
      const dot = screen.getByTestId('clock-lock-dot') as HTMLElement;
      // tokens.color.green = '#34D399' → rgb(52, 211, 153)
      expect(dot.style.background).toBe('rgb(52, 211, 153)');
    });
  });

  it('lock indicator shows yellow dot when chase searching', async () => {
    const api = makeApi({ source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: 0, locked: false });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => {
      const dot = screen.getByTestId('clock-lock-dot') as HTMLElement;
      // tokens.color.yellow = '#F5B83D' → rgb(245, 184, 61)
      expect(dot.style.background).toBe('rgb(245, 184, 61)');
    });
  });

  it('lock state updates via clock:lock:change push event', async () => {
    const api = makeApi({ source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: 0, locked: false });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => {
      const label = screen.getByTestId('clock-lock-label') as HTMLElement;
      expect(label.textContent).toBe('Searching…');
    });

    // Simulate IPC push — lock achieved
    api._emit('clock:lock:change', { source: 'ltc', locked: true });

    await waitFor(() => {
      const label = screen.getByTestId('clock-lock-label') as HTMLElement;
      expect(label.textContent).toBe('Locked');
    });
  });

  it('missing-device fallback shows warning when IPC returns fallback', async () => {
    const api = makeApi(
      { source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null },
      { ok: false, fallback: 'internal' },
    );
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => screen.getByTestId('clock-source-radio-ltc'));
    fireEvent.click(screen.getByTestId('clock-source-radio-ltc'));

    await waitFor(() => {
      expect(screen.getByTestId('clock-source-fallback-warning')).toBeInTheDocument();
    });
  });

  it('internal source shows dim lock dot (free-run)', async () => {
    const api = makeApi({ source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null });
    mountWithApi(api);

    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');
    render(<ClockSourceSettings />);

    await waitFor(() => {
      const dot = screen.getByTestId('clock-lock-dot') as HTMLElement;
      // tokens.color.ink_disabled = '#5C6170' → rgb(92, 97, 112)
      expect(dot.style.background).toBe('rgb(92, 97, 112)');
    });
  });
});

// ── Mount smoke test: ClockSourceSettings inside CuelistCorePanel ────────────

describe('ClockSourceSettings mounted via CuelistCorePanel.clockPanel prop', () => {
  afterEach(() => { unmountApi(); });

  it('renders clock-source-settings inside the Devices tab of CuelistCorePanel', async () => {
    const clockApi = makeApi({ source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null });
    mountWithApi(clockApi);

    const mockIpc = {
      invoke: vi.fn(async (channel: string) => {
        if (channel === 'cuelist-core/get-state') return { open: true, mode: 'rehearsal', cuelistName: 'Test', cueCount: 3, isSm: false };
        if (channel === 'cuelist-core:recent-shows-get') return [];
        if (channel === 'pairing:listOperatorRecords') return [];
        if (channel === 'cuelist-core/get-devices') return [];
        if (channel === 'cuelist-core/list-midi-outputs') return [];
        if (channel === 'health:snapshot') return [];
        return null;
      }),
      on: vi.fn().mockReturnValue(() => {}),
    };

    const { CuelistCorePanel } = await import('../../../src/modules/cuelist-core/src/ui/CuelistCorePanel.js');
    const { ClockSourceSettings } = await import('../../../pwa/src/components/cuelist/ClockSourceSettings.js');

    render(<CuelistCorePanel ipc={mockIpc} clockPanel={<ClockSourceSettings />} />);

    // Navigate to Devices tab where ClockSourceSettings is mounted
    await waitFor(() => screen.getByRole('tab', { name: 'Devices' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Devices' }));

    await waitFor(() => {
      expect(screen.getByTestId('clock-source-settings')).toBeInTheDocument();
    });
  });
});

// ── TimecodeDisplay chase status tests ────────────────────────────────────────

describe('TimecodeDisplayView — chaseStatus prop (B008-004)', () => {
  it('shows green dot when chaseStatus=locked (LTC source)', async () => {
    const { TimecodeDisplayView } = await import('../../../pwa/src/components/cuelist/TimecodeDisplay.js');
    const clock = {
      totalFrames: 0,
      formatted: '01:00:00:00',
      rate: 25,
      dropFrame: false,
      running: true,
      source: 'ltc',
      locked: false, // clock anchor not stale — but chase locked is separate
    };
    render(<TimecodeDisplayView clock={clock} chaseStatus="locked" />);
    const dot = screen.getByTestId('timecode-status-dot') as HTMLElement;
    // green = '#34D399' → rgb(52, 211, 153)
    expect(dot.style.background).toBe('rgb(52, 211, 153)');
    expect(dot.getAttribute('aria-label')).toBe('Chase locked');
  });

  it('shows yellow dot when chaseStatus=searching (LTC source)', async () => {
    const { TimecodeDisplayView } = await import('../../../pwa/src/components/cuelist/TimecodeDisplay.js');
    const clock = {
      totalFrames: 0,
      formatted: '00:00:00:00',
      rate: 25,
      dropFrame: false,
      running: false,
      source: 'ltc',
      locked: false,
    };
    render(<TimecodeDisplayView clock={clock} chaseStatus="searching" />);
    const dot = screen.getByTestId('timecode-status-dot') as HTMLElement;
    // yellow = '#F5B83D' → rgb(245, 184, 61)
    expect(dot.style.background).toBe('rgb(245, 184, 61)');
    expect(dot.getAttribute('aria-label')).toBe('Chase searching');
  });

  it('shows dim dot when chaseStatus=inactive (LTC source)', async () => {
    const { TimecodeDisplayView } = await import('../../../pwa/src/components/cuelist/TimecodeDisplay.js');
    const clock = {
      totalFrames: 0,
      formatted: '00:00:00:00',
      rate: 25,
      dropFrame: false,
      running: false,
      source: 'ltc',
      locked: false,
    };
    render(<TimecodeDisplayView clock={clock} chaseStatus="inactive" />);
    const dot = screen.getByTestId('timecode-status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(92, 97, 112)');
    expect(dot.getAttribute('aria-label')).toBe('Chase inactive');
  });

  it('existing INT behaviour unchanged (no chaseStatus, running+locked → green)', async () => {
    const { TimecodeDisplayView } = await import('../../../pwa/src/components/cuelist/TimecodeDisplay.js');
    const clock = {
      totalFrames: 100,
      formatted: '00:00:04:00',
      rate: 25,
      dropFrame: false,
      running: true,
      source: 'internal',
      locked: true,
    };
    render(<TimecodeDisplayView clock={clock} />);
    const dot = screen.getByTestId('timecode-status-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(52, 211, 153)');
    expect(dot.getAttribute('aria-label')).toBe('Clock running');
  });
});
