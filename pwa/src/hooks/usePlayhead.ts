import * as Y from 'yjs';
import { useConnection } from '../lib/ConnectionProvider.js';
import { useCuelist } from './useCuelist.js';

export interface PlayheadState {
  playheadCueId: string | null;
  armedCueId: string | null;
  setPlayhead(cueId: string): void;
  advance(): void;
  retreat(): void;
  arm(cueId: string): void;
  unarm(): void;
}

function findCuelistMap(doc: Y.Doc, cuelistId: string): Y.Map<unknown> | undefined {
  return doc
    .getArray<Y.Map<unknown>>('cuelists')
    .toArray()
    .find((m) => m.get('id') === cuelistId);
}

type PlayheadData = { cue_id: string | null; armed_cue_id: string | null };

function mutatePlayhead(doc: Y.Doc, cl: Y.Map<unknown>, patch: Partial<PlayheadData>): void {
  const ph = (cl.get('playhead') as PlayheadData | undefined) ?? {
    cue_id: null,
    armed_cue_id: null,
  };
  doc.transact(() => cl.set('playhead', { ...ph, ...patch }));
}

export function usePlayhead(cuelistId: string): PlayheadState {
  const conn = useConnection();
  const { cuelist, cues } = useCuelist(cuelistId);

  const playheadCueId = cuelist?.playhead?.cue_id ?? null;
  const armedCueId = cuelist?.playhead?.armed_cue_id ?? null;

  const setPlayhead = (cueId: string) => {
    const cl = findCuelistMap(conn.doc, cuelistId);
    if (!cl) return;
    mutatePlayhead(conn.doc, cl, { cue_id: cueId });
  };

  const advance = () => {
    if (cues.length === 0) return;
    const cl = findCuelistMap(conn.doc, cuelistId);
    if (!cl) return;
    const idx = cues.findIndex((c) => c.id === playheadCueId);
    const next = idx >= 0 && idx < cues.length - 1 ? cues[idx + 1] : cues[0];
    if (next) mutatePlayhead(conn.doc, cl, { cue_id: next.id });
  };

  const retreat = () => {
    if (cues.length === 0) return;
    const cl = findCuelistMap(conn.doc, cuelistId);
    if (!cl) return;
    const idx = cues.findIndex((c) => c.id === playheadCueId);
    const prev = idx > 0 ? cues[idx - 1] : cues[cues.length - 1];
    if (prev) mutatePlayhead(conn.doc, cl, { cue_id: prev.id });
  };

  const arm = (cueId: string) => {
    const cl = findCuelistMap(conn.doc, cuelistId);
    if (!cl) return;
    mutatePlayhead(conn.doc, cl, { armed_cue_id: cueId });
  };

  const unarm = () => {
    const cl = findCuelistMap(conn.doc, cuelistId);
    if (!cl) return;
    mutatePlayhead(conn.doc, cl, { armed_cue_id: null });
  };

  return { playheadCueId, armedCueId, setPlayhead, advance, retreat, arm, unarm };
}
