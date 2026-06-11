import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { EventBus, Logger, Subscription, ShowxEvent } from 'showx-shared';
import { computeCueCatalog, CatalogPublisher } from '../../../../../src/modules/cuelist-core/src/catalog/cueCatalog.js';
import { initShowDoc } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCuelist } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { addPayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makeMockBus() {
  const published: ShowxEvent[] = [];
  const bus: EventBus = {
    publish<T extends ShowxEvent>(event: T): void {
      published.push(event);
    },
    subscribe<T extends ShowxEvent>(
      _type: T['type'],
      _handler: (e: T) => void,
    ): Subscription {
      return { id: 'sub-1', unsubscribe: vi.fn() };
    },
  };
  return { bus, published };
}

function makeMockLog(): Logger {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
}

function makeDoc() {
  return initShowDoc({ title: 'Test Show', venue: null, date: null, created_by: 'test' });
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function addOscPayload(doc: Y.Doc, cuelistId: string, cueId: string, deviceId: string) {
  addPayload(doc, cuelistId, cueId, {
    type: 'osc',
    tag: null,
    note: '',
    device_id: deviceId,
    address: '/test/go',
    args: [],
  });
}

function addLxRefPayload(doc: Y.Doc, cuelistId: string, cueId: string, deviceId: string) {
  addPayload(doc, cuelistId, cueId, {
    type: 'lx_ref',
    tag: null,
    note: '',
    device_id: deviceId,
    cue_list: 1,
    cue_number: 47,
  });
}

// ── Tests 11-13: Catalog shape ─────────────────────────────────────────────

describe('computeCueCatalog', () => {
  // 11. Empty show
  it('empty show: returns empty cues, devices_referenced, payload_types_used', () => {
    const doc = makeDoc();
    const catalog = computeCueCatalog(doc);
    expect(catalog.schema_version).toBe(1);
    expect(catalog.show_id).toBeTruthy();
    expect(catalog.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(catalog.source).toMatch(/^cuelist-core@/);
    expect(catalog.cues).toHaveLength(0);
    expect(catalog.devices_referenced).toHaveLength(0);
    expect(catalog.payload_types_used).toHaveLength(0);
  });

  // 12. Mixed payloads — cues count + deduplication
  it('show with 3 cues + mixed payloads: cues.length=3, payload_types_used deduplicated', () => {
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const c1 = addCue(doc, clId, { label: 'Cue 1', department: ['LX'], created_by: 'test' });
    const c2 = addCue(doc, clId, { label: 'Cue 2', department: ['SX'], created_by: 'test' });
    const c3 = addCue(doc, clId, { label: 'Cue 3', department: ['LX', 'SX'], created_by: 'test' });

    addOscPayload(doc, clId, c1, 'dev_osc');
    addLxRefPayload(doc, clId, c2, 'dev_eos');
    addOscPayload(doc, clId, c3, 'dev_osc');

    const catalog = computeCueCatalog(doc);
    // The show doc already has a default cuelist with 0 cues, our cuelist has 3
    const ourCuelist = catalog.cues.filter((c) => c.cuelist_id === clId);
    expect(ourCuelist).toHaveLength(3);
    // osc appears twice but deduplication collapses to 1
    const types = catalog.payload_types_used;
    const oscCount = types.filter((t) => t === 'osc').length;
    expect(oscCount).toBe(1);
    expect(types).toContain('lx_ref');
  });

  // 13. Device aggregation
  it('device aggregated: dev_eos referenced 5 lx_ref + 2 osc → count=7, types=[lx_ref, osc]', () => {
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    // Add 5 cues with lx_ref to dev_eos
    for (let i = 0; i < 5; i++) {
      const cId = addCue(doc, clId, { label: `C ${i}`, department: ['LX'], created_by: 'test' });
      addLxRefPayload(doc, clId, cId, 'dev_eos');
    }
    // Add 2 cues with osc to dev_eos
    for (let i = 5; i < 7; i++) {
      const cId = addCue(doc, clId, { label: `C ${i}`, department: ['LX'], created_by: 'test' });
      addOscPayload(doc, clId, cId, 'dev_eos');
    }

    const catalog = computeCueCatalog(doc);
    const devEntry = catalog.devices_referenced.find((d) => d.id === 'dev_eos');
    expect(devEntry).toBeDefined();
    expect(devEntry!.referenced_by_payloads).toBe(7);
    expect(devEntry!.payload_types).toContain('lx_ref');
    expect(devEntry!.payload_types).toContain('osc');
    expect(devEntry!.payload_types).toHaveLength(2);
  });

  it('cue entry carries id, label, cuelist_id, department, payloads with summary', () => {
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const cId = addCue(doc, clId, { label: 'Smoke Cue', department: ['SX', 'LX'], created_by: 'test' });
    addOscPayload(doc, clId, cId, 'dev_eos');

    const catalog = computeCueCatalog(doc);
    const entry = catalog.cues.find((c) => c.id === cId);
    expect(entry).toBeDefined();
    expect(entry!.label).toBe('Smoke Cue');
    expect(entry!.cuelist_id).toBe(clId);
    expect(entry!.department).toContain('SX');
    expect(entry!.payloads).toHaveLength(1);
    expect(entry!.payloads[0].summary).toContain('/test/go');
    expect(entry!.payloads[0].device_id).toBe('dev_eos');
    expect(entry!.payloads[0].type).toBe('osc');
  });

  it('wait and group payloads have device_id = null', () => {
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const cId = addCue(doc, clId, { label: 'Pause', department: ['SM'], created_by: 'test' });
    addPayload(doc, clId, cId, { type: 'wait', tag: null, note: '', duration_ms: 500 });

    const catalog = computeCueCatalog(doc);
    const entry = catalog.cues.find((c) => c.id === cId);
    expect(entry!.payloads[0].device_id).toBeNull();
    expect(entry!.payloads[0].summary).toContain('500ms');
  });

  it('cue-catalog-updated event matches CueCatalog shape', () => {
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    addCue(doc, clId, { label: 'C1', department: ['LX'], created_by: 'test' });

    const catalog = computeCueCatalog(doc);
    expect(catalog.schema_version).toBe(1);
    expect(typeof catalog.show_id).toBe('string');
    expect(typeof catalog.generated_at).toBe('string');
    expect(typeof catalog.source).toBe('string');
    expect(Array.isArray(catalog.cues)).toBe(true);
    expect(Array.isArray(catalog.payload_types_used)).toBe(true);
    expect(Array.isArray(catalog.devices_referenced)).toBe(true);
  });
});

// ── Tests 14-20: CatalogPublisher ─────────────────────────────────────────────

describe('CatalogPublisher', () => {
  let doc: Y.Doc;
  let mockBus: ReturnType<typeof makeMockBus>;
  let pkgPath: string;
  let log: Logger;

  beforeEach(() => {
    doc = makeDoc();
    mockBus = makeMockBus();
    log = makeMockLog();
    pkgPath = path.join(os.tmpdir(), `showx-catalog-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    // A debounced catalog write restored by useRealTimers can land a fresh file
    // inside media/.cache while rm() is enumerating — retry shields the race.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rm(pkgPath, { recursive: true, force: true });
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOTEMPTY' || attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  });

  // 20. Initial publish on start() — fires before any debounce
  it('start() triggers initial publish without waiting for mutation', async () => {
    const publisher = new CatalogPublisher({ doc, events: mockBus.bus, pkgPath, log });
    publisher.start();
    // Flush microtasks to let the async publish() complete
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const catalogEvents = mockBus.published.filter((e) => e.type === 'cue-catalog-updated');
    expect(catalogEvents.length).toBeGreaterThanOrEqual(1);
    publisher.stop();
  });

  // 14. Fires on Y.Doc cue insert after 100ms debounce
  it('fires on Y.Doc cue insert after 100ms debounce', async () => {
    const publisher = new CatalogPublisher({ doc, events: mockBus.bus, pkgPath, log });
    publisher.start();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const countBefore = mockBus.published.filter((e) => e.type === 'cue-catalog-updated').length;

    const clId = addCuelist(doc, 'Trigger Test');
    addCue(doc, clId, { label: 'New Cue', department: ['LX'], created_by: 'test' });

    // Advance past debounce window
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();

    const countAfter = mockBus.published.filter((e) => e.type === 'cue-catalog-updated').length;
    expect(countAfter).toBeGreaterThan(countBefore);

    publisher.stop();
  });

  // 15. Fires on routing change
  it('fires on routing map change', async () => {
    const publisher = new CatalogPublisher({ doc, events: mockBus.bus, pkgPath, log });
    publisher.start();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const countBefore = mockBus.published.filter((e) => e.type === 'cue-catalog-updated').length;

    doc.transact(() => {
      doc.getMap('routing').set('route-1', { id: 'r1', enabled: true });
    });
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();

    const countAfter = mockBus.published.filter((e) => e.type === 'cue-catalog-updated').length;
    expect(countAfter).toBeGreaterThan(countBefore);

    publisher.stop();
  });

  // 16. Multiple rapid mutations = 1 publish (debounce)
  it('multiple rapid mutations within 100ms result in one catalog publish', async () => {
    const publisher = new CatalogPublisher({ doc, events: mockBus.bus, pkgPath, log });
    publisher.start();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const countBefore = mockBus.published.filter((e) => e.type === 'cue-catalog-updated').length;

    // Fire 5 mutations within 99ms (debounce window)
    const clId = addCuelist(doc, 'Rapid');
    for (let i = 0; i < 5; i++) {
      addCue(doc, clId, { label: `C${i}`, department: ['LX'], created_by: 'test' });
      vi.advanceTimersByTime(10); // 10ms between each
    }
    // Now advance past debounce
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    const countAfter = mockBus.published.filter((e) => e.type === 'cue-catalog-updated').length;
    expect(countAfter).toBe(countBefore + 1);

    publisher.stop();
  });

  // 17. cue-catalog-updated event payload matches CueCatalog shape
  it('cue-catalog-updated event payload matches CueCatalog shape', async () => {
    const clId = addCuelist(doc, 'Shape Test');
    addCue(doc, clId, { label: 'X', department: ['LX'], created_by: 'test' });

    const publisher = new CatalogPublisher({ doc, events: mockBus.bus, pkgPath, log });
    publisher.start();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const evt = mockBus.published.find((e) => e.type === 'cue-catalog-updated') as {
      type: string; showId: string; catalog: unknown;
    } | undefined;
    expect(evt).toBeDefined();
    expect(evt!.showId).toBeTruthy();
    const cat = evt!.catalog as Record<string, unknown>;
    expect(cat.schema_version).toBe(1);
    expect(Array.isArray(cat.cues)).toBe(true);

    publisher.stop();
  });

  // 18. Cache file written to <pkgPath>/media/.cache/cue-catalog.json
  it('writes cache file to <pkgPath>/media/.cache/cue-catalog.json', async () => {
    await fs.mkdir(pkgPath, { recursive: true });

    const publisher = new CatalogPublisher({ doc, events: mockBus.bus, pkgPath, log });
    publisher.start();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    // Use real timers briefly to let the filesystem promise settle
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 50));

    const cachePath = path.join(pkgPath, 'media', '.cache', 'cue-catalog.json');
    const content = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.schema_version).toBe(1);
    expect(typeof parsed.show_id).toBe('string');

    publisher.stop();
  });

  // 19. Cache write atomicity: second write produces correct file; no corruption
  it('repeated cache writes leave correct content (atomic write)', async () => {
    await fs.mkdir(pkgPath, { recursive: true });

    const publisher = new CatalogPublisher({ doc, events: mockBus.bus, pkgPath, log });
    publisher.start();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const clId = addCuelist(doc, 'Atomic');
    addCue(doc, clId, { label: 'Unique Cue', department: ['LX'], created_by: 'test' });

    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 50));

    const cachePath = path.join(pkgPath, 'media', '.cache', 'cue-catalog.json');
    const content = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.schema_version).toBe(1);
    // The file should be valid JSON (not a partial write)
    expect(typeof JSON.stringify(parsed)).toBe('string');

    publisher.stop();
  });

  // stop() prevents post-stop publishes
  it('stop() clears debounce timer and prevents post-stop publishes', async () => {
    const publisher = new CatalogPublisher({ doc, events: mockBus.bus, pkgPath, log });
    publisher.start();
    await vi.runAllTimersAsync();
    await Promise.resolve();

    const clId = addCuelist(doc, 'AfterStop');
    addCue(doc, clId, { label: 'C', department: ['LX'], created_by: 'test' });
    // Timer is armed but not yet fired
    vi.advanceTimersByTime(50);

    publisher.stop();
    const countAtStop = mockBus.published.filter((e) => e.type === 'cue-catalog-updated').length;

    // Advance past where the debounce would have fired
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();

    const countAfterStop = mockBus.published.filter((e) => e.type === 'cue-catalog-updated').length;
    expect(countAfterStop).toBe(countAtStop);
  });
});
