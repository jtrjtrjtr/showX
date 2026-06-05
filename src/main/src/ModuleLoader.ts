import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Module } from 'showx-shared';
import { ModuleManifestSchema, type LoadedModule } from './moduleLoader/types.js';
import { discoverModules } from './moduleLoader/discovery.js';
import { buildContext, type SharedServices } from './moduleLoader/contextFactory.js';
import { LifecycleOrchestrator } from './moduleLoader/lifecycle.js';

export type { SharedServices };
export type { LoadedModule };

export interface ModuleLoaderOpts {
  modulesRoot: string;
  shared: SharedServices;
  installedTier: 'free' | 'pro';
  userConfig: { disabledSlugs: string[] };
}

export class ModuleLoader {
  private loaded: LoadedModule[] = [];
  private orchestrator: LifecycleOrchestrator | null = null;

  constructor(private readonly opts: ModuleLoaderOpts) {}

  async discoverAndPrepare(): Promise<void> {
    const disc = await discoverModules(this.opts.modulesRoot, this.opts.shared.logger);

    for (const entry of disc.found) {
      let manifestRaw: string;
      try {
        manifestRaw = await fs.readFile(entry.manifestPath, 'utf8');
      } catch (err) {
        this.opts.shared.health.report(
          `module.${entry.slug}`,
          'error',
          `manifest_read_error: ${String(err)}`,
        );
        continue;
      }

      let manifestJson: unknown;
      try {
        manifestJson = JSON.parse(manifestRaw) as unknown;
      } catch {
        this.opts.shared.health.report(`module.${entry.slug}`, 'error', 'manifest_parse_error');
        continue;
      }

      const parsed = ModuleManifestSchema.safeParse(manifestJson);
      if (!parsed.success) {
        this.opts.shared.health.report(
          `module.${entry.slug}`,
          'error',
          `manifest_invalid: ${parsed.error.message}`,
        );
        this.opts.shared.logger.warn('module.manifest.invalid', {
          slug: entry.slug,
          error: parsed.error.message,
        });
        continue;
      }

      const manifest = parsed.data;

      if (manifest.tier === 'pro' && this.opts.installedTier === 'free') {
        this.opts.shared.logger.info('module.skipped.tier', { slug: manifest.slug });
        continue;
      }

      if (this.opts.userConfig.disabledSlugs.includes(manifest.slug)) {
        this.opts.shared.logger.info('module.skipped.user_disabled', { slug: manifest.slug });
        continue;
      }

      let mod: Module;
      try {
        mod = await this.dynamicImport(entry.entryPath);
      } catch (err) {
        this.opts.shared.health.report(
          `module.${entry.slug}`,
          'error',
          `import_failed: ${String(err)}`,
        );
        this.opts.shared.logger.error('module.import.failed', { slug: entry.slug, error: String(err) });
        continue;
      }

      const abortController = new AbortController();
      const loadedEntry: LoadedModule = {
        slug: manifest.slug,
        manifest,
        module: mod,
        context: undefined as unknown as ReturnType<typeof buildContext>, // set below
        abortController,
        state: 'init_pending',
      };
      loadedEntry.context = buildContext(
        manifest.slug,
        manifest,
        this.opts.shared,
        () => loadedEntry.state,
        abortController,
      );
      this.loaded.push(loadedEntry);
    }

    this.orchestrator = new LifecycleOrchestrator(
      this.loaded,
      this.opts.shared.logger,
      this.opts.shared.health,
    );
  }

  async initAll(): Promise<void> {
    await (this.orchestrator?.initAll() ?? Promise.resolve());
  }

  async startAll(): Promise<void> {
    await (this.orchestrator?.startAll() ?? Promise.resolve());
  }

  async stopAll(): Promise<void> {
    await (this.orchestrator?.stopAll() ?? Promise.resolve());
  }

  async teardownAll(): Promise<void> {
    await (this.orchestrator?.teardownAll() ?? Promise.resolve());
  }

  listLoaded(): LoadedModule[] {
    return [...this.loaded];
  }

  private async dynamicImport(entryPath: string): Promise<Module> {
    // Use file URL for reliable ESM resolution in both dev (.ts via tsx/vitest) and
    // production (.js compiled). Vitest's module system intercepts file:// imports.
    const importUrl = pathToFileURL(entryPath).href;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import(/* @vite-ignore */ importUrl);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!mod.default || typeof mod.default.init !== 'function') {
      throw new Error(
        `module at ${entryPath} has no valid default export (missing default or init method)`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return mod.default as Module;
  }
}
