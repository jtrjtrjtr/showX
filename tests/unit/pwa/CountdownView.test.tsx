// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import * as Y from 'yjs';
import type { PairedSession } from '../../../pwa/src/lib/types.js';
import type { ClockDisplay } from '../../../pwa/src/hooks/useClock.js';

// ── Mock clock state ──────────────────────────────────────────────────────────

const mockClock: ClockDisplay = {
  totalFrames: 0,
  formatted: '00:00:00:00',
  rate: 25,
  dropFrame: false,
  running: false,
  source: 'internal',
  locked: false,
};

vi.mock('../../../pwa/src/hooks/useClock.js', () => ({
  useClock: () => mockClock,
}));

// ── Mock cue/playhead/go state ────────────────────────────────────────────────

const mockCues: { id: string; label: string; cue_number: string | null; pre_wait_ms: number; duration_hint_ms: number | null; sort_key: number; trigger: string; departments: string[]; payloads: unknown[]; armed: boolean; created_by: string; modified_at: string; created_at: string }[] = [];
let mockPlayheadCueId: string | null = null;
let mockArmedCueId: string | null = null;
let mockPreWait: { cue_id: string; cuelist_id: string; waiting_until: number } | null = null;
let mockLastDispatched: { cue_id: string } | null = null;

vi.mock('../../../pwa/src/hooks/useCuelist.js', () => ({
  useCuelist: () => ({
    cues: mockCues,
    cuelist: null,
    updateFields: vi.fn(),
    addCue: vi.fn(),
    insertCueAfter: vi.fn(),
    removeCue: vi.fn(),
    reorderCues: vi.fn(),
    setArmed: vi.fn(),
  }),
}));

vi.mock('../../../pwa/src/hooks/usePlayhead.js', () => ({
  usePlayhead: () => ({
    playhead: null,
    playheadCueId: mockPlayheadCueId,
    armedCueId: mockArmedCueId,
    setPlayhead: vi.fn(),
    advance: vi.fn(),
    retreat: vi.fn(),
    arm: vi.fn(),
    unarm: vi.fn(),
    isAuthority: false,
    smOnline: false,
  }),
}));

vi.mock('../../../pwa/src/hooks/useGoChannel.js', () => ({
  useGoChannel: () => ({
    go: vi.fn(),
    standby: vi.fn(),
    audition: vi.fn(),
    lastDispatched: mockLastDispatched,
    lastHistoric: null,
    firstGoAt: null,
    preWait: mockPreWait,
    lastAuditioned: null,
  }),
}));

// ── StationRouter deps ────────────────────────────────────────────────────────

const mockDoc = new Y.Doc();
const mockAwareness = {
  setLocalState: vi.fn(),
  setLocalStateField: vi.fn(),
  getStates: vi.fn(() => new Map()),
  on: vi.fn(),
  off: vi.fn(),
};
const mockSideChannel = {
  on: vi.fn(() => () => {}),
  off: vi.fn(),
  disconnect: vi.fn(),
  sendGoRequest: vi.fn(),
  sendArmRequest: vi.fn(),
  sendAuditionRequest: vi.fn(),
};
const mockConn = {
  doc: mockDoc,
  provider: { on: vi.fn(), off: vi.fn(), destroy: vi.fn(), awareness: mockAwareness },
  persistence: { destroy: vi.fn(), whenSynced: Promise.resolve() },
  awareness: mockAwareness,
  sideChannel: mockSideChannel,
  disconnect: vi.fn(),
};

vi.mock('../../../pwa/src/lib/ConnectionProvider.js', () => {
  const React = require('react');
  const ctx = React.createContext(null);
  return {
    ConnectionProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(ctx.Provider, { value: mockConn }, children),
    useConnection: () => mockConn,
    ConnectionContext: ctx,
  };
});

function seedCuelist(id: string) {
  const list = new Y.Map<unknown>();
  list.set('id', id);
  list.set('cues', new Y.Array<Y.Map<unknown>>());
  list.set('playhead', { cue_id: null, armed_cue_id: null });
  mockDoc.getArray<Y.Map<unknown>>('cuelists').insert(0, [list]);
}

vi.mock('../../../pwa/src/components/cuelist/SMMasterView.js', () => ({
  SMMasterView: () => <div data-testid="sm-master-view" />,
}));
vi.mock('../../../pwa/src/components/cuelist/OperatorView.js', () => ({
  OperatorView: () => <div data-testid="operator-view" />,
}));
vi.mock('../../../pwa/src/components/cuelist/variants/GenericOperatorView.js', () => ({
  GenericOperatorView: () => <div data-testid="generic-operator-view" />,
}));
vi.mock('../../../pwa/src/components/DiscoveryView.js', () => ({
  DiscoveryView: () => <div data-testid="discovery-view" />,
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { CountdownView } from '../../../pwa/src/components/cuelist/CountdownView.js';
import { StationRouter } from '../../../pwa/src/components/StationRouter.js';

const baseSession: PairedSession = {
  host: '10.0.0.1',
  port: 5300,
  token: 'tok-abc',
  display_name: 'Countdown',
  device_id: 'dev-countdown',
  paired_at: 1000,
};

// ── CountdownView direct tests ────────────────────────────────────────────────

describe('CountdownView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCues.length = 0;
    mockPlayheadCueId = null;
    mockArmedCueId = null;
    mockPreWait = null;
    mockLastDispatched = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders with data-testid="countdown-view"', () => {
    render(<CountdownView cuelistId="cuelist-1" />);
    expect(screen.getByTestId('countdown-view')).toBeInTheDocument();
  });

  it('renders timecode display with digits', () => {
    render(<CountdownView cuelistId="cuelist-1" />);
    expect(screen.getByTestId('timecode-display')).toBeInTheDocument();
    expect(screen.getByTestId('timecode-digits')).toBeInTheDocument();
    expect(screen.getByTestId('timecode-digits').textContent).toBe('00:00:00:00');
  });

  it('renders idle countdown block when no pre-wait active', () => {
    render(<CountdownView cuelistId="cuelist-1" />);
    expect(screen.getByTestId('countdown-idle')).toBeInTheDocument();
    expect(screen.queryByTestId('countdown-prewait')).toBeNull();
  });

  it('renders next-cue and last-fired blocks', () => {
    render(<CountdownView cuelistId="cuelist-1" />);
    expect(screen.getByTestId('countdown-next-cue')).toBeInTheDocument();
    expect(screen.getByTestId('countdown-last-fired')).toBeInTheDocument();
  });

  it('has NO GO button', () => {
    render(<CountdownView cuelistId="cuelist-1" />);
    expect(screen.queryByTestId('go-button')).toBeNull();
    expect(screen.queryByRole('button', { name: /^GO/i })).toBeNull();
  });

  it('has NO edit controls', () => {
    render(<CountdownView cuelistId="cuelist-1" />);
    expect(screen.queryByTestId('cue-edit-dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });

  it('shows pre-wait countdown block when preWait is set', () => {
    mockPreWait = {
      cue_id: 'cue-99',
      cuelist_id: 'cuelist-1',
      waiting_until: Date.now() + 5000,
    };
    render(<CountdownView cuelistId="cuelist-1" />);
    expect(screen.getByTestId('countdown-prewait')).toBeInTheDocument();
    expect(screen.queryByTestId('countdown-idle')).toBeNull();
  });

  it('shows standing cue label when playheadCueId is set', () => {
    mockCues.push({ id: 'cue-1', label: 'Opening', cue_number: '1', pre_wait_ms: 0, duration_hint_ms: null, sort_key: 0, trigger: 'manual', departments: [], payloads: [], armed: false, created_by: 'test', modified_at: '', created_at: '' });
    mockPlayheadCueId = 'cue-1';
    render(<CountdownView cuelistId="cuelist-1" />);
    const nextBlock = screen.getByTestId('countdown-next-cue');
    expect(nextBlock.textContent).toContain('Opening');
    expect(nextBlock.textContent).toContain('1');
  });

  it('shows last-fired cue label from lastDispatched', () => {
    mockCues.push({ id: 'cue-5', label: 'Lights up', cue_number: '5', pre_wait_ms: 0, duration_hint_ms: null, sort_key: 0, trigger: 'manual', departments: [], payloads: [], armed: false, created_by: 'test', modified_at: '', created_at: '' });
    mockLastDispatched = { cue_id: 'cue-5' } as typeof mockLastDispatched;
    render(<CountdownView cuelistId="cuelist-1" />);
    const lastBlock = screen.getByTestId('countdown-last-fired');
    expect(lastBlock.textContent).toContain('Lights up');
  });

  it('shows "then: next cue" when there are two cues and playhead is on first', () => {
    mockCues.push(
      { id: 'cue-1', label: 'Opening', cue_number: '1', pre_wait_ms: 0, duration_hint_ms: null, sort_key: 0, trigger: 'manual', departments: [], payloads: [], armed: false, created_by: 'test', modified_at: '', created_at: '' },
      { id: 'cue-2', label: 'Music starts', cue_number: '2', pre_wait_ms: 0, duration_hint_ms: null, sort_key: 1, trigger: 'manual', departments: [], payloads: [], armed: false, created_by: 'test', modified_at: '', created_at: '' },
    );
    mockPlayheadCueId = 'cue-1';
    render(<CountdownView cuelistId="cuelist-1" />);
    expect(screen.getByTestId('countdown-after-next')).toBeInTheDocument();
    expect(screen.getByTestId('countdown-after-next').textContent).toContain('Music starts');
  });

  it('does not show "then" block when playhead is on last cue', () => {
    mockCues.push({ id: 'cue-1', label: 'Finale', cue_number: '99', pre_wait_ms: 0, duration_hint_ms: null, sort_key: 0, trigger: 'manual', departments: [], payloads: [], armed: false, created_by: 'test', modified_at: '', created_at: '' });
    mockPlayheadCueId = 'cue-1';
    render(<CountdownView cuelistId="cuelist-1" />);
    expect(screen.queryByTestId('countdown-after-next')).toBeNull();
  });
});

// ── StationRouter routing tests ───────────────────────────────────────────────

describe('StationRouter routes countdown role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCues.length = 0;
    mockPlayheadCueId = null;
    mockArmedCueId = null;
    mockPreWait = null;
    mockLastDispatched = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    if (mockDoc.getArray<Y.Map<unknown>>('cuelists').length === 0) {
      seedCuelist('cuelist-1');
    }
    vi.stubGlobal('WebSocket', vi.fn(() => ({ onopen: null, onclose: null, onerror: null, close: vi.fn() })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders CountdownView when session.role === "countdown"', async () => {
    const session: PairedSession = { ...baseSession, role: 'countdown', show_id: 'show-1' };
    render(<StationRouter session={session} />);
    await waitFor(() => {
      expect(screen.getByTestId('countdown-view')).toBeInTheDocument();
    });
  });

  it('CountdownView has no GO button for countdown role', async () => {
    const session: PairedSession = { ...baseSession, role: 'countdown', show_id: 'show-1' };
    render(<StationRouter session={session} />);
    await waitFor(() => {
      expect(screen.getByTestId('countdown-view')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('go-button')).toBeNull();
    expect(screen.queryByRole('button', { name: /^GO/i })).toBeNull();
  });

  it('CountdownView renders timecode display for countdown role', async () => {
    const session: PairedSession = { ...baseSession, role: 'countdown', show_id: 'show-1' };
    render(<StationRouter session={session} />);
    await waitFor(() => {
      expect(screen.getByTestId('timecode-digits')).toBeInTheDocument();
    });
  });

  it('does NOT render CountdownView for operator role', async () => {
    const session: PairedSession = { ...baseSession, role: 'operator', show_id: 'show-1' };
    render(<StationRouter session={session} />);
    await waitFor(() => {
      expect(screen.queryByTestId('countdown-view')).toBeNull();
      expect(screen.getByTestId('operator-view')).toBeInTheDocument();
    });
  });

  it('does NOT render CountdownView for sm role', async () => {
    const session: PairedSession = { ...baseSession, role: 'sm', show_id: 'show-1' };
    render(<StationRouter session={session} />);
    await waitFor(() => {
      expect(screen.queryByTestId('countdown-view')).toBeNull();
      expect(screen.getByTestId('sm-master-view')).toBeInTheDocument();
    });
  });
});
