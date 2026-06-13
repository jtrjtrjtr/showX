import { ipcMain, BrowserWindow } from 'electron';
import type { GoExecutor } from '../runtime/GoExecutor.js';
import type { IpcMainBridge } from './index.js';

export function registerDispatchLogBridge(
  executor: GoExecutor,
  ipc: IpcMainBridge = ipcMain,
): () => void {
  ipc.handle('dispatchLog:list', async () => executor.getLog());

  const unsubLog = executor.onAppend((record) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('dispatchLog:append', record);
    });
  });

  const unsubReply = executor.onReplyStatus((update) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('cuelist-core/device-status', {
        deviceId: update.deviceId,
        status: update.status,
        updatedAt: update.updatedAt,
      });
    });
  });

  return () => { unsubLog(); unsubReply(); };
}
