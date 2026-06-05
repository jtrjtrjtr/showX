// src/types/show.ts
// Canonical Show types — normative TypeScript contract.
// Matches data_model.md §2.2, §2.3, §2.4 exactly.
// Y.Map / Y.Array are Yjs runtime types (import 'yjs' in consuming code).

import type { DepartmentTag, Trigger } from './cue.js';

export type ShowMode = 'rehearsal' | 'show';

export interface ShowMeta {
  schema_version: 1;
  show_id: string;              // UUIDv7, immutable after creation
  title: string;
  venue: string | null;
  date: string | null;          // ISO yyyy-mm-dd
  departments: DepartmentTag[];
  mode: ShowMode;
  active_cuelist_id: string;
  created_at: string;           // ISO 8601
  last_meta_editor: string | null;
}

/** Y.Array entry shape for one cuelist. Values stored on Y.Map. */
export interface CuelistMap {
  id: string;
  name: string;
  default_trigger: Trigger['kind'];
  go_authority: 'sm_called' | 'auto_cascade' | 'per_dept' | 'timecode';
  sm_offline_policy:
    | { kind: 'freeze' }
    | { kind: 'delegate'; to_operator_id: string }
    | { kind: 'auto_continue' };
  // cues: Y.Array<Y.Map<unknown>> — Yjs CRDT array, not typed here
  playhead: { cue_id: string | null; armed_cue_id: string | null };
  show_snapshot_id: string | null;
}
