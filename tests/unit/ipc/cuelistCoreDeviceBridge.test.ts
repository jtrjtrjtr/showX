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

import { registerDeviceBridge } from '../../../src/main/src/ipc/cuelistCoreDeviceBridge.js';
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

function makeDevice(id: string, transport: 'osc' | 'midi' | 'msc' | 'dmx' = 'osc') {
  return { device_id: id, label: `Device ${id}`, transport };
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

describe('registerDeviceBridge', () => {
  let testDoc: Y.Doc;
  let activeShow: ActiveShowDoc;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDoc = new Y.Doc();
    // Set rehearsal mode explicitly so assertEditAllowed passes
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

  // ── get-devices ──────────────────────────────────────────────────────────────

  describe('get-devices', () => {
    it('returns [] when no show is open', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);

      const result = await handlers['cuelist-core/get-devices']?.();
      expect(result).toEqual([]);
    });

    it('returns device list when show is open', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      // Add a device directly to the doc
      const m = new Y.Map<unknown>();
      m.set('device_id', 'eos-1');
      m.set('label', 'EOS Console');
      m.set('transport', 'osc');
      testDoc.transact(() => testDoc.getMap('devices').set('eos-1', m));

      const result = (await handlers['cuelist-core/get-devices']?.()) as unknown[];
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ device_id: 'eos-1', label: 'EOS Console' });
    });
  });

  // ── device-add ───────────────────────────────────────────────────────────────

  describe('device-add', () => {
    it('adds device and returns ok', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      const result = await handlers['cuelist-core/device-add']?.(null, makeDevice('osc-1'));
      expect(result).toEqual({ ok: true });

      const devices = (await handlers['cuelist-core/get-devices']?.()) as unknown[];
      expect(devices).toHaveLength(1);
      expect(devices[0]).toMatchObject({ device_id: 'osc-1' });
    });

    it('throws DuplicateDeviceError when device_id already exists', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      await handlers['cuelist-core/device-add']?.(null, makeDevice('dup-1'));

      await expect(
        handlers['cuelist-core/device-add']?.(null, makeDevice('dup-1')),
      ).rejects.toThrow("device 'dup-1' already exists");
    });

    it('broadcasts devices-changed after successful add', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      await handlers['cuelist-core/device-add']?.(null, makeDevice('midi-1', 'midi'));

      expect(mockSend).toHaveBeenCalledWith(
        'cuelist-core/devices-changed',
        expect.arrayContaining([expect.objectContaining({ device_id: 'midi-1' })]),
      );
    });

    it('throws No show open when no active show', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);

      await expect(
        handlers['cuelist-core/device-add']?.(null, makeDevice('x')),
      ).rejects.toThrow('No show open');
    });
  });

  // ── device-update ────────────────────────────────────────────────────────────

  describe('device-update', () => {
    it('updates device fields and broadcasts', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      await handlers['cuelist-core/device-add']?.(null, makeDevice('dev-1'));
      mockSend.mockClear();

      const result = await handlers['cuelist-core/device-update']?.(null, 'dev-1', {
        label: 'Updated Label',
        host: '192.168.1.10',
      });
      expect(result).toEqual({ ok: true });

      const devices = (await handlers['cuelist-core/get-devices']?.()) as Array<{
        label: string;
        host?: string;
      }>;
      expect(devices[0]).toMatchObject({ label: 'Updated Label', host: '192.168.1.10' });

      expect(mockSend).toHaveBeenCalledWith(
        'cuelist-core/devices-changed',
        expect.any(Array),
      );
    });

    it('throws No show open when no active show', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);

      await expect(
        handlers['cuelist-core/device-update']?.(null, 'dev-1', { label: 'x' }),
      ).rejects.toThrow('No show open');
    });
  });

  // ── device-remove ────────────────────────────────────────────────────────────

  describe('device-remove', () => {
    it('throws DeviceInUseError when force=false and deps exist', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      // addDevice auto-creates a routing rule targeting the device
      await handlers['cuelist-core/device-add']?.(null, makeDevice('osc-dev'));

      await expect(
        handlers['cuelist-core/device-remove']?.(null, 'osc-dev', { force: false }),
      ).rejects.toThrow("device 'osc-dev' is referenced by routing rules");
    });

    it('succeeds with force=true and removes device + dependent routing rules', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      await handlers['cuelist-core/device-add']?.(null, makeDevice('force-dev'));

      const result = await handlers['cuelist-core/device-remove']?.(null, 'force-dev', {
        force: true,
      });
      expect(result).toEqual({ ok: true });

      const devices = (await handlers['cuelist-core/get-devices']?.()) as unknown[];
      expect(devices).toHaveLength(0);
    });

    it('throws No show open when no active show', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);

      await expect(
        handlers['cuelist-core/device-remove']?.(null, 'x', {}),
      ).rejects.toThrow('No show open');
    });
  });

  // ── device-deps ──────────────────────────────────────────────────────────────

  describe('device-deps', () => {
    it('returns [] when no show is open', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);

      const result = await handlers['cuelist-core/device-deps']?.(null, 'any-id');
      expect(result).toEqual([]);
    });

    it('returns routing rule IDs that reference the device', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      // addDevice auto-creates a routing rule with target_device_id = deviceId
      await handlers['cuelist-core/device-add']?.(null, makeDevice('dep-dev'));

      const deps = (await handlers['cuelist-core/device-deps']?.(null, 'dep-dev')) as string[];
      expect(deps.length).toBeGreaterThan(0);
      expect(deps.every((id) => typeof id === 'string')).toBe(true);
    });

    it('returns [] for a device with no referencing rules', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      // Add device via direct Y.Doc mutation (no auto-routing rule created this way)
      const m = new Y.Map<unknown>();
      m.set('device_id', 'no-deps');
      m.set('label', 'No Deps Device');
      m.set('transport', 'midi');
      testDoc.transact(() => testDoc.getMap('devices').set('no-deps', m));

      const deps = (await handlers['cuelist-core/device-deps']?.(null, 'no-deps')) as string[];
      expect(deps).toEqual([]);
    });
  });

  // ── device-test ──────────────────────────────────────────────────────────────

  describe('device-test', () => {
    it('returns true for an existing device', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      await handlers['cuelist-core/device-add']?.(null, makeDevice('test-dev'));

      const result = await handlers['cuelist-core/device-test']?.(null, 'test-dev');
      expect(result).toBe(true);
    });

    it('throws device not found for a missing device', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      await expect(
        handlers['cuelist-core/device-test']?.(null, 'ghost-dev'),
      ).rejects.toThrow('device not found: ghost-dev');
    });

    it('throws No show open when no active show', async () => {
      const { ipc, handlers } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);

      await expect(
        handlers['cuelist-core/device-test']?.(null, 'any'),
      ).rejects.toThrow('No show open');
    });
  });

  // ── observe broadcast ────────────────────────────────────────────────────────

  describe('observe broadcast on external Y.Doc mutation', () => {
    it('broadcasts devices-changed when devices map is mutated externally', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const { ipc } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      mockSend.mockClear();

      // Directly mutate the Y.Doc outside of the IPC handler
      const m = new Y.Map<unknown>();
      m.set('device_id', 'ext-dev');
      m.set('label', 'External Device');
      m.set('transport', 'osc');
      testDoc.transact(() => testDoc.getMap('devices').set('ext-dev', m));

      expect(mockSend).toHaveBeenCalledWith(
        'cuelist-core/devices-changed',
        expect.arrayContaining([expect.objectContaining({ device_id: 'ext-dev' })]),
      );
    });

    it('broadcasts empty list on show close', async () => {
      const fakeWin = makeFakeWindow();
      mockGetAllWindows.mockReturnValue([fakeWin]);

      const { ipc } = captureHandlers();
      registerDeviceBridge(activeShow, ipc, logger);
      await activeShow.open('/test/show.showx');

      mockSend.mockClear();
      await activeShow.close();

      expect(mockSend).toHaveBeenCalledWith('cuelist-core/devices-changed', []);
    });
  });
});
