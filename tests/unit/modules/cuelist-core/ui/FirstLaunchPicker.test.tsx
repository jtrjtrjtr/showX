// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { FirstLaunchPicker } from '../../../../../src/modules/cuelist-core/src/ui/FirstLaunchPicker.js';
import type { IpcBridge } from '../../../../../src/modules/cuelist-core/src/ui/CuelistCorePanel.js';

afterEach(cleanup);

function createMockIpc(overrides: Partial<IpcBridge> = {}): IpcBridge {
  return {
    invoke: vi.fn().mockResolvedValue(null),
    on: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

describe('FirstLaunchPicker', () => {
  it('renders three cards with correct titles', () => {
    const ipc = createMockIpc();
    render(<FirstLaunchPicker ipc={ipc} />);
    expect(screen.getByText('Open Demo Show')).toBeTruthy();
    expect(screen.getByText('Open Existing Show')).toBeTruthy();
    expect(screen.getByText('Create New from Scratch')).toBeTruthy();
  });

  it('renders three CTA buttons', () => {
    const ipc = createMockIpc();
    render(<FirstLaunchPicker ipc={ipc} />);
    expect(screen.getByRole('button', { name: 'Open Demo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Browse…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create…' })).toBeTruthy();
  });

  it('renders subtext for each card', () => {
    const ipc = createMockIpc();
    render(<FirstLaunchPicker ipc={ipc} />);
    expect(screen.getByText(/25 cues, 3 devices/)).toBeTruthy();
    expect(screen.getByText(/Browse to a \.showx file/)).toBeTruthy();
    expect(screen.getByText(/blank show/)).toBeTruthy();
  });

  it('clicking Open Demo invokes cuelist-core:open-demo', async () => {
    const ipc = createMockIpc({
      invoke: vi.fn().mockResolvedValue({ path: '/docs/ShowX/Demo Show.showx' }),
    });
    render(<FirstLaunchPicker ipc={ipc} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }));
    });

    expect(ipc.invoke).toHaveBeenCalledWith('cuelist-core:open-demo');
  });

  it('after Open Demo returns path, invokes cuelist-core/open-show with that path', async () => {
    const demoPath = '/Users/tester/Documents/ShowX/Demo Show.showx';
    const invoke = vi.fn()
      .mockResolvedValueOnce({ path: demoPath })  // open-demo
      .mockResolvedValueOnce(undefined);           // open-show
    const ipc = createMockIpc({ invoke });
    render(<FirstLaunchPicker ipc={ipc} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }));
    });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('cuelist-core/open-show', demoPath);
    });
  });

  it('clicking Open Demo when result is cancelled does not invoke open-show', async () => {
    const invoke = vi.fn().mockResolvedValue({ cancelled: true });
    const ipc = createMockIpc({ invoke });
    render(<FirstLaunchPicker ipc={ipc} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }));
    });

    expect(invoke).not.toHaveBeenCalledWith(
      'cuelist-core/open-show',
      expect.anything(),
    );
  });

  it('clicking Browse invokes cuelist-core:open-file-picker', async () => {
    const ipc = createMockIpc({
      invoke: vi.fn().mockResolvedValue({ cancelled: true }),
    });
    render(<FirstLaunchPicker ipc={ipc} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    });

    expect(ipc.invoke).toHaveBeenCalledWith('cuelist-core:open-file-picker');
  });

  it('clicking Create invokes cuelist-core:create-new', async () => {
    const ipc = createMockIpc({
      invoke: vi.fn().mockResolvedValue({ cancelled: true }),
    });
    render(<FirstLaunchPicker ipc={ipc} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create…' }));
    });

    expect(ipc.invoke).toHaveBeenCalledWith('cuelist-core:create-new');
  });

  it('shows error alert when IPC rejects', async () => {
    const ipc = createMockIpc({
      invoke: vi.fn().mockRejectedValue(new Error('demo src not found')),
    });
    render(<FirstLaunchPicker ipc={ipc} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }));
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('demo src not found');
    });
  });

  it('calls onShowOpened callback after successful open', async () => {
    const demoPath = '/docs/ShowX/Demo Show.showx';
    const invoke = vi.fn()
      .mockResolvedValueOnce({ path: demoPath })
      .mockResolvedValueOnce(undefined);
    const ipc = createMockIpc({ invoke });
    const onShowOpened = vi.fn();

    render(<FirstLaunchPicker ipc={ipc} onShowOpened={onShowOpened} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }));
    });

    await waitFor(() => {
      expect(onShowOpened).toHaveBeenCalledWith(demoPath);
    });
  });

  it('Enter key on card region triggers the demo action', async () => {
    const invoke = vi.fn().mockResolvedValue({ cancelled: true });
    const ipc = createMockIpc({ invoke });
    render(<FirstLaunchPicker ipc={ipc} />);

    const demoCard = screen.getByRole('region', { name: 'Open Demo Show' });

    await act(async () => {
      fireEvent.keyDown(demoCard, { key: 'Enter' });
    });

    expect(invoke).toHaveBeenCalledWith('cuelist-core:open-demo');
  });

  it('all three CTA buttons are keyboard-focusable (have tabIndex)', () => {
    const ipc = createMockIpc();
    render(<FirstLaunchPicker ipc={ipc} />);
    const openDemoBtn = screen.getByRole('button', { name: 'Open Demo' });
    const browseBtn = screen.getByRole('button', { name: 'Browse…' });
    const createBtn = screen.getByRole('button', { name: 'Create…' });
    // Buttons are naturally focusable; tabIndex is not negative
    expect(openDemoBtn.getAttribute('tabindex')).not.toBe('-1');
    expect(browseBtn.getAttribute('tabindex')).not.toBe('-1');
    expect(createBtn.getAttribute('tabindex')).not.toBe('-1');
  });
});
