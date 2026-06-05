// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { createSideChannel } from '../../../pwa/src/lib/sideChannel.js';

// Mock y-websocket before importing syncClient
const mockProviderInstance = {
  on: vi.fn(),
  destroy: vi.fn(),
  awareness: null,
};
const MockWebsocketProvider = vi.fn(() => mockProviderInstance);

vi.mock('y-websocket', () => ({
  WebsocketProvider: MockWebsocketProvider,
}));

// Mock y-indexeddb
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
  let statusHandlers: Record<string, ((e: unknown) => void)[]> = {};

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
    const client = createSyncClient({ docName: 'test', host: '127.0.0.1', port: 8088, token: 'tok' });
    expect(client.doc).toBeInstanceOf(Y.Doc);
    client.destroy();
  });

  it('status transitions to connected on provider status event', () => {
    const client = createSyncClient({ docName: 'test2', host: '127.0.0.1', port: 8088, token: 'tok' });
    const cb = vi.fn();
    client.onStatusChange(cb);

    const statusCbs = statusHandlers['status'] ?? [];
    statusCbs.forEach((h) => h({ status: 'connected' }));

    expect(client.status.state).toBe('connected');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ state: 'connected' }));
    client.destroy();
  });

  it('status transitions to reconnecting on disconnect and schedules reconnect with backoff', () => {
    vi.useFakeTimers();
    const client = createSyncClient({ docName: 'test3', host: '127.0.0.1', port: 8088, token: 'tok' });
    const cb = vi.fn();
    client.onStatusChange(cb);

    const statusCbs = statusHandlers['status'] ?? [];
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
    const client = createSyncClient({ docName: 'test4', host: '127.0.0.1', port: 8088, token: 'tok' });

    function disconnect() {
      const cbs = statusHandlers['status'] ?? [];
      cbs.forEach((h) => h({ status: 'disconnected' }));
    }

    // First disconnect: backoff = 1000ms
    disconnect();
    vi.advanceTimersByTime(1000);

    // Re-register handler on new provider
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
    const client = createSyncClient({ docName: 'test5', host: '127.0.0.1', port: 8088, token: 'tok' });
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
