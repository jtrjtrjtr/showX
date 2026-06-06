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

type AwarenessLike = {
  getStates(): Map<number, Record<string, unknown>>;
  clientID: number;
};

/**
 * Returns the clientID of the playhead authority station.
 * SM-role station wins; if no SM connected, lowest clientID is authority (deterministic).
 */
export function getPlayheadAuthorityClientId(awareness: AwarenessLike): number | null {
  const states = Array.from(awareness.getStates().entries());
  if (states.length === 0) return null;

  // Prefer SM-role station
  const sm = states.find(([, s]) => (s as unknown as StationAwareness).role === 'sm');
  if (sm) return sm[0];

  // Fallback: lowest clientID (deterministic)
  const sorted = [...states].sort(([a], [b]) => a - b);
  return sorted[0]?.[0] ?? null;
}

/**
 * Returns the current playhead state from the authority station's awareness.
 */
export function getPlayheadState(awareness: AwarenessLike): PlayheadAwareness | null {
  const authorityId = getPlayheadAuthorityClientId(awareness);
  if (authorityId === null) return null;
  const state = awareness.getStates().get(authorityId) as unknown as StationAwareness | undefined;
  return state?.playhead ?? null;
}

export type { ShowMode };
