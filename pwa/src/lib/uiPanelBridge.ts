import type { IpcBridge } from '../../../src/modules/cuelist-core/src/ui/CuelistCorePanel.js';

export type { IpcBridge };

export interface RecentShow {
  path: string;
  last_opened_at: string;
  cue_count?: number;
}

export type ShellState =
  | { kind: 'no-show'; recentShows: RecentShow[] }
  | { kind: 'show-loaded'; showName: string; recentShows: RecentShow[] };

interface CuelistCoreApiShape {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, handler: (...args: unknown[]) => void): () => void;
}

interface ShellApiShape {
  getState(): Promise<ShellState>;
  openDemo(): Promise<{ path?: string; cancelled?: boolean }>;
  openExisting(): Promise<{ path?: string; cancelled?: boolean }>;
  createNew(): Promise<{ path?: string; cancelled?: boolean; error?: string }>;
  openRecent(showPath: string): Promise<{ ok?: boolean }>;
  onShowChanged(cb: () => void): () => void;
}

declare global {
  interface Window {
    showxApi?: {
      shell: ShellApiShape;
      cuelistCore: CuelistCoreApiShape;
    };
  }
}

export function createIpcBridge(): IpcBridge {
  const api = window.showxApi?.cuelistCore;
  if (!api) {
    throw new Error('showxApi.cuelistCore not available — PWA is not running inside Electron shell');
  }
  return {
    invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
      return api.invoke(channel, ...args) as Promise<T>;
    },
    on(channel: string, handler: (...args: unknown[]) => void): () => void {
      return api.on(channel, handler);
    },
  };
}

export function getShellApi(): ShellApiShape {
  const api = window.showxApi?.shell;
  if (!api) {
    throw new Error('showxApi.shell not available — PWA is not running inside Electron shell');
  }
  return api;
}
