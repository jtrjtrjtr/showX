---
id: "B003-021"
title: "Stream Deck — Bitfocus Companion community module"
type: "implementation"
estimated_size_lines: 500
priority: "P1"
depends_on: ["B003-008", "B003-015"]
target_files:
  - "external/companion-module-showx/companion/manifest.json"
  - "external/companion-module-showx/package.json"
  - "external/companion-module-showx/src/index.ts"
  - "external/companion-module-showx/src/connection.ts"
  - "external/companion-module-showx/src/actions.ts"
  - "external/companion-module-showx/src/feedbacks.ts"
  - "external/companion-module-showx/src/variables.ts"
  - "external/companion-module-showx/src/presets.ts"
  - "external/companion-module-showx/README.md"
  - "external/companion-module-showx/HELP.md"
  - "external/companion-module-showx/tests/connection.test.ts"
acceptance_criteria:
  - "Companion community module conforms to @companion-module/base SDK (v1.x) — manifest, init, configFields, instance class with destroy/configUpdated/getConfigFields lifecycle"
  - "Module connects to ShowX side-channel WSS at user-configured host:port; pairing token configured via Companion config UI (manually-pasted token from ShowX 'Add Companion' flow)"
  - "Actions exposed: GO (cue armed), GO override, Standby next, Stop cuelist, Pause cuelist, Resume cuelist, Goto cue (label or ID)"
  - "Feedbacks (button state): connection status (green/red), last fired cue label (changes button text), armed cue indicator (yellow pulse), SHOW mode (red border)"
  - "Variables: connected (0/1), current_cue_label, armed_cue_label, last_fired_label, mode (rehearsal/show), stations_online (count)"
  - "Presets: 6 button presets — 'GO button', 'Standby Next', 'Cue Label Display', 'Mode Indicator', 'Stations Counter', 'Connection Status'"
  - "Reconnect: on WSS close, exponential backoff (1s, 2s, 5s, 10s, 30s max); preserves user config"
  - "Pairing token entry: Companion UI shows config field with paste hint + 'Generate token' button (placeholder for future ShowX deep-link flow)"
  - "Manifest declares module name 'showx', author 'XLAB s.r.o.', license MIT, repository url"
  - "README documents installation, configuration, button setup, troubleshooting"
  - "HELP.md is short Companion-compatible inline help text"
  - "Module published to Companion community repo via PR (Architect/Jindřich handles PR submission; Forge prepares submitter-ready directory)"
  - "10+ vitest tests covering connection lifecycle, action handlers, variable updates, reconnect logic"
---

## Context

Stream Deck + Companion is the de-facto FOH button-box standard. Theatre and corporate AV users expect their existing Stream Decks to control ShowX. Building a Companion community module is the path of least resistance — Companion handles Stream Deck hardware, OSC, OBS, and dozens of other devices; we just publish a thin shim that talks ShowX's side-channel.

This task creates a separate module repo (or `external/` subdir) suitable for PR submission to the Bitfocus Companion community module index. ShowX users install it via Companion's built-in module browser.

## Implementation notes

### Companion SDK boilerplate

```ts
// external/companion-module-showx/src/index.ts
import { InstanceBase, runEntrypoint, InstanceStatus, SomeCompanionConfigField } from '@companion-module/base';
import { ShowXConnection } from './connection';
import { compileActions } from './actions';
import { compileFeedbacks } from './feedbacks';
import { compileVariables } from './variables';
import { compilePresets } from './presets';

interface ShowXConfig {
  host: string;
  port: number;
  showId: string;
  pairingToken: string;
}

class ShowXInstance extends InstanceBase<ShowXConfig> {
  conn?: ShowXConnection;

  async init(config: ShowXConfig): Promise<void> {
    this.config = config;
    this.updateStatus(InstanceStatus.Connecting);
    this.conn = new ShowXConnection({
      host: config.host, port: config.port,
      showId: config.showId, pairingToken: config.pairingToken,
      onStatusChange: (status) => this.updateStatus(status),
      onVariablesUpdate: (vars) => this.setVariableValues(vars),
      onFeedbacksUpdate: () => this.checkFeedbacks(),
    });
    await this.conn.connect();
    this.setActionDefinitions(compileActions(this));
    this.setFeedbackDefinitions(compileFeedbacks(this));
    this.setVariableDefinitions(compileVariables());
    this.setPresetDefinitions(compilePresets());
  }

  async destroy(): Promise<void> { await this.conn?.disconnect(); }

  async configUpdated(config: ShowXConfig): Promise<void> {
    await this.destroy();
    await this.init(config);
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return [
      { id: 'host', type: 'textinput', label: 'ShowX host', width: 6, default: 'showx.local', required: true },
      { id: 'port', type: 'number', label: 'ShowX port', width: 3, default: 5300, min: 1, max: 65535 },
      { id: 'showId', type: 'textinput', label: 'Show ID', width: 12, default: '', required: true },
      { id: 'pairingToken', type: 'textinput', label: 'Pairing token (paste from ShowX → Add Companion)', width: 12, default: '', required: true },
    ];
  }
}

runEntrypoint(ShowXInstance, []);
```

### Connection

```ts
// external/companion-module-showx/src/connection.ts
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

export interface ConnOpts {
  host: string; port: number; showId: string; pairingToken: string;
  onStatusChange: (status: string) => void;
  onVariablesUpdate: (vars: Record<string, any>) => void;
  onFeedbacksUpdate: () => void;
}

export class ShowXConnection {
  private ws?: WebSocket;
  private reconnectDelay = 1000;
  private maxBackoff = 30000;
  private stopped = false;

  vars: Record<string, any> = {
    connected: 0,
    current_cue_label: '',
    armed_cue_label: '',
    last_fired_label: '',
    mode: 'unknown',
    stations_online: 0,
  };

  constructor(public opts: ConnOpts) {}

  async connect(): Promise<void> {
    const url = `ws://${this.opts.host}:${this.opts.port}/events/${this.opts.showId}?token=${encodeURIComponent(this.opts.pairingToken)}`;
    this.ws = new WebSocket(url);
    this.ws.on('open', () => {
      this.reconnectDelay = 1000;
      this.vars.connected = 1;
      this.opts.onStatusChange('ok');
      this.opts.onVariablesUpdate(this.vars);
      this.opts.onFeedbacksUpdate();
    });
    this.ws.on('message', (data) => this.handleMessage(data.toString()));
    this.ws.on('close', () => {
      this.vars.connected = 0;
      this.opts.onStatusChange('connection_failure');
      this.opts.onVariablesUpdate(this.vars);
      this.opts.onFeedbacksUpdate();
      if (!this.stopped) setTimeout(() => this.connect().catch(() => {}), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxBackoff);
    });
    this.ws.on('error', (err) => this.opts.onStatusChange('connection_failure'));
  }

  private handleMessage(data: string): void {
    const env = JSON.parse(data);
    if (env.topic === 'go.dispatched') {
      this.vars.last_fired_label = env.payload.cue_label ?? env.payload.cue_id;
      this.opts.onVariablesUpdate(this.vars);
      this.opts.onFeedbacksUpdate();
    } else if (env.topic === 'arm.broadcast') {
      this.vars.armed_cue_label = env.payload.cue_label ?? env.payload.cue_id;
      this.opts.onVariablesUpdate(this.vars);
    } else if (env.topic === 'mode.transition') {
      this.vars.mode = env.payload.mode;
      this.opts.onVariablesUpdate(this.vars);
      this.opts.onFeedbacksUpdate();
    } else if (env.topic === 'heartbeat') {
      this.vars.stations_online = env.payload.stations_online ?? 0;
      this.opts.onVariablesUpdate(this.vars);
    }
  }

  sendGo(cuelistId: string, cueId: string, override = false): void {
    this.ws?.send(JSON.stringify({
      topic: 'go.request', request_id: uuidv4(),
      cue_id: cueId, cuelist_id: cuelistId,
      station_id: 'companion', operator_id: 'companion',
      client_ts: new Date().toISOString(), override,
    }));
  }

  sendStandby(cuelistId: string, cueId: string): void {
    this.ws?.send(JSON.stringify({
      topic: 'arm.request', cuelist_id: cuelistId, cue_id: cueId,
      station_id: 'companion', operator_id: 'companion',
    }));
  }

  async disconnect(): Promise<void> { this.stopped = true; this.ws?.close(); }
}
```

### Actions

```ts
// external/companion-module-showx/src/actions.ts
export function compileActions(instance: ShowXInstance) {
  return {
    go: {
      name: 'GO — fire armed cue',
      options: [],
      callback: () => instance.conn?.sendGo(instance.config.cuelistId ?? '', '/* derive armed */'),
    },
    standby_next: {
      name: 'Standby — arm next cue',
      options: [],
      callback: () => instance.conn?.sendStandby(instance.config.cuelistId ?? '', '/* derive next */'),
    },
    goto: {
      name: 'Goto cue',
      options: [{ id: 'cueRef', type: 'textinput', label: 'Cue ID or label' }],
      callback: (event) => { /* send goto envelope */ },
    },
    stop: { name: 'Stop cuelist', options: [], callback: () => {/* send stop */} },
    pause: { name: 'Pause cuelist', options: [], callback: () => {/* */} },
    resume: { name: 'Resume cuelist', options: [], callback: () => {/* */} },
    go_override: {
      name: 'GO override (bypass authority)',
      options: [],
      callback: () => instance.conn?.sendGo(/* args */ '', '', true),
    },
  };
}
```

### Feedbacks

```ts
// external/companion-module-showx/src/feedbacks.ts
export function compileFeedbacks(instance: ShowXInstance) {
  return {
    connected: {
      type: 'boolean',
      name: 'Connection status',
      defaultStyle: { color: 0xffffff, bgcolor: 0x008000 },
      options: [],
      callback: () => instance.conn?.vars.connected === 1,
    },
    show_mode: {
      type: 'boolean',
      name: 'SHOW mode active',
      defaultStyle: { color: 0xffffff, bgcolor: 0xCC0000 },
      options: [],
      callback: () => instance.conn?.vars.mode === 'show',
    },
    cue_armed: {
      type: 'boolean',
      name: 'Cue armed',
      defaultStyle: { color: 0x000000, bgcolor: 0xFFCC00 },
      options: [],
      callback: () => !!instance.conn?.vars.armed_cue_label,
    },
  };
}
```

### Variables + presets

(Forge fills out compileVariables + compilePresets per Companion SDK conventions.)

### README

```markdown
# companion-module-showx

Bitfocus Companion module for ShowX — XLAB live show cuelist platform.

## Install

(Once accepted to Companion community modules: install via Companion UI → Modules → ShowX.)

## Configuration

1. In Companion, add a connection of type "ShowX".
2. Set host (default `showx.local`), port (5300), show ID (UUIDv7 from ShowX), and pairing token.
3. Pairing token: in ShowX shell → Cuelist Core → Companion → "Generate Companion token" → paste.

## Actions

- GO — fire armed cue
- Standby — arm next cue
- Goto — jump playhead
- Stop / Pause / Resume cuelist
- GO override — bypass SM authority (emergency)

## Feedback

- Connection status (green/red)
- SHOW mode active (red border)
- Cue armed (yellow pulse)

## Variables

- `$(showx:current_cue_label)` — current playhead cue
- `$(showx:armed_cue_label)` — armed cue (next to fire)
- `$(showx:last_fired_label)` — most recent fired cue
- `$(showx:mode)` — rehearsal / show
- `$(showx:stations_online)` — connected station count

## License

MIT — XLAB s.r.o.
```

## Test plan

### `connection.test.ts`

1. connect() opens WSS to correct URL with token query.
2. open event sets vars.connected = 1.
3. go.dispatched event updates last_fired_label var.
4. mode.transition event updates mode var.
5. Reconnect on close: setTimeout with exponential backoff.
6. disconnect() prevents reconnect.
7. sendGo() produces valid JSON envelope with unique request_id.
8. sendStandby() produces valid arm.request envelope.

### `actions.test.ts`

9. compileActions returns 7 action handlers.
10. go action callback invokes conn.sendGo.

## Out of scope

- Native Stream Deck plugin (Companion suffices).
- Auto-discovery of ShowX via mDNS in Companion (post-MVP — manual host entry).
- Cue browser UI in Companion (post-MVP).
- Multi-show / multi-cuelist switcher (post-MVP).
- Token auto-rotation (post-MVP).
- Cloud Sync awareness (post-MVP).
- PR submission to Companion repo (Architect/Jindřich handles).

## Notes for Critic

- Verify module structure matches @companion-module/base SDK requirements (manifest.json fields, runEntrypoint signature).
- Verify reconnect logic uses exponential backoff (NOT immediate retry).
- Confirm pairing token entered via Companion config; no hardcoded secrets.
- Verify variables are updated on every relevant event (last_fired_label updates on go.dispatched).
- Verify HELP.md is concise (Companion shows in tooltip).
- Confirm README mentions PR submission process is Architect-led.
- Watch for license — MIT consistent with Companion ecosystem.
- Verify destroy() cleans up WSS (no leaks across config updates).
