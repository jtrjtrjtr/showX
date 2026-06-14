import type { Cue, CallerLineGroup } from 'showx-shared';
import { generateCallerLines } from './generateCallerLines.js';

/** Builds a display reference string from cue_number + label (internal helper). */
function cueRef(cue: Cue): string {
  const parts: string[] = [];
  if (cue.cue_number) parts.push(cue.cue_number);
  if (cue.label) parts.push(cue.label);
  return parts.join(' ') || 'cue';
}

/**
 * Aggregate caller lines for multiple cues that fire at the same instant.
 * Merges all departments into a single combined CallerLineGroup.
 *
 * Used for:
 * - Compound cues (single cue with multiple departments)
 * - Adjacent cues with the same trigger instant (auto_follow / simultaneous timecode)
 *
 * Aggregate standby per dept: "{allDepts} — standby for {ref1}, {ref2}"
 * Aggregate GO: "{allDepts} — GO"
 * aggregate field: "{allDepts} — standby for {refs} → GO"
 */
export function aggregateCallerLines(cues: readonly Cue[]): CallerLineGroup {
  if (cues.length === 0) {
    return { standby: {}, go: 'GO', aggregate: null };
  }

  if (cues.length === 1) {
    return generateCallerLines(cues[0]);
  }

  // Collect all unique departments in order of first appearance across all cues.
  const seen = new Set<string>();
  const allDepts: string[] = [];
  for (const cue of cues) {
    for (const dept of cue.department ?? []) {
      if (!seen.has(dept)) {
        seen.add(dept);
        allDepts.push(dept);
      }
    }
  }

  if (allDepts.length === 0) {
    return { standby: {}, go: 'GO', aggregate: null };
  }

  const deptStr = allDepts.join(', ');
  const refs = cues.map(cueRef).join(', ');

  const standby: Record<string, string> = {};
  for (const dept of allDepts) {
    standby[dept] = `${deptStr} — standby for ${refs}`;
  }

  const go = `${deptStr} — GO`;
  const aggregate = `${deptStr} — standby for ${refs} → GO`;

  return { standby, go, aggregate };
}
