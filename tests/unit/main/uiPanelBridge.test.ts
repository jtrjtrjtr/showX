import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActiveShowDoc } from '../../../src/main/src/runtime/ActiveShowDoc.js';

const { mockGetAllWindows, mockSend } = vi.hoisted(() => ({
  mockGetAllWindows: vi.fn(() => []),
  mockSend: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

import { registerUiPanelBridge } from '../../../src/main/src/ipc/uiPanelBridge.js';
import type { ShellConfigStore } from '../../../src/main/src/Shell.js';
import type { IpcMainBridge } from '../../../src/main/src/ipc/index.js';

function makeConfig(kv: Record<string, unknown> = {}): ShellConfigStore {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    getDisabledSlugs: vi.fn(() => []),
    setDisabledSlugs: vi.fn().mockResolvedValue(undefined),
    get: vi.fn((key: string) => kv[key]),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

function makeActiveShow(opts: { title?: string; mode?: 'rehearsal' | 'show' } = {}): ActiveShowDoc {
  let current: { pkgPath: string; title: string; mode: 'rehearsal' | 'show' } | null = null;
  const show = {
    open: vi.fn(async (showPath: string) => {
      current = { pkgPath: showPath, title: opts.title ?? 'Test Show', mode: opts.mode ?? 'rehearsal' };
    }),
    close: vi.fn().mockResolvedValue(undefined),
    getDoc: vi.fn().mockReturnValue(null),
    getPkgPath: vi.fn(() => current?.pkgPath ?? null),
    getActiveShow: vi.fn(() => current),
    onChange: vi.fn(() => () => {}),
  } as unknown as ActiveShowDoc;
  return show;
}

function captureHandlers(): {
  ipc: IpcMainBridge;
  handleMock: ReturnType<typeof vi.fn>;
  handlers: Record<string, (...args: unknown[]) => unknown>;
} {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const handleMock = vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => {
    handlers[channel] = listener;
  });
  const ipc: IpcMainBridge = { handle: handleMock as IpcMainBridge['handle'] };
  return { ipc, handleMock, handlers };
}

describe('registerUiPanelBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers cuelist-core/shell.getState handler', () => {
    const { ipc, handleMock } = captureHandlers();
    registerUiPanelBridge(makeConfig(), makeActiveShow(), ipc);
    expect(handleMock).toHaveBeenCalledWith(
      'cuelist-core/shell.getState',
      expect.any(Function),
    );
  });

  it('shell.getState returns no-show when no active show and no recents', async () => {
    const { ipc, handlers } = captureHandlers();
    registerUiPanelBridge(makeConfig(), makeActiveShow(), ipc);

    const result = await handlers['cuelist-core/shell.getState']?.();
    expect(result).toEqual({ kind: 'no-show', recentShows: [] });
  });

  it('shell.getState returns no-show with recents when config has recent-shows', async () => {
    const recents = [{ path: '/shows/a.showx', last_opened_at: '2026-06-07T10:00:00Z', cue_count: 5 }];
    const config = makeConfig({ 'cuelist-core:recent-shows': recents });
    const { ipc, handlers } = captureHandlers();
    registerUiPanelBridge(config, makeActiveShow(), ipc);

    const result = await handlers['cuelist-core/shell.getState']?.();
    expect(result).toEqual({ kind: 'no-show', recentShows: recents });
  });

  it('shell.getState returns show-loaded after openShow is called', async () => {
    const fakeWin = { isDestroyed: vi.fn(() => false), webContents: { send: mockSend } };
    mockGetAllWindows.mockReturnValue([fakeWin]);

    const { ipc, handlers } = captureHandlers();
    registerUiPanelBridge(makeConfig(), makeActiveShow(), ipc);

    await handlers['cuelist-core/open-show']?.({} as unknown, '/shows/demo.showx');

    const result = await handlers['cuelist-core/shell.getState']?.();
    expect(result).toMatchObject({ kind: 'show-loaded', showName: expect.any(String), recentShows: [] });
  });

  it('cuelist-core/open-show broadcasts cuelist-core:show-changed to all windows', async () => {
    const fakeWin = { isDestroyed: vi.fn(() => false), webContents: { send: mockSend } };
    mockGetAllWindows.mockReturnValue([fakeWin]);

    const { ipc, handlers } = captureHandlers();
    registerUiPanelBridge(makeConfig(), makeActiveShow(), ipc);

    await handlers['cuelist-core/open-show']?.({} as unknown, '/shows/demo.showx');

    expect(mockSend).toHaveBeenCalledWith('cuelist-core:show-changed');
  });

  it('cuelist-core/open-show throws on non-string path', async () => {
    const { ipc, handlers } = captureHandlers();
    registerUiPanelBridge(makeConfig(), makeActiveShow(), ipc);

    await expect(handlers['cuelist-core/open-show']?.({} as unknown, 42)).rejects.toThrow(
      'showPath must be a string',
    );
  });
});
