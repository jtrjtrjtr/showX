import type { HealthStatus } from './services.js';
import type { ModuleContext } from './context.js';

// Structural stand-in for zod v3 ZodSchema<T>.
// Consumers import the real zod and their ZodSchema satisfies this structurally.
export interface ZodSchema<T> {
  readonly _type: T;
  parse(data: unknown): T;
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: unknown };
}

// ModuleContext is defined in context.ts; imported here for use in Module.init().
// NOT re-exported — index.ts barrel exports context.ts directly to avoid duplicate-export error.

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

