import type { ShowXConnection } from './connection.js';

export interface ShowXActionInstance {
  conn?: ShowXConnection;
  config: {
    host: string;
    port: number;
    showId: string;
    cuelistId: string;
    pairingToken: string;
  };
}

export interface CompanionActionDefinition {
  name: string;
  options: CompanionInputFieldBase[];
  callback: (event: { options: Record<string, unknown> }) => void;
}

export interface CompanionInputFieldBase {
  id: string;
  type: string;
  label: string;
  default?: unknown;
}

export function compileActions(instance: ShowXActionInstance): Record<string, CompanionActionDefinition> {
  return {
    go: {
      name: 'GO — fire armed cue',
      options: [],
      callback: () => {
        instance.conn?.sendGoArmed(false);
      },
    },
    go_override: {
      name: 'GO override (bypass SM authority — emergency only)',
      options: [],
      callback: () => {
        instance.conn?.sendGoArmed(true);
      },
    },
    standby_next: {
      name: 'Standby — arm next cue',
      options: [],
      callback: () => {
        instance.conn?.sendStandbyNext();
      },
    },
    stop: {
      name: 'Stop cuelist',
      options: [],
      callback: () => {
        instance.conn?.sendStop(instance.config.cuelistId ?? '');
      },
    },
    pause: {
      name: 'Pause cuelist',
      options: [],
      callback: () => {
        instance.conn?.sendPause(instance.config.cuelistId ?? '');
      },
    },
    resume: {
      name: 'Resume cuelist',
      options: [],
      callback: () => {
        instance.conn?.sendResume(instance.config.cuelistId ?? '');
      },
    },
    goto: {
      name: 'Goto cue',
      options: [
        {
          id: 'cueRef',
          type: 'textinput',
          label: 'Cue ID or label',
          default: '',
        },
      ],
      callback: (event) => {
        const cueRef = String(event.options['cueRef'] ?? '');
        if (cueRef) {
          instance.conn?.sendGoto(instance.config.cuelistId ?? '', cueRef);
        }
      },
    },
  };
}
