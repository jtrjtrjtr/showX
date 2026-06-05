import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from './channels.js';
import type { ModuleLoader } from '../ModuleLoader.js';
import type { HealthBus } from '../shared/HealthBus.js';
import type { PairingStore } from '../shared/PairingStore.js';
import type { PinManager } from '../shared/pairing/pinManager.js';
import type { Logger } from '../shared/Logger.js';
import type { ShellConfigStore } from '../Shell.js';

export type { ShellConfigStore } from '../Shell.js';

export interface IpcDeps {
  modules: ModuleLoader;
  health: HealthBus;
  pairing: PairingStore;
  pins: PinManager;
  shellConfig: ShellConfigStore;
  logger: Logger;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  ipcMain.handle(IPC.MODULES_LIST, async () =>
    deps.modules.listLoaded().map((m) => ({
      slug: m.slug,
      name: m.manifest.name,
      version: m.manifest.version,
      tier: m.manifest.tier,
      state: m.state,
    })),
  );

  ipcMain.handle(IPC.MODULES_SET_DISABLED, async (_e, slug: string, disabled: boolean) => {
    const current = deps.shellConfig.getDisabledSlugs();
    const set = new Set<string>(current);
    if (disabled) set.add(slug);
    else set.delete(slug);
    await deps.shellConfig.setDisabledSlugs([...set]);
    return { ok: true, requiresRestart: true };
  });

  ipcMain.handle(IPC.HEALTH_SNAPSHOT, async () => deps.health.snapshot());

  deps.health.observeAggregate(() => {
    const snap = deps.health.snapshot();
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(IPC.HEALTH_CHANGE, snap));
  });

  ipcMain.handle(IPC.PAIRING_INITIATE, async () => {
    const rec = deps.pins.generate();
    return { pin: rec.pin, expires_at: rec.expires_at };
  });

  ipcMain.handle(IPC.PAIRING_LIST_DEVICES, async () => deps.pairing.listDevices());

  ipcMain.handle(IPC.PAIRING_REVOKE_DEVICE, async (_e, id: string) => {
    await deps.pairing.revokeDevice(id);
    return { ok: true };
  });

  ipcMain.handle(IPC.CONFIG_GET, async (_e, key: string) => deps.shellConfig.get(key));

  ipcMain.handle(IPC.CONFIG_SET, async (_e, key: string, value: unknown) => {
    await deps.shellConfig.set(key, value);
    return { ok: true };
  });
}
