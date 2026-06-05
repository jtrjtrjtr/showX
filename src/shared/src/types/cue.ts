import type { Payload } from './payload.js';

export interface Cue {
  id: string;
  showId: string;
  number: string;
  label: string;
  notes?: string;
  payloads: Payload[];
  departments: string[];
  autoFollow?: { delayMs: number; targetCueId: string };
  createdAt: number;
  updatedAt: number;
}

export interface CueCatalog {
  showId: string;
  cues: Cue[];
  version: number;
}
