import { useEffect, useState } from 'react';
import type { GoDispatched } from '../lib/sideChannel.js';
import { useConnection } from '../lib/ConnectionProvider.js';

export interface GoChannelState {
  go: (cueId: string, override?: boolean) => string;
  standby: (cueId: string) => void;
  lastDispatched: GoDispatched | null;
}

export function useGoChannel(cuelistId: string): GoChannelState {
  const conn = useConnection();
  const [lastDispatched, setLastDispatched] = useState<GoDispatched | null>(null);

  useEffect(() => {
    return conn.sideChannel.on('go.dispatched', (event) => {
      if (event.cuelist_id !== cuelistId) return;
      if (event.historic) return;
      setLastDispatched(event);
    });
  }, [conn.sideChannel, cuelistId]);

  return {
    go: (cueId, override = false) =>
      conn.sideChannel.sendGoRequest(cuelistId, cueId, override),
    standby: (cueId) => conn.sideChannel.sendArmRequest(cuelistId, cueId),
    lastDispatched,
  };
}
