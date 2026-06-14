import { BrowserWindow } from 'electron';
import { IPC } from './channels.js';
import type { IpcMainBridge } from './index.js';
import type { MasterClock, ClockSource } from 'showx-shared';
import type { LtcGenerator } from '../shared/output/ltcGenerator.js';
import type { LtcReceiver } from '../shared/input/ltcDecoder.js';
import type { ShellConfigStore } from '../Shell.js';

const CONFIG_KEY = 'clock.source.config';

export interface ClockSourceConfig {
  source: ClockSource;
  /** Generate LTC audio output from master clock */
  ltcOutEnabled: boolean;
  ltcOutDeviceId: number | null;
  ltcInDeviceId: number | null;
}

export interface ClockLockState {
  source: ClockSource;
  locked: boolean;
}

export interface ClockSourceBridgeDeps {
  clock: MasterClock;
  shellConfig: ShellConfigStore;
  ltcGenerator?: LtcGenerator;
  ltcReceiver?: LtcReceiver;
}

function defaultConfig(): ClockSourceConfig {
  return { source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null };
}

function applyConfig(
  config: ClockSourceConfig,
  deps: ClockSourceBridgeDeps,
): { ok: boolean; fallback?: ClockSource } {
  const { source, ltcOutEnabled, ltcOutDeviceId, ltcInDeviceId } = config;

  // Mutual exclusivity: disable LTC receiver when not chasing LTC
  if (source !== 'ltc') {
    deps.ltcReceiver?.disable();
  }

  deps.clock.setSource(source);

  // LTC output: LtcGenerator self-suppresses when source !== 'internal',
  // but we still manage the enable/disable lifecycle here.
  if (ltcOutEnabled && ltcOutDeviceId !== null && deps.ltcGenerator) {
    try {
      deps.ltcGenerator.enable(ltcOutDeviceId);
    } catch {
      deps.ltcGenerator.disable();
    }
  } else {
    deps.ltcGenerator?.disable();
  }

  // LTC chase: enable receiver when source is 'ltc'
  if (source === 'ltc' && ltcInDeviceId !== null && deps.ltcReceiver) {
    try {
      deps.ltcReceiver.enable(ltcInDeviceId);
    } catch {
      // Device missing — fall back to internal
      deps.ltcReceiver.disable();
      deps.clock.setSource('internal');
      return { ok: false, fallback: 'internal' };
    }
  }

  return { ok: true };
}

/**
 * Registers IPC handlers for clock source selection (Internal/MTC/LTC) and
 * LTC device configuration. Broadcasts clock:lock:change on LTC lock transitions.
 *
 * Returns a cleanup fn that clears the lock-poll interval.
 */
export function registerClockSourceBridge(
  deps: ClockSourceBridgeDeps,
  ipc: IpcMainBridge,
): () => void {
  // Restore persisted config on startup (best-effort)
  const rawConfig = deps.shellConfig.get(CONFIG_KEY) as ClockSourceConfig | undefined;
  if (rawConfig && typeof rawConfig.source === 'string') {
    applyConfig(rawConfig, deps);
  }

  // Poll LTC lock state every 500 ms; broadcast when it changes
  let lastLocked: boolean | null = null;
  const pollId = setInterval(() => {
    if (!deps.ltcReceiver) return;
    const { locked } = deps.ltcReceiver.getStatus();
    if (locked !== lastLocked) {
      lastLocked = locked;
      const payload: ClockLockState = {
        source: deps.clock.getState().source,
        locked,
      };
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send(IPC.CLOCK_LOCK_CHANGE, payload),
      );
    }
  }, 500);

  ipc.handle(IPC.CLOCK_SOURCE_GET, async () => {
    const config: ClockSourceConfig =
      (deps.shellConfig.get(CONFIG_KEY) as ClockSourceConfig | undefined) ?? defaultConfig();
    const ltcStatus = deps.ltcReceiver?.getStatus();
    return { ...config, locked: ltcStatus?.locked ?? false };
  });

  ipc.handle(IPC.CLOCK_SOURCE_SET, async (_e: unknown, config: ClockSourceConfig) => {
    const result = applyConfig(config, deps);
    const toPersist: ClockSourceConfig = result.fallback
      ? { ...config, source: result.fallback }
      : config;
    await deps.shellConfig.set(CONFIG_KEY, toPersist);
    return { ok: result.ok, fallback: result.fallback ?? null };
  });

  return () => clearInterval(pollId);
}
