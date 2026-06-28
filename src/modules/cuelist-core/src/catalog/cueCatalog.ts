import * as Y from 'yjs';
import type { CueCatalog, CueCatalogEntry, Payload, EventBus, Logger } from 'showx-shared';
import { getCuelists, getCues } from '../document/cuelist.js';
import { summarizePayload } from './summarize.js';
import { writeCatalogCache } from './cacheWrite.js';

// Sourced from package.json at build time; avoids JSON import assertion complexity.
const MODULE_VERSION = '0.1.0';

export function computeCueCatalog(doc: Y.Doc): CueCatalog {
  const showId = doc.getMap('meta').get('show_id') as string;
  const cuelists = getCuelists(doc).toArray();
  const entries: CueCatalogEntry[] = [];
  const payloadTypesUsed = new Set<string>();
  const devicesMap = new Map<string, { count: number; types: Set<string> }>();

  for (const cuelistMap of cuelists) {
    const cuelistId = cuelistMap.get('id') as string;
    for (const cueMap of getCues(cuelistMap).toArray()) {
      const cueJson = cueMap.toJSON() as {
        id: string;
        label: string;
        cue_number?: string | null;
        department: string[];
        payloads: Payload[];
      };
      const entryPayloads: CueCatalogEntry['payloads'] = [];
      for (const p of cueJson.payloads) {
        payloadTypesUsed.add(p.type);
        const deviceId: string | null =
          p.type === 'webhook' || p.type === 'wait' || p.type === 'group'
            ? null
            : p.device_id;
        if (deviceId !== null) {
          if (!devicesMap.has(deviceId)) {
            devicesMap.set(deviceId, { count: 0, types: new Set() });
          }
          const ref = devicesMap.get(deviceId)!;
          ref.count++;
          ref.types.add(p.type);
        }
        entryPayloads.push({
          id: p.id,
          type: p.type,
          tag: p.tag,
          device_id: deviceId,
          summary: summarizePayload(p),
        });
      }
      entries.push({
        id: cueJson.id,
        label: cueJson.label,
        cue_number: cueJson.cue_number ?? null,
        cuelist_id: cuelistId,
        department: cueJson.department,
        payloads: entryPayloads,
      });
    }
  }

  return {
    schema_version: 1,
    show_id: showId,
    generated_at: new Date().toISOString(),
    source: `cuelist-core@${MODULE_VERSION}`,
    payload_types_used: [...payloadTypesUsed] as CueCatalog['payload_types_used'],
    devices_referenced: [...devicesMap.entries()].map(([id, { count, types }]) => ({
      id,
      referenced_by_payloads: count,
      payload_types: [...types] as CueCatalog['devices_referenced'][number]['payload_types'],
    })),
    cues: entries,
  };
}

export interface CatalogPublisherDeps {
  doc: Y.Doc;
  events: EventBus;
  pkgPath: string;
  log: Logger;
}

export class CatalogPublisher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubs: Array<() => void> = [];
  /**
   * Tracks the most recently started cache-write promise (always resolved, never
   * rejects — write errors are caught and logged inside publish()).
   * Used by waitForWrite() so tests can await deterministic file-I/O completion
   * without relying on fixed setTimeout delays.
   */
  private _lastWritePromise: Promise<void> = Promise.resolve();

  constructor(private readonly deps: CatalogPublisherDeps) {}

  start(): void {
    const debounce = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => { void this.publish(); }, 100);
    };

    const cuelists = this.deps.doc.getArray('cuelists');
    cuelists.observeDeep(debounce);

    const routing = this.deps.doc.getMap('routing');
    routing.observeDeep(debounce);

    this.unsubs.push(
      () => cuelists.unobserveDeep(debounce),
      () => routing.unobserveDeep(debounce),
    );

    // Publish initial catalog without waiting for a mutation.
    void this.publish();
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Resolves once the most recently kicked-off cache write has settled.
   * The returned promise never rejects (write errors are caught and logged).
   *
   * Intended for tests: await this instead of a fixed setTimeout to get
   * deterministic, timing-race-free confirmation of file-I/O completion.
   */
  waitForWrite(): Promise<void> {
    return this._lastWritePromise;
  }

  private async publish(): Promise<void> {
    const catalog = computeCueCatalog(this.deps.doc);
    this.deps.events.publish({
      type: 'cue-catalog-updated',
      showId: catalog.show_id,
      catalog,
    });
    // Capture the write promise before awaiting so that waitForWrite() always
    // reflects the latest in-flight write, even under concurrent calls.
    const writePromise = writeCatalogCache(this.deps.pkgPath, catalog).catch((err) => {
      this.deps.log.warn('catalog cache write failed', { error: String(err) });
    });
    this._lastWritePromise = writePromise;
    await writePromise;
  }
}
