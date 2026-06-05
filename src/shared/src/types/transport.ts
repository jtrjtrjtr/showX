export type Transport =
  | 'osc'
  | 'midi'
  | 'msc'
  | 'dmx-artnet'
  | 'dmx-sacn'
  | 'webhook';

export interface TransportDestination {
  transport: Transport;
  host?: string;
  port?: number;
  midiPortName?: string;
  dmxUniverse?: number;
}

export interface OscMessage {
  transport: 'osc';
  host: string;
  port: number;
  address: string;
  args: Array<number | string | boolean | Buffer>;
}

export interface MidiMessage {
  transport: 'midi';
  midiPortName: string;
  bytes: number[];
}

export interface MscMessage {
  transport: 'msc';
  midiPortName: string;
  deviceId: number;
  commandFormat: number;
  command: number;
  data: number[];
}

export interface DmxArtnetMessage {
  transport: 'dmx-artnet';
  host: string;
  net?: number;
  subnet?: number;
  universe: number;
  data: number[];
}

export interface DmxSacnMessage {
  transport: 'dmx-sacn';
  universe: number;
  priority?: number;
  data: number[];
}

export interface WebhookMessage {
  transport: 'webhook';
  url: string;
  method: 'POST' | 'PUT' | 'GET';
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
}

export type TransportMessage =
  | OscMessage
  | MidiMessage
  | MscMessage
  | DmxArtnetMessage
  | DmxSacnMessage
  | WebhookMessage;

export interface DispatchResult {
  ok: boolean;
  transport: Transport;
  latencyMs: number;
  error?: string;
}

export interface ClaimToken {
  readonly id: string;
  readonly slug: string;
  readonly destination: TransportDestination;
}

export interface ClaimConflict {
  ok: false;
  reason: 'exclusive_owned';
  ownerSlug: string;
}

export interface PoolStatus {
  oscConnections: Array<{ host: string; port: number; refcount: number }>;
  midiOutputs: Array<{ portName: string; ownerSlug: string }>;
  dmxUniverses: Array<{ universe: number; protocol: 'artnet' | 'sacn'; ownerSlug: string }>;
}

export interface InputSpec {
  kind: 'osc-in' | 'midi-in' | 'webhook-in';
  port?: number;
  midiPortName?: string;
  path?: string;
  addressPattern?: string;
}

export interface InputHandler {
  (event: InboundEvent): void;
}

export type InboundEvent =
  | { kind: 'osc'; host: string; port: number; address: string; args: unknown[]; receivedAt: number }
  | { kind: 'midi'; portName: string; bytes: number[]; receivedAt: number }
  | { kind: 'webhook'; method: string; path: string; headers: Record<string, string>; body: unknown; receivedAt: number };
