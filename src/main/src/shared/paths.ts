import { createRequire } from 'node:module';
import { join } from 'node:path';

export interface PathLayout {
  rootDir: string;
  modulesDir: string;
  secretsDir: string;
  localSecretFile: string;
  logsDir: string;
  assetsDir: string;
}

export function resolvePaths(opts: { override?: string } = {}): PathLayout {
  const base = opts.override ?? defaultUserDataDir();
  const rootDir = join(base, 'showx');
  return {
    rootDir,
    modulesDir: join(rootDir, 'modules'),
    secretsDir: join(rootDir, 'secrets'),
    localSecretFile: join(rootDir, 'local_secret.bin'),
    logsDir: join(rootDir, 'logs'),
    assetsDir: join(rootDir, 'assets'),
  };
}

function defaultUserDataDir(): string {
  try {
    const _require = createRequire(import.meta.url);
    const electron = _require('electron') as { app?: { getPath?: (name: string) => string } };
    if (electron?.app?.getPath) return electron.app.getPath('userData');
  } catch { /* not in electron */ }
  return process.env['SHOWX_USER_DATA'] ?? join(process.cwd(), '.showx-userdata');
}

export function moduleConfigPath(layout: PathLayout, slug: string): string {
  return join(layout.modulesDir, slug, 'config.json');
}

export function secretFallbackPath(layout: PathLayout, slug: string): string {
  return join(layout.secretsDir, `${slug}.enc`);
}
