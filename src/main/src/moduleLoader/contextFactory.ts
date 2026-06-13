import type {
  Logger,
  EventBus,
  HealthBus,
  OutputDispatcher,
  InputRegistrar,
  SyncBroker,
  AssetServer,
  MdnsService,
  PairingStore,
  ModuleContext,
  ModuleState,
  Subscription,
  MenuItemSpec,
  ReactComponentModule,
  MasterClock,
} from 'showx-shared';
import type { PathLayout } from '../shared/paths.js';
import { PersistedStore } from '../shared/PersistedStore.js';
import { SecretStore } from '../shared/SecretStore.js';
import type { ModuleManifest, ModuleLifecycleState } from './types.js';

export interface SharedServices {
  logger: Logger;
  events: EventBus;
  health: HealthBus;
  // PathLayout is needed to create per-module PersistedStore and SecretStore instances.
  // Each module gets its own namespaced store; no global "shell" persisted store is exposed.
  layout: PathLayout;
  shellVersion: string;
  output: OutputDispatcher;
  input: InputRegistrar;
  sync: SyncBroker;
  assets: AssetServer;
  mdns: MdnsService;
  pairing: PairingStore;
  clock: MasterClock;
}

function mapToModuleState(s: ModuleLifecycleState): ModuleState {
  switch (s) {
    case 'discovered': return 'discovered';
    case 'manifest_invalid': return 'unloadable';
    case 'init_pending': return 'validated';
    case 'init_running': return 'init';
    case 'init_failed': return 'failed';
    case 'inited': return 'validated';
    case 'start_running': return 'init';
    case 'start_failed': return 'failed';
    case 'started': return 'started';
    case 'stop_running': return 'stopping';
    case 'stopped': return 'stopped';
    case 'teardown_running': return 'stopping';
    case 'torn_down': return 'torn_down';
    case 'quarantined': return 'failed';
  }
}

function makeNullUIRegistrar() {
  return {
    registerStatusBadge(_: ReactComponentModule): Subscription {
      return { id: 'noop-badge', unsubscribe: () => {} };
    },
    registerMenuItem(_: MenuItemSpec): Subscription {
      return { id: 'noop-menu', unsubscribe: () => {} };
    },
  };
}

export function buildContext(
  slug: string,
  manifest: ModuleManifest,
  shared: SharedServices,
  getState: () => ModuleLifecycleState,
  abortController: AbortController,
): ModuleContext {
  // Each module gets its own PersistedStore and SecretStore instances keyed by slug.
  // TODO(B001-011): If Shell needs to read module-enabled flags at bootstrap, provide a
  // persistedFactory callback in SharedServices rather than creating stores inline here.
  const persisted = new PersistedStore(slug, shared.layout, shared.logger.child(slug));
  const secrets = new SecretStore(slug, shared.layout, { log: shared.logger.child(slug) });

  return {
    slug,
    shellVersion: shared.shellVersion,
    tier: manifest.tier,
    output: shared.output,
    input: shared.input,
    sync: shared.sync,
    assets: shared.assets,
    mdns: shared.mdns,
    pairing: shared.pairing,
    secrets,
    health: shared.health,
    persisted,
    log: shared.logger.child(slug),
    events: shared.events,
    ui: makeNullUIRegistrar(),
    clock: shared.clock,
    state: () => mapToModuleState(getState()),
    abortSignal: abortController.signal,
  };
}
