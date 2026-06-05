import * as Y from 'yjs';
import { uuidv7 } from './uuid.js';

export function makeCuelistMap(name: string): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set('id', uuidv7());
  m.set('name', name);
  m.set('default_trigger', 'manual');
  m.set('go_authority', 'sm_called');
  m.set('sm_offline_policy', { kind: 'freeze' });
  m.set('cues', new Y.Array<Y.Map<unknown>>());
  m.set('playhead', { cue_id: null, armed_cue_id: null });
  m.set('show_snapshot_id', null);
  return m;
}

export function getCuelists(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('cuelists');
}

export function getCuelist(doc: Y.Doc, id: string): Y.Map<unknown> | undefined {
  return getCuelists(doc).toArray().find((c) => c.get('id') === id);
}

export function getCues(cuelistMap: Y.Map<unknown>): Y.Array<Y.Map<unknown>> {
  return cuelistMap.get('cues') as Y.Array<Y.Map<unknown>>;
}

export function getCue(cuelistMap: Y.Map<unknown>, id: string): Y.Map<unknown> | undefined {
  return getCues(cuelistMap).toArray().find((c) => c.get('id') === id);
}

export function addCuelist(doc: Y.Doc, name: string): string {
  const cuelists = getCuelists(doc);
  const cuelist = makeCuelistMap(name);
  doc.transact(() => cuelists.push([cuelist]));
  return cuelist.get('id') as string;
}

/**
 * Returns cue maps sorted by sort_key ascending (display order).
 * Use this for rendering and ordering-sensitive tests.
 * getCues() returns the raw Y.Array in insertion order for CRDT observation.
 */
export function getCuesSorted(cuelistMap: Y.Map<unknown>): Y.Map<unknown>[] {
  return getCues(cuelistMap)
    .toArray()
    .slice()
    .sort((a, b) => ((a.get('sort_key') as number) ?? 0) - ((b.get('sort_key') as number) ?? 0));
}
