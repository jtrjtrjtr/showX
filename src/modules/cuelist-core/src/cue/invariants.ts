import type { Cue } from 'showx-shared';

export class InvariantError extends Error {
  constructor(
    public readonly field: string,
    msg: string,
  ) {
    super(msg);
    this.name = 'InvariantError';
  }
}

// Forward-compat types are allowed via unknown_* prefix (data_model.md §11.1).
const KNOWN_PAYLOAD_TYPES = new Set([
  'osc', 'msc', 'lx_ref', 'midi', 'dmx', 'webhook', 'wait', 'group',
]);

/**
 * Defensive invariant check for a cue.
 * Called after CRDT mutations as belt-and-suspenders validation.
 * Allows forward-compat unknown_* payload types per data_model.md §11.1.
 */
export function assertCueInvariants(cue: Cue): void {
  if (cue.department.length === 0) {
    throw new InvariantError('department', 'cue.department must have ≥ 1 entry');
  }
  if (new Set(cue.department).size !== cue.department.length) {
    throw new InvariantError('department', 'cue.department contains duplicates');
  }
  const seen = new Set<string>();
  for (const p of cue.payloads) {
    if (seen.has(p.id)) {
      throw new InvariantError('payloads', `duplicate payload id ${p.id}`);
    }
    seen.add(p.id);
    const typeStr = p.type as string;
    if (!KNOWN_PAYLOAD_TYPES.has(typeStr) && !typeStr.startsWith('unknown_')) {
      throw new InvariantError('payloads.type', `unknown payload.type ${typeStr}`);
    }
  }
}
