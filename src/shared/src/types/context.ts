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
import type { MasterClock } from './timecode.js';

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
  clock: MasterClock;

  state(): ModuleState;
  abortSignal: AbortSignal;
}
