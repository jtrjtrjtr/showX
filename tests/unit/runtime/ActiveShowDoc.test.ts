import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';

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
  promises: {
    readFile: mockReadFile,
  },
}));

import { ActiveShowDoc } from '../../../src/main/src/runtime/ActiveShowDoc.js';

const SAVE_DEBOUNCE_MS = 350;

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

let _docSeq = 0;
function freshDoc(): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap('meta').set('show_id', `00000000-0000-0000-0000-${String(++_docSeq).padStart(12, '0')}`);
  return doc;
}

function makeOpenResult(doc?: Y.Doc) {
  return {
    doc: doc ?? freshDoc(),
    appliedMigrations: [],
    recoveredFromJson: false,
  };
}

describe('ActiveShowDoc', () => {
  let logger: ReturnType<typeof makeLogger>;
  let activeShow: ActiveShowDoc;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenShowxPackage.mockResolvedValue(makeOpenResult());
    logger = makeLogger();
    activeShow = new ActiveShowDoc(logger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('open', () => {
    it('creates Y.Doc and returns it via getDoc()', async () => {
      const doc = freshDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

      await activeShow.open('/shows/test.showx');

      expect(activeShow.getDoc()).toBe(doc);
    });

    it('sets pkgPath and activeShow meta', async () => {
      mockReadFile.mockResolvedValue('{"meta":{"title":"My Show","mode":"show"}}');

      await activeShow.open('/shows/myshow.showx');

      expect(activeShow.getPkgPath()).toBe('/shows/myshow.showx');
      const meta = activeShow.getActiveShow();
      expect(meta).toMatchObject({
        pkgPath: '/shows/myshow.showx',
        title: 'My Show',
        mode: 'show',
      });
    });

    it('falls back to basename title if show.json is missing', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await activeShow.open('/shows/demo-show.showx');

      expect(activeShow.getActiveShow()?.title).toBe('demo-show');
    });

    it('logs active_show.opened', async () => {
      await activeShow.open('/shows/test.showx');

      expect(logger.info).toHaveBeenCalledWith('active_show.opened', {
        pkgPath: '/shows/test.showx',
      });
    });

    it('fires onChange listeners with "opened"', async () => {
      const cb = vi.fn();
      activeShow.onChange(cb);

      await activeShow.open('/shows/test.showx');

      expect(cb).toHaveBeenCalledWith('opened');
    });
  });

  describe('double-open', () => {
    it('closes prior show before opening new one', async () => {
      const doc1 = freshDoc();
      const doc2 = freshDoc();
      mockOpenShowxPackage
        .mockResolvedValueOnce(makeOpenResult(doc1))
        .mockResolvedValueOnce(makeOpenResult(doc2));

      await activeShow.open('/shows/first.showx');
      expect(activeShow.getDoc()).toBe(doc1);

      await activeShow.open('/shows/second.showx');

      expect(activeShow.getDoc()).toBe(doc2);
      expect(activeShow.getPkgPath()).toBe('/shows/second.showx');
    });

    it('flushes dirty save from prior show on double-open', async () => {
      vi.useFakeTimers();
      const doc1 = freshDoc();
      mockOpenShowxPackage
        .mockResolvedValueOnce(makeOpenResult(doc1))
        .mockResolvedValueOnce(makeOpenResult(freshDoc()));

      await activeShow.open('/shows/first.showx');

      // Mutate doc1 to trigger debounce
      doc1.transact(() => {
        doc1.getMap('test').set('k', 1);
      });
      expect(activeShow['dirty']).toBe(true);

      // Open second show — should flush dirty before close
      await activeShow.open('/shows/second.showx');

      expect(mockSaveShowxPackage).toHaveBeenCalledWith(
        doc1,
        '/shows/first.showx',
        { reason: 'autosave' },
      );
    });
  });

  describe('mutation + debounced save', () => {
    it('marks dirty immediately on Y.Doc update', async () => {
      vi.useFakeTimers();
      const doc = freshDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

      await activeShow.open('/shows/test.showx');

      doc.transact(() => {
        doc.getMap('test').set('k', 1);
      });

      expect(activeShow['dirty']).toBe(true);
    });

    it('does not call saveShowxPackage before debounce window', async () => {
      vi.useFakeTimers();
      const doc = freshDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

      await activeShow.open('/shows/test.showx');

      doc.transact(() => {
        doc.getMap('test').set('k', 1);
      });

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 10);

      expect(mockSaveShowxPackage).not.toHaveBeenCalled();
    });

    it('calls saveShowxPackage after debounce window', async () => {
      vi.useFakeTimers();
      const doc = freshDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

      await activeShow.open('/shows/test.showx');

      doc.transact(() => {
        doc.getMap('test').set('k', 1);
      });

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);

      expect(mockSaveShowxPackage).toHaveBeenCalledWith(
        doc,
        '/shows/test.showx',
        { reason: 'autosave' },
      );
    });

    it('coalesces rapid edits into one save', async () => {
      vi.useFakeTimers();
      const doc = freshDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

      await activeShow.open('/shows/test.showx');

      // Three rapid mutations
      doc.transact(() => { doc.getMap('test').set('a', 1); });
      await vi.advanceTimersByTimeAsync(100);
      doc.transact(() => { doc.getMap('test').set('b', 2); });
      await vi.advanceTimersByTimeAsync(100);
      doc.transact(() => { doc.getMap('test').set('c', 3); });

      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);

      expect(mockSaveShowxPackage).toHaveBeenCalledTimes(1);
    });

    it('fires onChange "mutated" after save resolves', async () => {
      vi.useFakeTimers();
      const doc = freshDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

      const cb = vi.fn();
      await activeShow.open('/shows/test.showx');
      activeShow.onChange(cb);
      cb.mockClear(); // clear the 'opened' call from a late register (not triggered here)

      doc.transact(() => { doc.getMap('test').set('k', 1); });
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);

      expect(cb).toHaveBeenCalledWith('mutated');
    });

    it('logs active_show.autosave after debounce', async () => {
      vi.useFakeTimers();
      const doc = freshDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

      await activeShow.open('/shows/test.showx');
      doc.transact(() => { doc.getMap('test').set('k', 1); });
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);

      expect(logger.debug).toHaveBeenCalledWith(
        'active_show.autosave',
        expect.objectContaining({ pkgPath: '/shows/test.showx', durationMs: expect.any(Number) }),
      );
    });
  });

  describe('close', () => {
    it('sets getDoc() to null', async () => {
      await activeShow.open('/shows/test.showx');
      await activeShow.close();

      expect(activeShow.getDoc()).toBeNull();
    });

    it('sets getPkgPath() to null', async () => {
      await activeShow.open('/shows/test.showx');
      await activeShow.close();

      expect(activeShow.getPkgPath()).toBeNull();
    });

    it('sets getActiveShow() to null', async () => {
      await activeShow.open('/shows/test.showx');
      await activeShow.close();

      expect(activeShow.getActiveShow()).toBeNull();
    });

    it('flushes pending dirty save synchronously (before timer fires)', async () => {
      vi.useFakeTimers();
      const doc = freshDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

      await activeShow.open('/shows/test.showx');

      doc.transact(() => { doc.getMap('test').set('k', 1); });
      expect(activeShow['dirty']).toBe(true);

      // close without advancing timers
      await activeShow.close();

      expect(mockSaveShowxPackage).toHaveBeenCalledWith(
        doc,
        '/shows/test.showx',
        { reason: 'autosave' },
      );
    });

    it('does not save if not dirty on close', async () => {
      await activeShow.open('/shows/test.showx');
      // No mutations
      await activeShow.close();

      expect(mockSaveShowxPackage).not.toHaveBeenCalled();
    });

    it('fires onChange listener with "closed"', async () => {
      const cb = vi.fn();
      activeShow.onChange(cb);

      await activeShow.open('/shows/test.showx');
      cb.mockClear();

      await activeShow.close();

      expect(cb).toHaveBeenCalledWith('closed');
    });

    it('logs active_show.closed', async () => {
      await activeShow.open('/shows/test.showx');
      await activeShow.close();

      expect(logger.info).toHaveBeenCalledWith('active_show.closed', {
        pkgPath: '/shows/test.showx',
        savedDirty: false,
      });
    });

    it('is safe to call without a prior open', async () => {
      await expect(activeShow.close()).resolves.toBeUndefined();
    });
  });

  describe('onChange', () => {
    it('returns an unsubscribe function', async () => {
      const cb = vi.fn();
      const unsub = activeShow.onChange(cb);
      expect(typeof unsub).toBe('function');

      unsub();

      await activeShow.open('/shows/test.showx');
      expect(cb).not.toHaveBeenCalled();
    });

    it('fires opened → mutated → closed in sequence', async () => {
      vi.useFakeTimers();
      const doc = freshDoc();
      mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

      const events: string[] = [];
      activeShow.onChange((kind) => events.push(kind));

      await activeShow.open('/shows/test.showx');
      doc.transact(() => { doc.getMap('test').set('k', 1); });
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10);
      await activeShow.close();

      expect(events).toEqual(['opened', 'mutated', 'closed']);
    });

    it('multiple listeners all fire', async () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      activeShow.onChange(cb1);
      activeShow.onChange(cb2);

      await activeShow.open('/shows/test.showx');

      expect(cb1).toHaveBeenCalledWith('opened');
      expect(cb2).toHaveBeenCalledWith('opened');
    });
  });
});

describe('ActiveShowDoc — SyncBroker integration', () => {
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = makeLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeMockBroker() {
    return { attachDoc: vi.fn(), detachDoc: vi.fn() };
  }

  it('getShowId() returns null when no show is open', () => {
    const ad = new ActiveShowDoc(logger);
    expect(ad.getShowId()).toBeNull();
  });

  it('open() reads show_id from Y.Doc meta map', async () => {
    const showId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const doc = new Y.Doc();
    doc.getMap('meta').set('show_id', showId);
    mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

    const ad = new ActiveShowDoc(logger);
    await ad.open('/shows/test.showx');

    expect(ad.getShowId()).toBe(showId);
  });

  it('open() falls back to show.json show_id when not in meta', async () => {
    const doc = new Y.Doc();
    const showId = 'fallback-from-json-id';
    mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));
    mockReadFile.mockResolvedValue(JSON.stringify({
      show_id: showId,
      meta: { title: 'Test', mode: 'rehearsal' },
    }));

    const ad = new ActiveShowDoc(logger);
    await ad.open('/shows/test.showx');

    expect(ad.getShowId()).toBe(showId);
  });

  it('open() throws if no show_id in doc meta or show.json', async () => {
    const doc = new Y.Doc();
    mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));
    mockReadFile.mockResolvedValue('{"meta":{"title":"No ID","mode":"rehearsal"}}');

    const ad = new ActiveShowDoc(logger);
    await expect(ad.open('/shows/noid.showx')).rejects.toThrow('No show_id');
  });

  it('open() calls syncBroker.attachDoc with show_id and the doc', async () => {
    const showId = '12345678-1234-1234-1234-123456789012';
    const doc = new Y.Doc();
    doc.getMap('meta').set('show_id', showId);
    mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

    const broker = makeMockBroker();
    const ad = new ActiveShowDoc(logger, broker as never);
    await ad.open('/shows/test.showx');

    expect(broker.attachDoc).toHaveBeenCalledWith(showId, doc);
    expect(broker.attachDoc).toHaveBeenCalledTimes(1);
  });

  it('close() calls syncBroker.detachDoc with the active show_id', async () => {
    const showId = '12345678-1234-1234-1234-123456789012';
    const doc = new Y.Doc();
    doc.getMap('meta').set('show_id', showId);
    mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

    const broker = makeMockBroker();
    const ad = new ActiveShowDoc(logger, broker as never);
    await ad.open('/shows/test.showx');
    await ad.close();

    expect(broker.detachDoc).toHaveBeenCalledWith(showId);
    expect(broker.detachDoc).toHaveBeenCalledTimes(1);
  });

  it('close() sets getShowId() to null', async () => {
    const doc = freshDoc();
    mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

    const broker = makeMockBroker();
    const ad = new ActiveShowDoc(logger, broker as never);
    await ad.open('/shows/test.showx');
    expect(ad.getShowId()).toBeTruthy();

    await ad.close();
    expect(ad.getShowId()).toBeNull();
  });

  it('double-open calls attachDoc for second show, detachDoc for first', async () => {
    const id1 = '11111111-0000-0000-0000-000000000001';
    const id2 = '22222222-0000-0000-0000-000000000002';
    const doc1 = new Y.Doc();
    doc1.getMap('meta').set('show_id', id1);
    const doc2 = new Y.Doc();
    doc2.getMap('meta').set('show_id', id2);

    mockOpenShowxPackage
      .mockResolvedValueOnce(makeOpenResult(doc1))
      .mockResolvedValueOnce(makeOpenResult(doc2));

    const broker = makeMockBroker();
    const ad = new ActiveShowDoc(logger, broker as never);

    await ad.open('/shows/first.showx');
    expect(broker.attachDoc).toHaveBeenCalledWith(id1, doc1);

    await ad.open('/shows/second.showx');
    expect(broker.detachDoc).toHaveBeenCalledWith(id1);
    expect(broker.attachDoc).toHaveBeenCalledWith(id2, doc2);

    expect(ad.getShowId()).toBe(id2);
  });

  it('works without syncBroker (backward compat — no call errors)', async () => {
    const doc = freshDoc();
    mockOpenShowxPackage.mockResolvedValue(makeOpenResult(doc));

    const ad = new ActiveShowDoc(logger);
    await expect(ad.open('/shows/test.showx')).resolves.not.toThrow();
    await expect(ad.close()).resolves.not.toThrow();
  });
});
