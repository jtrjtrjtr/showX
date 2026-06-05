// src/types/payload.ts
// Canonical Payload discriminated union — normative TypeScript contract.
// Matches data_model.md §5.1 exactly. All other codebase types defer to this.

export type PayloadType =
  | 'osc' | 'msc' | 'lx_ref' | 'midi' | 'webhook' | 'wait' | 'group';

export interface PayloadBase {
  id: string;
  type: PayloadType;
  /** Optional sub-selector for routing. Free string set by author. */
  tag: string | null;
  /** Authored display note for UI. */
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
  device_id_msc: number;  // 0..127, 127 = all devices
}

export interface LxRefPayload extends PayloadBase {
  type: 'lx_ref';
  device_id: string;
  cue_list: number;    // ≥ 1
  cue_number: number;  // ≥ 0, float allowed (Eos fractional cue numbers)
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

export interface WebhookPayload extends PayloadBase {
  type: 'webhook';
  url: string;   // https enforced, loopback http allowed
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body: string | null;
  timeout_ms: number;  // default 5000
}

export interface WaitPayload extends PayloadBase {
  type: 'wait';
  duration_ms: number;  // 0..600000
}

export interface GroupPayload extends PayloadBase {
  type: 'group';
  child_cue_ids: string[];  // ≤ 32
  fire_mode: 'parallel' | 'series';
}

export type Payload =
  | OscPayload
  | MscPayload
  | LxRefPayload
  | MidiPayload
  | WebhookPayload
  | WaitPayload
  | GroupPayload;

export type OscArg =
  | { type: 'int'; value: number }
  | { type: 'float'; value: number }
  | { type: 'string'; value: string }
  | { type: 'blob'; value: string }    // base64 in JSON; Buffer in runtime
  | { type: 'bool'; value: boolean }
  | { type: 'nil' };
