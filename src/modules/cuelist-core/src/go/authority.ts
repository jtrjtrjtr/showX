import type { GoRequest } from './goEventChannel.js';

export type AuthorityResult =
  | { ok: true; mode: 'sm' | 'cascade' | 'dept' | 'sm_override' }
  | { ok: false; reason: 'not_sm' | 'not_owner' | 'timecode_only' | 'revoked' };

export interface AuthorityCuelist {
  go_authority: 'sm_called' | 'auto_cascade' | 'per_dept' | 'timecode';
  cues: Array<{ id: string; department: string[] }>;
}

export interface OperatorContext {
  operatorOwns(operator_id: string, dept: string): boolean;
  operatorOwned(operator_id: string): string[];
  isRevoked?(operator_id: string): boolean;
}

/**
 * Authorise a GO request per data_model.md §8.5.
 *
 * ShowX-3 MVP: operator role resolved from octx (operator registry is ShowX-4).
 * Without octx, sm_called always rejects (no SM to detect), per_dept always rejects.
 */
export function authorise(
  req: GoRequest,
  cuelist: AuthorityCuelist,
  octx?: OperatorContext,
): AuthorityResult {
  if (octx?.isRevoked?.(req.operator_id)) return { ok: false, reason: 'revoked' };

  switch (cuelist.go_authority) {
    case 'sm_called':
      if (octx?.operatorOwns(req.operator_id, 'SM')) return { ok: true, mode: 'sm' };
      return { ok: false, reason: 'not_sm' };

    case 'auto_cascade':
      return { ok: true, mode: 'cascade' };

    case 'per_dept': {
      const cue = cuelist.cues.find((c) => c.id === req.cue_id);
      if (!cue) return { ok: false, reason: 'not_owner' };
      const ownedDepts = octx?.operatorOwned(req.operator_id) ?? [];
      const overlap = cue.department.some((d) => ownedDepts.includes(d));
      return overlap ? { ok: true, mode: 'dept' } : { ok: false, reason: 'not_owner' };
    }

    case 'timecode':
      if (req.override && octx?.operatorOwns(req.operator_id, 'SM')) {
        return { ok: true, mode: 'sm_override' };
      }
      return { ok: false, reason: 'timecode_only' };
  }
}
