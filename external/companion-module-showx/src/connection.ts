import WebSocket from 'ws';
import { randomUUID } from 'crypto';

export interface ConnOpts {
  host: string;
  port: number;
  showId: string;
  pairingToken: string;
  onStatusChange: (status: string) => void;
  onVariablesUpdate: (vars: Record<string, string | number>) => void;
  onFeedbacksUpdate: () => void;
}

export interface ConnectionVars {
  connected: number;
  current_cue_label: string;
  armed_cue_label: string;
  last_fired_label: string;
  mode: string;
  stations_online: number;
}

// Backoff steps in ms: 1s, 2s, 4s, 8s, 16s, 30s max
const BACKOFF_INITIAL = 1000;
const BACKOFF_MAX = 30000;

export class ShowXConnection {
  private ws?: WebSocket;
  private reconnectDelay = BACKOFF_INITIAL;
  private stopped = false;
  // Tracks cuelist_id from last arm.broadcast so GO knows which cuelist to target
  private lastCuelistId = '';
  private lastArmedCueId = '';

  vars: ConnectionVars = {
    connected: 0,
    current_cue_label: '',
    armed_cue_label: '',
    last_fired_label: '',
    mode: 'unknown',
    stations_online: 0,
  };

  constructor(public readonly opts: ConnOpts) {}

  connect(): void {
    const url = `ws://${this.opts.host}:${this.opts.port}/events/${encodeURIComponent(this.opts.showId)}?token=${encodeURIComponent(this.opts.pairingToken)}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectDelay = BACKOFF_INITIAL;
      this.vars.connected = 1;
      this.opts.onStatusChange('ok');
      this.opts.onVariablesUpdate({ ...this.vars });
      this.opts.onFeedbacksUpdate();
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        this.handleMessage(data.toString());
      } catch {
        // malformed message — ignore
      }
    });

    this.ws.on('close', () => {
      this.vars.connected = 0;
      this.opts.onStatusChange('connection_failure');
      this.opts.onVariablesUpdate({ ...this.vars });
      this.opts.onFeedbacksUpdate();
      if (!this.stopped) {
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, BACKOFF_MAX);
        setTimeout(() => {
          if (!this.stopped) this.connect();
        }, delay);
      }
    });

    this.ws.on('error', () => {
      this.opts.onStatusChange('connection_failure');
    });
  }

  private handleMessage(raw: string): void {
    const env = JSON.parse(raw) as {
      topic: string;
      seq?: number;
      ts?: number;
      payload: Record<string, unknown>;
    };

    switch (env.topic) {
      case 'go.dispatched': {
        const p = env.payload;
        const label = (p['cue_label'] as string | undefined) ?? (p['cue_id'] as string | undefined) ?? '';
        this.vars.last_fired_label = label;
        this.vars.current_cue_label = label;
        this.opts.onVariablesUpdate({ ...this.vars });
        this.opts.onFeedbacksUpdate();
        break;
      }
      case 'arm.broadcast': {
        const p = env.payload;
        this.lastCuelistId = (p['cuelist_id'] as string | undefined) ?? this.lastCuelistId;
        this.lastArmedCueId = (p['cue_id'] as string | undefined) ?? '';
        this.vars.armed_cue_label = (p['cue_label'] as string | undefined) ?? this.lastArmedCueId;
        this.opts.onVariablesUpdate({ ...this.vars });
        this.opts.onFeedbacksUpdate();
        break;
      }
      case 'mode.transition': {
        const p = env.payload;
        this.vars.mode = (p['to'] as string | undefined) ?? 'unknown';
        this.opts.onVariablesUpdate({ ...this.vars });
        this.opts.onFeedbacksUpdate();
        break;
      }
      case 'heartbeat': {
        const p = env.payload;
        this.vars.stations_online = (p['stations_online'] as number | undefined) ?? 0;
        this.opts.onVariablesUpdate({ ...this.vars });
        break;
      }
    }
  }

  sendGo(cuelistId: string, cueId: string, override = false): void {
    if (!this.isOpen()) return;
    this.ws!.send(
      JSON.stringify({
        topic: 'go.request',
        request_id: randomUUID(),
        cue_id: cueId,
        cuelist_id: cuelistId,
        station_id: 'companion',
        operator_id: 'companion',
        client_ts: new Date().toISOString(),
        override,
      }),
    );
  }

  sendGoArmed(override = false): void {
    this.sendGo(this.lastCuelistId, this.lastArmedCueId, override);
  }

  sendStandbyNext(): void {
    if (!this.isOpen()) return;
    this.ws!.send(
      JSON.stringify({
        topic: 'arm.request',
        cuelist_id: this.lastCuelistId,
        cue_id: 'next',
        station_id: 'companion',
        operator_id: 'companion',
      }),
    );
  }

  sendStandby(cuelistId: string, cueId: string): void {
    if (!this.isOpen()) return;
    this.ws!.send(
      JSON.stringify({
        topic: 'arm.request',
        cuelist_id: cuelistId,
        cue_id: cueId,
        station_id: 'companion',
        operator_id: 'companion',
      }),
    );
  }

  sendStop(cuelistId: string): void {
    if (!this.isOpen()) return;
    this.ws!.send(JSON.stringify({ topic: 'stop.request', cuelist_id: cuelistId, station_id: 'companion' }));
  }

  sendPause(cuelistId: string): void {
    if (!this.isOpen()) return;
    this.ws!.send(JSON.stringify({ topic: 'pause.request', cuelist_id: cuelistId, station_id: 'companion' }));
  }

  sendResume(cuelistId: string): void {
    if (!this.isOpen()) return;
    this.ws!.send(JSON.stringify({ topic: 'resume.request', cuelist_id: cuelistId, station_id: 'companion' }));
  }

  sendGoto(cuelistId: string, cueRef: string): void {
    if (!this.isOpen()) return;
    this.ws!.send(
      JSON.stringify({
        topic: 'goto.request',
        cuelist_id: cuelistId,
        cue_ref: cueRef,
        station_id: 'companion',
        operator_id: 'companion',
      }),
    );
  }

  disconnect(): void {
    this.stopped = true;
    this.ws?.close();
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getLastCuelistId(): string {
    return this.lastCuelistId;
  }

  getLastArmedCueId(): string {
    return this.lastArmedCueId;
  }
}
