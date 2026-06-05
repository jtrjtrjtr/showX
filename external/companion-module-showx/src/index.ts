import {
  InstanceBase,
  runEntrypoint,
  InstanceStatus,
  type SomeCompanionConfigField,
} from '@companion-module/base';
import { ShowXConnection } from './connection.js';
import { compileActions } from './actions.js';
import { compileFeedbacks } from './feedbacks.js';
import { compileVariables } from './variables.js';
import { compilePresets } from './presets.js';

export interface ShowXConfig {
  host: string;
  port: number;
  showId: string;
  cuelistId: string;
  pairingToken: string;
}

class ShowXInstance extends InstanceBase<ShowXConfig> {
  conn?: ShowXConnection;

  async init(config: ShowXConfig): Promise<void> {
    this.config = config;
    this.updateStatus(InstanceStatus.Connecting);

    this.conn = new ShowXConnection({
      host: config.host,
      port: config.port,
      showId: config.showId,
      pairingToken: config.pairingToken,
      onStatusChange: (status) => {
        this.updateStatus(status === 'ok' ? InstanceStatus.Ok : InstanceStatus.ConnectionFailure);
      },
      onVariablesUpdate: (vars) => {
        this.setVariableValues(vars as Record<string, string | number | boolean | undefined>);
      },
      onFeedbacksUpdate: () => {
        this.checkFeedbacks();
      },
    });

    this.conn.connect();

    this.setActionDefinitions(compileActions(this) as Parameters<typeof this.setActionDefinitions>[0]);
    this.setFeedbackDefinitions(compileFeedbacks(this) as Parameters<typeof this.setFeedbackDefinitions>[0]);
    this.setVariableDefinitions(compileVariables());
    this.setPresetDefinitions(compilePresets() as Parameters<typeof this.setPresetDefinitions>[0]);
  }

  async destroy(): Promise<void> {
    this.conn?.disconnect();
    this.conn = undefined;
  }

  async configUpdated(config: ShowXConfig): Promise<void> {
    await this.destroy();
    await this.init(config);
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return [
      {
        id: 'host',
        type: 'textinput',
        label: 'ShowX host',
        width: 6,
        default: 'showx.local',
        required: true,
      },
      {
        id: 'port',
        type: 'number',
        label: 'ShowX port',
        width: 3,
        default: 5300,
        min: 1,
        max: 65535,
      },
      {
        id: 'showId',
        type: 'textinput',
        label: 'Show ID (UUID from ShowX)',
        width: 12,
        default: '',
        required: true,
      },
      {
        id: 'cuelistId',
        type: 'textinput',
        label: 'Cuelist ID (UUID from ShowX)',
        width: 12,
        default: '',
        required: true,
      },
      {
        id: 'pairingToken',
        type: 'textinput',
        label: 'Pairing token (paste from ShowX → Cuelist Core → Companion)',
        width: 12,
        default: '',
        required: true,
      },
    ] as SomeCompanionConfigField[];
  }
}

runEntrypoint(ShowXInstance, []);
