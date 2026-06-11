import type { DepartmentTag, ShowMode } from 'showx-shared';

export interface PlayheadAwareness {
  cuelist_id: string;
  cue_id: string | null;
  armed_cue_id: string | null;
  updated_at: string;
  updated_by: string;
}

export interface StationAwareness {
  operator_id: string;
  station_id: string;
  display_name: string;
  role?: 'sm' | 'operator';
  owned_departments: DepartmentTag[];
  watched_departments: DepartmentTag[];
  current_view: { cuelist_id: string; focus_cue_id: string | null };
  presence_color: string;
  cursor: { cue_id: string | null; field: string | null };
  last_heartbeat_at: string;
  playhead?: PlayheadAwareness;
}

export interface LocalStationOpts {
  operator_id: string;
  station_id: string;
  display_name: string;
  role?: 'sm' | 'operator';
  owned_departments: DepartmentTag[];
  watched_departments: DepartmentTag[];
  presence_color: string;
}

export function makeInitialAwarenessState(opts: LocalStationOpts): StationAwareness {
  return {
    operator_id: opts.operator_id,
    station_id: opts.station_id,
    display_name: opts.display_name,
    role: opts.role ?? 'operator',
    owned_departments: opts.owned_departments,
    watched_departments: opts.watched_departments,
    current_view: { cuelist_id: '', focus_cue_id: null },
    presence_color: opts.presence_color,
    cursor: { cue_id: null, field: null },
    last_heartbeat_at: new Date().toISOString(),
  };
}

export function extractStations(
  states: Map<number, Record<string, unknown>>,
  localClientId: number,
): StationAwareness[] {
  const result: StationAwareness[] = [];
  for (const [clientId, state] of states) {
    if (clientId === localClientId) continue;
    if (state && typeof state === 'object' && 'operator_id' in state) {
      result.push(state as unknown as StationAwareness);
    }
  }
  return result;
}

export type AwarenessLike = {
  getStates(): Map<number, Record<string, unknown>>;
  clientID: number;
};

/**
 * Returns true iff any awareness state (including local) has role === 'sm'.
 * Presence in the states map is the liveness signal — Yjs prunes disconnected
 * clients after ~30s, so no timestamp math is needed.
 */
export function isSmPresent(awareness: AwarenessLike): boolean {
  for (const [, s] of awareness.getStates()) {
    if ((s as unknown as StationAwareness).role === 'sm') return true;
  }
  return false;
}

/**
 * Returns the clientID of the playhead authority station.
 * Among SM-role stations, picks the LOWEST clientID (deterministic — avoids
 * split-brain when two SM-role tabs are open and each client's Map iteration
 * order differs). Falls back to lowest clientID overall when no SM present.
 */
export function getPlayheadAuthorityClientId(awareness: AwarenessLike): number | null {
  const states = Array.from(awareness.getStates().entries());
  if (states.length === 0) return null;

  const sms = states
    .filter(([, s]) => (s as unknown as StationAwareness).role === 'sm')
    .sort(([a], [b]) => a - b);
  if (sms.length > 0) return sms[0][0];

  // Fallback: lowest clientID (deterministic)
  return [...states].sort(([a], [b]) => a - b)[0]?.[0] ?? null;
}

/**
 * Returns the current playhead state from the authority station's awareness.
 * If the authority has no playhead yet (freshly promoted), falls back to any
 * state carrying a playhead so the UI doesn't blank on authority handover.
 */
export function getPlayheadState(awareness: AwarenessLike): PlayheadAwareness | null {
  const authorityId = getPlayheadAuthorityClientId(awareness);
  if (authorityId === null) return null;
  const state = awareness.getStates().get(authorityId) as unknown as StationAwareness | undefined;
  if (state?.playhead) return state.playhead;

  // Authority has no playhead yet — fall back to any state that carries one
  for (const [, s] of awareness.getStates()) {
    const sa = s as unknown as StationAwareness;
    if (sa?.playhead) return sa.playhead;
  }
  return null;
}

export type { ShowMode };
