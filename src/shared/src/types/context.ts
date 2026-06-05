import type {
  Logger,
  EventBus,
  HealthBus,
  PersistedStore,
  SecretStore,
  AssetServer,
  MdnsService,
  SyncBroker,
  OutputDispatcher,
  InputRegistrar,
  PairingStore,
  ModuleUIRegistrar,
} from './services.js';
import type { ModuleState, ModuleTier } from './module.js';

export interface ModuleContext {
  slug: string;
  shellVersion: string;
  tier: ModuleTier;

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

  state(): ModuleState;
  abortSignal: AbortSignal;
}
