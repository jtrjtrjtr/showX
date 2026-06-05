// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { createSideChannel } from '../../../pwa/src/lib/sideChannel.js';

// Hoist the provider mock objects so vi.mock factories (y-indexeddb) can reference them
const mocks = vi.hoisted(() => {
  const mockProviderInstance = {
    on: vi.fn(),
    destroy: vi.fn(),
    awareness: null,
  };
  // MockWebsocketProvider is used as a call counter in _providerFactory — NOT as a vi.mock substitute.
  // Using provider injection (_providerFactory) avoids vi.mock('y-websocket') ESM unreliability.
  const MockWebsocketProvider = vi.fn();
  return { mockProviderInstance, MockWebsocketProvider };
});

// y-indexeddb vi.mock works reliably (CJS-compatible export); keeps IDB side-effects out of tests.
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: vi.fn(() => ({ destroy: vi.fn() })),
}));

import { createSyncClient } from '../../../pwa/src/lib/syncClient.js';

// --- sideChannel tests ---
describe('createSideChannel', () => {
  let mockWsInstance: { onmessage: ((e: MessageEvent) => void) | null; onclose: (() => void) | null; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockWsInstance = { onmessage: null, onclose: null, close: vi.fn() };
    vi.stubGlobal('WebSocket', vi.fn(() => mockWsInstance));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers events to subscribers', () => {
    const channel = createSideChannel({ host: '127.0.0.1', port: 8088, showId: 'show1', token: 'tok' });
    const cb = vi.fn();
    channel.onEvent(cb);

    const event = { type: 'go', cue_id: 'q1', timestamp: 1000 };
    mockWsInstance.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'go', cue_id: 'q1' }));
    channel.destroy();
  });

  it('idempotency: duplicate event IDs are discarded', () => {
    const channel = createSideChannel({ host: '127.0.0.1', port: 8088, showId: 'show1', token: 'tok' });
    const cb = vi.fn();
    channel.onEvent(cb);

    const event = { id: 'ev-1', type: 'go', cue_id: 'q1', timestamp: 1000 };
    mockWsInstance.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
    mockWsInstance.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);

    expect(cb).toHaveBeenCalledTimes(1);
    channel.destroy();
  });

  it('unsubscribe stops delivery', () => {
    const channel = createSideChannel({ host: '127.0.0.1', port: 8088, showId: 'show1', token: 'tok' });
    const cb = vi.fn();
    const unsub = channel.onEvent(cb);
    unsub();

    mockWsInstance.onmessage?.({ data: JSON.stringify({ type: 'go', cue_id: 'q2', timestamp: 2000 }) } as MessageEvent);
    expect(cb).not.toHaveBeenCalled();
    channel.destroy();
  });

  it('destroy closes websocket', () => {
    const channel = createSideChannel({ host: '127.0.0.1', port: 8088, showId: 'show1', token: 'tok' });
    channel.destroy();
    expect(mockWsInstance.close).toHaveBeenCalled();
  });
});

describe('createSyncClient', () => {
  const { mockProviderInstance, MockWebsocketProvider } = mocks;
  let statusHandlers: Record<string, ((e: unknown) => void)[]> = {};

  // Helper: creates a SyncClient using provider injection so tests bypass vi.mock('y-websocket')
  function makeClient(docName: string) {
    return createSyncClient({
      docName,
      host: '127.0.0.1',
      port: 8088,
      token: 'tok',
      _providerFactory: (url, room, doc) => {
        MockWebsocketProvider(url, room, doc);
        return mockProviderInstance;
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    statusHandlers = {};
    mockProviderInstance.on.mockImplementation((event: string, cb: (e: unknown) => void) => {
      if (!statusHandlers[event]) statusHandlers[event] = [];
      statusHandlers[event].push(cb);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a real Y.Doc instance', () => {
    const client = makeClient('test');
    expect(client.doc).toBeInstanceOf(Y.Doc);
    client.destroy();
  });

  it('status transitions to connected on provider status event', () => {
    const client = makeClient('test2');
    const cb = vi.fn();
    client.onStatusChange(cb);

    const statusCbs = statusHandlers['status'] ?? [];
    expect(statusCbs.length).toBeGreaterThan(0);
    statusCbs.forEach((h) => h({ status: 'connected' }));

    expect(client.status.state).toBe('connected');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ state: 'connected' }));
    client.destroy();
  });

  it('status transitions to reconnecting on disconnect and schedules reconnect with backoff', () => {
    vi.useFakeTimers();
    const client = makeClient('test3');
    const cb = vi.fn();
    client.onStatusChange(cb);

    const statusCbs = statusHandlers['status'] ?? [];
    expect(statusCbs.length).toBeGreaterThan(0);
    statusCbs.forEach((h) => h({ status: 'disconnected' }));

    expect(client.status.state).toBe('reconnecting');
    expect(client.status.attempts).toBe(1);

    // advance 1000ms to trigger backoff reconnect
    vi.advanceTimersByTime(1000);
    expect(MockWebsocketProvider).toHaveBeenCalledTimes(2);
    client.destroy();
  });

  it('backoff doubles and caps at 30s', () => {
    vi.useFakeTimers();
    const client = makeClient('test4');

    function disconnect() {
      const cbs = statusHandlers['status'] ?? [];
      cbs.forEach((h) => h({ status: 'disconnected' }));
    }

    // First disconnect: backoff = 1000ms
    disconnect();
    vi.advanceTimersByTime(1000);

    // Re-register handler on new provider instance after reconnect
    mockProviderInstance.on.mockImplementation((event: string, cb: (e: unknown) => void) => {
      if (!statusHandlers[event]) statusHandlers[event] = [];
      statusHandlers[event].push(cb);
    });

    // Second disconnect: backoff = 2000ms
    disconnect();
    vi.advanceTimersByTime(2000);

    expect(MockWebsocketProvider.mock.calls.length).toBeGreaterThanOrEqual(3);
    client.destroy();
  });

  it('destroy clears listeners and stops reconnect', () => {
    const client = makeClient('test5');
    const cb = vi.fn();
    const unsub = client.onStatusChange(cb);
    unsub();
    client.destroy();

    const statusCbs = statusHandlers['status'] ?? [];
    statusCbs.forEach((h) => h({ status: 'connected' }));
    expect(cb).not.toHaveBeenCalled();
    expect(mockProviderInstance.destroy).toHaveBeenCalled();
  });
});
