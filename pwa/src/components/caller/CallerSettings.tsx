// Audio output device selector — B007-008
// Lets the showcaller route AI caller audio to the intercom output device.
// Uses navigator.mediaDevices.enumerateDevices; persists selection to localStorage.

import { useState, useEffect, useCallback } from 'react';
import { tokens } from '../cuelist/tokens.js';

export const CALLER_SINK_ID_KEY = 'showx-caller-sinkId';

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

export interface CallerSettingsProps {
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
  /** True when the selected device disappeared; engine fell back to default. */
  deviceFallback?: boolean;
}

async function listOutputDevices(): Promise<AudioOutputDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Output ${d.deviceId.slice(0, 8)}` }));
  } catch {
    return [];
  }
}

export function CallerSettings({ selectedDeviceId, onDeviceChange, deviceFallback = false }: CallerSettingsProps) {
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [permissionHint, setPermissionHint] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listOutputDevices();
    setDevices(list);
    // If all labels are device IDs (no permission), show hint
    const noLabels = list.length > 0 && list.every((d) => d.label.startsWith('Output '));
    setPermissionHint(noLabels);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();

    // Refresh when devices change (plug/unplug)
    const handler = () => { void refresh(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [refresh]);

  const handleChange = useCallback((deviceId: string) => {
    try {
      localStorage.setItem(CALLER_SINK_ID_KEY, deviceId);
    } catch {
      // localStorage unavailable — ignore
    }
    onDeviceChange(deviceId);
  }, [onDeviceChange]);

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: tokens.color.ink_secondary,
    fontFamily: tokens.font.ui,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink: 0,
  };

  const selectStyle: React.CSSProperties = {
    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
    background: tokens.color.raised,
    color: tokens.color.ink,
    border: `1px solid ${deviceFallback ? tokens.color.yellow : tokens.color.border}`,
    borderRadius: tokens.radius.s,
    fontSize: 12,
    fontFamily: tokens.font.ui,
    cursor: 'pointer',
    minWidth: 180,
    maxWidth: 260,
  };

  return (
    <div
      data-testid="caller-settings"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.m,
        padding: `${tokens.space.xs}px ${tokens.space.m}px`,
        background: tokens.color.panel,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.s,
        fontFamily: tokens.font.ui,
        flexWrap: 'wrap',
      }}
    >
      <span style={labelStyle}>Output</span>
      <select
        data-testid="caller-settings-device-select"
        value={selectedDeviceId}
        onChange={(e) => handleChange(e.target.value)}
        style={selectStyle}
        aria-label="Select audio output device for AI caller"
        disabled={loading || devices.length === 0}
      >
        <option value="">System default</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
      {deviceFallback && (
        <span
          data-testid="caller-settings-fallback-warning"
          style={{
            fontSize: 11,
            color: tokens.color.yellow,
            fontFamily: tokens.font.ui,
          }}
        >
          ⚠ Device unavailable — using default
        </span>
      )}
      {permissionHint && (
        <span
          data-testid="caller-settings-permission-hint"
          style={{
            fontSize: 11,
            color: tokens.color.ink_secondary,
            fontFamily: tokens.font.ui,
          }}
        >
          Grant microphone permission to see device names
        </span>
      )}
    </div>
  );
}
