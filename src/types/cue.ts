// src/types/cue.ts
// Canonical Cue types — normative TypeScript contract.
// Matches data_model.md §4.1, §6.1 exactly.

import type { Payload } from './payload.js';
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
  department: DepartmentTag[];  // 1..N entries required
  standby_note: string;
  script_line_ref: string | null;
  trigger: Trigger;
  payloads: Payload[];
  duration_hint_ms: number | null;
  notes: string;             // plain string MVP; Y.Text upgrade at 0.2
  payload_frozen_at: string | null;  // ISO or null; set by SHOW mode lock
  created_at: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
}
