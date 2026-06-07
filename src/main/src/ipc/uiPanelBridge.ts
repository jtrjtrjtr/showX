import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ShellConfigStore } from '../Shell.js';
import type { IpcMainBridge } from './index.js';

const RECENT_KEY = 'cuelist-core:recent-shows';

const ShowMetaZ = z.object({
  meta: z
    .object({
      title: z.string().optional(),
      mode: z.enum(['rehearsal', 'show']).optional(),
    })
    .optional(),
});

interface ActiveShow {
  pkgPath: string;
  title: string;
  mode: 'rehearsal' | 'show';
}

let _activeShow: ActiveShow | null = null;

function broadcastToAll(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args);
  });
}

export async function openShow(showPath: string): Promise<void> {
  let title = path.basename(showPath, '.showx') || 'Untitled';
  let mode: 'rehearsal' | 'show' = 'rehearsal';

  try {
    const raw = await fs.readFile(path.join(showPath, 'show.json'), 'utf-8');
    const parsed = ShowMetaZ.safeParse(JSON.parse(raw));
    if (parsed.success) {
      title = parsed.data.meta?.title ?? title;
      mode = parsed.data.meta?.mode ?? mode;
    }
  } catch {
    // Use fallback title from path
  }

  _activeShow = { pkgPath: showPath, title, mode };

  broadcastToAll('cuelist-core/show-state', {
    open: true,
    pkgPath: showPath,
    title,
    mode,
    isSm: true,
  });
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
  ipc: IpcMainBridge = ipcMain,
): void {
  ipc.handle('cuelist-core/shell.getState', async () => {
    const recentShows = getRecents(config);
    if (!_activeShow) {
      return { kind: 'no-show', recentShows };
    }
    return {
      kind: 'show-loaded',
      showName: _activeShow.title,
      recentShows,
    };
  });

  ipc.handle('cuelist-core/get-state', async () => {
    if (!_activeShow) return { open: false };
    return {
      open: true,
      pkgPath: _activeShow.pkgPath,
      title: _activeShow.title,
      mode: _activeShow.mode,
      isSm: true,
    };
  });

  ipc.handle('cuelist-core/open-show', async (_e, showPath: unknown) => {
    if (typeof showPath !== 'string') throw new Error('showPath must be a string');
    await openShow(showPath);
    return { ok: true };
  });

  ipc.handle('cuelist-core:open-recent', async (_e, showPath: unknown) => {
    if (typeof showPath !== 'string') throw new Error('showPath must be a string');
    await openShow(showPath);
    return { ok: true };
  });

  ipc.handle('cuelist-core/transition-mode', async () => ({ ok: true }));
  ipc.handle('cuelist-core/kick-station', async () => ({ ok: true }));
}
