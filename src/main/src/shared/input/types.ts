export type InputTransport = 'osc' | 'midi';

export interface OscInputFilter {
  /** Glob address pattern, e.g. "/showx/cue/*". Use "*" to match any. */
  address: string;
  /** Optional source host filter — exact IP or "any". */
  fromHost?: string;
}

export interface OscMessage {
  address: string;
  args: Array<number | string | boolean | Buffer>;
  fromHost: string;
  fromPort: number;
  receivedAt: number;
}

export interface MidiInputFilter {
  type?: 'noteOn' | 'noteOff' | 'cc' | 'programChange' | 'sysex' | 'any';
  /** 0-15 or 'any'. */
  channel?: number | 'any';
}

export interface MidiMessage {
  type: 'noteOn' | 'noteOff' | 'cc' | 'programChange' | 'sysex';
  channel: number;
  data1: number;
  data2: number;
  raw: number[];
  receivedAt: number;
}

export interface Subscription {
  id: string;
  unsubscribe(): Promise<void>;
}

export interface OscPortKey { kind: 'osc'; port: number; }
export interface MidiPortKey { kind: 'midi'; portName: string; }
export type ListenerKey = OscPortKey | MidiPortKey;
