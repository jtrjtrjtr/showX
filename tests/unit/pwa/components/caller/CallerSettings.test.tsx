// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CallerSettings, CALLER_SINK_ID_KEY } from '../../../../../pwa/src/components/caller/CallerSettings.js';

let localStorageData: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageData[key] ?? null,
  setItem: (key: string, value: string) => { localStorageData[key] = value; },
  removeItem: (key: string) => { delete localStorageData[key]; },
  clear: () => { localStorageData = {}; },
  key: (_i: number) => null,
  length: 0,
};

beforeEach(() => {
  localStorageData = {};
  vi.stubGlobal('localStorage', localStorageMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type DeviceStub = { deviceId: string; label: string; kind: MediaDeviceKind };

function stubMediaDevices(devices: DeviceStub[]) {
  const stub = {
    enumerateDevices: vi.fn().mockResolvedValue(
      devices.map((d) => ({
        deviceId: d.deviceId,
        groupId: '',
        kind: d.kind,
        label: d.label,
        toJSON() { return {}; },
      }))
    ),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    value: stub,
    writable: true,
    configurable: true,
  });
  return stub;
}

describe('CallerSettings', () => {
  it('renders "System default" plus discovered audiooutput devices, filtering audioinput', async () => {
    stubMediaDevices([
      { deviceId: 'spk-1', label: 'Built-in Speakers', kind: 'audiooutput' },
      { deviceId: 'usb-1', label: 'USB Intercom', kind: 'audiooutput' },
      { deviceId: 'mic-1', label: 'Microphone', kind: 'audioinput' },
    ]);

    render(<CallerSettings selectedDeviceId="" onDeviceChange={vi.fn()} />);

    await waitFor(() => {
      const select = screen.getByTestId('caller-settings-device-select') as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1);
    });

    const select = screen.getByTestId('caller-settings-device-select') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.text);

    expect(labels).toContain('System default');
    expect(labels).toContain('Built-in Speakers');
    expect(labels).toContain('USB Intercom');
    expect(labels).not.toContain('Microphone');
  });

  it('changing selection writes to localStorage and calls onDeviceChange', async () => {
    stubMediaDevices([
      { deviceId: 'spk-1', label: 'Built-in Speakers', kind: 'audiooutput' },
      { deviceId: 'usb-1', label: 'USB Intercom', kind: 'audiooutput' },
    ]);

    const onDeviceChange = vi.fn();
    render(<CallerSettings selectedDeviceId="" onDeviceChange={onDeviceChange} />);

    await waitFor(() => {
      const select = screen.getByTestId('caller-settings-device-select') as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1);
    });

    fireEvent.change(screen.getByTestId('caller-settings-device-select'), { target: { value: 'usb-1' } });

    expect(localStorageMock.getItem(CALLER_SINK_ID_KEY)).toBe('usb-1');
    expect(onDeviceChange).toHaveBeenCalledWith('usb-1');
    expect(onDeviceChange).toHaveBeenCalledTimes(1);
  });

  it('renders fallback warning when deviceFallback is true', async () => {
    stubMediaDevices([]);
    render(<CallerSettings selectedDeviceId="" onDeviceChange={vi.fn()} deviceFallback={true} />);
    const warning = await screen.findByTestId('caller-settings-fallback-warning');
    expect(warning.textContent).toContain('Device unavailable');
  });

  it('renders permission hint when device labels are obscured (no microphone permission)', async () => {
    stubMediaDevices([
      { deviceId: 'abc12345def6', label: '', kind: 'audiooutput' },
      { deviceId: 'xyz98765qrst', label: '', kind: 'audiooutput' },
    ]);
    render(<CallerSettings selectedDeviceId="" onDeviceChange={vi.fn()} />);
    const hint = await screen.findByTestId('caller-settings-permission-hint');
    expect(hint.textContent).toContain('microphone permission');
  });
});
