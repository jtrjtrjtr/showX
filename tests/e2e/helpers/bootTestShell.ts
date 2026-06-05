import { _electron as electron } from 'playwright';
import path from 'node:path';
import { mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import type { ElectronApplication, Page } from 'playwright';

export interface BootOpts {
  fixturePath?: string;
  port?: number;
  pairingPin?: string;
}

export interface BootResult {
  shell: ElectronApplication;
  shellWindow: Page;
  pkgPath: string;
  port: number;
  baseUrl: string;
  cleanup: () => Promise<void>;
}

async function copyShowFixture(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
}

export async function bootTestShell(opts: BootOpts = {}): Promise<BootResult> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'showx-e2e-'));
  const pkgPath = path.join(tmpDir, 'test-show.showx');

  if (opts.fixturePath) {
    const abs = path.resolve(opts.fixturePath);
    await copyShowFixture(abs, pkgPath);
  }

  const port = opts.port ?? (5300 + Math.floor(Math.random() * 1000));

  const mainEntry = path.resolve(
    path.join(__dirname, '../../../dist/main/index.js'),
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SHOWX_PORT: String(port),
    SHOWX_TEST_MODE: '1',
    SHOWX_PAIRING_TEST_PIN: opts.pairingPin ?? '000000',
    SHOWX_AUTOLOAD_SHOW: pkgPath,
    ELECTRON_ENABLE_LOGGING: '0',
  };

  const shell = await electron.launch({
    args: [mainEntry],
    env,
  });

  const shellWindow = await shell.firstWindow();
  await shellWindow.waitForLoadState('domcontentloaded');

  const baseUrl = `http://localhost:${port}`;

  return {
    shell,
    shellWindow,
    pkgPath,
    port,
    baseUrl,
    cleanup: async () => {
      await shell.close().catch(() => {});
      await rm(tmpDir, { recursive: true, force: true });
    },
  };
}
