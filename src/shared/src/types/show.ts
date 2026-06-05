// src/shared/src/types/show.ts
// Canonical Show meta types per data_model.md §2.3

import type { DepartmentTag } from './cue.js';

export type ShowMode = 'rehearsal' | 'show';

export interface ShowMeta {
  schema_version: 1;
  show_id: string;
  title: string;
  venue: string | null;
  date: string | null;
  departments: DepartmentTag[];
  mode: ShowMode;
  active_cuelist_id: string;
  created_at: string;
  last_meta_editor: string | null;
}

export interface Show {
  id: string;
  title: string;
  mode: ShowMode;
  createdAt: number;
  updatedAt: number;
  departments: string[];
}
