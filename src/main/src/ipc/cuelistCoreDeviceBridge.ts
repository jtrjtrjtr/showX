import { ipcMain, BrowserWindow } from 'electron';
import type { Logger } from 'showx-shared';
import type { ActiveShowDoc } from '../runtime/ActiveShowDoc.js';
import type { IpcMainBridge } from './index.js';
import {
  getDevicesList,
  getDevice,
  addDevice,
  updateDevice,
  removeDevice,
  type Device,
} from '../../../modules/cuelist-core/dist/document/devices.js';
import { getRoutingRules } from '../../../modules/cuelist-core/dist/document/routing.js';

const ACTOR = { actorId: 'shell' };

function broadcastDevicesChanged(devices: Device[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('cuelist-core/devices-changed', devices);
  });
}

export function registerDeviceBridge(
  activeShow: ActiveShowDoc,
  ipc: IpcMainBridge = ipcMain,
  logger: Logger,
): void {
  let unsubscribeObserve: (() => void) | null = null;

  activeShow.onChange((kind) => {
    if (kind === 'opened') {
      const doc = activeShow.getDoc()!;
      const devicesMap = doc.getMap('devices');
      const handler = () => broadcastDevicesChanged(getDevicesList(doc));
      devicesMap.observeDeep(handler);
      unsubscribeObserve = () => devicesMap.unobserveDeep(handler);
    } else if (kind === 'closed') {
      unsubscribeObserve?.();
      unsubscribeObserve = null;
      broadcastDevicesChanged([]);
    }
  });

  ipc.handle('cuelist-core/get-devices', async () => {
    logger.debug('device.ipc', { channel: 'get-devices' });
    const doc = activeShow.getDoc();
    if (!doc) return [];
    return getDevicesList(doc);
  });

  ipc.handle('cuelist-core/device-add', async (_e, device: Device) => {
    const doc = activeShow.getDoc();
    if (!doc) throw new Error('No show open');
    logger.debug('device.ipc', { channel: 'device-add', deviceId: device.device_id });
    doc.transact(() => addDevice(doc, device, ACTOR));
    broadcastDevicesChanged(getDevicesList(doc));
    return { ok: true };
  });

  ipc.handle(
    'cuelist-core/device-update',
    async (_e, deviceId: string, patch: Partial<Omit<Device, 'device_id'>>) => {
      const doc = activeShow.getDoc();
      if (!doc) throw new Error('No show open');
      logger.debug('device.ipc', { channel: 'device-update', deviceId });
      doc.transact(() => updateDevice(doc, deviceId, patch, ACTOR));
      broadcastDevicesChanged(getDevicesList(doc));
      return { ok: true };
    },
  );

  ipc.handle(
    'cuelist-core/device-remove',
    async (_e, deviceId: string, opts: { force?: boolean } = {}) => {
      const doc = activeShow.getDoc();
      if (!doc) throw new Error('No show open');
      logger.debug('device.ipc', { channel: 'device-remove', deviceId });
      doc.transact(() => removeDevice(doc, deviceId, opts, ACTOR));
      broadcastDevicesChanged(getDevicesList(doc));
      return { ok: true };
    },
  );

  ipc.handle('cuelist-core/device-deps', async (_e, deviceId: string) => {
    logger.debug('device.ipc', { channel: 'device-deps', deviceId });
    const doc = activeShow.getDoc();
    if (!doc) return [];
    return getRoutingRules(doc)
      .filter((r) => r.target_device_id === deviceId || r.match.device_id === deviceId)
      .map((r) => r.rule_id);
  });

  ipc.handle('cuelist-core/device-test', async (_e, deviceId: string) => {
    logger.debug('device.ipc', { channel: 'device-test', deviceId });
    const doc = activeShow.getDoc();
    if (!doc) throw new Error('No show open');
    const device = getDevice(doc, deviceId);
    if (!device) throw new Error(`device not found: ${deviceId}`);
    // Real transport ping deferred to post-3.3 (requires OutputDispatcher wiring)
    return true;
  });
}
