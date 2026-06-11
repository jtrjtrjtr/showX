import { shell, ipcMain } from 'electron';
import type { IpcMainBridge } from './index.js';

export function registerShellOpenExternal(ipc: IpcMainBridge = ipcMain): void {
  ipc.handle('shell.openExternal', async (_e: unknown, url: unknown) => {
    if (typeof url !== 'string') throw new Error('url must be a string');
    await shell.openExternal(url);
    return { ok: true };
  });
}
