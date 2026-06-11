import * as Y from 'yjs';
import { getMode } from './modeState.js';

export type EditKind = 'payload' | 'structure' | 'meta';

export class LockedError extends Error {
  constructor(
    public readonly kind: EditKind,
    public readonly mode: 'show',
  ) {
    super(
      `edit (${kind}) blocked: show mode locks payload + structure; route via proposal queue`,
    );
    this.name = 'LockedError';
  }
}

/**
 * MVP policy per data_model.md §7.3 + Q7:
 *   payload   → blocked in SHOW
 *   structure → blocked in SHOW (insert/delete/reorder)
 *   meta      → allowed in SHOW (notes, standby_note, label, description — LWW)
 */
export function isLockedForEdit(doc: Y.Doc, kind: EditKind): boolean {
  if (getMode(doc) !== 'show') return false;
  return kind === 'payload' || kind === 'structure';
}

export function assertEditAllowed(doc: Y.Doc, kind: EditKind): void {
  if (isLockedForEdit(doc, kind)) throw new LockedError(kind, 'show');
}
