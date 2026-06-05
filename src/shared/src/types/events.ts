import type { CueCatalog } from './cue.js';
import type { Payload } from './payload.js';
import type { DepartmentTag } from './department.js';
import type { HealthStatus } from './services.js';
import type { ModuleState } from './module.js';
import type { ShowMode } from './show.js';

export interface CueFiredEvent {
  type: 'cue-fired';
  showId: string;
  cueId: string;
  firedAt: number;
  origin: string;
}

// ── Cuelist Core canonical events (protocol_dictionary.md §2.2) ───────────────

export interface CueFireEvent {
  type: 'cue-fire';
  seq: number;
  ts: number;
  source: string;
  show_id: string;
  cuelist_id: string;
  cue_id: string;
  cue_label: string;
  departments: DepartmentTag[];
  payloads?: Payload[];
  fired_by: string;
  trigger_mode: 'manual' | 'auto_follow' | 'auto_continue' | 'timecode';
}

export interface CueCompleteEvent {
  type: 'cue-complete';
  seq: number;
  ts: number;
  source: string;
  show_id: string;
  cuelist_id: string;
  cue_id: string;
  duration_ms: number;
  success: boolean;
  errors?: string[];
  /** Populated by B003-009 payload dispatcher */
  payloads_dispatched?: number;
  /** Populated by B003-009 payload dispatcher — array of failed payload_ids */
  payloads_failed?: string[];
}

export interface CuelistGoEvent {
  type: 'cuelist-go';
  seq: number;
  ts: number;
  source: string;
  show_id: string;
  cuelist_id: string;
  next_cue_id: string;
  by_operator_id: string;
}

export interface SystemErrorEvent {
  type: 'system-error';
  seq: number;
  ts: number;
  source: string;
  module: string;
  severity: 'warn' | 'error' | 'fatal';
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface CueCatalogUpdatedEvent {
  type: 'cue-catalog-updated';
  showId: string;
  catalog: CueCatalog;
}

export interface ModuleStateChangedEvent {
  type: 'module-state-changed';
  slug: string;
  prev: ModuleState;
  next: ModuleState;
  at: number;
}

export interface HealthChangedEvent {
  type: 'health-changed';
  slug: string;
  status: HealthStatus;
  detail?: string;
}

export interface PairingChangedEvent {
  type: 'pairing-changed';
  action: 'paired' | 'revoked' | 'seen';
  deviceId: string;
}

export interface ShowModeChangeEvent {
  type: 'show-mode-change';
  show_id: string;
  from: ShowMode;
  to: ShowMode;
  by_operator_id: string;
}

export type ShowxEvent =
  | CueFiredEvent
  | CueCatalogUpdatedEvent
  | ModuleStateChangedEvent
  | HealthChangedEvent
  | PairingChangedEvent
  | ShowModeChangeEvent
  | CueFireEvent
  | CueCompleteEvent
  | CuelistGoEvent
  | SystemErrorEvent;

