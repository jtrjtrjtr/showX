import { ipcMain, BrowserWindow } from 'electron';
import type { ShellConfigStore } from '../Shell.js';
import type { IpcMainBridge } from './index.js';
import type { ActiveShowDoc } from '../runtime/ActiveShowDoc.js';

const RECENT_KEY = 'cuelist-core:recent-shows';

function broadcastToAll(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args);
  });
}

export async function openShow(showPath: string, activeShow: ActiveShowDoc): Promise<void> {
  await activeShow.open(showPath);
  // cuelist-core/show-state broadcast is owned by registerShowStateBridge (observe-driven).
  // Only signal shell to refresh Recent Shows list here.
  broadcastToAll('cuelist-core:show-changed');
}

function getRecents(
  config: ShellConfigStore,
): Array<{ path: string; last_opened_at: string; cue_count?: number }> {
  const raw = config.get(RECENT_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is { path: string; last_opened_at: string; cue_count?: number } =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as Record<string, unknown>).path === 'string' &&
      typeof (r as Record<string, unknown>).last_opened_at === 'string',
  );
}

export function registerUiPanelBridge(
  config: ShellConfigStore,
  activeShow: ActiveShowDoc,
  ipc: IpcMainBridge = ipcMain,
): void {
  ipc.handle('cuelist-core/shell.getState', async () => {
    const recentShows = getRecents(config);
    const meta = activeShow.getActiveShow();
    if (!meta) {
      return { kind: 'no-show', recentShows };
    }
    return {
      kind: 'show-loaded',
      showName: meta.title,
      recentShows,
    };
  });

  ipc.handle('cuelist-core/open-show', async (_e, showPath: unknown) => {
    if (typeof showPath !== 'string') throw new Error('showPath must be a string');
    await openShow(showPath, activeShow);
    return { ok: true };
  });

  ipc.handle('cuelist-core:open-recent', async (_e, showPath: unknown) => {
    if (typeof showPath !== 'string') throw new Error('showPath must be a string');
    await openShow(showPath, activeShow);
    return { ok: true };
  });

  ipc.handle('cuelist-core/transition-mode', async () => ({ ok: true }));
  ipc.handle('cuelist-core/kick-station', async () => ({ ok: true }));
}
