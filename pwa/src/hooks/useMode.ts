import { useSyncExternalStore } from 'react';
import type { ShowMode } from 'showx-shared';
import { useConnection } from '../lib/ConnectionProvider.js';

export interface ModeState {
  mode: ShowMode;
  canToggle: boolean;
  transition: (mode: ShowMode) => void;
}

export function useMode(): ModeState {
  const conn = useConnection();

  const mode = useSyncExternalStore(
    (cb) => {
      const meta = conn.doc.getMap('meta');
      meta.observe(cb);
      return () => meta.unobserve(cb);
    },
    () => (conn.doc.getMap('meta').get('mode') as ShowMode | undefined) ?? 'rehearsal',
    () => 'rehearsal' as ShowMode,
  );

  return {
    mode,
    canToggle: true,
    transition(next: ShowMode) {
      const meta = conn.doc.getMap('meta');
      conn.doc.transact(() => meta.set('mode', next));
    },
  };
}
