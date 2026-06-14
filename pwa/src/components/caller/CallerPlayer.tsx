// Caller playback panel — B007-006
// Opt-in toggle for AI Showcaller audio. Mounts in the shell FOH window.
// When disabled: zero audio, zero network activity (no regression for non-caller shows).

import { useState, useEffect, useCallback, useRef } from 'react';
import { CallerAudio, type CallerAudioState, type CallerManifestPWA } from '../../lib/callerAudio.js';
import { tokens } from '../cuelist/tokens.js';
import { InterruptButton } from './InterruptButton.js';
import { CallerSettings, CALLER_SINK_ID_KEY } from './CallerSettings.js';

// ── Side-channel type (accepts SideChannelClient or compatible mock) ──────────

interface CallerPlayerChannel {
  on(event: 'standby.broadcast', cb: (e: { cue_id: string; cuelist_id: string; departments: string[]; standby: boolean }) => void): () => void;
  on(event: 'go.dispatched', cb: (e: { cue_id: string; cuelist_id: string; historic: boolean }) => void): () => void;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CallerPlayerProps {
  sideChannel: CallerPlayerChannel;
  /** Fetches manifest from main process via IPC. Injected so the component is testable. */
  getManifest(): Promise<CallerManifestPWA | null>;
  /** Initial enabled state (default false). */
  defaultEnabled?: boolean;
}

// ── State labels ──────────────────────────────────────────────────────────────

const STATE_LABEL: Record<CallerAudioState, string> = {
  idle: 'Ready',
  'playing-standby': 'Standby ▶',
  'playing-go': 'GO ▶',
  'no-audio': 'No audio',
  manual: 'Manual',
};

const STATE_COLOR: Record<CallerAudioState, string> = {
  idle: tokens.color.ink_secondary,
  'playing-standby': tokens.color.yellow,
  'playing-go': tokens.color.green,
  'no-audio': tokens.color.red,
  manual: tokens.color.red,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CallerPlayer({ sideChannel, getManifest, defaultEnabled = false }: CallerPlayerProps) {
  const [enabled, setEnabledState] = useState(defaultEnabled);
  const [audioState, setAudioState] = useState<CallerAudioState>('idle');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    try { return localStorage.getItem(CALLER_SINK_ID_KEY) ?? ''; } catch { return ''; }
  });
  const [deviceFallback, setDeviceFallback] = useState(false);
  const engineRef = useRef<CallerAudio | null>(null);

  // Create engine once on mount, subscribe to state changes and device fallback
  useEffect(() => {
    const engine = new CallerAudio({ sideChannel, getManifest });
    engineRef.current = engine;
    const offState = engine.onStateChange(setAudioState);
    const offFallback = engine.onDeviceFallback(() => {
      setDeviceFallback(true);
      setSelectedDeviceId('');
      try { localStorage.removeItem(CALLER_SINK_ID_KEY); } catch { /* ignore */ }
    });
    // Apply persisted device ID on mount
    const persisted = (() => { try { return localStorage.getItem(CALLER_SINK_ID_KEY) ?? ''; } catch { return ''; } })();
    if (persisted) engine.setOutputDevice(persisted);
    return () => {
      offState();
      offFallback();
      engine.destroy();
      engineRef.current = null;
    };
  }, [sideChannel, getManifest]);

  const handleToggle = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;
      void engineRef.current?.setEnabled(next);
      return next;
    });
  }, []);

  const handleInterrupt = useCallback(() => {
    engineRef.current?.interrupt();
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resumeAI();
  }, []);

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setDeviceFallback(false);
    engineRef.current?.setOutputDevice(deviceId);
  }, []);

  // Sync enabled state if defaultEnabled changes (e.g. from persisted config)
  useEffect(() => {
    setEnabledState(defaultEnabled);
    void engineRef.current?.setEnabled(defaultEnabled);
  }, [defaultEnabled]);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space.m,
    padding: `${tokens.space.s}px ${tokens.space.m}px`,
    background: tokens.color.panel,
    border: `1px solid ${tokens.color.border}`,
    borderRadius: tokens.radius.s,
    fontFamily: tokens.font.ui,
  };

  const toggleStyle: React.CSSProperties = {
    padding: `${tokens.space.xs}px ${tokens.space.m}px`,
    border: `1px solid ${enabled ? tokens.color.teal : tokens.color.border}`,
    borderRadius: tokens.radius.s,
    background: enabled ? tokens.color.teal_dim : 'transparent',
    color: enabled ? tokens.color.teal : tokens.color.ink_secondary,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: tokens.font.ui,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  const stateStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: enabled ? STATE_COLOR[audioState] : tokens.color.ink_disabled,
    fontFamily: tokens.font.mono ?? tokens.font.ui,
    letterSpacing: '0.04em',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: tokens.color.ink_secondary,
    fontFamily: tokens.font.ui,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };

  return (
    <div data-testid="caller-player" style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s }}>
      <div style={containerStyle}>
        <span style={labelStyle}>AI Caller</span>
        <button
          data-testid="caller-player-toggle"
          onClick={handleToggle}
          style={toggleStyle}
          aria-pressed={enabled}
        >
          {enabled ? 'On' : 'Off'}
        </button>
        {enabled && (
          <span data-testid="caller-player-state" style={stateStyle}>
            {STATE_LABEL[audioState]}
            {audioState === 'no-audio' && (
              <span
                data-testid="caller-player-no-audio-indicator"
                title="No pre-generated audio for this cue. Run pre-generation in REHEARSAL mode."
                style={{ marginLeft: 4, cursor: 'help' }}
              >
                ⚠
              </span>
            )}
          </span>
        )}
      </div>
      <InterruptButton
        onInterrupt={handleInterrupt}
        onResume={handleResume}
        isManual={audioState === 'manual'}
        callerEnabled={enabled}
      />
      {enabled && (
        <CallerSettings
          selectedDeviceId={selectedDeviceId}
          onDeviceChange={handleDeviceChange}
          deviceFallback={deviceFallback}
        />
      )}
    </div>
  );
}
