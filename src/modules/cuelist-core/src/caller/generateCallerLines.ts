import type { Cue, CallerLineGroup } from 'showx-shared';

/** Builds a display reference string from cue_number + label. */
function cueRef(cue: Cue): string {
  const parts: string[] = [];
  if (cue.cue_number) parts.push(cue.cue_number);
  if (cue.label) parts.push(cue.label);
  return parts.join(' ') || 'cue';
}

/** Formats a department list for a GO call: "{dept1}, {dept2} — GO". */
function formatGo(depts: readonly string[]): string {
  if (depts.length === 0) return 'GO';
  return `${depts.join(', ')} — GO`;
}

/**
 * Generate deterministic caller lines for a single cue.
 * Pure function — no LLM, no network.
 *
 * standby per dept: "{Dept} — standby for {cue_number} {label}"
 * go: "{dept1}, {dept2} — GO"
 */
export function generateCallerLines(cue: Cue): CallerLineGroup {
  const depts = cue.department ?? [];

  if (depts.length === 0) {
    return { standby: {}, go: 'GO' };
  }

  const ref = cueRef(cue);
  const standby: Record<string, string> = {};
  for (const dept of depts) {
    standby[dept] = `${dept} — standby for ${ref}`;
  }

  return { standby, go: formatGo(depts) };
}

/**
 * Generate caller lines for every cue in a list.
 * Returns a Map of cue.id → CallerLineGroup.
 */
export function generateAllCallerLines(cues: readonly Cue[]): Map<string, CallerLineGroup> {
  const result = new Map<string, CallerLineGroup>();
  for (const cue of cues) {
    result.set(cue.id, generateCallerLines(cue));
  }
  return result;
}
