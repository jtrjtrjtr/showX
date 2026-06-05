---
id: "B001-002"
title: "Shared types: Module, ModuleContext, services, payload, events"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
depends_on: ["B001-001"]
target_files:
  - "src/shared/src/index.ts"
  - "src/shared/src/types/module.ts"
  - "src/shared/src/types/context.ts"
  - "src/shared/src/types/services.ts"
  - "src/shared/src/types/cue.ts"
  - "src/shared/src/types/show.ts"
  - "src/shared/src/types/payload.ts"
  - "src/shared/src/types/events.ts"
  - "src/shared/src/types/transport.ts"
  - "src/shared/package.json"
  - "tests/unit/types/types.test.ts"
acceptance_criteria:
  - "src/shared/src/index.ts re-exports every type from types/* sub-module under a flat namespace"
  - "`Module`, `ModuleManifest`, `ModuleContext`, `ModuleRequirements`, `ModuleState` declared and align with docs/specs/module_loader.md §2 + §4"
  - "Transport literal union `Transport = 'osc' | 'midi' | 'msc' | 'dmx-artnet' | 'dmx-sacn' | 'webhook'` exported"
  - "Discriminated `TransportMessage` union: one variant per Transport, narrowing via `transport` field"
  - "`Payload` discriminated union covers Cuelist payload kinds from docs/specs/data_model.md (osc, midi, msc, dmx, webhook) with shape `{ kind, ... }`"
  - "`ShowxEvent` discriminated union exported for EventBus: at least 'cue-fired', 'cue-catalog-updated', 'module-state-changed', 'health-changed', 'pairing-changed' variants"
  - "Service interfaces declared: Logger, EventBus, HealthBus, PersistedStore, SecretStore, AssetServer, MdnsService, SyncBroker, OutputDispatcher, InputRegistrar, PairingStore (signature shells only, no implementation)"
  - "tests/unit/types/types.test.ts uses `expectTypeOf` from vitest to assert discriminated-union narrowing + service interface shape"
  - "`pnpm --filter showx-shared typecheck` passes"
  - "`pnpm vitest run tests/unit/types` passes (type-only suite, zero runtime assertions but ≥10 expectTypeOf calls)"
---

## Context

ShowX is a modular Electron app. The module loader (B001-010), every shared service (B001-003 through B001-009), and every future module need a stable typed contract. This task creates the `showx-shared` package — pure TypeScript types, zero runtime code (except optionally `Symbol`/`enum` markers). It is the **first compile-time gate** for the rest of the bundle: if these types are wrong, every other task ships bugs.

Forge mirrors the contracts already locked in `docs/specs/module_loader.md` (Module + ModuleContext), `docs/specs/data_model.md` (Cue, Show, Payload), `docs/specs/protocol_dictionary.md` (Transport, TransportMessage), and `docs/specs/pairing_auth.md` (PairingStore + SecretStore shapes). Treat those specs as source of truth — if a field is ambiguous between this spec and a docs/specs/*.md spec, the docs/specs/*.md spec wins.

## Implementation notes

### Package shape

`src/shared/package.json` already exists from B001-001. Verify these fields:

```json
{
  "name": "showx-shared",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./types/*": { "types": "./dist/types/*.d.ts", "default": "./dist/types/*.js" }
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "zod": "^3.22.0"
  }
}
```

Add `zod` as a dependency (peer of consumers) — used to declare `ConfigSchemaDescriptor<T>` shape. Don't define schemas here; just import the `ZodSchema` type.

### `src/shared/src/types/module.ts`

Mirrors `docs/specs/module_loader.md` §2 + §3 exactly:

```ts
import type { ZodSchema } from 'zod';

export type ModuleTier = 'free' | 'pro';

export type ModuleState =
  | 'discovered'
  | 'validated'
  | 'gated'
  | 'init'
  | 'started'
  | 'stopping'
  | 'stopped'
  | 'torn_down'
  | 'failed'
  | 'unloadable';

export interface TransportRequirement {
  kind:
    | 'osc-in' | 'osc-out'
    | 'midi-in' | 'midi-out'
    | 'msc-out'
    | 'dmx-artnet-out' | 'dmx-sacn-out'
    | 'webhook-in' | 'webhook-out';
  notes?: string;
}

export type OSPermission =
  | 'network.lan'
  | 'fs.readwrite.userdata'
  | 'keychain.read'
  | 'bonjour';

export interface ModuleRequirements {
  transports: TransportRequirement[];
  permissions: OSPermission[];
  depends_on: string[];
  conflicts_with?: string[];
  min_shell_version: string;
}

export interface MenuItemSpec {
  label: string;
  accelerator?: string;
  action: 'open-panel' | 'invoke-rpc';
  rpcName?: string;
}

// React component module from lazy import — kept opaque so showx-shared
// doesn't take a React dependency.
export interface ReactComponentModule {
  default: unknown;
}

export interface ConfigSchemaDescriptor<T> {
  schemaVersion: number;
  zodSchema: ZodSchema<T>;
  defaults: T;
  migrate?: (prevVersion: number, prevValue: unknown) => T;
}

export interface ModuleManifest {
  slug: string;
  name: string;
  version: string;
  description: string;
  tier: ModuleTier;
  requires: ModuleRequirements;
  default_enabled?: boolean;
  persistedConfigSchemaVersion: number;
  entry: new () => Module;
  uiPanel?: () => Promise<ReactComponentModule>;
  statusBadge?: () => Promise<ReactComponentModule>;
  menuItem?: MenuItemSpec;
}

export interface Module {
  init(ctx: ModuleContext): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  teardown(): Promise<void>;
  onConfigChange?(newConfig: unknown): Promise<void>;
  onHealthCheck?(): HealthStatus;
}

// re-exports from context to avoid circular-ish file split
import type { ModuleContext } from './context.js';
import type { HealthStatus } from './services.js';
export type { ModuleContext };
```

### `src/shared/src/types/context.ts`

Mirrors `docs/specs/module_loader.md` §4 — typed handle the loader injects:

```ts
import type {
  Logger, EventBus, HealthBus, PersistedStore, SecretStore,
  AssetServer, MdnsService, SyncBroker, OutputDispatcher,
  InputRegistrar, PairingStore, ModuleUIRegistrar,
} from './services.js';
import type { ModuleState, ModuleTier } from './module.js';

export interface ModuleContext {
  // identity
  slug: string;
  shellVersion: string;
  tier: ModuleTier;

  // shared services
  output: OutputDispatcher;
  input: InputRegistrar;
  sync: SyncBroker;
  assets: AssetServer;
  mdns: MdnsService;
  pairing: PairingStore;
  secrets: SecretStore;
  health: HealthBus;
  persisted: PersistedStore;
  log: Logger;
  events: EventBus;
  ui: ModuleUIRegistrar;

  // lifecycle introspection
  state(): ModuleState;
  abortSignal: AbortSignal;
}
```

### `src/shared/src/types/services.ts`

Interface-only declarations. Each service interface contains the **minimum signature** B001-003..009 must implement. Drive shapes from docs/specs/module_loader.md §4.3.

Required interfaces:

- `Logger` — `debug/info/warn/error(msg: string, meta?: Record<string, unknown>): void`. Plus `child(suffix: string): Logger` for sub-loggers.
- `EventBus` — `publish<T extends ShowxEvent>(event: T): void`, `subscribe<T extends ShowxEvent>(type: T['type'] | T['type'][] | '*', handler: (e: T) => void): Subscription`, `subscribePattern(pattern: string, handler: (e: ShowxEvent) => void): Subscription` (glob support: `'cue:*'`).
- `HealthBus` — `report(slug: string, status: HealthStatus, detail?: string): void`, `observe(slug: string, handler: (h: HealthSnapshot) => void): Subscription`, `aggregate(): HealthStatus`, `snapshot(): HealthSnapshot[]`.
- `PersistedStore` — `load<T>(schema: ConfigSchemaDescriptor<T>): Promise<T>`, `save<T>(value: T): Promise<void>`, `onChange<T>(handler: (next: T) => void): Subscription`. Slug is bound at construction (loader-injected instance is per-module).
- `SecretStore` — `get(key: string): Promise<string | undefined>`, `set(key: string, value: string): Promise<void>`, `delete(key: string): Promise<void>`, `list(): Promise<string[]>`. Slug-scoped.
- `AssetServer` — `port(): number`, `baseUrl(): string`, `registerStaticRoute(slug: string, dir: string): Subscription`, `registerApiRoute(method: 'GET'|'POST', path: string, handler: ApiHandler): Subscription`. Type `ApiHandler = (req: AssetReq) => Promise<AssetResp>`.
- `MdnsService` — `advertise(name: string, port: number, txt: Record<string, string>): Subscription`, `browse(serviceType: string, handler: (peer: MdnsPeer) => void): Subscription`.
- `SyncBroker` — `openDocument(name: string): YDocHandle`, `closeDocument(handle: YDocHandle): void`, `subscribeAwareness(name: string, handler: AwarenessHandler): Subscription`, `publishSideChannel(showId: string, msg: SideChannelMessage): void`, `subscribeSideChannel(showId: string, handler: (msg: SideChannelMessage) => void): Subscription`.
- `OutputDispatcher` — `send(msg: TransportMessage): Promise<DispatchResult>`, `claim(dest: TransportDestination): ClaimToken | ClaimConflict`, `release(token: ClaimToken): void`, `poolStatus(): PoolStatus`.
- `InputRegistrar` — `listen(spec: InputSpec, handler: InputHandler): Subscription`, `unlisten(sub: Subscription): void`.
- `PairingStore` — `validateToken(token: string): Promise<PairingClaims | null>`, `issue(deviceLabel: string, roles: string[], tier: ModuleTier): Promise<PairingToken>`, `revoke(deviceId: string): Promise<void>`, `list(): Promise<PairedDevice[]>`. (Full impl in B001-009; type shell here.)
- `ModuleUIRegistrar` — `registerStatusBadge(_: ReactComponentModule): Subscription`, `registerMenuItem(_: MenuItemSpec): Subscription`. (No-ops in main; renderer wires later.)

Supporting types (all in services.ts unless noted):

```ts
export type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';
export interface HealthSnapshot {
  slug: string;
  status: HealthStatus;
  detail?: string;
  updatedAt: number;
}
export interface Subscription {
  readonly id: string;
  unsubscribe(): void;
}
export interface YDocHandle {
  readonly name: string;
  readonly doc: unknown;            // Y.Doc; opaque here to avoid yjs dep
  destroy(): void;
}
export interface AwarenessHandler {
  (clientId: number, state: Record<string, unknown> | null): void;
}
export interface SideChannelMessage {
  topic: 'go' | 'presence' | 'preview';
  payload: Record<string, unknown>;
  origin?: string;
}
export interface MdnsPeer {
  name: string;
  host: string;
  port: number;
  txt: Record<string, string>;
}
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
```

### `src/shared/src/types/transport.ts`

```ts
export type Transport =
  | 'osc'
  | 'midi'
  | 'msc'
  | 'dmx-artnet'
  | 'dmx-sacn'
  | 'webhook';

export interface TransportDestination {
  transport: Transport;
  host?: string;       // for network transports
  port?: number;
  midiPortName?: string;
  dmxUniverse?: number;
}

export interface OscMessage {
  transport: 'osc';
  host: string;
  port: number;
  address: string;     // '/cue/go'
  args: Array<number | string | boolean | Buffer>;
}

export interface MidiMessage {
  transport: 'midi';
  midiPortName: string;
  bytes: number[];     // raw MIDI bytes
}

export interface MscMessage {
  transport: 'msc';
  midiPortName: string;
  deviceId: number;          // 0x00-0x7F
  commandFormat: number;     // e.g. 0x10 = Lighting
  command: number;           // e.g. 0x01 = GO
  data: number[];
}

export interface DmxArtnetMessage {
  transport: 'dmx-artnet';
  host: string;              // multicast or unicast IP
  net?: number;
  subnet?: number;
  universe: number;
  data: number[];            // 1-512 channel values
}

export interface DmxSacnMessage {
  transport: 'dmx-sacn';
  universe: number;
  priority?: number;         // 0-200, default 100
  data: number[];
}

export interface WebhookMessage {
  transport: 'webhook';
  url: string;
  method: 'POST' | 'PUT' | 'GET';
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
}

export type TransportMessage =
  | OscMessage
  | MidiMessage
  | MscMessage
  | DmxArtnetMessage
  | DmxSacnMessage
  | WebhookMessage;

export interface DispatchResult {
  ok: boolean;
  transport: Transport;
  latencyMs: number;
  error?: string;
}

export interface ClaimToken {
  readonly id: string;
  readonly slug: string;
  readonly destination: TransportDestination;
}

export interface ClaimConflict {
  ok: false;
  reason: 'exclusive_owned';
  ownerSlug: string;
}

export interface PoolStatus {
  oscConnections: Array<{ host: string; port: number; refcount: number }>;
  midiOutputs: Array<{ portName: string; ownerSlug: string }>;
  dmxUniverses: Array<{ universe: number; protocol: 'artnet' | 'sacn'; ownerSlug: string }>;
}

export interface InputSpec {
  kind: 'osc-in' | 'midi-in' | 'webhook-in';
  port?: number;
  midiPortName?: string;
  path?: string;             // webhook
  addressPattern?: string;   // osc
}

export interface InputHandler {
  (event: InboundEvent): void;
}

export type InboundEvent =
  | { kind: 'osc'; host: string; port: number; address: string; args: unknown[]; receivedAt: number }
  | { kind: 'midi'; portName: string; bytes: number[]; receivedAt: number }
  | { kind: 'webhook'; method: string; path: string; headers: Record<string, string>; body: unknown; receivedAt: number };
```

### `src/shared/src/types/payload.ts`

Mirrors `docs/specs/data_model.md` Cue.payload variants. Discriminated union by `kind`:

```ts
import type { ZodSchema } from 'zod';

export interface OscPayload {
  kind: 'osc';
  destination: { host: string; port: number };
  address: string;
  args: Array<number | string | boolean>;
}

export interface MidiPayload {
  kind: 'midi';
  midiPortName: string;
  bytes: number[];
}

export interface MscPayload {
  kind: 'msc';
  midiPortName: string;
  deviceId: number;
  commandFormat: number;
  command: number;
  data: number[];
}

export interface DmxPayload {
  kind: 'dmx';
  protocol: 'artnet' | 'sacn';
  universe: number;
  data: number[];
  priority?: number;
}

export interface WebhookPayload {
  kind: 'webhook';
  url: string;
  method: 'POST' | 'PUT' | 'GET';
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
}

export type Payload = OscPayload | MidiPayload | MscPayload | DmxPayload | WebhookPayload;
```

### `src/shared/src/types/cue.ts` and `src/shared/src/types/show.ts`

Skeletons from `docs/specs/data_model.md`. Forge writes the minimum subset other tasks need (full data model elaborated later in B003-* tasks for Cuelist Core):

```ts
// cue.ts
import type { Payload } from './payload.js';

export interface Cue {
  id: string;                // ulid
  showId: string;
  number: string;            // operator-facing, e.g. '12.5'
  label: string;
  notes?: string;
  payloads: Payload[];
  departments: string[];     // ['LX', 'SOUND', 'VIDEO']
  autoFollow?: { delayMs: number; targetCueId: string };
  createdAt: number;
  updatedAt: number;
}

export interface CueCatalog {
  showId: string;
  cues: Cue[];
  version: number;
}
```

```ts
// show.ts
export type ShowMode = 'rehearsal' | 'show';

export interface Show {
  id: string;
  title: string;
  mode: ShowMode;
  createdAt: number;
  updatedAt: number;
  departments: string[];
}
```

### `src/shared/src/types/events.ts`

Discriminated union for EventBus. Mirrors loader spec §9:

```ts
import type { Cue, CueCatalog } from './cue.js';
import type { HealthStatus, ModuleState } from './services.js';

export interface CueFiredEvent {
  type: 'cue-fired';
  showId: string;
  cueId: string;
  firedAt: number;
  origin: string;            // slug
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
```

Note `ModuleState` is referenced from `module.ts`; either re-export from services or use a local copy and add Forge a TODO to consolidate later. Prefer single source: keep `ModuleState` in module.ts, re-export from services.ts.

### `src/shared/src/index.ts`

```ts
export * from './types/module.js';
export * from './types/context.js';
export * from './types/services.js';
export * from './types/transport.js';
export * from './types/payload.js';
export * from './types/cue.js';
export * from './types/show.js';
export * from './types/events.js';
```

### `tests/unit/types/types.test.ts`

Pure compile-time tests using `expectTypeOf`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  Module, ModuleManifest, ModuleContext, ModuleState,
  Transport, TransportMessage, OscMessage, MidiMessage,
  Payload, OscPayload, ShowxEvent, CueFiredEvent,
  Logger, EventBus, OutputDispatcher,
} from 'showx-shared';

describe('module types', () => {
  it('ModuleManifest requires slug + entry', () => {
    expectTypeOf<ModuleManifest>().toHaveProperty('slug').toBeString();
    expectTypeOf<ModuleManifest>().toHaveProperty('entry');
  });

  it('ModuleState includes all lifecycle phases', () => {
    expectTypeOf<ModuleState>().toEqualTypeOf<
      'discovered' | 'validated' | 'gated' | 'init' | 'started'
      | 'stopping' | 'stopped' | 'torn_down' | 'failed' | 'unloadable'
    >();
  });
});

describe('transport types', () => {
  it('TransportMessage narrows by transport', () => {
    const msg = {} as TransportMessage;
    if (msg.transport === 'osc') expectTypeOf(msg).toEqualTypeOf<OscMessage>();
    if (msg.transport === 'midi') expectTypeOf(msg).toEqualTypeOf<MidiMessage>();
  });

  it('Transport union closed', () => {
    expectTypeOf<Transport>().toEqualTypeOf<
      'osc' | 'midi' | 'msc' | 'dmx-artnet' | 'dmx-sacn' | 'webhook'
    >();
  });
});

describe('payload types', () => {
  it('Payload narrows by kind', () => {
    const p = {} as Payload;
    if (p.kind === 'osc') expectTypeOf(p).toEqualTypeOf<OscPayload>();
  });
});

describe('event bus types', () => {
  it('ShowxEvent narrows by type', () => {
    const e = {} as ShowxEvent;
    if (e.type === 'cue-fired') expectTypeOf(e).toEqualTypeOf<CueFiredEvent>();
  });
});

describe('service interfaces', () => {
  it('Logger has level methods', () => {
    expectTypeOf<Logger>().toHaveProperty('info').toBeFunction();
    expectTypeOf<Logger>().toHaveProperty('error').toBeFunction();
  });

  it('EventBus.publish accepts only ShowxEvent', () => {
    type Pub = EventBus['publish'];
    expectTypeOf<Pub>().parameter(0).toMatchTypeOf<ShowxEvent>();
  });

  it('OutputDispatcher.send returns Promise<DispatchResult>', () => {
    expectTypeOf<OutputDispatcher['send']>().returns.toMatchTypeOf<Promise<{ ok: boolean }>>();
  });
});

describe('ModuleContext', () => {
  it('exposes all required services', () => {
    expectTypeOf<ModuleContext>().toHaveProperty('output');
    expectTypeOf<ModuleContext>().toHaveProperty('input');
    expectTypeOf<ModuleContext>().toHaveProperty('sync');
    expectTypeOf<ModuleContext>().toHaveProperty('persisted');
    expectTypeOf<ModuleContext>().toHaveProperty('secrets');
    expectTypeOf<ModuleContext>().toHaveProperty('log');
    expectTypeOf<ModuleContext>().toHaveProperty('events');
    expectTypeOf<ModuleContext>().toHaveProperty('health');
    expectTypeOf<ModuleContext>().toHaveProperty('abortSignal').toEqualTypeOf<AbortSignal>();
  });
});
```

That's ≥10 expectTypeOf calls; satisfies the acceptance criterion.

### Add zod dependency

In `src/shared/package.json`, add `"zod": "^3.22.0"` to dependencies. Run `pnpm install` from repo root to materialize.

Add `tsconfig.json` `compilerOptions.composite: true` and `declaration: true` so consumer packages can project-reference `showx-shared` and pick up types.

## Test plan

1. `pnpm --filter showx-shared typecheck` — zero errors.
2. `pnpm vitest run tests/unit/types` — type-only suite passes (uses vitest's `expectTypeOf` which lives in `vitest` package — already present from B001-001).
3. Verify `pnpm --filter showx-shared build` produces `dist/index.d.ts` with all exports.
4. Import smoke test: in a throwaway script in `tests/unit/types/smoke.test.ts`, `import type { Module } from 'showx-shared'` resolves.

## Out of scope

- Runtime implementations of any service (B001-003 onwards do that).
- Zod schemas for `ConfigSchemaDescriptor` instances (each module supplies its own; this task only defines the descriptor shape).
- Yjs `Y.Doc` typing — kept opaque (`doc: unknown`) so showx-shared stays Yjs-free. SyncBroker impl (B001-006) imports yjs locally and casts.
- React component runtime — only an opaque `ReactComponentModule` shape. PWA bootstrap (B001-012) takes the actual React dep.
- Cuelist data model beyond minimal `Cue`/`Show`/`CueCatalog` shapes (B003-* will expand).
- Migration logic for ConfigSchemaDescriptor (declared as optional, no impl here).

## Notes for Critic

- Check every interface signature against `docs/specs/module_loader.md` §4 — any drift is a `changes_requested` blocker.
- Check discriminated-union exhaustiveness: in `tests/unit/types/types.test.ts`, every `Transport` literal should appear in at least one `TransportMessage` narrowing test. Same for `Payload['kind']`.
- Ensure `src/shared/src/index.ts` re-exports everything — try `import { Module, OscMessage, ShowxEvent } from 'showx-shared'` mentally; all three must resolve.
- Look for accidental runtime values leaked into shared (enums compile to runtime objects; prefer `type X = 'a' | 'b'` over `enum X`). This file should produce ~zero runtime JS.
- `ModuleState` defined in exactly one file (module.ts) and re-exported elsewhere — not duplicated.
- `Subscription` returned by every `subscribe*`/`listen`/`registerXxx` method (consistency).
