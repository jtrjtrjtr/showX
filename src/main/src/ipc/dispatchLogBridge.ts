import { ipcMain, BrowserWindow } from 'electron';
import type { GoExecutor } from '../runtime/GoExecutor.js';
import type { IpcMainBridge } from './index.js';

export function registerDispatchLogBridge(
  executor: GoExecutor,
  ipc: IpcMainBridge = ipcMain,
): () => void {
  ipc.handle('dispatchLog:list', async () => executor.getLog());

  const unsub = executor.onAppend((record) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('dispatchLog:append', record);
    });
  });

  return unsub;
}
