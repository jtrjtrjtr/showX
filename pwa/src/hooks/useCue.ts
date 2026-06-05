import { useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import { useConnection } from '../lib/ConnectionProvider.js';

export function useCue(cuelistId: string, cueId: string): Cue | null {
  const conn = useConnection();
  return useSyncExternalStore(
    (cb) => {
      const cuelists = conn.doc.getArray('cuelists');
      cuelists.observeDeep(cb);
      return () => cuelists.unobserveDeep(cb);
    },
    () => {
      const cl = conn.doc
        .getArray<Y.Map<unknown>>('cuelists')
        .toArray()
        .find((m) => m.get('id') === cuelistId);
      if (!cl) return null;
      const cueMap = (cl.get('cues') as Y.Array<Y.Map<unknown>>)
        .toArray()
        .find((m) => m.get('id') === cueId);
      return cueMap ? (cueMap.toJSON() as Cue) : null;
    },
    () => null,
  );
}
