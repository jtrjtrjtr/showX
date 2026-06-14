import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from './channels.js';
import type { ModuleLoader } from '../ModuleLoader.js';
import type { HealthBus } from '../shared/HealthBus.js';
import type { PairingStore } from '../shared/PairingStore.js';
import type { PinManager } from '../shared/pairing/pinManager.js';
import type { Logger } from '../shared/Logger.js';
import type { ShellConfigStore } from '../Shell.js';
import { registerShowActions } from './showActions.js';
import { registerCallerBridge, type CallerBridgeDeps } from './callerBridge.js';
import { registerLlmDraftBridge, type LlmDraftBridgeDeps } from './llmDraftBridge.js';

export type { ShellConfigStore } from '../Shell.js';

export interface IpcMainBridge {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(channel: string, listener: (...args: any[]) => unknown): void;
}

export interface IpcDeps {
  modules: ModuleLoader;
  health: HealthBus;
  pairing: PairingStore;
  pins: PinManager;
  shellConfig: ShellConfigStore;
  logger: Logger;
  /** Returns the port the AssetServer is listening on. Used by TEST_GET_PORT. */
  assetPort?: () => number;
  /** AI Showcaller (F4) — ElevenLabs TTS. Optional until Shell wires ElevenLabsClient. */
  caller?: CallerBridgeDeps;
  /** AI Showcaller (F4) — LLM draft via Claude. Optional until Shell wires LlmDraftClient. */
  llmDraft?: LlmDraftBridgeDeps;
}

export function registerIpcHandlers(deps: IpcDeps, ipc: IpcMainBridge = ipcMain): void {
  ipc.handle(IPC.MODULES_LIST, async () =>
    deps.modules.listLoaded().map((m) => ({
      slug: m.slug,
      name: m.manifest.name,
      version: m.manifest.version,
      tier: m.manifest.tier,
      state: m.state,
    })),
  );

  ipc.handle(IPC.MODULES_SET_DISABLED, async (_e, slug: string, disabled: boolean) => {
    const current = deps.shellConfig.getDisabledSlugs();
    const set = new Set<string>(current);
    if (disabled) set.add(slug);
    else set.delete(slug);
    await deps.shellConfig.setDisabledSlugs([...set]);
    return { ok: true, requiresRestart: true };
  });

  ipc.handle(IPC.HEALTH_SNAPSHOT, async () => deps.health.snapshot());

  deps.health.observeAggregate(() => {
    const snap = deps.health.snapshot();
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(IPC.HEALTH_CHANGE, snap));
  });

  ipc.handle(IPC.PAIRING_INITIATE, async () => {
    const rec = deps.pins.generate();
    return { pin: rec.pin, expires_at: rec.expires_at };
  });

  ipc.handle(IPC.PAIRING_LIST_DEVICES, async () => deps.pairing.listDevices());

  ipc.handle(IPC.PAIRING_LIST_OPERATORS, async () => deps.pairing.listOperatorRecords());

  ipc.handle(IPC.PAIRING_REVOKE_DEVICE, async (_e, id: string) => {
    await deps.pairing.revokeDevice(id);
    return { ok: true };
  });

  ipc.handle(IPC.CONFIG_GET, async (_e, key: string) => deps.shellConfig.get(key));

  ipc.handle(IPC.CONFIG_SET, async (_e, key: string, value: unknown) => {
    await deps.shellConfig.set(key, value);
    return { ok: true };
  });

  if (deps.assetPort) {
    const assetPort = deps.assetPort;
    ipc.handle(IPC.TEST_GET_PORT, async () => assetPort());
  }

  if (deps.caller) {
    registerCallerBridge(deps.caller, ipc);
  }

  if (deps.llmDraft) {
    registerLlmDraftBridge(deps.llmDraft, ipc);
  }

  registerShowActions(deps.shellConfig, ipc);
}
