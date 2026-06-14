import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Subscription } from 'showx-shared';

const { mockGetAllWindows, mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockGetAllWindows = vi.fn(() => [{ webContents: { send: mockSend } }]);
  return { mockGetAllWindows, mockSend };
});

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

import { registerClockSourceBridge } from '../../../src/main/src/ipc/clockSourceBridge.js';
import type { IpcMainBridge } from '../../../src/main/src/ipc/index.js';
import type { ClockSourceConfig } from '../../../src/main/src/ipc/clockSourceBridge.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClock(source: 'internal' | 'mtc' | 'ltc' = 'internal') {
  return {
    getState: vi.fn(() => ({ rate: 25, dropFrame: false, totalFrames: 0, running: false, source })),
    setSource: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    locate: vi.fn(),
    setRate: vi.fn(),
    onChange: vi.fn((_h: unknown): Subscription => ({ id: '0', unsubscribe: vi.fn() })),
  };
}

function makeShellConfig(initial: Record<string, unknown> = {}) {
  const store = { ...initial };
  return {
    init: vi.fn(async () => {}),
    getDisabledSlugs: vi.fn(() => []),
    setDisabledSlugs: vi.fn(async () => {}),
    get: vi.fn((key: string) => store[key]),
    set: vi.fn(async (key: string, value: unknown) => { store[key] = value; }),
  };
}

function makeLtcGenerator() {
  return {
    enable: vi.fn(),
    disable: vi.fn(),
    getStatus: vi.fn(() => ({ enabled: false, deviceId: -1, rate: null, dropFrame: false })),
    get isEnabled() { return false; },
  };
}

function makeLtcReceiver(locked = false) {
  let _locked = locked;
  return {
    enable: vi.fn(),
    disable: vi.fn(),
    getStatus: vi.fn(() => ({
      enabled: false, deviceId: -1, locked: _locked, rate: null, dropFrame: false,
    })),
    get isLocked() { return _locked; },
    _setLocked(v: boolean) { _locked = v; },
  };
}

function makeIpc() {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const ipc: IpcMainBridge = {
    handle: vi.fn((ch: string, fn: (...a: unknown[]) => unknown) => {
      handlers.set(ch, fn as (...args: unknown[]) => Promise<unknown>);
    }),
  };
  async function invoke(ch: string, ...args: unknown[]): Promise<unknown> {
    const fn = handlers.get(ch);
    if (!fn) throw new Error(`No handler for ${ch}`);
    return fn(undefined, ...args);
  }
  return { ipc, invoke };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerClockSourceBridge', () => {
  let clock: ReturnType<typeof makeClock>;
  let shellConfig: ReturnType<typeof makeShellConfig>;
  let ltcGen: ReturnType<typeof makeLtcGenerator>;
  let ltcRec: ReturnType<typeof makeLtcReceiver>;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = makeClock();
    shellConfig = makeShellConfig();
    ltcGen = makeLtcGenerator();
    ltcRec = makeLtcReceiver(false);
    vi.clearAllMocks();
    mockSend.mockClear();
    mockGetAllWindows.mockReturnValue([{ webContents: { send: mockSend } }]);
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
  });

  it('clock:source:get returns default config when none persisted', async () => {
    const { ipc, invoke } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);
    const result = await invoke('clock:source:get') as ClockSourceConfig & { locked: boolean };
    expect(result.source).toBe('internal');
    expect(result.ltcOutEnabled).toBe(false);
    expect(result.locked).toBe(false);
  });

  it('clock:source:set switches master clock source', async () => {
    const { ipc, invoke } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);

    const config: ClockSourceConfig = { source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: 2 };
    await invoke('clock:source:set', config);

    expect(clock.setSource).toHaveBeenCalledWith('ltc');
    expect(ltcRec.enable).toHaveBeenCalledWith(2);
  });

  it('switching to ltc with no ltcInDeviceId does not enable receiver', async () => {
    const { ipc, invoke } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);

    await invoke('clock:source:set', {
      source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null,
    });

    expect(ltcRec.enable).not.toHaveBeenCalled();
    expect(clock.setSource).toHaveBeenCalledWith('ltc');
  });

  it('switching away from ltc disables receiver (mutual exclusivity)', async () => {
    const { ipc, invoke } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);

    await invoke('clock:source:set', {
      source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null,
    });

    expect(ltcRec.disable).toHaveBeenCalled();
    expect(clock.setSource).toHaveBeenCalledWith('internal');
  });

  it('ltcOutEnabled=true + device → enables generator', async () => {
    const { ipc, invoke } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);

    await invoke('clock:source:set', {
      source: 'internal', ltcOutEnabled: true, ltcOutDeviceId: 1, ltcInDeviceId: null,
    });

    expect(ltcGen.enable).toHaveBeenCalledWith(1);
  });

  it('ltcOutEnabled=false → disables generator', async () => {
    const { ipc, invoke } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);

    await invoke('clock:source:set', {
      source: 'internal', ltcOutEnabled: false, ltcOutDeviceId: 1, ltcInDeviceId: null,
    });

    expect(ltcGen.disable).toHaveBeenCalled();
    expect(ltcGen.enable).not.toHaveBeenCalled();
  });

  it('config persisted to shellConfig after clock:source:set', async () => {
    const { ipc, invoke } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);

    const config: ClockSourceConfig = { source: 'mtc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: null };
    await invoke('clock:source:set', config);

    expect(shellConfig.set).toHaveBeenCalledWith('clock.source.config', expect.objectContaining({ source: 'mtc' }));
  });

  it('persisted config restored on startup', async () => {
    const persisted: ClockSourceConfig = { source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: 5 };
    const sc = makeShellConfig({ 'clock.source.config': persisted });
    const { ipc } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig: sc, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);

    expect(clock.setSource).toHaveBeenCalledWith('ltc');
    expect(ltcRec.enable).toHaveBeenCalledWith(5);
  });

  it('missing device fallback: enable() throws → setSource("internal") + returns fallback', async () => {
    ltcRec.enable.mockImplementation(() => { throw new Error('device not found'); });
    const { ipc, invoke } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);

    const result = await invoke('clock:source:set', {
      source: 'ltc', ltcOutEnabled: false, ltcOutDeviceId: null, ltcInDeviceId: 3,
    }) as { ok: boolean; fallback: string | null };

    expect(result.ok).toBe(false);
    expect(result.fallback).toBe('internal');
    // Clock should fall back to internal
    expect(clock.setSource).toHaveBeenCalledWith('internal');
  });

  it('lock state change broadcast via CLOCK_LOCK_CHANGE after poll interval', async () => {
    ltcRec._setLocked(false);
    const { ipc } = makeIpc();
    cleanup = registerClockSourceBridge({ clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec }, ipc);

    // Toggle locked state
    ltcRec._setLocked(true);
    ltcRec.getStatus.mockReturnValue({ enabled: true, deviceId: 0, locked: true, rate: 25, dropFrame: false });

    // Advance timer past 500ms poll interval
    vi.advanceTimersByTime(600);

    expect(mockSend).toHaveBeenCalledWith('clock:lock:change', expect.objectContaining({ locked: true }));
  });

  it('cleanup fn clears poll interval (no broadcast after cleanup)', async () => {
    const { ipc } = makeIpc();
    const cleanupFn = registerClockSourceBridge(
      { clock, shellConfig, ltcGenerator: ltcGen, ltcReceiver: ltcRec },
      ipc,
    );
    cleanupFn();

    ltcRec._setLocked(true);
    ltcRec.getStatus.mockReturnValue({ enabled: true, deviceId: 0, locked: true, rate: 25, dropFrame: false });
    vi.advanceTimersByTime(2000);

    expect(mockSend).not.toHaveBeenCalled();
  });
});
