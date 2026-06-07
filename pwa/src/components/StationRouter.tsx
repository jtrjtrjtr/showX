import { useState, useEffect } from 'react';
import type { PairedSession } from '../lib/types.js';
import { ConnectionProvider, useConnection } from '../lib/ConnectionProvider.js';
import type { ConnectOpts } from '../lib/cuelistData.js';
import type { DepartmentTag } from 'showx-shared';
import { SMMasterView } from './cuelist/SMMasterView.js';
import { OperatorView } from './cuelist/OperatorView.js';
import { GenericOperatorView } from './cuelist/variants/GenericOperatorView.js';
import { DiscoveryView } from './DiscoveryView.js';

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

  // Resolve first cuelist from doc
  useEffect(() => {
    const cuelists = conn.doc.getMap<unknown>('cuelists');

    const update = () => {
      if (!cuelistId) {
        const first = cuelists.keys().next().value as string | undefined;
        if (first) setCuelistId(first);
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
      <div data-testid="connection-error" style={{ padding: 32, textAlign: 'center', fontFamily: 'system-ui' }}>
        <p>Could not connect to {session.host}.</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!cuelistId) {
    return (
      <div data-testid="station-loading" style={{ padding: 32, textAlign: 'center', fontFamily: 'system-ui', color: '#6b7280' }}>
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

export function StationRouter({ session }: StationRouterProps) {
  if (!session) {
    return <DiscoveryView onPick={() => { window.location.reload(); }} />;
  }

  const opts = buildConnectOpts(session);

  return (
    <ConnectionProvider opts={opts}>
      <StationContent session={session} />
    </ConnectionProvider>
  );
}
