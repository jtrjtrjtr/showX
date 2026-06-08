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
  mockReadFile: vi.fn().mockResolvedValue('{"meta":{"title":"Demo Show","mode":"rehearsal"}}'),
}));

vi.mock('../../../src/modules/cuelist-core/dist/persistence/showxPackage.js', () => ({
  openShowxPackage: mockOpenShowxPackage,
  saveShowxPackage: mockSaveShowxPackage,
}));

vi.mock('node:fs', () => ({
  promises: { readFile: mockReadFile },
}));

import { registerShowStateBridge } from '../../../src/main/src/ipc/cuelistCoreShowStateBridge.js';
import { ActiveShowDoc } from '../../../src/main/src/runtime/ActiveShowDoc.js';
import type { IpcMainBridge } from '../../../src/main/src/ipc/index.js';
import { buildDemoDoc } from '../../../src/modules/cuelist-core/dist/document/demoFactory.js';
import { addCuelist, getCuelists, getCues } from '../../../src/modules/cuelist-core/dist/document/cuelist.js';

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

interface ShowState {
  open: boolean;
  pkgPath?: string;
  title?: string;
  mode?: 'rehearsal' | 'show';
  isSm?: boolean;
  cuelist?: Array<{ id: string; name: string; cueCount: number }>;
}

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function captureHandlers(): {
  ipc: IpcMainBridge;
  handlers: Map<string, HandlerFn>;
} {
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

function makeOpenResult(doc: Y.Doc) {
  return { doc, appliedMigrations: [], recoveredFromJson: false };
}

describe('registerShowStateBridge', () => {
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = makeLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── get-state: no show open ───────────────────────────────────────────────

  describe('get-state: no show open', () => {
    it('returns { open: false } when no show is open', async () => {
      const activeShow = new ActiveShowDoc(logger);
      const { ipc, handlers } = captureHandlers();
      registerShowStateBridge(activeShow, ipc, logger);

      const state = await handlers.get('cuelist-core/get-state')?.() as ShowState;
      expect(state).toEqual({ open: false });
    });

    it('logs with open=false and counts=0', async () => {
      const activeShow = new ActiveShowDoc(logger);
      const { ipc, handlers } = captureHandlers();
      registerShowStateBridge(activeShow, ipc, logger);

      await handlers.get('cuelist-core/get-state')?.();
      expect(logger.debug).toHaveBeenCalledWith('showstate.ipc', {
        open: false,
        cuelistCount: 0,
        totalCues: 0,
      });
    });
  });

  // ── get-state: demo show — 25 cues ───────────────────────────────────────

  describe('get-state: demo show', () => {
    it('returns 1 cuelist with cueCount=25 for demo show fixture', async () => {
      const demoDoc = buildDemoDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(demoDoc));

      const activeShow = new ActiveShowDoc(logger);
      const { ipc, handlers } = captureHandlers();
      registerShowStateBridge(activeShow, ipc, logger);

      await activeShow.open('/demo/Demo Show.showx');

      const state = await handlers.get('cuelist-core/get-state')?.() as ShowState;
      expect(state.open).toBe(true);
      expect(state.cuelist).toHaveLength(1);
      expect(state.cuelist![0].cueCount).toBe(25);
    });

    it('includes pkgPath, title, mode, isSm in state', async () => {
      const demoDoc = buildDemoDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(demoDoc));

      const activeShow = new ActiveShowDoc(logger);
      const { ipc, handlers } = captureHandlers();
      registerShowStateBridge(activeShow, ipc, logger);

      await activeShow.open('/demo/Demo Show.showx');

      const state = await handlers.get('cuelist-core/get-state')?.() as ShowState;
      expect(state.pkgPath).toBe('/demo/Demo Show.showx');
      expect(state.title).toBe('Demo Show');
      expect(state.mode).toBe('rehearsal');
      expect(state.isSm).toBe(true);
    });
  });

  // ── observe: broadcast on open ───────────────────────────────────────────

  describe('observe broadcast on open', () => {
    it('broadcasts show-state immediately on show open', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const demoDoc = buildDemoDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(demoDoc));

      const activeShow = new ActiveShowDoc(logger);
      const { ipc } = captureHandlers();
      registerShowStateBridge(activeShow, ipc, logger);

      await activeShow.open('/demo/Demo Show.showx');

      expect(mockSend).toHaveBeenCalledWith(
        'cuelist-core/show-state',
        expect.objectContaining({ open: true, cuelist: expect.any(Array) }),
      );

      const lastCall = mockSend.mock.calls.find(
        (c: unknown[]) => c[0] === 'cuelist-core/show-state',
      );
      expect(lastCall).toBeDefined();
      const payload = lastCall![1] as ShowState;
      expect(payload.cuelist![0].cueCount).toBe(25);
    });
  });

  // ── observe: broadcast on Y.Doc mutation ────────────────────────────────

  describe('observe broadcast on mutation', () => {
    it('broadcasts updated cueCount when a cue is added to the doc', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const testDoc = new Y.Doc();
      testDoc.transact(() => {
        testDoc.getMap('meta').set('mode', 'rehearsal');
      });
      // Add a cuelist with 2 cues using the cuelist API
      const cuelistId = addCuelist(testDoc, 'Test Cuelist');
      const clArr = getCuelists(testDoc);
      const clMap = clArr.toArray().find((c) => c.get('id') === cuelistId)!;
      const cuesArr = getCues(clMap);
      testDoc.transact(() => {
        const c1 = new Y.Map<unknown>();
        c1.set('id', 'cue-001');
        c1.set('label', 'Cue 1');
        cuesArr.push([c1]);
        const c2 = new Y.Map<unknown>();
        c2.set('id', 'cue-002');
        c2.set('label', 'Cue 2');
        cuesArr.push([c2]);
      });

      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(testDoc));
      mockReadFile.mockResolvedValue('{"meta":{"title":"Test Show","mode":"rehearsal"}}');

      const activeShow = new ActiveShowDoc(logger);
      const { ipc } = captureHandlers();
      registerShowStateBridge(activeShow, ipc, logger);

      await activeShow.open('/test/show.showx');

      // Verify initial state
      const sent = mockSend.mock.calls.filter(
        (c: unknown[]) => c[0] === 'cuelist-core/show-state',
      );
      expect(sent.length).toBeGreaterThan(0);
      const initialPayload = sent[sent.length - 1][1] as ShowState;
      expect(initialPayload.cuelist![0].cueCount).toBe(2);

      mockSend.mockClear();

      // Add a 3rd cue — should trigger observe broadcast
      testDoc.transact(() => {
        const c3 = new Y.Map<unknown>();
        c3.set('id', 'cue-003');
        c3.set('label', 'Cue 3');
        cuesArr.push([c3]);
      });

      const afterMutation = mockSend.mock.calls.filter(
        (c: unknown[]) => c[0] === 'cuelist-core/show-state',
      );
      expect(afterMutation.length).toBeGreaterThan(0);
      const updatedPayload = afterMutation[afterMutation.length - 1][1] as ShowState;
      expect(updatedPayload.cuelist![0].cueCount).toBe(3);
    });
  });

  // ── observe: broadcast on close ──────────────────────────────────────────

  describe('observe broadcast on close', () => {
    it('broadcasts { open: false } when show is closed', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const demoDoc = buildDemoDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(demoDoc));

      const activeShow = new ActiveShowDoc(logger);
      const { ipc } = captureHandlers();
      registerShowStateBridge(activeShow, ipc, logger);

      await activeShow.open('/demo/Demo Show.showx');
      mockSend.mockClear();

      await activeShow.close();

      expect(mockSend).toHaveBeenCalledWith('cuelist-core/show-state', { open: false });
    });

    it('does not broadcast further after close', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const testDoc = new Y.Doc();
      testDoc.transact(() => {
        testDoc.getMap('meta').set('mode', 'rehearsal');
      });
      addCuelist(testDoc, 'Orphan');
      const clArr = getCuelists(testDoc);
      const clMap = clArr.toArray()[0]!;
      const cuesArr = getCues(clMap);

      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(testDoc));
      mockReadFile.mockResolvedValue('{"meta":{"title":"T","mode":"rehearsal"}}');

      const activeShow = new ActiveShowDoc(logger);
      const { ipc } = captureHandlers();
      registerShowStateBridge(activeShow, ipc, logger);

      await activeShow.open('/test/show.showx');
      await activeShow.close();
      mockSend.mockClear();

      // Mutation after close should NOT trigger broadcast (observer unsubscribed)
      testDoc.transact(() => {
        const c = new Y.Map<unknown>();
        c.set('id', 'post-close');
        c.set('label', 'Post Close');
        cuesArr.push([c]);
      });

      const showStateCalls = mockSend.mock.calls.filter(
        (c: unknown[]) => c[0] === 'cuelist-core/show-state',
      );
      expect(showStateCalls).toHaveLength(0);
    });
  });
});
