import type { CueCatalog } from './cue.js';
import type { HealthStatus } from './services.js';
import type { ModuleState } from './module.js';

export interface CueFiredEvent {
  type: 'cue-fired';
  showId: string;
  cueId: string;
  firedAt: number;
  origin: string;
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

export type ShowxEvent =
  | CueFiredEvent
  | CueCatalogUpdatedEvent
  | ModuleStateChangedEvent
  | HealthChangedEvent
  | PairingChangedEvent;

