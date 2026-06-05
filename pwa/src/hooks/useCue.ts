import { useRef, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import { useConnection } from '../lib/ConnectionProvider.js';

// undefined = not yet cached; null = cached as "cue not found"
const UNSET = undefined;

export function useCue(cuelistId: string, cueId: string): Cue | null {
  const conn = useConnection();
  const cache = useRef<Cue | null | typeof UNSET>(UNSET);

  return useSyncExternalStore(
    (cb) => {
      const cuelists = conn.doc.getArray('cuelists');
      const handler = () => {
        cache.current = UNSET;
        cb();
      };
      cuelists.observeDeep(handler);
      return () => cuelists.unobserveDeep(handler);
    },
    () => {
      if (cache.current !== UNSET) return cache.current;
      const cl = conn.doc
        .getArray<Y.Map<unknown>>('cuelists')
        .toArray()
        .find((m) => m.get('id') === cuelistId);
      if (!cl) {
        cache.current = null;
        return null;
      }
      const cueMap = (cl.get('cues') as Y.Array<Y.Map<unknown>>)
        .toArray()
        .find((m) => m.get('id') === cueId);
      cache.current = cueMap ? (cueMap.toJSON() as Cue) : null;
      return cache.current;
    },
    () => null,
  );
}
