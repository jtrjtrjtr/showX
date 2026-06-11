import * as Y from 'yjs';
import type { ShowMode } from 'showx-shared';

export type Mode = ShowMode;

/**
 * Browser-safe leaf: current show mode from the doc.
 * Kept free of node: imports — lockGuards (and through it document/cue.ts)
 * is bundled into the PWA, so this chain must never pull snapshot/historyJsonl.
 */
export function getMode(doc: Y.Doc): Mode {
  return (doc.getMap('meta').get('mode') as Mode) ?? 'rehearsal';
}
