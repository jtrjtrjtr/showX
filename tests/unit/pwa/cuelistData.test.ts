// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';

// ── Mock helpers (no vi.mock needed — use factory injection) ─────────────────

function makeMockAwareness() {
  return {
    setLocalState: vi.fn(),
    setLocalStateField: vi.fn(),
  };
}

function makeMockProvider(awareness = makeMockAwareness()) {
  return {
    awareness,
    disconnect: vi.fn(),
    on: vi.fn(),
  };
}

function makeMockPersistence() {
  return {
    whenSynced: Promise.resolve(),
    destroy: vi.fn(),
  };
}

import { connectToShow } from '../../../pwa/src/lib/cuelistData.js';

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'test-uuid') });
  // Stub WebSocket for SideChannelClient
  vi.stubGlobal('WebSocket', vi.fn(() => ({
    onopen: null, onclose: null, onerror: null, onmessage: null,
    send: vi.fn(), close: vi.fn(),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const baseOpts = {
  wsUrl: 'ws://showx.local:5300/yjs/show-1',
  sideChannelUrl: 'ws://showx.local:5300/events/show-1',
  show_id: 'show-1',
  pairingToken: 'tok',
  operator_id: 'op1',
  station_id: 'station-1',
  display_name: 'LX Op',
  owned_departments: ['LX'] as const,
  watched_departments: [] as const,
  presence_color: '#ff0000',
};

describe('connectToShow', () => {
  it('returns a Connection with a Y.Doc instance', async () => {
    const mockProvider = makeMockProvider();
    const mockPersistence = makeMockPersistence();
    const conn = await connectToShow({
      ...baseOpts,
      _providerFactory: () => mockProvider as unknown as import('y-websocket').WebsocketProvider,
      _persistenceFactory: () => mockPersistence as unknown as import('y-indexeddb').IndexeddbPersistence,
    });
    expect(conn.doc).toBeInstanceOf(Y.Doc);
    conn.disconnect();
  });

  it('builds provider URL with token query param', async () => {
    const capturedUrls: string[] = [];
    const mockProvider = makeMockProvider();
    const mockPersistence = makeMockPersistence();
    await connectToShow({
      ...baseOpts,
      _providerFactory: (url) => {
        capturedUrls.push(url);
        return mockProvider as unknown as import('y-websocket').WebsocketProvider;
      },
      _persistenceFactory: () => mockPersistence as unknown as import('y-indexeddb').IndexeddbPersistence,
    });
    expect(capturedUrls[0]).toContain('?token=tok');
    expect(capturedUrls[0]).toContain('ws://showx.local:5300/yjs/show-1');
  });

  it('creates IndexedDB persistence keyed by show:<show_id>', async () => {
    const capturedNames: string[] = [];
    const mockProvider = makeMockProvider();
    await connectToShow({
      ...baseOpts,
      _providerFactory: () => mockProvider as unknown as import('y-websocket').WebsocketProvider,
      _persistenceFactory: (name, d) => {
        capturedNames.push(name);
        return { whenSynced: Promise.resolve(), destroy: vi.fn() } as unknown as import('y-indexeddb').IndexeddbPersistence;
      },
    });
    expect(capturedNames[0]).toBe('show:show-1');
  });

  it('sets awareness local state with required fields', async () => {
    const awareness = makeMockAwareness();
    const mockProvider = makeMockProvider(awareness);
    const mockPersistence = makeMockPersistence();
    const conn = await connectToShow({
      ...baseOpts,
      _providerFactory: () => mockProvider as unknown as import('y-websocket').WebsocketProvider,
      _persistenceFactory: () => mockPersistence as unknown as import('y-indexeddb').IndexeddbPersistence,
    });
    expect(awareness.setLocalState).toHaveBeenCalledWith(
      expect.objectContaining({
        operator_id: 'op1',
        station_id: 'station-1',
        display_name: 'LX Op',
      }),
    );
    conn.disconnect();
  });

  it('heartbeat ticker updates awareness every 1000ms', async () => {
    vi.useFakeTimers();
    const awareness = makeMockAwareness();
    const mockProvider = makeMockProvider(awareness);
    const mockPersistence = makeMockPersistence();
    const conn = await connectToShow({
      ...baseOpts,
      _providerFactory: () => mockProvider as unknown as import('y-websocket').WebsocketProvider,
      _persistenceFactory: () => mockPersistence as unknown as import('y-indexeddb').IndexeddbPersistence,
    });
    vi.advanceTimersByTime(1000);
    expect(awareness.setLocalStateField).toHaveBeenCalledWith(
      'last_heartbeat_at',
      expect.any(String),
    );
    conn.disconnect();
  });

  it('disconnect calls provider.disconnect and persistence.destroy', async () => {
    const mockProvider = makeMockProvider();
    const mockPersistence = makeMockPersistence();
    const conn = await connectToShow({
      ...baseOpts,
      _providerFactory: () => mockProvider as unknown as import('y-websocket').WebsocketProvider,
      _persistenceFactory: () => mockPersistence as unknown as import('y-indexeddb').IndexeddbPersistence,
    });
    conn.disconnect();
    expect(mockProvider.disconnect).toHaveBeenCalled();
    expect(mockPersistence.destroy).toHaveBeenCalled();
  });
});
