export interface OscPayload {
  kind: 'osc';
  destination: { host: string; port: number };
  address: string;
  args: Array<number | string | boolean>;
}

export interface MidiPayload {
  kind: 'midi';
  midiPortName: string;
  bytes: number[];
}

export interface MscPayload {
  kind: 'msc';
  midiPortName: string;
  deviceId: number;
  commandFormat: number;
  command: number;
  data: number[];
}

export interface DmxPayload {
  kind: 'dmx';
  protocol: 'artnet' | 'sacn';
  universe: number;
  data: number[];
  priority?: number;
}

export interface WebhookPayload {
  kind: 'webhook';
  url: string;
  method: 'POST' | 'PUT' | 'GET';
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
}

export type Payload = OscPayload | MidiPayload | MscPayload | DmxPayload | WebhookPayload;
