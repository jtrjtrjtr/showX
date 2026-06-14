import { IPC } from './channels.js';
import type { IpcMainBridge } from './index.js';
import { enumerateAudioDevices, type AudifyFactory } from '../shared/audio/audioDevices.js';
import type { Logger } from '../shared/Logger.js';

export interface AudioDevicesBridgeDeps {
  logger: Logger;
  audifyFactory?: AudifyFactory | null;
}

export function registerAudioDevicesBridge(
  deps: AudioDevicesBridgeDeps,
  ipc: IpcMainBridge,
): void {
  ipc.handle(IPC.AUDIO_DEVICES_LIST, async () =>
    enumerateAudioDevices(deps.logger, deps.audifyFactory),
  );
}
