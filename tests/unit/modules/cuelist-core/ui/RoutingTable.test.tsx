// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { RoutingTable } from '../../../../../src/modules/cuelist-core/src/ui/RoutingTable.js';
import type { IpcBridge } from '../../../../../src/modules/cuelist-core/src/ui/CuelistCorePanel.js';
import type { RoutingRule } from '../../../../../src/modules/cuelist-core/src/document/routing.js';
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
  { device_id: 'lx_eos', label: 'ETC Eos', transport: 'osc', host: '192.168.1.100', port: 8000 },
  { device_id: 'midi_con', label: 'MIDI Console', transport: 'midi' },
];

const sampleRules: RoutingRule[] = [
  { rule_id: 'rule-1', sort_key: 1000, match: { payload_type: 'osc' }, target_device_id: 'lx_eos' },
  { rule_id: 'rule-2', sort_key: 2000, match: { payload_type: 'midi' }, target_device_id: 'midi_con' },
];

describe('RoutingTable — empty state', () => {
  it('renders "no routing rules" message when list is empty', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])   // get-routing
      .mockResolvedValueOnce([]);  // get-devices

    render(<RoutingTable ipc={ipc} />);
    await waitFor(() => {
      expect(screen.getByText(/no routing rules configured/i)).toBeTruthy();
    });
  });

  it('renders "+ Add Rule" button in rehearsal mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add routing rule/i })).toBeTruthy();
    });
  });

  it('hides "+ Add Rule" button in SHOW mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<RoutingTable ipc={ipc} mode="show" />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /add rule/i })).toBeNull());
  });
});

describe('RoutingTable — populated state', () => {
  it('renders rule rows with match descriptions', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => {
      expect(screen.getByText(/type=osc/i)).toBeTruthy();
      expect(screen.getByText(/type=midi/i)).toBeTruthy();
    });
  });

  it('renders target device label with device_id', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => {
      expect(screen.getByText(/ETC Eos \(lx_eos\)/)).toBeTruthy();
      expect(screen.getByText(/MIDI Console \(midi_con\)/)).toBeTruthy();
    });
  });

  it('renders Edit and Delete buttons per row in rehearsal mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /edit/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /delete/i }).length).toBeGreaterThan(0);
    });
  });

  it('hides Edit and Delete buttons in SHOW mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="show" />);
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /edit/i })).toHaveLength(0));
    expect(screen.queryAllByRole('button', { name: /delete/i })).toHaveLength(0);
  });

  it('renders priority numbers (1-indexed) for rules', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => {
      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
    });
  });
});

describe('RoutingTable — edit flow', () => {
  it('clicking + Add Rule opens RoutingRuleEditDialog', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]).mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => screen.getByRole('button', { name: /add routing rule/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add routing rule/i }));
    });
    expect(screen.getByRole('dialog', { name: /add routing rule/i })).toBeTruthy();
  });

  it('clicking Edit opens dialog in edit mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => screen.getAllByRole('button', { name: /edit/i }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /edit rule/i })[0]);
    });
    expect(screen.getByRole('dialog', { name: /edit routing rule/i })).toBeTruthy();
  });
});

describe('RoutingTable — delete confirmation', () => {
  it('clicking Delete shows confirmation dialog', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => screen.getAllByRole('button', { name: /delete/i }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /delete rule rule-1/i })[0]);
    });
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /confirm delete routing rule/i })).toBeTruthy();
    });
  });

  it('confirms delete calls cuelist-core/routing-remove', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices)
      .mockResolvedValueOnce(undefined)  // routing-remove
      .mockResolvedValueOnce([])         // get-routing reload
      .mockResolvedValueOnce(sampleDevices); // get-devices reload

    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => screen.getAllByRole('button', { name: /delete rule rule-1/i }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /delete rule rule-1/i })[0]);
    });
    await waitFor(() => screen.getByRole('button', { name: /confirm delete rule/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm delete rule/i }));
    });
    await waitFor(() => {
      expect(ipc.invoke).toHaveBeenCalledWith('cuelist-core/routing-remove', 'rule-1');
    });
  });
});

describe('RoutingTable — live updates', () => {
  it('updates rules when routing-changed event fires', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    render(<RoutingTable ipc={ipc} />);
    await waitFor(() => screen.getByText(/no routing rules configured/i));

    await act(async () => {
      (ipc as ReturnType<typeof createMockIpc>).emit('cuelist-core/routing-changed', sampleRules);
    });
    await waitFor(() => {
      expect(screen.getByText(/type=osc/i)).toBeTruthy();
    });
  });
});

describe('RoutingTable — drag-and-drop reorder', () => {
  it('rows are draggable in rehearsal mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="rehearsal" />);
    await waitFor(() => screen.getByText(/type=osc/i));
    const table = screen.getByRole('table', { name: /routing rules/i });
    const rows = table.querySelectorAll('tbody tr');
    expect((rows[0] as HTMLElement).draggable).toBe(true);
  });

  it('rows are not draggable in SHOW mode', async () => {
    const ipc = createMockIpc();
    (ipc.invoke as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(sampleRules)
      .mockResolvedValueOnce(sampleDevices);

    render(<RoutingTable ipc={ipc} mode="show" />);
    await waitFor(() => screen.getByText(/type=osc/i));
    const table = screen.getByRole('table', { name: /routing rules/i });
    const rows = table.querySelectorAll('tbody tr');
    expect((rows[0] as HTMLElement).draggable).toBe(false);
  });
});
