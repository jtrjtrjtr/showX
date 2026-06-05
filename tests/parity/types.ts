export interface ParityEvent {
  /** Where the event originated. */
  source: 'eventx_supabase' | 'osc_in' | 'midi_in' | 'http_in';
  /** ms offset from scenario start. */
  at_ms: number;
  /** Source-specific payload. */
  payload: Record<string, unknown>;
}

export interface ParityOutput {
  transport: 'osc' | 'midi' | 'dmx' | 'msc' | 'webhook';
  /** ms offset from scenario start, with tolerance window. */
  at_ms: number;
  tolerance_ms?: number;
  /** Transport-specific shape. */
  payload: Record<string, unknown>;
}

export interface ParityScenario {
  name: string;
  description?: string;
  duration_ms: number;
  input_events: ParityEvent[];
  expected_outputs: ParityOutput[];
  /** Optional: golden recording from BridgeX 0.3.x against which to also compare. */
  bridgex_golden_path?: string;
}

export interface ParityResult {
  scenario: string;
  passed: boolean;
  diffs: ParityDiff[];
  showx_outputs: ParityOutput[];
  bridgex_outputs?: ParityOutput[];
  notes: string[];
}

export interface ParityDiff {
  kind: 'missing_expected' | 'unexpected_emitted' | 'payload_mismatch' | 'timing_drift';
  expected?: ParityOutput;
  actual?: ParityOutput;
  detail: string;
}
