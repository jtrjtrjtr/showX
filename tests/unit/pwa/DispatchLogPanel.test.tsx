// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import type { DispatchRecord } from '../../../pwa/src/components/DispatchLogPanel.js';

afterEach(() => cleanup());

function makeRecord(overrides: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    ts: '2026-06-11T10:30:45.123Z',
    cue_id: 'cue-1',
    cue_label: 'House up',
    transport_summary: 'osc×2',
    payloads_dispatched: 2,
    payloads_failed: [],
    duration_ms: 5,
    fired_by: 'op-1',
    ...overrides,
  };
}

function mockDispatchLogApi(overrides: Partial<{
  list: () => Promise<DispatchRecord[]>;
  onAppend: (cb: (r: DispatchRecord) => void) => () => void;
}> = {}) {
  const api = {
    list: vi.fn(async () => [] as DispatchRecord[]),
    onAppend: vi.fn((_cb: (r: DispatchRecord) => void) => () => {}),
    ...overrides,
  };
  vi.stubGlobal('showxApi', { dispatchLog: api });
  return api;
}

describe('DispatchLogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders empty state when no cues fired', async () => {
    mockDispatchLogApi();
    const { DispatchLogPanel } = await import('../../../pwa/src/components/DispatchLogPanel.js');
    render(<DispatchLogPanel />);

    await waitFor(() => {
      expect(screen.getByText('No cues fired yet')).toBeInTheDocument();
    });
  });

  it('renders existing records from list()', async () => {
    const records = [
      makeRecord({ cue_id: 'a', cue_label: 'Act 1 open' }),
      makeRecord({ cue_id: 'b', cue_label: 'Blackout' }),
    ];
    mockDispatchLogApi({ list: async () => records });
    const { DispatchLogPanel } = await import('../../../pwa/src/components/DispatchLogPanel.js');
    render(<DispatchLogPanel />);

    await waitFor(() => {
      expect(screen.getByText('Blackout')).toBeInTheDocument();
      expect(screen.getByText('Act 1 open')).toBeInTheDocument();
    });
  });

  it('shows dispatch-log-panel testid', async () => {
    mockDispatchLogApi();
    const { DispatchLogPanel } = await import('../../../pwa/src/components/DispatchLogPanel.js');
    render(<DispatchLogPanel />);

    expect(screen.getByTestId('dispatch-log-panel')).toBeInTheDocument();
  });

  it('shows duration and transport summary in row', async () => {
    const rec = makeRecord({ transport_summary: 'osc×2', duration_ms: 12 });
    mockDispatchLogApi({ list: async () => [rec] });
    const { DispatchLogPanel } = await import('../../../pwa/src/components/DispatchLogPanel.js');
    render(<DispatchLogPanel />);

    await waitFor(() => {
      const panel = screen.getByTestId('dispatch-log-panel');
      expect(panel.textContent).toContain('osc×2');
      expect(panel.textContent).toContain('12ms');
    });
  });

  it('subscribes to onAppend and shows new record', async () => {
    let appendCb: ((r: DispatchRecord) => void) | null = null;
    mockDispatchLogApi({
      onAppend: (cb) => {
        appendCb = cb;
        return () => {};
      },
    });
    const { DispatchLogPanel } = await import('../../../pwa/src/components/DispatchLogPanel.js');
    render(<DispatchLogPanel />);

    await waitFor(() => expect(appendCb).not.toBeNull());

    // Fire a new record via onAppend
    appendCb!(makeRecord({ cue_label: 'Storm starts' }));

    await waitFor(() => {
      expect(screen.getByText('Storm starts')).toBeInTheDocument();
    });
  });

  it('renders failed counts in red for rows with failures', async () => {
    const rec = makeRecord({
      cue_label: 'Pyro fire',
      payloads_failed: [{ payload_id: 'p1', error: 'no route' }],
      payloads_dispatched: 0,
    });
    mockDispatchLogApi({ list: async () => [rec] });
    const { DispatchLogPanel } = await import('../../../pwa/src/components/DispatchLogPanel.js');
    render(<DispatchLogPanel />);

    await waitFor(() => {
      const panel = screen.getByTestId('dispatch-log-panel');
      expect(panel.textContent).toContain('1fail');
    });
  });

  it('expands failure reasons on click when row has failures', async () => {
    const rec = makeRecord({
      cue_label: 'Pyro fire',
      payloads_failed: [{ payload_id: 'p1', error: 'no route' }],
    });
    mockDispatchLogApi({ list: async () => [rec] });
    const { DispatchLogPanel } = await import('../../../pwa/src/components/DispatchLogPanel.js');
    render(<DispatchLogPanel />);

    await waitFor(() => screen.getByTestId('dispatch-row-0'));

    fireEvent.click(screen.getByTestId('dispatch-row-0'));

    await waitFor(() => {
      const panel = screen.getByTestId('dispatch-log-panel');
      expect(panel.textContent).toContain('no route');
    });
  });

  it('collapses the panel on header click', async () => {
    mockDispatchLogApi();
    const { DispatchLogPanel } = await import('../../../pwa/src/components/DispatchLogPanel.js');
    render(<DispatchLogPanel />);

    const panel = screen.getByTestId('dispatch-log-panel');
    // List is visible initially
    await waitFor(() => expect(screen.getByTestId('dispatch-log-list')).toBeInTheDocument());

    // Click the header chevron to collapse
    const header = panel.querySelector('div[style*="cursor"]') as HTMLElement;
    fireEvent.click(header);

    await waitFor(() => {
      expect(screen.queryByTestId('dispatch-log-list')).not.toBeInTheDocument();
    });
  });

  it('renders nothing when dispatchLog API is unavailable', async () => {
    vi.stubGlobal('showxApi', undefined);
    const { DispatchLogPanel } = await import('../../../pwa/src/components/DispatchLogPanel.js');
    render(<DispatchLogPanel />);

    // Should still render the panel shell (section/header) but no data — just empty state
    expect(screen.getByTestId('dispatch-log-panel')).toBeInTheDocument();
  });
});
