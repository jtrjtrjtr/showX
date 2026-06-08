import { ipcMain, BrowserWindow } from 'electron';
import type { Logger } from 'showx-shared';
import type { ActiveShowDoc } from '../runtime/ActiveShowDoc.js';
import type { IpcMainBridge } from './index.js';
import {
  getCuelists,
  getCues,
} from '../../../modules/cuelist-core/dist/document/cuelist.js';

interface CuelistSummary {
  id: string;
  name: string;
  cueCount: number;
}

interface ShowState {
  open: boolean;
  pkgPath?: string;
  title?: string;
  mode?: 'rehearsal' | 'show';
  isSm?: boolean;
  cuelist?: CuelistSummary[];
}

function computeShowState(activeShow: ActiveShowDoc): ShowState {
  const doc = activeShow.getDoc();
  const meta = activeShow.getActiveShow();
  if (!doc || !meta) return { open: false };
  const cuelists = getCuelists(doc).toArray();
  return {
    open: true,
    pkgPath: meta.pkgPath,
    title: meta.title,
    mode: meta.mode,
    isSm: true,
    cuelist: cuelists.map((cl) => ({
      id: cl.get('id') as string,
      name: cl.get('name') as string,
      cueCount: getCues(cl).length,
    })),
  };
}

function broadcastShowState(state: ShowState): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('cuelist-core/show-state', state);
  });
}

export function registerShowStateBridge(
  activeShow: ActiveShowDoc,
  ipc: IpcMainBridge = ipcMain,
  logger: Logger,
): void {
  ipc.handle('cuelist-core/get-state', async () => {
    const state = computeShowState(activeShow);
    logger.debug('showstate.ipc', {
      open: state.open,
      cuelistCount: state.cuelist?.length ?? 0,
      totalCues: state.cuelist?.reduce((s, c) => s + c.cueCount, 0) ?? 0,
    });
    return state;
  });

  let unsub: (() => void) | null = null;

  activeShow.onChange((kind) => {
    if (kind === 'opened') {
      const doc = activeShow.getDoc()!;
      const cuelistsArr = getCuelists(doc);
      const handler = () => broadcastShowState(computeShowState(activeShow));
      cuelistsArr.observeDeep(handler);
      unsub = () => cuelistsArr.unobserveDeep(handler);
      // Fire once immediately so UI gets cuelist counts without invoking get-state
      broadcastShowState(computeShowState(activeShow));
    } else if (kind === 'closed') {
      unsub?.();
      unsub = null;
      broadcastShowState({ open: false });
    }
  });
}
