import type { Module, ModuleContext, ConfigSchemaDescriptor, HealthStatus } from 'showx-shared';
import { configSchema, type CuelistCoreConfig } from './config/schema.js';

export class CuelistCore implements Module {
  private ctx?: ModuleContext;
  private _config?: CuelistCoreConfig;
  private state: 'idle' | 'inited' | 'started' | 'stopped' = 'idle';

  async init(context: ModuleContext): Promise<void> {
    this.ctx = context;
    this._config = await context.persisted.load(configSchema);
    context.log.info(`cuelist-core init complete (config: ${this._config ? 'loaded' : 'default'})`);
    this.state = 'inited';
  }

  async start(): Promise<void> {
    if (!this.ctx) throw new Error('init() must precede start()');
    // Future: open Y.Doc broker, register IPC handlers, mount asset routes (B003-002+).
    this.ctx.health.report(this.ctx.slug, 'healthy', 'cuelist-core started');
    this.ctx.log.info('cuelist-core started');
    this.state = 'started';
  }

  async stop(): Promise<void> {
    // Future: close Y.Doc, flush autosave, drain dispatch queue.
    this.ctx?.log.info('cuelist-core stopping');
    this.state = 'stopped';
  }

  async teardown(): Promise<void> {
    this.ctx = undefined;
    this._config = undefined;
  }

  getConfigSchema(): ConfigSchemaDescriptor<CuelistCoreConfig> {
    return configSchema;
  }

  onHealthCheck(): HealthStatus {
    return this.state === 'started' ? 'healthy' : 'unknown';
  }
}
