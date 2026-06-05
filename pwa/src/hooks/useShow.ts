import { useRef, useSyncExternalStore } from 'react';
import type { ShowMode, DepartmentTag } from 'showx-shared';
import { useConnection } from '../lib/ConnectionProvider.js';

export interface ShowState {
  show_id: string;
  title: string;
  venue: string | null;
  date: string | null;
  mode: ShowMode;
  active_cuelist_id: string;
  departments: DepartmentTag[];
}

export function useShow(): ShowState | null {
  const conn = useConnection();
  // Cached snapshot — cleared on each Yjs mutation so getSnapshot creates a fresh one.
  const cache = useRef<ShowState | null>(null);

  return useSyncExternalStore(
    (cb) => {
      const meta = conn.doc.getMap('meta');
      const handler = () => {
        cache.current = null;
        cb();
      };
      meta.observe(handler);
      return () => meta.unobserve(handler);
    },
    () => {
      if (cache.current !== null) return cache.current;
      const meta = conn.doc.getMap('meta');
      if (!meta.has('show_id')) return null;
      cache.current = meta.toJSON() as ShowState;
      return cache.current;
    },
    () => null,
  );
}
