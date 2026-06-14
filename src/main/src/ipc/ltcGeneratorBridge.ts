import { IPC } from './channels.js';
import type { IpcMainBridge } from './index.js';
import type { LtcGenerator } from '../shared/output/ltcGenerator.js';

export interface LtcGeneratorBridgeDeps {
  ltcGenerator: LtcGenerator;
}

export function registerLtcGeneratorBridge(
  deps: LtcGeneratorBridgeDeps,
  ipc: IpcMainBridge,
): void {
  ipc.handle(IPC.LTC_GEN_ENABLE, async (_e: unknown, deviceId: number) => {
    deps.ltcGenerator.enable(deviceId);
    return { ok: true };
  });

  ipc.handle(IPC.LTC_GEN_DISABLE, async () => {
    deps.ltcGenerator.disable();
    return { ok: true };
  });

  ipc.handle(IPC.LTC_GEN_STATUS, async () => deps.ltcGenerator.getStatus());
}
