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
  // Station identity — populated at pairing time; optional for backward compat
  role?: 'sm' | 'operator' | 'companion' | 'observer';
  show_id?: string;
  station_id?: string;
  operator_id?: string;
  owned_departments?: string[];
  watched_departments?: string[];
  presence_color?: string;
}

export type AppMode = 'discover' | 'pair' | 'show' | 'shell';

export interface SyncStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  attempts: number;
  lastError?: string;
}
