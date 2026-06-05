import type { Cue } from 'showx-shared';
import type { DepartmentTag } from 'showx-shared';
import { computeHighlightedPayloads } from './departmentFilter.js';

/**
 * Returns payload ids that should be HIGHLIGHTED in the station's view.
 * Pure — no Y.Doc reads. Memoized via departmentFilter internals.
 */
export function highlightedPayloads(
  cue: Cue,
  owned: ReadonlySet<DepartmentTag>,
): Set<string> {
  return computeHighlightedPayloads(cue, owned);
}

/** Returns payload ids that are DIMMED — visible context but not actionable. */
export function dimmedPayloads(
  cue: Cue,
  owned: ReadonlySet<DepartmentTag>,
): Set<string> {
  const highlighted = highlightedPayloads(cue, owned);
  const all = new Set(cue.payloads.map((p) => p.id));
  for (const id of highlighted) all.delete(id);
  return all;
}
