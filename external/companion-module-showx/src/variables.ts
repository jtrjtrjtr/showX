export interface CompanionVariableDefinition {
  variableId: string;
  name: string;
}

export function compileVariables(): CompanionVariableDefinition[] {
  return [
    { variableId: 'connected', name: 'Connected (0=no, 1=yes)' },
    { variableId: 'current_cue_label', name: 'Current cue label (playhead)' },
    { variableId: 'armed_cue_label', name: 'Armed cue label (next to fire)' },
    { variableId: 'last_fired_label', name: 'Last fired cue label' },
    { variableId: 'mode', name: 'Show mode (rehearsal / show)' },
    { variableId: 'stations_online', name: 'Stations online (count)' },
  ];
}
