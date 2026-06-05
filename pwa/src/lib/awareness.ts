import type { DepartmentTag, ShowMode } from 'showx-shared';

export interface StationAwareness {
  operator_id: string;
  station_id: string;
  display_name: string;
  owned_departments: DepartmentTag[];
  watched_departments: DepartmentTag[];
  current_view: { cuelist_id: string; focus_cue_id: string | null };
  presence_color: string;
  cursor: { cue_id: string | null; field: string | null };
  last_heartbeat_at: string;
}

export interface LocalStationOpts {
  operator_id: string;
  station_id: string;
  display_name: string;
  owned_departments: DepartmentTag[];
  watched_departments: DepartmentTag[];
  presence_color: string;
}

export function makeInitialAwarenessState(opts: LocalStationOpts): StationAwareness {
  return {
    operator_id: opts.operator_id,
    station_id: opts.station_id,
    display_name: opts.display_name,
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

export type { ShowMode };
