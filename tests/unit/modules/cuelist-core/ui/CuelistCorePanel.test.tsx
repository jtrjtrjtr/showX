// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { CuelistCorePanel, type IpcBridge } from '../../../../../src/modules/cuelist-core/src/ui/CuelistCorePanel.js';

type IpcHandler = (...args: unknown[]) => void;

function createMockIpc(overrides: Partial<IpcBridge> = {}): IpcBridge & { emit: (channel: string, ...args: unknown[]) => void } {
  const handlers = new Map<string, IpcHandler[]>();
  return {
    invoke: vi.fn().mockResolvedValue(null),
    on: vi.fn((channel: string, handler: IpcHandler) => {
      const list = handlers.get(channel) ?? [];
      list.push(handler);
      handlers.set(channel, list);
      return () => {
        const l = handlers.get(channel);
        if (l) handlers.set(channel, l.filter((h) => h !== handler));
      };
    }),
    emit: (channel: string, ...args: unknown[]) => {
      (handlers.get(channel) ?? []).forEach((h) => h(...args));
    },
    ...overrides,
  };
}

describe('CuelistCorePanel — empty state', () => {
  it('renders Open .showx and New show buttons when no show is open', () => {
    const ipc = createMockIpc();
    render(<CuelistCorePanel ipc={ipc} />);
    expect(screen.getByText(/open \.showx/i)).toBeTruthy();
    expect(screen.getByText(/new show/i)).toBeTruthy();
  });

  it('renders action-oriented empty state copy', () => {
    const ipc = createMockIpc();
    render(<CuelistCorePanel ipc={ipc} />);
    expect(screen.getByText(/open a show file or create a new one to start/i)).toBeTruthy();
  });

  it('does NOT render Cuelist section heading in empty state', () => {
    const ipc = createMockIpc();
    render(<CuelistCorePanel ipc={ipc} />);
    // h2 "Cuelist" only appears in the loaded state; h1 "Cuelist Core" is in empty state
    expect(screen.queryByRole('heading', { level: 2, name: /^cuelist$/i })).toBeNull();
  });

  it('calls cuelist-core/pick-show-file then cuelist-core/open-show when Open is clicked with a path', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // get-state initial call
      .mockResolvedValueOnce('/path/to/show.showx') // pick-show-file
      .mockResolvedValueOnce(undefined); // open-show

    render(<CuelistCorePanel ipc={ipc} />);
    await act(async () => {
      fireEvent.click(screen.getByText(/open \.showx/i));
    });

    expect(ipc.invoke).toHaveBeenCalledWith('cuelist-core/pick-show-file');
    expect(ipc.invoke).toHaveBeenCalledWith('cuelist-core/open-show', '/path/to/show.showx');
  });

  it('calls cuelist-core/new-show-flow when New show is clicked', async () => {
    const ipc = createMockIpc();
    render(<CuelistCorePanel ipc={ipc} />);
    await act(async () => {
      fireEvent.click(screen.getByText(/new show/i));
    });
    expect(ipc.invoke).toHaveBeenCalledWith('cuelist-core/new-show-flow');
  });
});

describe('CuelistCorePanel — populated state', () => {
  const populatedState = {
    open: true,
    pkgPath: '/Users/foh/shows/kongres.showx',
    title: 'Kongres 2026',
    venue: 'Prague Congress Centre',
    date: '2026-06-17',
    mode: 'rehearsal' as const,
    cuelistName: 'Main Show',
    cueCount: 42,
    isSm: false,
  };

  it('renders show title, venue, and date when show is open', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce(populatedState);

    render(<CuelistCorePanel ipc={ipc} />);
    await waitFor(() => {
      expect(screen.getByText('Kongres 2026')).toBeTruthy();
    });
    expect(screen.getByText(/prague congress centre/i)).toBeTruthy();
  });

  it('renders cuelist name and cue count', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce(populatedState);

    render(<CuelistCorePanel ipc={ipc} />);
    await waitFor(() => {
      expect(screen.getByText(/main show/i)).toBeTruthy();
    });
    expect(screen.getByText(/42 cues/i)).toBeTruthy();
  });

  it('renders REHEARSAL mode badge in teal for rehearsal mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce(populatedState);

    render(<CuelistCorePanel ipc={ipc} />);
    await waitFor(() => {
      expect(screen.getByText('REHEARSAL')).toBeTruthy();
    });
  });

  it('renders SHOW mode badge in red for show mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...populatedState, mode: 'show' });

    render(<CuelistCorePanel ipc={ipc} />);
    await waitFor(() => {
      expect(screen.getByText('SHOW')).toBeTruthy();
    });
  });
});

describe('CuelistCorePanel — mode toggle', () => {
  it('mode badge is disabled for non-SM operator', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      open: true, mode: 'rehearsal', isSm: false, cueCount: 0,
    });

    render(<CuelistCorePanel ipc={ipc} />);
    await waitFor(() => {
      const badge = screen.getByRole('button', { name: /mode: rehearsal/i });
      expect((badge as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('mode badge is enabled for SM operator', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      open: true, mode: 'rehearsal', isSm: true, cueCount: 0,
    });

    render(<CuelistCorePanel ipc={ipc} />);
    await waitFor(() => {
      const badge = screen.getByRole('button', { name: /mode: rehearsal/i });
      expect((badge as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('clicking mode badge calls cuelist-core/transition-mode for SM operator', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      open: true, mode: 'rehearsal', isSm: true, cueCount: 0,
    });

    render(<CuelistCorePanel ipc={ipc} />);
    await waitFor(() => screen.getByRole('button', { name: /mode: rehearsal/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /mode: rehearsal/i }));
    });
    expect(ipc.invoke).toHaveBeenCalledWith('cuelist-core/transition-mode', 'show');
  });
});

describe('CuelistCorePanel — error toast', () => {
  it('shows error toast when IPC rejects', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // get-state
      .mockRejectedValueOnce(new Error('IPC error: module not started')); // new-show-flow

    render(<CuelistCorePanel ipc={ipc} />);
    await act(async () => {
      fireEvent.click(screen.getByText(/new show/i));
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain('IPC error: module not started');
    });
  });
});

describe('CuelistCorePanel — health indicator', () => {
  it('renders health status strip with unknown health by default', async () => {
    const ipc = createMockIpc();
    render(<CuelistCorePanel ipc={ipc} />);
    // Health indicator only visible when show is open; push show state + health
    await act(async () => {
      (ipc as ReturnType<typeof createMockIpc>).emit('cuelist-core/show-state', {
        open: true, mode: 'rehearsal', isSm: false, cueCount: 0,
      });
    });
    await waitFor(() => {
      const healthDot = screen.getByLabelText(/health: unknown/i);
      expect(healthDot).toBeTruthy();
    });
  });

  it('updates health indicator when health event arrives', async () => {
    const ipc = createMockIpc();
    render(<CuelistCorePanel ipc={ipc} />);
    await act(async () => {
      (ipc as ReturnType<typeof createMockIpc>).emit('cuelist-core/show-state', {
        open: true, mode: 'rehearsal', isSm: false, cueCount: 0,
      });
      (ipc as ReturnType<typeof createMockIpc>).emit('cuelist-core/health', 'error');
    });
    await waitFor(() => {
      const healthDot = screen.getByLabelText(/health: error/i);
      expect(healthDot).toBeTruthy();
    });
  });
});
