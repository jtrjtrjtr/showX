import * as Y from 'yjs';
import type { ShowJson, CuelistJson, RoutingJson, OperatorsJson } from './projections.js';
import { projectionsToDoc } from './projections.js';
import { appendHistoryEvent } from './historyJsonl.js';

/**
 * Rebuild a Y.Doc from JSON projections when doc.yjs is missing or corrupt.
 * Logs a recovery_from_json event to history.jsonl and to the provided logger.
 */
export async function rebuildDocFromJson(
  pkgPath: string,
  show: ShowJson,
  cuelists: CuelistJson[],
  routing?: RoutingJson,
  operators?: OperatorsJson,
  log?: (msg: string) => void,
): Promise<Y.Doc> {
  const doc = new Y.Doc();
  projectionsToDoc(doc, show, cuelists, routing, operators);

  log?.('[recovery] doc.yjs missing or corrupt — rebuilt from JSON projections');

  await appendHistoryEvent(pkgPath, {
    ts: new Date().toISOString(),
    kind: 'recovery_from_json',
    show_id: show.show_id,
    cuelist_count: cuelists.length,
    total_cues: cuelists.reduce((n, cl) => n + cl.cues.length, 0),
  }).catch(() => {
    // Non-fatal: if history.jsonl itself is gone we still return a valid doc
  });

  return doc;
}
