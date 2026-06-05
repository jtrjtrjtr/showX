// src/types/cueCatalog.ts
// Public CueCatalog type — normative contract for derived cue catalog artifact.
// Matches data_model.md §10.2 shape. Re-exported from showx-shared.

import type { DepartmentTag } from './department.js';
import type { PayloadType } from './payload.js';

export interface CueCatalog {
  schema_version: 1;
  show_id: string;
  generated_at: string;             // ISO
  source: string;                   // "cuelist-core@<semver>"
  payload_types_used: PayloadType[];
  devices_referenced: Array<{
    id: string;
    referenced_by_payloads: number;
    payload_types: PayloadType[];
  }>;
  cues: CueCatalogEntry[];
}

export interface CueCatalogEntry {
  id: string;
  label: string;
  cuelist_id: string;
  department: DepartmentTag[];
  payloads: Array<{
    id: string;
    type: PayloadType;
    tag: string | null;
    device_id: string | null;
    /** Type-specific UI-friendly summary string. */
    summary: string;
  }>;
}
