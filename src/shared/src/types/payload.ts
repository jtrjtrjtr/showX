// src/shared/src/types/payload.ts
// Canonical Payload discriminated union per data_model.md §5.1

export type PayloadType =
  | 'osc' | 'msc' | 'lx_ref' | 'midi' | 'dmx' | 'webhook' | 'wait' | 'group';

export interface PayloadBase {
  id: string;
  type: PayloadType;
  tag: string | null;
  note: string;
}

export interface OscPayload extends PayloadBase {
  type: 'osc';
  device_id: string;
  address: string;
  args: OscArg[];
}

export interface MscPayload extends PayloadBase {
  type: 'msc';
  device_id: string;
  command: 'go' | 'stop' | 'resume' | 'load' | 'set' | 'fire' | 'all_off';
  cue_list: string | null;
  cue_number: string | null;
  device_id_msc: number;
}

export interface LxRefPayload extends PayloadBase {
  type: 'lx_ref';
  device_id: string;
  cue_list: number;
  cue_number: number;
}

export interface MidiPayload extends PayloadBase {
  type: 'midi';
  device_id: string;
  message:
    | { kind: 'note_on'; channel: number; note: number; velocity: number }
    | { kind: 'note_off'; channel: number; note: number; velocity: number }
    | { kind: 'cc'; channel: number; controller: number; value: number }
    | { kind: 'program_change'; channel: number; program: number }
    | { kind: 'raw'; bytes: number[] };
}

export interface DmxChannel {
  channel: number;
  value: number;
}

export interface DmxPayload extends PayloadBase {
  type: 'dmx';
  device_id: string;
  universe: number;
  channels: DmxChannel[];
}

export interface WebhookPayload extends PayloadBase {
  type: 'webhook';
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body: string | null;
  timeout_ms: number;
}

export interface WaitPayload extends PayloadBase {
  type: 'wait';
  duration_ms: number;
}

export interface GroupPayload extends PayloadBase {
  type: 'group';
  child_cue_ids: string[];
  fire_mode: 'parallel' | 'series';
}

export type Payload =
  | OscPayload
  | MscPayload
  | LxRefPayload
  | MidiPayload
  | DmxPayload
  | WebhookPayload
  | WaitPayload
  | GroupPayload;

export type OscArg =
  | { type: 'int'; value: number }
  | { type: 'float'; value: number }
  | { type: 'string'; value: string }
  | { type: 'blob'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'nil' };
