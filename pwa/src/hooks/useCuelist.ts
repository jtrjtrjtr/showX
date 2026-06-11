import { useRef, useSyncExternalStore, useCallback } from 'react';
import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import { useConnection } from '../lib/ConnectionProvider.js';
import {
  updateCueFields,
  type CueFieldPatch,
} from '../../../src/modules/cuelist-core/src/document/cue.js';

export type { CueFieldPatch };

export interface CuelistJson {
  id: string;
  name: string;
  default_trigger: string;
  go_authority: string;
  playhead: { cue_id: string | null; armed_cue_id: string | null };
}

interface RawSnapshot {
  cuelist: CuelistJson | null;
  cues: Cue[];
}

export interface CuelistSnapshot extends RawSnapshot {
  updateFields: (cueId: string, patch: CueFieldPatch, modifiedBy: string) => void;
}

function findCuelistMap(doc: Y.Doc, cuelistId: string): Y.Map<unknown> | undefined {
  return doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId);
}

const EMPTY_RAW: RawSnapshot = { cuelist: null, cues: [] };

export function useCuelist(cuelistId: string): CuelistSnapshot {
  const conn = useConnection();
  // Cache cleared on every Yjs mutation so getSnapshot returns a fresh object → React detects change.
  const cache = useRef<RawSnapshot | null>(null);

  const raw = useSyncExternalStore(
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
        cache.current = EMPTY_RAW;
        return cache.current;
      }
      const cues = (cl.get('cues') as Y.Array<Y.Map<unknown>>)
        .toArray()
        .map((m) => m.toJSON() as Cue);
      cache.current = { cuelist: cl.toJSON() as CuelistJson, cues };
      return cache.current;
    },
    () => EMPTY_RAW,
  );

  const updateFields = useCallback(
    (cueId: string, patch: CueFieldPatch, modifiedBy: string) => {
      updateCueFields(conn.doc, cuelistId, cueId, patch, modifiedBy);
    },
    [conn.doc, cuelistId],
  );

  return { ...raw, updateFields };
}
