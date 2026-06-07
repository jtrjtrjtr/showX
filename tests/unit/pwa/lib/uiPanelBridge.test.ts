// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createIpcBridge, getShellApi } from '../../../../pwa/src/lib/uiPanelBridge.js';

function buildMockCuelistCore() {
  return {
    invoke: vi.fn().mockResolvedValue({ ok: true }),
    on: vi.fn().mockReturnValue(() => {}),
  };
}

function buildMockShell() {
  return {
    getState: vi.fn().mockResolvedValue({ kind: 'no-show', recentShows: [] }),
    openDemo: vi.fn().mockResolvedValue({ path: '/demo.showx' }),
    openExisting: vi.fn().mockResolvedValue({ cancelled: true }),
    createNew: vi.fn().mockResolvedValue({ cancelled: true }),
    openRecent: vi.fn().mockResolvedValue({ ok: true }),
    onShowChanged: vi.fn().mockReturnValue(() => {}),
  };
}

describe('createIpcBridge', () => {
  beforeEach(() => {
    // Reset window.showxApi
    Object.defineProperty(window, 'showxApi', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('throws when showxApi is not available', () => {
    expect(() => createIpcBridge()).toThrow(/not available/i);
  });

  it('creates a bridge that delegates invoke to cuelistCore.invoke', async () => {
    const cuelistCore = buildMockCuelistCore();
    Object.defineProperty(window, 'showxApi', {
      configurable: true,
      writable: true,
      value: { cuelistCore, shell: buildMockShell() },
    });

    const bridge = createIpcBridge();
    await bridge.invoke('some:channel', 'arg1', 42);

    expect(cuelistCore.invoke).toHaveBeenCalledWith('some:channel', 'arg1', 42);
  });

  it('creates a bridge that delegates on() to cuelistCore.on', () => {
    const cuelistCore = buildMockCuelistCore();
    Object.defineProperty(window, 'showxApi', {
      configurable: true,
      writable: true,
      value: { cuelistCore, shell: buildMockShell() },
    });

    const bridge = createIpcBridge();
    const handler = vi.fn();
    bridge.on('some:event', handler);

    expect(cuelistCore.on).toHaveBeenCalledWith('some:event', handler);
  });

  it('bridge.on returns an unsubscribe function from cuelistCore.on', () => {
    const unsub = vi.fn();
    const cuelistCore = { invoke: vi.fn(), on: vi.fn().mockReturnValue(unsub) };
    Object.defineProperty(window, 'showxApi', {
      configurable: true,
      writable: true,
      value: { cuelistCore, shell: buildMockShell() },
    });

    const bridge = createIpcBridge();
    const off = bridge.on('chan', vi.fn());
    off();

    expect(unsub).toHaveBeenCalledTimes(1);
  });
});

describe('getShellApi', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'showxApi', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('throws when showxApi is not available', () => {
    expect(() => getShellApi()).toThrow(/not available/i);
  });

  it('returns the shell API when available', async () => {
    const shell = buildMockShell();
    Object.defineProperty(window, 'showxApi', {
      configurable: true,
      writable: true,
      value: { cuelistCore: buildMockCuelistCore(), shell },
    });

    const api = getShellApi();
    const state = await api.getState();

    expect(state).toEqual({ kind: 'no-show', recentShows: [] });
  });

  it('shell.onShowChanged registers and returns unsubscribe', () => {
    const unsub = vi.fn();
    const shell = { ...buildMockShell(), onShowChanged: vi.fn().mockReturnValue(unsub) };
    Object.defineProperty(window, 'showxApi', {
      configurable: true,
      writable: true,
      value: { cuelistCore: buildMockCuelistCore(), shell },
    });

    const api = getShellApi();
    const cb = vi.fn();
    const off = api.onShowChanged(cb);
    off();

    expect(shell.onShowChanged).toHaveBeenCalledWith(cb);
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
