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
};

contextBridge.exposeInMainWorld('showxApi', showxApi);

export type ShowxApi = typeof showxApi;
