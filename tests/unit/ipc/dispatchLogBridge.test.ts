import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetAllWindows, mockSend } = vi.hoisted(() => ({
  mockGetAllWindows: vi.fn(() => [] as unknown[]),
  mockSend: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

import { registerDispatchLogBridge } from '../../../src/main/src/ipc/dispatchLogBridge.js';
import type { IpcMainBridge } from '../../../src/main/src/ipc/index.js';
import type { DispatchRecord } from '../../../src/main/src/runtime/GoExecutor.js';

// ── Fake GoExecutor ───────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    ts: new Date().toISOString(),
    cue_id: 'cue-1',
    cue_label: 'House up',
    transport_summary: 'osc×1',
    payloads_dispatched: 1,
    payloads_failed: [],
    duration_ms: 3,
    fired_by: 'op-1',
    ...overrides,
  };
}

function makeFakeExecutor(initialLog: DispatchRecord[] = []) {
  const listeners = new Set<(r: DispatchRecord) => void>();
  const replyListeners = new Set<(u: { deviceId: string; status: string; updatedAt: number }) => void>();
  const log = [...initialLog];

  return {
    getLog: vi.fn(() => [...log]),
    onAppend: vi.fn((cb: (r: DispatchRecord) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
    onReplyStatus: vi.fn((cb: (u: { deviceId: string; status: string; updatedAt: number }) => void) => {
      replyListeners.add(cb);
      return () => replyListeners.delete(cb);
    }),
    _fire: (r: DispatchRecord) => {
      log.push(r);
      for (const cb of listeners) cb(r);
    },
    _fireReply: (u: { deviceId: string; status: string; updatedAt: number }) => {
      for (const cb of replyListeners) cb(u);
    },
  };
}

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

function captureHandlers() {
  const handlers = new Map<string, HandlerFn>();
  const ipc: IpcMainBridge = {
    handle: vi.fn((ch: string, fn: HandlerFn) => {
      handlers.set(ch, fn);
    }) as IpcMainBridge['handle'],
  };
  return { ipc, handlers };
}

function makeFakeWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: { send: mockSend },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerDispatchLogBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers dispatchLog:list handler', () => {
    const executor = makeFakeExecutor();
    const { ipc, handlers } = captureHandlers();
    registerDispatchLogBridge(executor as never, ipc);

    expect(handlers.has('dispatchLog:list')).toBe(true);
  });

  it('list handler returns current log', async () => {
    const records = [makeRecord({ cue_id: 'a' }), makeRecord({ cue_id: 'b' })];
    const executor = makeFakeExecutor(records);
    const { ipc, handlers } = captureHandlers();
    registerDispatchLogBridge(executor as never, ipc);

    const result = await handlers.get('dispatchLog:list')?.();
    expect(result).toHaveLength(2);
    expect((result as DispatchRecord[])[0].cue_id).toBe('a');
  });

  it('broadcasts dispatchLog:append to all windows on new record', () => {
    const fakeWin = makeFakeWindow();
    mockGetAllWindows.mockReturnValue([fakeWin]);

    const executor = makeFakeExecutor();
    const { ipc } = captureHandlers();
    registerDispatchLogBridge(executor as never, ipc);

    const record = makeRecord({ cue_id: 'new' });
    executor._fire(record);

    expect(mockSend).toHaveBeenCalledWith('dispatchLog:append', record);
  });

  it('does not send to destroyed windows', () => {
    const destroyedWin = { isDestroyed: vi.fn(() => true), webContents: { send: mockSend } };
    mockGetAllWindows.mockReturnValue([destroyedWin]);

    const executor = makeFakeExecutor();
    const { ipc } = captureHandlers();
    registerDispatchLogBridge(executor as never, ipc);

    executor._fire(makeRecord());

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('cleanup function removes append listener', () => {
    const fakeWin = makeFakeWindow();
    mockGetAllWindows.mockReturnValue([fakeWin]);

    const executor = makeFakeExecutor();
    const { ipc } = captureHandlers();
    const cleanup = registerDispatchLogBridge(executor as never, ipc);

    cleanup();
    executor._fire(makeRecord());

    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ── Ring buffer tests ─────────────────────────────────────────────────────────

describe('GoExecutor ring buffer', () => {
  it('caps at 100 records', async () => {
    // Test ring buffer indirectly via fake executor + GoExecutor export
    // We test the in-memory behavior by importing GoExecutor directly.
    // Use dynamic import to avoid circular mock issues.
    const { GoExecutor } = await import('../../../src/main/src/runtime/GoExecutor.js');

    const executor = new (GoExecutor as new (deps: Record<string, unknown>) => {
      getLog: () => DispatchRecord[];
      onAppend: (cb: (r: DispatchRecord) => void) => () => void;
      // @ts-expect-error — private in real type, public in test
      pushRecord: (r: DispatchRecord) => void;
    })({
      syncBroker: { publishSideChannel: () => {}, subscribeSideChannel: () => ({ id: 'x', unsubscribe: () => {} }) },
      events: { subscribe: () => ({ id: 'x', unsubscribe: () => {} }), publish: () => {} },
      output: {},
      log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => ({}) },
    });

    // Push 105 records via onAppend subscription to exercise pushRecord
    const appended: DispatchRecord[] = [];
    executor.onAppend((r) => appended.push(r));

    for (let i = 0; i < 105; i++) {
      // @ts-expect-error — pushRecord is private
      executor['pushRecord']({
        ts: new Date().toISOString(),
        cue_id: `cue-${i}`,
        cue_label: `Cue ${i}`,
        transport_summary: 'osc×1',
        payloads_dispatched: 1,
        payloads_failed: [],
        duration_ms: 1,
        fired_by: 'test',
      });
    }

    const log = executor.getLog();
    expect(log).toHaveLength(100);
    // Should have kept the LAST 100 (dropped first 5)
    expect(log[0].cue_id).toBe('cue-5');
    expect(log[99].cue_id).toBe('cue-104');

    // All 105 were broadcast to onAppend listeners
    expect(appended).toHaveLength(105);
  });

  it('onAppend listener receives new records in order', async () => {
    const { GoExecutor } = await import('../../../src/main/src/runtime/GoExecutor.js');
    const executor = new (GoExecutor as new (deps: Record<string, unknown>) => {
      getLog: () => DispatchRecord[];
      onAppend: (cb: (r: DispatchRecord) => void) => () => void;
    })({
      syncBroker: { publishSideChannel: () => {}, subscribeSideChannel: () => ({ id: 'x', unsubscribe: () => {} }) },
      events: { subscribe: () => ({ id: 'x', unsubscribe: () => {} }), publish: () => {} },
      output: {},
      log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => ({}) },
    });

    const received: string[] = [];
    executor.onAppend((r) => received.push(r.cue_id));

    for (const id of ['a', 'b', 'c']) {
      // @ts-expect-error — pushRecord is private
      executor['pushRecord']({
        ts: new Date().toISOString(),
        cue_id: id,
        cue_label: id,
        transport_summary: '—',
        payloads_dispatched: 0,
        payloads_failed: [],
        duration_ms: 0,
        fired_by: 'test',
      });
    }

    expect(received).toEqual(['a', 'b', 'c']);
  });
});
