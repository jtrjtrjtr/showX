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

  useEffect(() => {
    let active = true;
    let created: Connection | null = null;
    connectToShow(opts).then((c) => {
      if (!active) {
        c.disconnect();
        return;
      }
      created = c;
      setConn(c);
    });
    return () => {
      active = false;
      created?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.wsUrl, opts.show_id, opts.pairingToken]);

  if (!conn) return <div>Connecting…</div>;
  return <ConnectionContext.Provider value={conn}>{children}</ConnectionContext.Provider>;
};

export function useConnection(): Connection {
  const c = useContext(ConnectionContext);
  if (!c) throw new Error('useConnection must be used inside ConnectionProvider');
  return c;
}
