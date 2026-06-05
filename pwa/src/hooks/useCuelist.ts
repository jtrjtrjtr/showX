import { useRef, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import { useConnection } from '../lib/ConnectionProvider.js';

export interface CuelistJson {
  id: string;
  name: string;
  default_trigger: string;
  go_authority: string;
  playhead: { cue_id: string | null; armed_cue_id: string | null };
}

export interface CuelistSnapshot {
  cuelist: CuelistJson | null;
  cues: Cue[];
}

function findCuelistMap(doc: Y.Doc, cuelistId: string): Y.Map<unknown> | undefined {
  return doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId);
}

const EMPTY: CuelistSnapshot = { cuelist: null, cues: [] };

export function useCuelist(cuelistId: string): CuelistSnapshot {
  const conn = useConnection();
  // Cache cleared on every Yjs mutation so getSnapshot returns a fresh object → React detects change.
  const cache = useRef<CuelistSnapshot | null>(null);

  return useSyncExternalStore(
    (cb) => {
      const cuelists = conn.doc.getArray('cuelists');
      const handler = () => {
        cache.current = null;
        cb();
      };
      cuelists.observeDeep(handler);
      return () => cuelists.unobserveDeep(handler);
    },
    () => {
      if (cache.current !== null) return cache.current;
      const cl = findCuelistMap(conn.doc, cuelistId);
      if (!cl) {
        cache.current = EMPTY;
        return cache.current;
      }
      const cues = (cl.get('cues') as Y.Array<Y.Map<unknown>>)
        .toArray()
        .map((m) => m.toJSON() as Cue);
      cache.current = { cuelist: cl.toJSON() as CuelistJson, cues };
      return cache.current;
    },
    () => EMPTY,
  );
}
