import { useRef, useSyncExternalStore } from 'react';
import type { StationAwareness } from '../lib/awareness.js';
import { extractStations } from '../lib/awareness.js';
import { useConnection } from '../lib/ConnectionProvider.js';

export function useStations(): StationAwareness[] {
  const conn = useConnection();
  const cache = useRef<StationAwareness[]>([]);

  return useSyncExternalStore(
    (cb) => {
      const handler = () => {
        cache.current = [];
        cb();
      };
      conn.awareness.on('change', handler);
      return () => conn.awareness.off('change', handler);
    },
    () => {
      if (cache.current.length > 0) return cache.current;
      const states = conn.awareness.getStates() as Map<number, Record<string, unknown>>;
      cache.current = extractStations(states, conn.doc.clientID);
      return cache.current;
    },
    () => [],
  );
}
