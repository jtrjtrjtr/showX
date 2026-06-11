// src/shared/src/types/cue.ts
// Canonical Cue types per data_model.md §4.1, §6.1

import type { Payload, PayloadType } from './payload.js';
import type { DepartmentTag } from './department.js';
export type { DepartmentTag } from './department.js';

export type TriggerKind = 'manual' | 'auto_follow' | 'auto_continue' | 'timecode';

export type Trigger =
  | { kind: 'manual' }
  | { kind: 'auto_follow'; prev_cue_id: string }
  | { kind: 'auto_continue'; delay_ms: number }
  | { kind: 'timecode'; time_ms: number; source: 'ltc' | 'mtc' | 'internal' };

export interface Cue {
  id: string;
  label: string;
  description: string;
  department: DepartmentTag[];
  standby_note: string;
  script_line_ref: string | null;
  trigger: Trigger;
  payloads: Payload[];
  duration_hint_ms: number | null;
  notes: string;
  payload_frozen_at: string | null;
  created_at: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
  /** QLab-style display number (free-text, not ordering). Null = no number assigned. */
  cue_number?: string | null;
}

export interface CueCatalogEntry {
  id: string;
  label: string;
  cue_number?: string | null;
  cuelist_id: string;
  department: DepartmentTag[];
  payloads: Array<{
    id: string;
    type: PayloadType;
    tag: string | null;
    device_id: string | null;
    summary: string;
  }>;
}

export interface CueCatalog {
  schema_version: 1;
  show_id: string;
  generated_at: string;
  source: string;
  payload_types_used: PayloadType[];
  devices_referenced: Array<{
    id: string;
    referenced_by_payloads: number;
    payload_types: PayloadType[];
  }>;
  cues: CueCatalogEntry[];
}
