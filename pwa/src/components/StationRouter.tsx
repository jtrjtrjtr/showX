import { useState, useEffect } from 'react';
import type * as Y from 'yjs';
import type { PairedSession } from '../lib/types.js';
import { loadSession, clearSession, saveSession } from '../lib/session.js';
import { ConnectionProvider, useConnection } from '../lib/ConnectionProvider.js';
import type { ConnectOpts } from '../lib/cuelistData.js';
import type { DepartmentTag } from 'showx-shared';
import { SMMasterView } from './cuelist/SMMasterView.js';
import { OperatorView } from './cuelist/OperatorView.js';
import { GenericOperatorView } from './cuelist/variants/GenericOperatorView.js';
import { DiscoveryView } from './DiscoveryView.js';
import { PairingView } from './PairingView.js';
import { tokens } from './cuelist/tokens.js';

interface ActiveShowResponse {
  open: boolean;
  show_id: string | null;
  title: string | null;
  mode: 'rehearsal' | 'show' | null;
}

function ShowClosedView({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="show-closed"
      style={{
        padding: 32,
        textAlign: 'center',
        fontFamily: tokens.font.ui,
        background: tokens.color.bg,
        color: tokens.color.ink,
        minHeight: '100vh',
      }}
    >
      <h2 style={{ color: tokens.color.ink }}>Show closed by stage manager</h2>
      <p style={{ color: tokens.color.ink_secondary }}>
        Waiting for a show to be opened in the FOH shell.
      </p>
      <button
        onClick={onRetry}
        style={{
          padding: `${tokens.space.m}px ${tokens.space.xl}px`,
          background: tokens.color.raised,
          color: tokens.color.ink,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.m,
          fontSize: 14,
          cursor: 'pointer',
          fontFamily: tokens.font.ui,
        }}
      >
        Reconnect
      </button>
    </div>
  );
}

function buildConnectOpts(session: PairedSession): ConnectOpts {
  const show_id = session.show_id ?? 'default';
  const base = `ws://${session.host}:${session.port}`;
  return {
    wsUrl: `${base}/yjs/${show_id}`,
    sideChannelUrl: `${base}/events/${show_id}`,
    show_id,
    pairingToken: session.token,
    operator_id: session.operator_id ?? session.device_id,
    station_id: session.station_id ?? session.device_id,
    display_name: session.display_name,
    role: session.role === 'sm' ? 'sm' : 'operator',
    owned_departments: (session.owned_departments ?? []) as DepartmentTag[],
    watched_departments: (session.watched_departments ?? []) as DepartmentTag[],
    presence_color: session.presence_color ?? '#6b7280',
  };
}

// ── Inner component — runs inside ConnectionProvider ─────────────────────────

interface StationContentProps {
  session: PairedSession;
}

function StationContent({ session }: StationContentProps) {
  const conn = useConnection();
  const [cuelistId, setCuelistId] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Connection timeout: if WebSocket hasn't connected in 10s, show retry UI
  useEffect(() => {
    let connected = false;
    const timer = setTimeout(() => {
      if (!connected) setTimedOut(true);
    }, 10_000);

    const handleStatus = (event: { status: 'connected' | 'disconnected' | 'connecting' }) => {
      if (event.status === 'connected') {
        connected = true;
        clearTimeout(timer);
        setTimedOut(false);
      }
    };

    conn.provider.on('status', handleStatus);

    return () => {
      clearTimeout(timer);
      conn.provider.off('status', handleStatus);
    };
  }, [conn.provider]);

  // Resolve first cuelist from doc.
  useEffect(() => {
    const cuelists = conn.doc.getArray<Y.Map<unknown>>('cuelists');

    const update = () => {
      if (!cuelistId) {
        const first = cuelists.get(0);
        if (first) {
          const id = first.get('id') as string | undefined;
          if (id) setCuelistId(id);
        }
      }
    };

    update();
    conn.doc.on('update', update);

    return () => {
      conn.doc.off('update', update);
    };
  }, [conn.doc, cuelistId]);

  if (timedOut) {
    return (
      <div
        data-testid="connection-error"
        style={{
          padding: 32,
          textAlign: 'center',
          fontFamily: tokens.font.ui,
          background: tokens.color.bg,
          color: tokens.color.ink,
          minHeight: '100vh',
        }}
      >
        <p style={{ color: tokens.color.ink_secondary }}>
          Could not connect to {session.host}.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: `${tokens.space.m}px ${tokens.space.xl}px`,
            background: tokens.color.raised,
            color: tokens.color.ink,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.m,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: tokens.font.ui,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!cuelistId) {
    return (
      <div
        data-testid="station-loading"
        style={{
          padding: 32,
          textAlign: 'center',
          fontFamily: tokens.font.ui,
          background: tokens.color.bg,
          color: tokens.color.ink_secondary,
          minHeight: '100vh',
        }}
      >
        Loading show…
      </div>
    );
  }

  const role = session.role ?? 'operator';

  if (role === 'sm') {
    return <SMMasterView cuelistId={cuelistId} />;
  }

  if (role === 'operator') {
    return (
      <OperatorView
        cuelistId={cuelistId}
        owned={(session.owned_departments ?? []) as DepartmentTag[]}
        watched={(session.watched_departments ?? []) as DepartmentTag[]}
      />
    );
  }

  // companion / observer — read-only fallback
  return <GenericOperatorView cuelistId={cuelistId} owned={[]} watched={[]} />;
}

// ── Public component ──────────────────────────────────────────────────────────

interface StationRouterProps {
  session: PairedSession | null;
}

function pairingHostFromLocation(): { host: string; port: number; pairingAvailable: true } | null {
  if (window.location.pathname === '/pairing') {
    return {
      host: window.location.hostname,
      port: Number(window.location.port) || 80,
      pairingAvailable: true,
    };
  }
  return null;
}

export function StationRouter({ session: sessionProp }: StationRouterProps) {
  // Synchronously read localStorage on first render.
  // If a stored session exists, we must validate it before showing the station.
  const storedOnMount = loadSession();

  const [resolvedSession, setResolvedSession] = useState<PairedSession | null>(
    // If no stored session: use the prop immediately (no async needed)
    storedOnMount ? null : sessionProp,
  );
  const [validating, setValidating] = useState(storedOnMount !== null);

  const [currentShowId, setCurrentShowId] = useState<string | undefined>(
    sessionProp?.show_id,
  );
  const [closedByShell, setClosedByShell] = useState(false);
  const [switchingTitle, setSwitchingTitle] = useState<string | null>(null);

  // Validate stored session on mount
  useEffect(() => {
    if (!storedOnMount) return;

    fetch(`http://${storedOnMount.host}:${storedOnMount.port}/api/pairing/validate`, {
      headers: { Authorization: `Bearer ${storedOnMount.token}` },
    })
      .then((r) => r.json() as Promise<{ valid: boolean }>)
      .then((data) => {
        if (data.valid) {
          setResolvedSession(storedOnMount);
          setCurrentShowId(storedOnMount.show_id);
        } else {
          clearSession();
          setResolvedSession(sessionProp);
        }
      })
      .catch(() => {
        // Network error — fall back to prop (usually null)
        setResolvedSession(sessionProp);
      })
      .finally(() => setValidating(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear the switching overlay after 2 seconds max
  useEffect(() => {
    if (!switchingTitle) return;
    const t = setTimeout(() => setSwitchingTitle(null), 2000);
    return () => clearTimeout(t);
  }, [switchingTitle]);

  // Poll /api/active-show every 2s to detect show open/close/switch
  useEffect(() => {
    if (!resolvedSession) return;
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`http://${resolvedSession.host}:${resolvedSession.port}/api/active-show`);
        const data = (await r.json()) as ActiveShowResponse;
        if (!data.open) {
          setClosedByShell(true);
          return;
        }
        setClosedByShell(false);
        if (data.show_id && data.show_id !== currentShowId) {
          setSwitchingTitle(data.title);
          setCurrentShowId(data.show_id);
        }
      } catch {
        // network blip — retry on next tick
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [resolvedSession, currentShowId]);

  if (validating) {
    return (
      <div
        data-testid="station-validating"
        style={{
          padding: 32,
          textAlign: 'center',
          fontFamily: tokens.font.ui,
          background: tokens.color.bg,
          color: tokens.color.ink_secondary,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Connecting…
      </div>
    );
  }

  if (!resolvedSession) {
    // If at /pairing path, show pairing form; otherwise discovery
    const pairingHost = pairingHostFromLocation();
    if (pairingHost) {
      return (
        <PairingView
          host={pairingHost}
          onPaired={(s) => {
            saveSession(s);
            setResolvedSession(s);
            setCurrentShowId(s.show_id);
          }}
        />
      );
    }
    return <DiscoveryView onPick={() => { window.location.reload(); }} />;
  }

  if (closedByShell) {
    return (
      <ShowClosedView onRetry={() => { window.location.reload(); }} />
    );
  }

  if (switchingTitle) {
    return (
      <div
        data-testid="station-switching"
        style={{
          padding: 32,
          textAlign: 'center',
          fontFamily: tokens.font.ui,
          background: tokens.color.bg,
          color: tokens.color.ink_secondary,
          minHeight: '100vh',
        }}
      >
        Switching to {switchingTitle}…
      </div>
    );
  }

  const effectiveShowId = currentShowId ?? resolvedSession.show_id ?? 'default';
  const opts = buildConnectOpts({ ...resolvedSession, show_id: effectiveShowId });

  return (
    <ConnectionProvider key={effectiveShowId} opts={opts}>
      <StationContent session={{ ...resolvedSession, show_id: effectiveShowId }} />
    </ConnectionProvider>
  );
}
