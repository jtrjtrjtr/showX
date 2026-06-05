/**
 * ShowX Module Loader — Public Contract
 * =====================================
 *
 * This file is the canonical TypeScript contract between the ShowX shell
 * and any module hosted inside it (EventX Bridge, Cuelist Core, SHOW mode,
 * Custom Router, Cloud Sync, and future modules).
 *
 * Forge implements `src/main/module_loader.ts` AGAINST this contract.
 * Modules implement the `Module` interface and export the `manifest`
 * constant per §2 of `docs/specs/module_loader.md`.
 *
 * DO NOT change shapes in this file without an Architect decision note
 * in `docs/agent_exchange/decisions/`. The contract is binding — adding
 * a field is OK, renaming/removing a field is a breaking change.
 *
 * Spec: docs/specs/module_loader.md (binding)
 * Strategy: ../../../xlab-strategy/docs/showx_module_architecture.md
 *
 * Notes for Forge:
 *  - All async hooks return Promise<void>. Throw to fail; loader handles isolation.
 *  - Zod is referenced via opaque `ZodSchema` placeholder. The real impl will
 *    import from 'zod' once the dependency is wired in package.json.
 *  - React types are referenced via structural `ReactComponentModule` — keep
 *    this file free of `react` import to stay usable in tests + main.
 *  - Sandboxing of PersistedStore / SecretStore / Logger by `slug` is enforced
 *    by the loader, NOT by this file.
 */

// =============================================================================
// 1. Primitives
// =============================================================================

/** Semver string. Validated at manifest load time. */
export type Semver = string;

/** Pricing tier required to load a module. */
export type ModuleTier = 'free' | 'pro';

/** Health signal emitted by a module to HealthBus. */
export type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';

/** Transport kinds known to the OutputDispatcher / InputRegistrar. */
export type TransportKind =
  | 'osc-in'
  | 'osc-out'
  | 'midi-in'
  | 'midi-out'
  | 'msc-out'
  | 'dmx-artnet-out'
  | 'dmx-sacn-out'
  | 'ltc-out'
  | 'mtc-out'
  | 'webhook-in'
  | 'webhook-out'
  | 'tcp-out'
  | 'serial-out';

/** OS-level permissions a module may need declared upfront. */
export type OSPermission =
  | 'network.lan'           // bind to LAN sockets, mDNS
  | 'network.wan'           // outbound WAN (Cloud Sync only)
  | 'fs.readwrite.userdata' // PersistedStore + show files
  | 'fs.read.bridgex'       // legacy BridgeX 0.3.x config import (EventX Bridge only)
  | 'midi.device'           // OS MIDI permission prompt
  | 'bluetooth.device';     // future modules; not used in MVP

/** Lifecycle states observable on a module. See spec §3.1. */
export type ModuleState =
  | 'discovered'   // manifest read, not validated yet
  | 'validated'    // passed §2.3 validation
  | 'gated'        // waiting for tier/enable/deps
  | 'initing'
  | 'inited'
  | 'starting'
  | 'started'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'tearing_down'
  | 'torn_down'
  | 'failed'
  | 'unloadable';  // manifest validation failed

/** Opaque Zod schema reference. Real type comes from 'zod' once wired. */
export interface ZodSchema<T = unknown> {
  parse(value: unknown): T;
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
}

/** Lazy React component import token. Loader hands to renderer via IPC. */
export interface ReactComponentModule {
  default: unknown; // structurally: a React component. Avoid pulling react types here.
}

// =============================================================================
// 2. Module manifest
// =============================================================================

/**
 * Capability declarations a module advertises in its manifest. Drives:
 *  - macOS permission prompts at startup
 *  - OutputDispatcher pool warm-up
 *  - UI display of "what this module uses"
 *  - dependency-aware activation ordering
 */
export interface ModuleRequirements {
  transports: TransportRequirement[];
  permissions: OSPermission[];
  depends_on: string[];          // slugs of modules that must init/start first
  conflicts_with?: string[];     // slugs of modules that cannot coexist
  min_shell_version: Semver;
}

export interface TransportRequirement {
  kind: TransportKind;
  /** Optional hint for the dispatcher pool warm-up. */
  destination_hint?: string;
}

/** Spec for a single application-menu entry a module may register. */
export interface MenuItemSpec {
  label: string;
  accelerator?: string;        // Electron accelerator string
  action: 'open-panel' | 'invoke-rpc';
  rpcName?: string;            // when action === 'invoke-rpc'
}

/** Descriptor used by PersistedStore to load + migrate + validate config. */
export interface ConfigSchemaDescriptor<T> {
  schemaVersion: number;
  zodSchema: ZodSchema<T>;
  defaults: T;
  /** Called when stored blob's __schemaVersion is older than schemaVersion. */
  migrate?(prevVersion: number, prevValue: unknown): T;
}

/**
 * The single constant a module's `index.ts` must export as `manifest`.
 * Validated at discovery time per spec §2.3.
 */
export interface ModuleManifest {
  /** Stable kebab-case identity. Pattern: ^[a-z][a-z0-9-]{1,39}$ */
  slug: string;
  /** Human display name (≤40 chars). */
  name: string;
  /** Module semver. */
  version: Semver;
  /** Short subtitle (≤200 chars). */
  description: string;
  /** Pricing tier required. */
  tier: ModuleTier;
  /** Capabilities + dependencies. */
  requires: ModuleRequirements;
  /** Default enabled state on first install (when tier allows). */
  default_enabled?: boolean;
  /** Increment when persistedConfig schema breaks. */
  persistedConfigSchemaVersion: number;
  /** The class constructor. Loader does `new entry()` after gating. */
  entry: ModuleConstructor;
  /** Lazy import of main UI tab component. */
  uiPanel?: () => Promise<ReactComponentModule>;
  /** Lazy import of optional status-bar badge. Capped at 1 per module. */
  statusBadge?: () => Promise<ReactComponentModule>;
  /** Optional app menu entry. Capped at 1 per module. */
  menuItem?: MenuItemSpec;
}

// =============================================================================
// 3. Module class contract
// =============================================================================

/** Constructor signature for module classes. Loader: `new ModuleCtor()`. */
export interface ModuleConstructor {
  new (): Module;
}

/**
 * The lifecycle interface every module implements as the default export
 * class. The shell's loader calls these hooks in the order specified by
 * spec §3 and wraps each in try/catch + timeout (§10.1).
 */
export interface Module {
  /** Called once on activation. Receives sandbox-scoped context. */
  init(context: ModuleContext): Promise<void>;

  /** Open listeners, subscribe upstream, begin operation. */
  start(): Promise<void>;

  /** Close listeners, unsubscribe, persist state if needed. Respect ctx.abortSignal. */
  stop(): Promise<void>;

  /** Free remaining resources. Called after stop() or on shutdown. */
  teardown(): Promise<void>;

  /** Optional: live config update without restart. Errors → rollback. */
  onConfigChange?(newConfig: unknown): Promise<void>;

  /** Optional: synchronous health probe; loader may call periodically. */
  onHealthCheck?(): HealthStatus;

  /**
   * Module must expose its persisted config descriptor so the loader can
   * wire PersistedStore. Read once at init.
   */
  getConfigSchema(): ConfigSchemaDescriptor<unknown>;
}

// =============================================================================
// 4. ModuleContext
// =============================================================================

/**
 * The ONE thing a module gets to touch the shell with. Constructed fresh per
 * module instance, sandboxed by slug. Stored on the module class and used for
 * the lifetime of the instance.
 *
 * Sandboxing rules (enforced by the loader, not by these types):
 *  - persisted / secrets are namespaced by slug
 *  - log prefixes every line with [slug]
 *  - events publish tags origin slug; subscribe is open
 *  - output / input are shared but refcount+ownership tracked per slug
 */
export interface ModuleContext {
  // identity
  readonly slug: string;
  readonly shellVersion: Semver;
  readonly tier: ModuleTier;

  // shared services
  readonly output: OutputDispatcher;
  readonly input: InputRegistrar;
  readonly sync: SyncBroker;
  readonly assets: AssetServer;
  readonly mdns: mDNSService;
  readonly pairing: PairingStore;
  readonly secrets: SecretStore;
  readonly health: HealthBus;
  readonly persisted: PersistedStore;
  readonly log: Logger;
  readonly events: EventBus;
  readonly ui: ModuleUIRegistrar;

  /** Current state of THIS module (introspection). */
  state(): ModuleState;

  /** Fires on disable / shutdown. Modules SHOULD listen and abort async work. */
  readonly abortSignal: AbortSignal;
}

// =============================================================================
// 5. Service interfaces
// =============================================================================

// ---- OutputDispatcher ------------------------------------------------------

export interface TransportDestination {
  kind: TransportKind;
  /** Host/port for network; device id for MIDI; universe for DMX. */
  address: string;
  /** Optional sub-channel for multi-port hardware. */
  port?: number | string;
}

export interface TransportMessage {
  transport: TransportKind;
  destination: TransportDestination;
  /** Transport-specific payload. e.g. OSC: { address, args }; MIDI: { msg } */
  payload: Record<string, unknown>;
  /** Optional priority hint. Loader does not currently honor; reserved. */
  priority?: 'normal' | 'high';
}

export interface DispatchResult {
  ok: boolean;
  bytes?: number;
  error?: string;
  /** Wall-clock latency at the dispatcher, ms. */
  latency_ms?: number;
}

export interface ClaimToken {
  readonly id: string;
  readonly slug: string;
  readonly destination: TransportDestination;
}

export type ClaimResult =
  | { ok: true; token: ClaimToken }
  | { ok: false; reason: 'conflict'; owner: string }
  | { ok: false; reason: 'invalid' | 'os_error'; detail: string };

export interface PoolStatus {
  active_destinations: Array<{
    destination: TransportDestination;
    refcount: number;
    owners: string[];   // slugs holding claims
  }>;
}

export interface OutputDispatcher {
  /** Send a message. May lazy-open a connection. */
  send(msg: TransportMessage): Promise<DispatchResult>;

  /** Refcount a destination. Required for exclusive transports (MIDI in/out). */
  claim(destination: TransportDestination): Promise<ClaimResult>;

  /** Drop one claim. At refcount 0 the underlying connection closes. */
  release(token: ClaimToken): void;

  /** Inspect pool. Used by UI / health checks. */
  poolStatus(): PoolStatus;
}

// ---- InputRegistrar --------------------------------------------------------

export interface InputSpec {
  kind: Extract<TransportKind, 'osc-in' | 'midi-in' | 'webhook-in'>;
  /** Port for OSC/webhook; device id for MIDI. */
  bind: string;
  /** Optional address filter (OSC) or channel filter (MIDI). */
  filter?: string;
}

export interface InputEvent {
  kind: TransportKind;
  receivedAt: number;     // epoch ms
  /** Transport-specific payload. */
  payload: Record<string, unknown>;
}

export type InputHandler = (e: InputEvent) => void;

export interface Subscription {
  /** Stable id for diagnostics. */
  readonly id: string;
  unsubscribe(): void;
}

export interface InputRegistrar {
  listen(spec: InputSpec, handler: InputHandler): Promise<Subscription>;
  unlisten(sub: Subscription): void;
}

// ---- SyncBroker (embedded Yjs y-websocket) --------------------------------

/** Opaque handle to a Yjs document tracked by the broker. */
export interface YDocHandle {
  readonly name: string;
  /** Marker so callers don't construct one by hand. */
  readonly __ydoc_handle: true;
}

export interface AwarenessUpdate {
  clientID: number;
  state: Record<string, unknown>;
  origin: 'local' | 'remote';
}

export type AwarenessHandler = (u: AwarenessUpdate) => void;

export interface SyncBroker {
  openDocument(name: string): YDocHandle;
  closeDocument(handle: YDocHandle): void;
  subscribeAwareness(name: string, handler: AwarenessHandler): Subscription;
}

// ---- AssetServer (static HTTP for PWA + show media) -----------------------

export interface AssetMount {
  /** URL path prefix, e.g. '/cuelist-core/assets'. Must start with `/<slug>/`. */
  urlPrefix: string;
  /** Absolute filesystem path served. */
  fsPath: string;
  /** Optional ETag policy. Default: filesystem mtime. */
  etag?: 'mtime' | 'content-hash' | 'none';
}

export interface AssetMountHandle {
  readonly id: string;
  unmount(): void;
}

export interface AssetServer {
  mount(spec: AssetMount): AssetMountHandle;
  baseUrl(): string;   // e.g. 'http://showx.local:5300'
}

// ---- mDNSService -----------------------------------------------------------

export interface mDNSAdvertisement {
  serviceType: string;    // e.g. '_showx._tcp.local'
  port: number;
  txt?: Record<string, string>;
}

export interface mDNSHandle {
  readonly id: string;
  unpublish(): void;
}

export interface mDNSService {
  advertise(ad: mDNSAdvertisement): Promise<mDNSHandle>;
  discover(serviceType: string, handler: (peer: mDNSPeer) => void): Subscription;
}

export interface mDNSPeer {
  host: string;
  port: number;
  txt: Record<string, string>;
  source: 'mdns';
}

// ---- PairingStore ----------------------------------------------------------

export interface PairedDevice {
  device_id: string;
  display_name: string;
  paired_at: number;          // epoch ms
  owned_departments: string[];
  tier: ModuleTier;
  last_seen_at?: number;
}

export interface PairingStore {
  list(): Promise<PairedDevice[]>;
  get(device_id: string): Promise<PairedDevice | undefined>;
  /** Returns a stable token; full pairing flow lives in pairing_auth.md. */
  issueToken(deviceMeta: Omit<PairedDevice, 'paired_at' | 'last_seen_at'>): Promise<string>;
  revoke(device_id: string): Promise<void>;
  touch(device_id: string): Promise<void>;   // update last_seen_at
}

// ---- SecretStore (OS keychain backed) -------------------------------------

export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Lists KEYS, not values. */
  list(): Promise<string[]>;
}

// ---- HealthBus -------------------------------------------------------------

export interface HealthSnapshot {
  slug: string;
  status: HealthStatus;
  detail?: string;
  updatedAt: number;   // epoch ms
}

export type HealthHandler = (snapshot: HealthSnapshot) => void;

export interface HealthBus {
  /** Report THIS module's health. Loader namespaces by slug. */
  report(status: HealthStatus, detail?: string): void;
  /** Observe ANY module's health by slug. */
  observe(slug: string, handler: HealthHandler): Subscription;
  /** Current shell-wide reduced health (see spec §10.2). */
  shellStatus(): HealthSnapshot;
}

// ---- PersistedStore --------------------------------------------------------

export interface PersistedStore {
  /** Load + migrate + validate. Returns defaults on corrupt or first run. */
  load<T>(schema: ConfigSchemaDescriptor<T>): Promise<T>;
  save<T>(value: T): Promise<void>;
  /** Live updates from UI edits via IPC. */
  onChange<T>(handler: (next: T) => void): Subscription;
}

// ---- Logger ----------------------------------------------------------------

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  trace(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  /** Child logger with extra static context. */
  child(extra: Record<string, unknown>): Logger;
}

// ---- EventBus --------------------------------------------------------------

/**
 * Base shape every typed event must satisfy. Concrete events declared in
 * `src/types/events.ts` as a discriminated union. Forge writes that file
 * when ratifying inter-module event shapes (cue-catalog-updated, show-locked,
 * etc.). Keep events small + serializable.
 */
export interface ShowxEvent {
  type: string;
  /** Origin slug stamped by the bus on publish (not by sender). */
  origin?: string;
  /** Wall-clock at publish. */
  ts?: number;
}

export interface EventBus {
  publish<T extends ShowxEvent>(event: T): void;
  subscribe<T extends ShowxEvent>(
    type: T['type'],
    handler: (e: T) => void,
  ): Subscription;
}

// ---- ModuleUIRegistrar (main-process side hook) ---------------------------

/**
 * Module registers UI hooks at init time. Renderer-side wiring is done by
 * the shell's IPC layer based on the manifest's uiPanel/statusBadge/menuItem.
 * This registrar is for runtime-dynamic UI changes (rare).
 */
export interface ModuleUIRegistrar {
  /** Push a transient toast/notification. Throttled by the shell. */
  notify(level: 'info' | 'warn' | 'error', message: string): void;
}

// =============================================================================
// 6. Registry-level types (used by main-process loader; not by modules)
// =============================================================================

export interface ModuleEntry {
  manifest: ModuleManifest;
  state: ModuleState;
  failure_count: number;
  last_failure_at?: number;
  last_error?: string;
  /** Live instance once started. Undefined when not running. */
  instance?: Module;
}

export type RegistryEvent =
  | { type: 'discovered'; slug: string }
  | { type: 'state_changed'; slug: string; from: ModuleState; to: ModuleState }
  | { type: 'health_changed'; slug: string; status: HealthStatus }
  | { type: 'unloadable'; slug: string; reason: string };

export interface ModuleRegistry {
  list(): ModuleEntry[];
  get(slug: string): ModuleEntry | undefined;
  enable(slug: string): Promise<void>;
  disable(slug: string): Promise<void>;
  subscribe(handler: (event: RegistryEvent) => void): Subscription;
}

// =============================================================================
// 7. Reserved (POST-MVP placeholders, do not implement)
// =============================================================================

/**
 * Future telemetry hook. Not part of MVP. Modules should NOT depend on this
 * existing on ModuleContext until ratified by a separate spec.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface TelemetryHook {
  emit(eventName: string, props?: Record<string, unknown>): void;
}

/**
 * Future hot-upgrade hint. Not implemented in MVP. The class-instance-only
 * design constraint (no file-scoped state) keeps this path open.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface HotUpgradeHint {
  /** Returns true if module instance can be replaced without restart. */
  canHotUpgrade(): boolean;
}
