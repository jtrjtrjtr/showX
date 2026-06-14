// B008-004 — LTC source UI + clock source switching
// Lets the operator choose between Internal / MTC chase / LTC chase,
// configure audio devices for LTC in/out, and see live lock state.
// Renders only in Electron shell mode (requires window.showxApi.cuelistCore).

import { useState, useEffect, useCallback } from 'react';
import { tokens } from './tokens.js';

// ── IPC channel strings (mirror of channels.ts constants) ────────────────────

const CH_CLOCK_SOURCE_GET = 'clock:source:get';
const CH_CLOCK_SOURCE_SET = 'clock:source:set';
const CH_AUDIO_DEVICES_LIST = 'audio:devices:list';
const CH_CLOCK_LOCK_CHANGE = 'clock:lock:change';

// ── Shared types ─────────────────────────────────────────────────────────────

export type ClockSource = 'internal' | 'mtc' | 'ltc';

export interface ClockSourceConfig {
  source: ClockSource;
  ltcOutEnabled: boolean;
  ltcOutDeviceId: number | null;
  ltcInDeviceId: number | null;
}

export interface AudioDevice {
  id: number;
  name: string;
  inputChannels: number;
  outputChannels: number;
  isDefaultInput: boolean;
  isDefaultOutput: boolean;
}

interface CuelistCoreApiLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, handler: (...args: unknown[]) => void): () => void;
}

function getApi(): CuelistCoreApiLike | undefined {
  return (
    typeof window !== 'undefined'
      ? (window as Window & { showxApi?: { cuelistCore?: CuelistCoreApiLike } }).showxApi?.cuelistCore
      : undefined
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const label: React.CSSProperties = {
  fontSize: 11,
  color: tokens.color.ink_secondary,
  fontFamily: tokens.font.ui,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const selectStyle: React.CSSProperties = {
  padding: `${tokens.space.xs}px ${tokens.space.s}px`,
  background: tokens.color.raised,
  color: tokens.color.ink,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.s,
  fontSize: 12,
  fontFamily: tokens.font.ui,
  cursor: 'pointer',
  minWidth: 180,
  maxWidth: 260,
};

const radioRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.space.s,
  cursor: 'pointer',
  fontSize: 13,
  color: tokens.color.ink,
  fontFamily: tokens.font.ui,
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Clock source settings panel (shell-only).
 * Mounted inside the Cuelist Core shell panel header / settings area.
 */
export function ClockSourceSettings() {
  const api = getApi();

  const [config, setConfig] = useState<ClockSourceConfig>({
    source: 'internal',
    ltcOutEnabled: false,
    ltcOutDeviceId: null,
    ltcInDeviceId: null,
  });

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [locked, setLocked] = useState(false);
  const [fallbackWarning, setFallbackWarning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initial load: current config + device list
  useEffect(() => {
    if (!api) { setLoading(false); return; }

    void Promise.all([
      api.invoke(CH_CLOCK_SOURCE_GET),
      api.invoke(CH_AUDIO_DEVICES_LIST),
    ]).then(([rawConfig, rawDevices]) => {
      const cfg = rawConfig as (ClockSourceConfig & { locked?: boolean }) | undefined;
      if (cfg) {
        setConfig({
          source: cfg.source ?? 'internal',
          ltcOutEnabled: cfg.ltcOutEnabled ?? false,
          ltcOutDeviceId: cfg.ltcOutDeviceId ?? null,
          ltcInDeviceId: cfg.ltcInDeviceId ?? null,
        });
        setLocked(cfg.locked ?? false);
      }
      const dl = (rawDevices as { devices?: AudioDevice[] } | undefined)?.devices ?? [];
      setDevices(dl);
      setLoading(false);
    });
  }, [api]);

  // Subscribe to lock state changes
  useEffect(() => {
    if (!api?.on) return;
    const unsub = api.on(CH_CLOCK_LOCK_CHANGE, (...args: unknown[]) => {
      const payload = args[0] as { source?: string; locked?: boolean } | undefined;
      if (payload) setLocked(payload.locked ?? false);
    });
    return unsub;
  }, [api]);

  const applyConfig = useCallback(async (next: ClockSourceConfig) => {
    setConfig(next);
    setFallbackWarning(false);
    if (!api) return;
    const result = await api.invoke(CH_CLOCK_SOURCE_SET, next) as { ok?: boolean; fallback?: string | null } | undefined;
    if (result?.fallback) {
      setFallbackWarning(true);
      setConfig((prev) => ({ ...prev, source: result.fallback as ClockSource }));
    }
  }, [api]);

  const inputDevices = devices.filter((d) => d.inputChannels > 0);
  const outputDevices = devices.filter((d) => d.outputChannels > 0);

  // Not in Electron shell
  if (!api) return null;

  if (loading) {
    return (
      <div
        data-testid="clock-source-settings"
        style={{ fontSize: 11, color: tokens.color.ink_disabled, fontFamily: tokens.font.ui }}
      >
        Loading…
      </div>
    );
  }

  const { source, ltcOutEnabled, ltcOutDeviceId, ltcInDeviceId } = config;

  // Lock indicator for active chase source
  const isChase = source === 'mtc' || source === 'ltc';
  const lockDot = isChase ? (locked ? tokens.color.green : tokens.color.yellow) : tokens.color.ink_disabled;
  const lockText = isChase
    ? (locked ? 'Locked' : 'Searching…')
    : 'Free-run';

  return (
    <div
      data-testid="clock-source-settings"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: tokens.space.m,
        padding: tokens.space.m,
        background: tokens.color.panel,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.s,
        fontFamily: tokens.font.ui,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
        <span style={{ ...label, fontSize: 12 }}>Clock Source</span>
        {/* Lock indicator */}
        <span
          data-testid="clock-lock-dot"
          aria-label={lockText}
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: lockDot,
          }}
        />
        <span
          data-testid="clock-lock-label"
          style={{
            fontSize: 10,
            color: isChase
              ? (locked ? tokens.color.green : tokens.color.yellow)
              : tokens.color.ink_disabled,
            fontFamily: tokens.font.ui,
          }}
        >
          {lockText}
        </span>
      </div>

      {fallbackWarning && (
        <span
          data-testid="clock-source-fallback-warning"
          style={{ fontSize: 11, color: tokens.color.yellow, fontFamily: tokens.font.ui }}
        >
          ⚠ Audio device unavailable — fell back to Internal
        </span>
      )}

      {/* Source selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.xs }}>
        {(['internal', 'mtc', 'ltc'] as const).map((src) => {
          const srcLabel = src === 'internal' ? 'Internal (free-run)' : src === 'mtc' ? 'MTC chase' : 'LTC chase';
          return (
            <label key={src} style={radioRowStyle}>
              <input
                type="radio"
                name="clock-source"
                data-testid={`clock-source-radio-${src}`}
                value={src}
                checked={source === src}
                onChange={() => {
                  void applyConfig({
                    ...config,
                    source: src,
                    // Mutual exclusivity: disable LTC receiver when switching away from LTC
                    ltcInDeviceId: src === 'ltc' ? ltcInDeviceId : null,
                  });
                }}
              />
              {srcLabel}
            </label>
          );
        })}
      </div>

      {/* LTC device section (shown when LTC chase or LTC out enabled) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s }}>
        {/* LTC Input device — only relevant when source is LTC */}
        {source === 'ltc' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
            <span style={label}>LTC In</span>
            <select
              data-testid="ltc-in-device-select"
              value={ltcInDeviceId ?? ''}
              onChange={(e) => {
                const id = e.target.value === '' ? null : Number(e.target.value);
                void applyConfig({ ...config, ltcInDeviceId: id });
              }}
              style={selectStyle}
              aria-label="LTC input audio device"
              disabled={inputDevices.length === 0}
            >
              <option value="">— Select input device —</option>
              {inputDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* LTC Output (available for all sources; LtcGenerator suppresses when source ≠ internal) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
          <label style={{ ...radioRowStyle, fontSize: 12 }}>
            <input
              type="checkbox"
              data-testid="ltc-out-enable"
              checked={ltcOutEnabled}
              onChange={(e) => {
                void applyConfig({ ...config, ltcOutEnabled: e.target.checked });
              }}
            />
            <span style={label}>LTC Out</span>
          </label>
          {ltcOutEnabled && (
            <select
              data-testid="ltc-out-device-select"
              value={ltcOutDeviceId ?? ''}
              onChange={(e) => {
                const id = e.target.value === '' ? null : Number(e.target.value);
                void applyConfig({ ...config, ltcOutDeviceId: id });
              }}
              style={selectStyle}
              aria-label="LTC output audio device"
              disabled={outputDevices.length === 0}
            >
              <option value="">— Select output device —</option>
              {outputDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
