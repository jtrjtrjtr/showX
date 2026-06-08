import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';

const { mockGetAllWindows, mockSend } = vi.hoisted(() => ({
  mockGetAllWindows: vi.fn(() => [] as unknown[]),
  mockSend: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

const { mockOpenShowxPackage, mockSaveShowxPackage, mockReadFile } = vi.hoisted(() => ({
  mockOpenShowxPackage: vi.fn(),
  mockSaveShowxPackage: vi.fn().mockResolvedValue(undefined),
  mockReadFile: vi.fn().mockResolvedValue('{"meta":{"title":"Test Show","mode":"rehearsal"}}'),
}));

vi.mock('../../../src/modules/cuelist-core/dist/persistence/showxPackage.js', () => ({
  openShowxPackage: mockOpenShowxPackage,
  saveShowxPackage: mockSaveShowxPackage,
}));

vi.mock('node:fs', () => ({
  promises: { readFile: mockReadFile },
}));

import { registerRoutingBridge } from '../../../src/main/src/ipc/cuelistCoreRoutingBridge.js';
import { ActiveShowDoc } from '../../../src/main/src/runtime/ActiveShowDoc.js';
import type { IpcMainBridge } from '../../../src/main/src/ipc/index.js';

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function captureHandlers(): {
  ipc: IpcMainBridge;
  handlers: Record<string, HandlerFn>;
} {
  const handlers: Record<string, HandlerFn> = {};
  const ipc: IpcMainBridge = {
    handle: vi.fn((ch: string, fn: HandlerFn) => {
      handlers[ch] = fn;
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

function makeOpenResult(doc: Y.Doc) {
  return { doc, appliedMigrations: [], recoveredFromJson: false };
}

function addDeviceToDoc(doc: Y.Doc, deviceId: string): void {
  const m = new Y.Map<unknown>();
  m.set('device_id', deviceId);
  m.set('label', `Device ${deviceId}`);
  m.set('transport', 'osc');
  doc.transact(() => doc.getMap('devices').set(deviceId, m));
}

function makeRule(deviceId: string): Omit<{ rule_id: string; sort_key: number; match: { payload_type?: string }; target_device_id: string }, 'rule_id' | 'sort_key'> {
  return { match: { payload_type: 'osc' }, target_device_id: deviceId };
}

describe('registerRoutingBridge', () => {
  let testDoc: Y.Doc;
  let activeShow: ActiveShowDoc;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDoc = new Y.Doc();
    testDoc.transact(() => {
      testDoc.getMap('meta').set('mode', 'rehearsal');
      testDoc.getMap('devices');
      testDoc.getMap('routing');
    });
    mockOpenShowxPackage.mockResolvedValue(makeOpenResult(testDoc));
    logger = makeLogger();
    activeShow = new ActiveShowDoc(logger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── get-routing ──────────────────────────────────────────────────────────────

  describe('get-routing', () => {
    it('returns [] when no show is open', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);

      const result = await handlers['cuelist-core/get-routing']?.();
      expect(result).toEqual([]);
    });

    it('returns routing rules when show is open', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      addDeviceToDoc(testDoc, 'osc-1');
      await handlers['cuelist-core/routing-add']?.(null, makeRule('osc-1'));

      const result = (await handlers['cuelist-core/get-routing']?.()) as unknown[];
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ target_device_id: 'osc-1' });
    });

    it('logs a debug line per call', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await handlers['cuelist-core/get-routing']?.();
      expect(logger.debug).toHaveBeenCalledWith('routing.ipc', { channel: 'get-routing' });
    });
  });

  // ── routing-add ──────────────────────────────────────────────────────────────

  describe('routing-add', () => {
    it('returns the created rule with non-empty rule_id and sort_key', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');
      addDeviceToDoc(testDoc, 'dev-1');

      const result = (await handlers['cuelist-core/routing-add']?.(null, makeRule('dev-1'))) as {
        rule_id: string;
        sort_key: number;
        target_device_id: string;
      };

      expect(result.rule_id).toBeTruthy();
      expect(result.rule_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof result.sort_key).toBe('number');
      expect(result.target_device_id).toBe('dev-1');
    });

    it('assigns monotone-ascending sort_keys for sequential adds', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');
      addDeviceToDoc(testDoc, 'dev-a');
      addDeviceToDoc(testDoc, 'dev-b');

      const r1 = (await handlers['cuelist-core/routing-add']?.(null, makeRule('dev-a'))) as { sort_key: number };
      const r2 = (await handlers['cuelist-core/routing-add']?.(null, makeRule('dev-b'))) as { sort_key: number };

      expect(r2.sort_key).toBeGreaterThan(r1.sort_key);
    });

    it('broadcasts routing-changed after add', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');
      addDeviceToDoc(testDoc, 'osc-2');

      await handlers['cuelist-core/routing-add']?.(null, makeRule('osc-2'));

      expect(mockSend).toHaveBeenCalledWith(
        'cuelist-core/routing-changed',
        expect.arrayContaining([expect.objectContaining({ target_device_id: 'osc-2' })]),
      );
    });

    it('throws No show open when no active show', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);

      await expect(
        handlers['cuelist-core/routing-add']?.(null, makeRule('any')),
      ).rejects.toThrow('No show open');
    });

    it('logs debug on successful add', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');
      addDeviceToDoc(testDoc, 'log-dev');

      await handlers['cuelist-core/routing-add']?.(null, makeRule('log-dev'));

      expect(logger.debug).toHaveBeenCalledWith(
        'routing.ipc',
        expect.objectContaining({ channel: 'routing-add', ruleId: expect.any(String) }),
      );
    });
  });

  // ── routing-update ───────────────────────────────────────────────────────────

  describe('routing-update', () => {
    it('patches the rule in place and broadcasts', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');
      addDeviceToDoc(testDoc, 'update-dev');

      const created = (await handlers['cuelist-core/routing-add']?.(null, makeRule('update-dev'))) as { rule_id: string };
      mockSend.mockClear();

      const result = await handlers['cuelist-core/routing-update']?.(null, created.rule_id, {
        notes: 'updated note',
      });
      expect(result).toEqual({ ok: true });

      const rules = (await handlers['cuelist-core/get-routing']?.()) as Array<{ rule_id: string; notes?: string }>;
      const updated = rules.find((r) => r.rule_id === created.rule_id);
      expect(updated?.notes).toBe('updated note');

      expect(mockSend).toHaveBeenCalledWith(
        'cuelist-core/routing-changed',
        expect.any(Array),
      );
    });

    it('throws No show open when no active show', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);

      await expect(
        handlers['cuelist-core/routing-update']?.(null, 'any-id', { notes: 'x' }),
      ).rejects.toThrow('No show open');
    });
  });

  // ── routing-remove ───────────────────────────────────────────────────────────

  describe('routing-remove', () => {
    it('removes the rule and broadcasts', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');
      addDeviceToDoc(testDoc, 'rm-dev');

      const created = (await handlers['cuelist-core/routing-add']?.(null, makeRule('rm-dev'))) as { rule_id: string };
      mockSend.mockClear();

      const result = await handlers['cuelist-core/routing-remove']?.(null, created.rule_id);
      expect(result).toEqual({ ok: true });

      const rules = (await handlers['cuelist-core/get-routing']?.()) as unknown[];
      expect(rules).toHaveLength(0);

      expect(mockSend).toHaveBeenCalledWith('cuelist-core/routing-changed', []);
    });

    it('throws when rule does not exist', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      await expect(
        handlers['cuelist-core/routing-remove']?.(null, 'ghost-id'),
      ).rejects.toThrow("routing rule 'ghost-id' not found");
    });

    it('throws No show open when no active show', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);

      await expect(
        handlers['cuelist-core/routing-remove']?.(null, 'any-id'),
      ).rejects.toThrow('No show open');
    });
  });

  // ── routing-reorder ──────────────────────────────────────────────────────────

  describe('routing-reorder', () => {
    it('reorders rules so sort_keys match new order ascending', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');
      addDeviceToDoc(testDoc, 'dev-x');
      addDeviceToDoc(testDoc, 'dev-y');
      addDeviceToDoc(testDoc, 'dev-z');

      const r1 = (await handlers['cuelist-core/routing-add']?.(null, makeRule('dev-x'))) as { rule_id: string };
      const r2 = (await handlers['cuelist-core/routing-add']?.(null, makeRule('dev-y'))) as { rule_id: string };
      const r3 = (await handlers['cuelist-core/routing-add']?.(null, makeRule('dev-z'))) as { rule_id: string };

      // Reverse order
      const result = await handlers['cuelist-core/routing-reorder']?.(null, [r3.rule_id, r2.rule_id, r1.rule_id]);
      expect(result).toEqual({ ok: true });

      const rules = (await handlers['cuelist-core/get-routing']?.()) as Array<{ rule_id: string; sort_key: number }>;
      const ids = rules.map((r) => r.rule_id);
      expect(ids[0]).toBe(r3.rule_id);
      expect(ids[1]).toBe(r2.rule_id);
      expect(ids[2]).toBe(r1.rule_id);

      // sort_keys must be strictly ascending
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i]!.sort_key).toBeGreaterThan(rules[i - 1]!.sort_key);
      }
    });

    it('throws when a ruleId in the list does not exist', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      await expect(
        handlers['cuelist-core/routing-reorder']?.(null, ['ghost-id']),
      ).rejects.toThrow("routing rule 'ghost-id' not found in reorder");
    });

    it('throws No show open when no active show', async () => {
      const { ipc, handlers } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);

      await expect(
        handlers['cuelist-core/routing-reorder']?.(null, []),
      ).rejects.toThrow('No show open');
    });
  });

  // ── observe broadcast ────────────────────────────────────────────────────────

  describe('observe broadcast on external Y.Doc mutation', () => {
    it('broadcasts routing-changed when routing map is mutated directly', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const { ipc } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      mockSend.mockClear();

      // Directly mutate the routing map outside of any IPC handler
      addDeviceToDoc(testDoc, 'ext-dev');
      const m = new Y.Map<unknown>();
      m.set('rule_id', 'ext-rule-1');
      m.set('sort_key', 1000);
      m.set('match', { payload_type: 'osc' });
      m.set('target_device_id', 'ext-dev');
      m.set('notes', '');
      testDoc.transact(() => testDoc.getMap('routing').set('ext-rule-1', m));

      expect(mockSend).toHaveBeenCalledWith(
        'cuelist-core/routing-changed',
        expect.arrayContaining([expect.objectContaining({ target_device_id: 'ext-dev' })]),
      );
    });

    it('broadcasts empty list on show close', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const { ipc } = captureHandlers();
      registerRoutingBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      mockSend.mockClear();
      await activeShow.close();

      expect(mockSend).toHaveBeenCalledWith('cuelist-core/routing-changed', []);
    });
  });
});
