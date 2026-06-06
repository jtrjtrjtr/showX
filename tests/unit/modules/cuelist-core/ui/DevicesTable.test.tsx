// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { DevicesTable } from '../../../../../src/modules/cuelist-core/src/ui/DevicesTable.js';
import type { IpcBridge } from '../../../../../src/modules/cuelist-core/src/ui/CuelistCorePanel.js';
import type { Device } from '../../../../../src/modules/cuelist-core/src/document/devices.js';

afterEach(cleanup);

type IpcHandler = (...args: unknown[]) => void;

function createMockIpc(overrides: Partial<IpcBridge> = {}): IpcBridge & {
  emit: (channel: string, ...args: unknown[]) => void;
} {
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

const sampleDevices: Device[] = [
  { device_id: 'lx_eos', label: 'ETC Eos', transport: 'osc', host: '192.168.1.100', port: 8000, driver: 'eos' },
  { device_id: 'midi_con', label: 'MIDI Console', transport: 'midi', midi_port: 'IAC Bus 1' },
];

describe('DevicesTable — empty state', () => {
  it('renders "no devices" message when list is empty', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<DevicesTable ipc={ipc} />);
    await waitFor(() => {
      expect(screen.getByText(/no devices configured/i)).toBeTruthy();
    });
  });

  it('renders "+ Add Device" button in rehearsal mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<DevicesTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add device/i })).toBeTruthy();
    });
  });

  it('hides "+ Add Device" button in SHOW mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<DevicesTable ipc={ipc} mode="show" />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /add device/i })).toBeNull());
  });
});

describe('DevicesTable — populated state', () => {
  it('renders device rows', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDevices);
    render(<DevicesTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => {
      expect(screen.getByText('ETC Eos')).toBeTruthy();
      expect(screen.getByText('MIDI Console')).toBeTruthy();
    });
  });

  it('renders device IDs in mono font column', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDevices);
    render(<DevicesTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => {
      expect(screen.getByText('lx_eos')).toBeTruthy();
      expect(screen.getByText('midi_con')).toBeTruthy();
    });
  });

  it('renders Edit and Delete buttons per row in rehearsal mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDevices);
    render(<DevicesTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /edit/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0);
    });
  });

  it('hides Edit and Delete buttons in SHOW mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDevices);
    render(<DevicesTable ipc={ipc} mode="show" />);
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /edit/i })).toHaveLength(0));
    expect(screen.queryAllByRole('button', { name: /delete/i })).toHaveLength(0);
  });

  it('renders Test button for every row', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDevices);
    render(<DevicesTable ipc={ipc} mode="show" />);
    await waitFor(() => {
      const testBtns = screen.getAllByRole('button', { name: /test/i });
      expect(testBtns).toHaveLength(sampleDevices.length);
    });
  });

  it('renders status dots for each device', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDevices);
    render(<DevicesTable ipc={ipc} />);
    await waitFor(() => {
      const dots = screen.getAllByLabelText(/device status:/i);
      expect(dots.length).toBe(sampleDevices.length);
    });
  });
});

describe('DevicesTable — edit flow', () => {
  it('clicking Edit opens DeviceEditDialog', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(sampleDevices);
    render(<DevicesTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => screen.getAllByRole('button', { name: /edit/i }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0]);
    });
    expect(screen.getByRole('dialog', { name: /edit device/i })).toBeTruthy();
  });

  it('clicking + Add Device opens dialog in add mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<DevicesTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => screen.getByRole('button', { name: /add device/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add device/i }));
    });
    expect(screen.getByRole('dialog', { name: /add device/i })).toBeTruthy();
  });
});

describe('DevicesTable — delete confirmation', () => {
  it('clicking Delete shows confirmation dialog', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleDevices)  // get-devices
      .mockResolvedValueOnce([]);            // device-deps

    render(<DevicesTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => screen.getAllByRole('button', { name: /delete/i }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /delete lx_eos/i })[0]);
    });
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /confirm delete device/i })).toBeTruthy();
    });
  });

  it('Cancel closes confirmation dialog', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleDevices)
      .mockResolvedValueOnce([]);

    render(<DevicesTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => screen.getAllByRole('button', { name: /delete/i }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /delete lx_eos/i })[0]);
    });
    await waitFor(() => screen.getByRole('dialog', { name: /confirm delete/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });
    expect(screen.queryByRole('dialog', { name: /confirm delete/i })).toBeNull();
  });
});

describe('DevicesTable — test button', () => {
  it('test button calls cuelist-core/device-test', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleDevices)
      .mockResolvedValueOnce(true); // device-test returns true

    render(<DevicesTable ipc={ipc} />);
    await waitFor(() => screen.getAllByRole('button', { name: /test/i }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /test lx_eos/i })[0]);
    });
    expect(ipc.invoke).toHaveBeenCalledWith('cuelist-core/device-test', 'lx_eos');
  });
});

describe('DevicesTable — live updates', () => {
  it('updates device list when devices-changed event fires', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(<DevicesTable ipc={ipc} />);
    await waitFor(() => screen.getByText(/no devices configured/i));

    await act(async () => {
      (ipc as ReturnType<typeof createMockIpc>).emit('cuelist-core/devices-changed', sampleDevices);
    });
    await waitFor(() => {
      expect(screen.getByText('ETC Eos')).toBeTruthy();
    });
  });
});
