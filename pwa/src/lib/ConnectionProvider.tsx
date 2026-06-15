import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Connection, ConnectOpts } from './cuelistData.js';
import { connectToShow } from './cuelistData.js';

export const ConnectionContext = createContext<Connection | null>(null);

interface ConnectionProviderProps {
  opts: ConnectOpts;
  children: React.ReactNode;
}

export const ConnectionProvider: React.FC<ConnectionProviderProps> = ({ opts, children }) => {
  const [conn, setConn] = useState<Connection | null>(null);
  const [connError, setConnError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: Connection | null = null;
    setConnError(null);
    connectToShow(opts)
      .then((c) => {
        if (!active) {
          c.disconnect();
          return;
        }
        created = c;
        setConn(c);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Connection failed';
        console.error('[ConnectionProvider] connectToShow failed:', msg);
        setConnError(msg);
      });
    return () => {
      active = false;
      created?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.wsUrl, opts.show_id, opts.pairingToken]);

  if (!conn) {
    if (connError) {
      return (
        <div
          data-testid="connection-failed"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0a',
            color: '#9ca3af',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            gap: 16,
            padding: 32,
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0 }}>Could not connect to show server.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              background: '#1f2937',
              color: '#d1d5db',
              border: '1px solid #374151',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: '#6b7280',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14,
        }}
      >
        Connecting…
      </div>
    );
  }
  return <ConnectionContext.Provider value={conn}>{children}</ConnectionContext.Provider>;
};

export function useConnection(): Connection {
  const c = useContext(ConnectionContext);
  if (!c) throw new Error('useConnection must be used inside ConnectionProvider');
  return c;
}
