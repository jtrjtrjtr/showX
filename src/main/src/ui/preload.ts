import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels.js';

const showxApi = {
  modules: {
    list: () => ipcRenderer.invoke(IPC.MODULES_LIST),
    setDisabled: (slug: string, disabled: boolean) =>
      ipcRenderer.invoke(IPC.MODULES_SET_DISABLED, slug, disabled),
  },
  health: {
    snapshot: () => ipcRenderer.invoke(IPC.HEALTH_SNAPSHOT),
    onChange: (cb: (snap: unknown) => void) => {
      const listener = (_e: unknown, snap: unknown) => cb(snap);
      ipcRenderer.on(IPC.HEALTH_CHANGE, listener as Parameters<typeof ipcRenderer.on>[1]);
      return () =>
        ipcRenderer.off(IPC.HEALTH_CHANGE, listener as Parameters<typeof ipcRenderer.on>[1]);
    },
  },
  pairing: {
    initiate: () => ipcRenderer.invoke(IPC.PAIRING_INITIATE),
    listDevices: () => ipcRenderer.invoke(IPC.PAIRING_LIST_DEVICES),
    revokeDevice: (id: string) => ipcRenderer.invoke(IPC.PAIRING_REVOKE_DEVICE, id),
  },
  config: {
    get: (key: string) => ipcRenderer.invoke(IPC.CONFIG_GET, key),
    set: (key: string, value: unknown) => ipcRenderer.invoke(IPC.CONFIG_SET, key, value),
  },
  shell: {
    getState: () => ipcRenderer.invoke('cuelist-core/shell.getState'),
    openDemo: () => ipcRenderer.invoke('cuelist-core:open-demo'),
    openExisting: () => ipcRenderer.invoke('cuelist-core:open-file-picker'),
    createNew: () => ipcRenderer.invoke('cuelist-core:create-new'),
    openRecent: (showPath: string) => ipcRenderer.invoke('cuelist-core:open-recent', showPath),
    openExternal: (url: string) => ipcRenderer.invoke('shell.openExternal', url),
    onShowChanged: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on(
        'cuelist-core:show-changed',
        listener as Parameters<typeof ipcRenderer.on>[1],
      );
      return () =>
        ipcRenderer.off(
          'cuelist-core:show-changed',
          listener as Parameters<typeof ipcRenderer.on>[1],
        );
    },
  },
  cuelistCore: {
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
      ipcRenderer.invoke(channel, ...args),
    on: (channel: string, handler: (...args: unknown[]) => void): (() => void) => {
      const listener = (_e: unknown, ...a: unknown[]) => handler(...a);
      ipcRenderer.on(channel, listener as Parameters<typeof ipcRenderer.on>[1]);
      return () => ipcRenderer.off(channel, listener as Parameters<typeof ipcRenderer.on>[1]);
    },
  },
  dispatchLog: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('dispatchLog:list'),
    onAppend: (cb: (record: unknown) => void): (() => void) => {
      const listener = (_e: unknown, record: unknown) => cb(record);
      ipcRenderer.on('dispatchLog:append', listener as Parameters<typeof ipcRenderer.on>[1]);
      return () =>
        ipcRenderer.off('dispatchLog:append', listener as Parameters<typeof ipcRenderer.on>[1]);
    },
  },
};

// When the menu fires cuelist-core/open-show as a push, translate to an invoke
// so the uiPanelBridge can update activeShow state and broadcast show-changed.
ipcRenderer.on('cuelist-core/open-show', (_e, showPath: unknown) => {
  if (typeof showPath === 'string') {
    void ipcRenderer.invoke('cuelist-core/open-show', showPath);
  }
});

contextBridge.exposeInMainWorld('showxApi', showxApi);

export type ShowxApi = typeof showxApi;
