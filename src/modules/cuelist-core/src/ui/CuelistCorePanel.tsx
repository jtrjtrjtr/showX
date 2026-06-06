import { useState, useEffect } from 'react';
import { tokens } from './tokens.js';
import { ShowFilePicker } from './ShowFilePicker.js';
import { StationsTable, type Awareness } from './StationsTable.js';
import { StatusStrip, type HealthLevel } from './StatusStrip.js';
import { DevicesTable } from './DevicesTable.js';
import { RoutingTable } from './RoutingTable.js';

export interface IpcBridge {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  on(channel: string, handler: (...args: unknown[]) => void): () => void;
}

interface ShowState {
  open: boolean;
  pkgPath?: string;
  title?: string;
  venue?: string;
  date?: string;
  mode?: 'rehearsal' | 'show';
  cuelistName?: string;
  cueCount?: number;
  isSm?: boolean;
}

interface PanelProps {
  ipc: IpcBridge;
}

type ActiveTab = 'show' | 'devices' | 'routing';

function ModeBadge({
  mode,
  isSm,
  onClick,
}: {
  mode: 'rehearsal' | 'show';
  isSm: boolean;
  onClick: () => void;
}) {
  const bg = mode === 'show' ? tokens.color.red : tokens.color.teal;
  const label = mode === 'show' ? 'SHOW' : 'REHEARSAL';
  return (
    <button
      onClick={onClick}
      disabled={!isSm}
      aria-label={`Mode: ${label}. ${isSm ? 'Click to toggle' : 'Only SM can toggle'}`}
      style={{
        background: bg,
        color: tokens.color.cream,
        padding: `${tokens.space.s}px ${tokens.space.l}px`,
        borderRadius: tokens.radius.l,
        border: 'none',
        fontWeight: 700,
        fontFamily: tokens.font.ui,
        fontSize: 14,
        cursor: isSm ? 'pointer' : 'not-allowed',
        opacity: isSm ? 1 : 0.7,
      }}
    >
      {label}
    </button>
  );
}

function TabBar({
  active,
  onChange,
}: {
  active: ActiveTab;
  onChange: (t: ActiveTab) => void;
}) {
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'show', label: 'Show' },
    { key: 'devices', label: 'Devices' },
    { key: 'routing', label: 'Routing' },
  ];

  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        borderBottom: `2px solid ${tokens.color.gray_50}`,
        marginBottom: tokens.space.l,
      }}
    >
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          aria-selected={active === key}
          onClick={() => onChange(key)}
          style={{
            fontFamily: tokens.font.ui,
            fontSize: 14,
            fontWeight: active === key ? 600 : 400,
            color: active === key ? tokens.color.teal : tokens.color.gray_700,
            background: 'none',
            border: 'none',
            borderBottom: active === key ? `2px solid ${tokens.color.teal}` : '2px solid transparent',
            padding: `${tokens.space.s}px ${tokens.space.l}px`,
            cursor: 'pointer',
            marginBottom: -2,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function CuelistCorePanel({ ipc }: PanelProps) {
  const [showState, setShowState] = useState<ShowState>({ open: false });
  const [stations, setStations] = useState<Awareness[]>([]);
  const [health, setHealth] = useState<HealthLevel>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      const saved = window.localStorage.getItem('cuelist-core:active-tab');
      if (saved === 'devices' || saved === 'routing') return saved;
    } catch { /* no-op */ }
    return 'show';
  });

  useEffect(() => {
    const offState = ipc.on('cuelist-core/show-state', (s) => setShowState(s as ShowState));
    const offStations = ipc.on('cuelist-core/stations', (s) => setStations(s as Awareness[]));
    const offHealth = ipc.on('cuelist-core/health', (h) => setHealth(h as HealthLevel));
    void ipc.invoke<ShowState>('cuelist-core/get-state').then((s) => {
      if (s && typeof s === 'object') setShowState(s);
    });
    return () => {
      offState();
      offStations();
      offHealth();
    };
  }, [ipc]);

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    try { window.localStorage.setItem('cuelist-core:active-tab', tab); } catch { /* no-op */ }
  };

  const openShow = async () => {
    try {
      const path = await ipc.invoke<string | null>('cuelist-core/pick-show-file');
      if (path) await ipc.invoke('cuelist-core/open-show', path);
    } catch (e) {
      setError(String(e));
    }
  };

  const newShow = async () => {
    try {
      await ipc.invoke('cuelist-core/new-show-flow');
    } catch (e) {
      setError(String(e));
    }
  };

  const toggleMode = async () => {
    if (!showState.isSm) return;
    const target = showState.mode === 'rehearsal' ? 'show' : 'rehearsal';
    try {
      await ipc.invoke('cuelist-core/transition-mode', target);
    } catch (e) {
      setError(String(e));
    }
  };

  if (!showState.open) {
    return (
      <div
        style={{
          background: tokens.color.cream,
          minHeight: '100vh',
          padding: tokens.space.xxl,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: tokens.font.ui,
        }}
      >
        <h1 style={{ color: tokens.color.ink, marginBottom: tokens.space.m }}>Cuelist Core</h1>
        <p style={{ color: tokens.color.gray_700, marginBottom: tokens.space.xl }}>
          Open a show file or create a new one to start.
        </p>
        <ShowFilePicker onOpen={() => void openShow()} onNew={() => void newShow()} />
        {error && (
          <div
            role="alert"
            style={{
              background: tokens.color.red,
              color: tokens.color.cream,
              padding: tokens.space.m,
              borderRadius: tokens.radius.m,
              marginTop: tokens.space.l,
              maxWidth: 480,
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: tokens.color.cream,
        minHeight: '100vh',
        padding: tokens.space.xxl,
        fontFamily: tokens.font.ui,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: tokens.space.m,
        }}
      >
        <div>
          <h1 style={{ color: tokens.color.ink, margin: 0, fontSize: 22 }}>
            {showState.title ?? '(untitled)'}
          </h1>
          <p style={{ color: tokens.color.gray_700, margin: 0, marginTop: tokens.space.xs }}>
            {[showState.venue, showState.date].filter(Boolean).join(' · ')}
          </p>
        </div>
        <ModeBadge
          mode={showState.mode ?? 'rehearsal'}
          isSm={!!showState.isSm}
          onClick={() => void toggleMode()}
        />
      </header>

      <StatusStrip health={health} pkgPath={showState.pkgPath ?? ''} />

      <div style={{ marginTop: tokens.space.xl }}>
        <TabBar active={activeTab} onChange={handleTabChange} />

        {activeTab === 'show' && (
          <>
            <section>
              <h2 style={{ color: tokens.color.ink, marginBottom: tokens.space.s }}>Cuelist</h2>
              <p style={{ color: tokens.color.gray_700 }}>
                {showState.cuelistName ?? '—'} &mdash; {showState.cueCount ?? 0} cues
              </p>
            </section>

            <section style={{ marginTop: tokens.space.xl }}>
              <h2 style={{ color: tokens.color.ink, marginBottom: tokens.space.s }}>Stations</h2>
              <StationsTable
                stations={stations}
                canKick={!!showState.isSm}
                onKick={(id) => void ipc.invoke('cuelist-core/kick-station', id)}
              />
            </section>
          </>
        )}

        {activeTab === 'devices' && (
          <DevicesTable ipc={ipc} mode={showState.mode} />
        )}

        {activeTab === 'routing' && (
          <RoutingTable ipc={ipc} mode={showState.mode} />
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: tokens.color.red,
            color: tokens.color.cream,
            padding: tokens.space.m,
            borderRadius: tokens.radius.m,
            marginTop: tokens.space.l,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
