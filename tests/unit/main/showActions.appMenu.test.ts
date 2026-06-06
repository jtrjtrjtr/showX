import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (vi.mock factory is hoisted above variable declarations) ────

const { mockSetApplicationMenu, mockBuildFromTemplate, mockGetFocusedWindow, mockGetAllWindows } =
  vi.hoisted(() => ({
    mockSetApplicationMenu: vi.fn(),
    mockBuildFromTemplate: vi.fn((t: unknown) => t),
    mockGetFocusedWindow: vi.fn(() => null),
    mockGetAllWindows: vi.fn(() => []),
  }));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp'),
  },
  Menu: {
    buildFromTemplate: mockBuildFromTemplate,
    setApplicationMenu: mockSetApplicationMenu,
  },
  BrowserWindow: {
    getFocusedWindow: mockGetFocusedWindow,
    getAllWindows: mockGetAllWindows,
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
}));

// ── Import after mocking ──────────────────────────────────────────────────────

import { buildAppMenu } from '../../../src/main/src/ipc/showActions.js';
import type { ShellConfigStore } from '../../../src/main/src/Shell.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

type RecentEntry = { path: string; last_opened_at: string; cue_count?: number };

function makeConfig(kv: Record<string, unknown> = {}): ShellConfigStore {
  return {
    init: vi.fn(),
    getDisabledSlugs: vi.fn(() => [] as string[]),
    setDisabledSlugs: vi.fn(async () => {}),
    get: vi.fn((key: string) => kv[key]),
    set: vi.fn(async () => {}),
  };
}

type MenuItem = {
  label?: string;
  type?: string;
  accelerator?: string;
  enabled?: boolean;
  submenu?: MenuItem[];
  click?: () => void;
};

function getFileSubmenu(config: ShellConfigStore): MenuItem[] {
  buildAppMenu(config);
  const template = mockBuildFromTemplate.mock.calls.at(-1)?.[0] as MenuItem[];
  const fileMenu = template?.find((item) => item.label === 'File');
  return (fileMenu?.submenu as MenuItem[]) ?? [];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildAppMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildFromTemplate.mockImplementation((t: unknown) => t);
  });

  it('calls Menu.buildFromTemplate and Menu.setApplicationMenu', () => {
    buildAppMenu(makeConfig());
    expect(mockBuildFromTemplate).toHaveBeenCalledOnce();
    expect(mockSetApplicationMenu).toHaveBeenCalledOnce();
  });

  it('template contains a File top-level menu', () => {
    buildAppMenu(makeConfig());
    const template = mockBuildFromTemplate.mock.calls[0]![0] as MenuItem[];
    const fileMenu = template.find((item) => item.label === 'File');
    expect(fileMenu).toBeDefined();
  });

  it('File submenu contains Open Demo Show', () => {
    const submenu = getFileSubmenu(makeConfig());
    expect(submenu.some((item) => item.label === 'Open Demo Show')).toBe(true);
  });

  it('File submenu contains Open… with CmdOrCtrl+O accelerator', () => {
    const submenu = getFileSubmenu(makeConfig());
    const openItem = submenu.find((item) => item.label === 'Open…');
    expect(openItem).toBeDefined();
    expect(openItem?.accelerator).toBe('CmdOrCtrl+O');
  });

  it('File submenu contains Open Recent', () => {
    const submenu = getFileSubmenu(makeConfig());
    expect(submenu.some((item) => item.label === 'Open Recent')).toBe(true);
  });

  it('File submenu contains New Show… with CmdOrCtrl+N accelerator', () => {
    const submenu = getFileSubmenu(makeConfig());
    const newItem = submenu.find((item) => item.label === 'New Show…');
    expect(newItem).toBeDefined();
    expect(newItem?.accelerator).toBe('CmdOrCtrl+N');
  });

  it('File submenu contains a separator between Open Recent and New Show…', () => {
    const submenu = getFileSubmenu(makeConfig());
    const recentIdx = submenu.findIndex((item) => item.label === 'Open Recent');
    const newIdx = submenu.findIndex((item) => item.label === 'New Show…');
    const hasSeparatorBetween = submenu
      .slice(recentIdx + 1, newIdx)
      .some((item) => item.type === 'separator');
    expect(hasSeparatorBetween).toBe(true);
  });

  it('Open Recent submenu shows "No Recent Shows" (disabled) when no recents', () => {
    const submenu = getFileSubmenu(makeConfig());
    const recentItem = submenu.find((item) => item.label === 'Open Recent');
    const recentSubmenu = recentItem?.submenu as MenuItem[];
    expect(recentSubmenu).toHaveLength(1);
    expect(recentSubmenu[0]!.label).toBe('No Recent Shows');
    expect(recentSubmenu[0]!.enabled).toBe(false);
  });

  it('Open Recent submenu lists recent show names when recents exist', () => {
    const recents: RecentEntry[] = [
      { path: '/docs/ShowX/My Show.showx', last_opened_at: '2026-06-07T00:00:00Z' },
      { path: '/docs/ShowX/Another.showx', last_opened_at: '2026-06-06T00:00:00Z' },
    ];
    const submenu = getFileSubmenu(makeConfig({ 'cuelist-core:recent-shows': recents }));
    const recentItem = submenu.find((item) => item.label === 'Open Recent');
    const recentSubmenu = recentItem?.submenu as MenuItem[];
    expect(recentSubmenu).toHaveLength(2);
    expect(recentSubmenu[0]!.label).toBe('My Show');
    expect(recentSubmenu[1]!.label).toBe('Another');
  });

  it('Open Recent submenu strips .showx extension from show name', () => {
    const recents: RecentEntry[] = [
      { path: '/docs/ShowX/Grand Prix 2026.showx', last_opened_at: '2026-06-07T00:00:00Z' },
    ];
    const submenu = getFileSubmenu(makeConfig({ 'cuelist-core:recent-shows': recents }));
    const recentItem = submenu.find((item) => item.label === 'Open Recent');
    const recentSubmenu = recentItem?.submenu as MenuItem[];
    expect(recentSubmenu[0]!.label).toBe('Grand Prix 2026');
  });
});
