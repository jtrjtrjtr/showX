export interface DiscoveredHost {
  host: string;
  port: number;
  name?: string;
  pairingAvailable: boolean;
}

export interface PairedSession {
  host: string;
  port: number;
  token: string;
  display_name: string;
  device_id: string;
  paired_at: number;
}

export type AppMode = 'discover' | 'pair' | 'show' | 'shell';

export interface SyncStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  attempts: number;
  lastError?: string;
}
