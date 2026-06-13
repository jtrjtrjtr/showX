import type {
  TransportMessage,
  TransportDestination,
  ClaimToken,
  ClaimConflict,
  DispatchResult,
  PoolStatus,
  InputSpec,
  InputHandler,
} from './transport.js';
import type { ConfigSchemaDescriptor, MenuItemSpec, ModuleTier, ReactComponentModule } from './module.js';
import type { ShowxEvent } from './events.js';

// ── Health ─────────────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';

export interface HealthSnapshot {
  slug: string;
  status: HealthStatus;
  detail?: string;
  updatedAt: number;
}

// ── Subscription ───────────────────────────────────────────────────────────

export interface Subscription {
  readonly id: string;
  unsubscribe(): void;
}

// ── Logger ─────────────────────────────────────────────────────────────────

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(suffix: string): Logger;
}

// ── EventBus ───────────────────────────────────────────────────────────────

export interface EventBus {
  publish<T extends ShowxEvent>(event: T): void;
  subscribe<T extends ShowxEvent>(
    type: T['type'] | T['type'][] | '*',
    handler: (e: T) => void,
  ): Subscription;
  subscribePattern(pattern: string, handler: (e: ShowxEvent) => void): Subscription;
}

// ── HealthBus ──────────────────────────────────────────────────────────────

export interface HealthBus {
  report(slug: string, status: HealthStatus, detail?: string): void;
  observe(slug: string, handler: (h: HealthSnapshot) => void): Subscription;
  aggregate(): HealthStatus;
  snapshot(): HealthSnapshot[];
}

// ── PersistedStore ─────────────────────────────────────────────────────────

export interface PersistedStore {
  load<T>(schema: ConfigSchemaDescriptor<T>): Promise<T>;
  save<T>(value: T): Promise<void>;
  onChange<T>(handler: (next: T) => void): Subscription;
}

// ── SecretStore ────────────────────────────────────────────────────────────

export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

// ── AssetServer ────────────────────────────────────────────────────────────

export interface AssetReq {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface AssetResp {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export type ApiHandler = (req: AssetReq) => Promise<AssetResp>;

export interface AssetServer {
  port(): number;
  baseUrl(): string;
  registerStaticRoute(slug: string, dir: string): Subscription;
  registerApiRoute(method: 'GET' | 'POST', path: string, handler: ApiHandler): Subscription;
}

// ── MdnsService ────────────────────────────────────────────────────────────

export interface MdnsPeer {
  name: string;
  host: string;
  port: number;
  txt: Record<string, string>;
}

export interface MdnsService {
  advertise(name: string, port: number, txt: Record<string, string>): Subscription;
  browse(serviceType: string, handler: (peer: MdnsPeer) => void): Subscription;
}

// ── SyncBroker ─────────────────────────────────────────────────────────────

export interface YDocHandle {
  readonly name: string;
  readonly doc: unknown;
  destroy(): void;
}

export interface AwarenessHandler {
  (clientId: number, state: Record<string, unknown> | null): void;
}

export interface SideChannelMessage {
  topic: 'go' | 'presence' | 'preview' | 'clock.anchor';
  payload: Record<string, unknown>;
  origin?: string;
}

export interface SyncBroker {
  openDocument(name: string): YDocHandle;
  closeDocument(handle: YDocHandle): void;
  subscribeAwareness(name: string, handler: AwarenessHandler): Subscription;
  publishSideChannel(showId: string, msg: SideChannelMessage): void;
  subscribeSideChannel(showId: string, handler: (msg: SideChannelMessage) => void): Subscription;
}

// ── OutputDispatcher ───────────────────────────────────────────────────────

export interface OutputDispatcher {
  send(msg: TransportMessage): Promise<DispatchResult>;
  claim(dest: TransportDestination): Promise<ClaimToken | ClaimConflict>;
  release(token: ClaimToken): Promise<void>;
  poolStatus(): PoolStatus;
}

// ── InputRegistrar ─────────────────────────────────────────────────────────

export interface InputRegistrar {
  listen(spec: InputSpec, handler: InputHandler): Subscription;
  unlisten(sub: Subscription): void;
}

// ── PairingStore ───────────────────────────────────────────────────────────

export interface PairingClaims {
  deviceId: string;
  roles: string[];
  tier: ModuleTier;
  expiresAt: number;
}

export interface PairingToken {
  token: string;
  deviceId: string;
  fingerprint: string;
}

export interface PairedDevice {
  deviceId: string;
  label: string;
  roles: string[];
  tier: ModuleTier;
  pairedAt: number;
  lastSeenAt?: number;
}

export interface PairingStore {
  validateToken(token: string): Promise<PairingClaims | null>;
  issue(deviceLabel: string, roles: string[], tier: ModuleTier): Promise<PairingToken>;
  revoke(deviceId: string): Promise<void>;
  list(): Promise<PairedDevice[]>;
}

// ── ModuleUIRegistrar ──────────────────────────────────────────────────────

export interface ModuleUIRegistrar {
  registerStatusBadge(_: ReactComponentModule): Subscription;
  registerMenuItem(_: MenuItemSpec): Subscription;
}
