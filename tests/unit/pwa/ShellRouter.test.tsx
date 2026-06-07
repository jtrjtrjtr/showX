// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

vi.mock('y-websocket', () => ({
  WebsocketProvider: vi.fn(() => ({ on: vi.fn(), destroy: vi.fn() })),
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn(() => ({ destroy: vi.fn() })),
}));

// Mock uiPanelBridge so ShellRouter can be tested without Electron globals
const mockGetState = vi.fn();
const mockOnShowChanged = vi.fn();
const mockIpcBridge = {
  invoke: vi.fn(),
  on: vi.fn().mockReturnValue(() => {}),
};

vi.mock('../../../pwa/src/lib/uiPanelBridge.js', () => ({
  createIpcBridge: () => mockIpcBridge,
  getShellApi: () => ({
    getState: mockGetState,
    openDemo: vi.fn(),
    openExisting: vi.fn(),
    createNew: vi.fn(),
    openRecent: vi.fn(),
    onShowChanged: mockOnShowChanged,
  }),
}));

// Mock cuelist-core UI components so tests stay lightweight
vi.mock('../../../src/modules/cuelist-core/src/ui/index.js', () => ({
  FirstLaunchPicker: ({ ipc: _ipc }: { ipc: unknown }) => <div data-testid="first-launch-picker">FirstLaunchPicker</div>,
  RecentShowsList: ({ ipc: _ipc, recentShows }: { ipc: unknown; recentShows: unknown[] }) => (
    <div data-testid="recent-shows-list">RecentShowsList ({recentShows.length} shows)</div>
  ),
  CuelistCorePanel: ({ ipc: _ipc }: { ipc: unknown }) => <div data-testid="cuelist-core-panel">CuelistCorePanel</div>,
}));

import { ShellRouter } from '../../../pwa/src/components/ShellRouter.js';

describe('ShellRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnShowChanged.mockReturnValue(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders FirstLaunchPicker when no-show and no recents', async () => {
    mockGetState.mockResolvedValue({ kind: 'no-show', recentShows: [] });

    render(<ShellRouter />);

    await waitFor(() => {
      expect(screen.getByTestId('first-launch-picker')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('recent-shows-list')).toBeNull();
    expect(screen.queryByTestId('cuelist-core-panel')).toBeNull();
  });

  it('renders RecentShowsList when no-show with recents', async () => {
    const recents = [
      { path: '/shows/show1.showx', last_opened_at: '2026-06-07T10:00:00Z', cue_count: 12 },
    ];
    mockGetState.mockResolvedValue({ kind: 'no-show', recentShows: recents });

    render(<ShellRouter />);

    await waitFor(() => {
      expect(screen.getByTestId('recent-shows-list')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('first-launch-picker')).toBeNull();
    expect(screen.queryByTestId('cuelist-core-panel')).toBeNull();
  });

  it('renders CuelistCorePanel when show-loaded', async () => {
    mockGetState.mockResolvedValue({
      kind: 'show-loaded',
      showName: 'Demo Show',
      recentShows: [],
    });

    render(<ShellRouter />);

    await waitFor(() => {
      expect(screen.getByTestId('cuelist-core-panel')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('first-launch-picker')).toBeNull();
    expect(screen.queryByTestId('recent-shows-list')).toBeNull();
  });

  it('shows loading state while fetching shell state', () => {
    // getState never resolves during this test
    mockGetState.mockReturnValue(new Promise(() => {}));

    render(<ShellRouter />);

    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('switches to CuelistCorePanel when show-changed fires', async () => {
    let showChangedCallback: (() => void) | null = null;

    mockGetState
      .mockResolvedValueOnce({ kind: 'no-show', recentShows: [] })
      .mockResolvedValueOnce({ kind: 'show-loaded', showName: 'Demo Show', recentShows: [] });

    mockOnShowChanged.mockImplementation((cb: () => void) => {
      showChangedCallback = cb;
      return () => {};
    });

    render(<ShellRouter />);

    await waitFor(() => {
      expect(screen.getByTestId('first-launch-picker')).toBeInTheDocument();
    });

    // Simulate show-changed event
    expect(showChangedCallback).not.toBeNull();
    showChangedCallback!();

    await waitFor(() => {
      expect(screen.getByTestId('cuelist-core-panel')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('first-launch-picker')).toBeNull();
  });

  it('unregisters show-changed listener on unmount', async () => {
    const unregisterSpy = vi.fn();
    mockOnShowChanged.mockReturnValue(unregisterSpy);
    mockGetState.mockResolvedValue({ kind: 'no-show', recentShows: [] });

    const { unmount } = render(<ShellRouter />);
    await waitFor(() => screen.getByTestId('first-launch-picker'));

    unmount();

    expect(unregisterSpy).toHaveBeenCalledTimes(1);
  });
});
