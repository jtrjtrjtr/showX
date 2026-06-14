import { IPC } from './channels.js';
import type { IpcMainBridge } from './index.js';
import type { LtcReceiver } from '../shared/input/ltcDecoder.js';

export interface LtcDecoderBridgeDeps {
  ltcReceiver: LtcReceiver;
}

export function registerLtcDecoderBridge(
  deps: LtcDecoderBridgeDeps,
  ipc: IpcMainBridge,
): void {
  ipc.handle(IPC.LTC_DEC_ENABLE, async (_e: unknown, deviceId: number) => {
    deps.ltcReceiver.enable(deviceId);
    return { ok: true };
  });

  ipc.handle(IPC.LTC_DEC_DISABLE, async () => {
    deps.ltcReceiver.disable();
    return { ok: true };
  });

  ipc.handle(IPC.LTC_DEC_STATUS, async () => deps.ltcReceiver.getStatus());
}
