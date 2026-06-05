import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ShellVersionInfo {
  version: string;
  build: string;
  electron: string;
  node: string;
  startedAt: number;
}

let cached: ShellVersionInfo | null = null;

export function shellVersion(): ShellVersionInfo {
  if (cached) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  let pkg: { version?: string } = { version: '0.0.0' };
  try {
    pkg = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf8')) as { version?: string };
  } catch { /* fallback */ }
  cached = {
    version: pkg.version ?? '0.0.0',
    build: process.env['SHOWX_BUILD'] ?? 'dev',
    electron: (process.versions as Record<string, string | undefined>)['electron'] ?? 'none',
    node: process.versions.node,
    startedAt: Date.now(),
  };
  return cached;
}

export function _resetVersionCache(): void {
  cached = null;
}
