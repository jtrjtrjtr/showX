---
id: "B003-010"
title: "Cue catalog publishing — emit cue-catalog-updated events + cache write"
type: "implementation"
estimated_size_lines: 300
priority: "P0"
depends_on: ["B003-009"]
target_files:
  - "src/modules/cuelist-core/src/catalog/cueCatalog.ts"
  - "src/modules/cuelist-core/src/catalog/summarize.ts"
  - "src/modules/cuelist-core/src/catalog/cacheWrite.ts"
  - "src/types/cueCatalog.ts"
  - "tests/unit/modules/cuelist-core/catalog/cueCatalog.test.ts"
  - "tests/unit/modules/cuelist-core/catalog/summarize.test.ts"
acceptance_criteria:
  - "`computeCueCatalog(doc): CueCatalog` builds catalog per data_model.md §10.2 shape: schema_version=1, show_id, generated_at ISO, source `cuelist-core@<pkg.version>`, payload_types_used, devices_referenced, cues array"
  - "Each `CueCatalogEntry` carries `id, label, cuelist_id, department[], payloads[]` where each payload summary is type-specific UI-friendly string (per `summarize.ts`)"
  - "Payload summaries: OSC = `'OSC /address to <device_id>'`; LXRef = `'Eos cue list 1, cue 47'` (or MA/Hog/Chamsys variants); MSC = `'MSC GO cue 11 list 1 to <device>'`; MIDI = `'MIDI note_on ch 1 60 vel 127'`; Webhook = `'POST <url>'`; Wait = `'Wait 500ms'`; Group = `'Group fire 3 cues parallel'`"
  - "Catalog recomputed on: show open, every Y.Doc transaction touching cues/payloads, every routing change — wired via Y.Doc observer on root cues/payloads/routing maps"
  - "Catalog emitted via `ctx.events.publish({type: 'cue-catalog-updated', show_id, catalog})` for routing UI + Custom Router (post-MVP) + external tools to consume per module_loader.md §9.1 + Q2"
  - "Catalog written to `<pkgPath>/media/.cache/cue-catalog.json` after emit (data_model.md §10.4) — atomic write; not in-Yjs"
  - "`devices_referenced` aggregates: scan all payloads, group by `device_id`, count references, list payload types per device"
  - "`payload_types_used` is deduplicated set of types appearing in any cue"
  - "Throttle: catalog recomputes coalesce in 100ms debounce window — multiple rapid mutations result in one catalog emit"
  - "Public type `CueCatalog` lives in `src/types/cueCatalog.ts` and is re-exported from showx-shared for external consumers"
  - "15+ vitest tests covering catalog shape, summary strings per payload type, device aggregation, debounce, cache write atomicity"
---

## Context

The cue catalog is ShowX's analog to EventX's `channel-catalog.json` — a derived artifact that exposes "what cues exist + what payloads they emit" for routing UIs and external tooling. The routing module (post-MVP) consumes it to show "Eos console will receive 47 cues this show". External Companion modules consume the JSON file for dynamic button feedback.

This task is small but architecturally important: it formalizes the data-flow contract between Cuelist Core and any consumer of cue structure.

## Implementation notes

### Public type

```ts
// src/types/cueCatalog.ts
import type { DepartmentTag } from './department';
import type { PayloadType } from './payload';

export interface CueCatalog {
  schema_version: 1;
  show_id: string;
  generated_at: string;             // ISO
  source: string;                   // "cuelist-core@<semver>"
  payload_types_used: PayloadType[];
  devices_referenced: Array<{
    id: string;
    referenced_by_payloads: number;
    payload_types: PayloadType[];
  }>;
  cues: CueCatalogEntry[];
}

export interface CueCatalogEntry {
  id: string;
  label: string;
  cuelist_id: string;
  department: DepartmentTag[];
  payloads: Array<{
    id: string;
    type: PayloadType;
    tag: string | null;
    device_id: string | null;
    /** Type-specific UI-friendly summary string. */
    summary: string;
  }>;
}
```

### Compute function

```ts
// src/modules/cuelist-core/src/catalog/cueCatalog.ts
import * as Y from 'yjs';
import type { Cue, Payload } from '../../../../types/cue';
import type { CueCatalog, CueCatalogEntry } from '../../../../types/cueCatalog';
import { getCuelists, getCues } from '../document/cuelist';
import { summarizePayload } from './summarize';
import { version as MODULE_VERSION } from '../../package.json';

export function computeCueCatalog(doc: Y.Doc): CueCatalog {
  const showId = doc.getMap('meta').get('show_id') as string;
  const cuelists = getCuelists(doc).toArray();
  const cues: CueCatalogEntry[] = [];
  const payloadTypesUsed = new Set<string>();
  const devicesMap = new Map<string, { count: number; types: Set<string> }>();

  for (const cuelist of cuelists) {
    const cuelistId = cuelist.get('id') as string;
    for (const cueMap of getCues(cuelist).toArray()) {
      const cue = cueMap.toJSON() as Cue;
      const entry: CueCatalogEntry = {
        id: cue.id,
        label: cue.label,
        cuelist_id: cuelistId,
        department: cue.department,
        payloads: cue.payloads.map((p) => ({
          id: p.id,
          type: p.type,
          tag: p.tag,
          device_id: (p as any).device_id ?? null,
          summary: summarizePayload(p),
        })),
      };
      cues.push(entry);
      for (const p of cue.payloads) {
        payloadTypesUsed.add(p.type);
        const deviceId = (p as any).device_id as string | undefined;
        if (deviceId) {
          if (!devicesMap.has(deviceId)) devicesMap.set(deviceId, { count: 0, types: new Set() });
          const ref = devicesMap.get(deviceId)!;
          ref.count++;
          ref.types.add(p.type);
        }
      }
    }
  }

  return {
    schema_version: 1,
    show_id: showId,
    generated_at: new Date().toISOString(),
    source: `cuelist-core@${MODULE_VERSION}`,
    payload_types_used: [...payloadTypesUsed] as any,
    devices_referenced: [...devicesMap.entries()].map(([id, { count, types }]) => ({
      id, referenced_by_payloads: count, payload_types: [...types] as any,
    })),
    cues,
  };
}
```

### Summarizer

```ts
// src/modules/cuelist-core/src/catalog/summarize.ts
import type { Payload } from '../../../../types/cue';

export function summarizePayload(p: Payload): string {
  switch (p.type) {
    case 'osc':
      return `OSC ${p.address} → ${p.device_id} (${p.args.length} args)`;
    case 'msc': {
      const list = p.cue_list ?? 'current';
      const num = p.cue_number ?? 'current';
      return `MSC ${p.command.toUpperCase()} cue ${num} list ${list} → ${p.device_id}`;
    }
    case 'lx_ref':
      return `Eos/MA cue list ${p.cue_list}, cue ${p.cue_number} → ${p.device_id}`;
    case 'midi': {
      const msg = p.message;
      if (msg.kind === 'note_on') return `MIDI note_on ch ${msg.channel} n ${msg.note} v ${msg.velocity} → ${p.device_id}`;
      if (msg.kind === 'note_off') return `MIDI note_off ch ${msg.channel} n ${msg.note} → ${p.device_id}`;
      if (msg.kind === 'cc') return `MIDI CC ch ${msg.channel} #${msg.controller}=${msg.value} → ${p.device_id}`;
      if (msg.kind === 'program_change') return `MIDI PC ch ${msg.channel} prog ${msg.program} → ${p.device_id}`;
      if (msg.kind === 'raw') return `MIDI raw ${msg.bytes.length} bytes → ${p.device_id}`;
      return `MIDI → ${p.device_id}`;
    }
    case 'webhook':
      return `${p.method} ${p.url}`;
    case 'wait':
      return `Wait ${p.duration_ms}ms`;
    case 'group':
      return `Group fire ${p.child_cue_ids.length} cues ${p.fire_mode}`;
    default:
      return `Unknown payload type ${(p as any).type}`;
  }
}
```

### Catalog publisher with debounce

```ts
// src/modules/cuelist-core/src/catalog/cueCatalog.ts (continued)
export interface CatalogPublisherDeps {
  doc: Y.Doc;
  events: EventBus;
  pkgPath: string;
  log: Logger;
}

export class CatalogPublisher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubs: Array<() => void> = [];

  constructor(private deps: CatalogPublisherDeps) {}

  start(): void {
    const debounce = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.publish(), 100);
    };
    const cuelists = this.deps.doc.getArray('cuelists');
    cuelists.observeDeep(debounce);
    const routing = this.deps.doc.getMap('routing');
    routing.observeDeep(debounce);
    this.unsubs.push(() => cuelists.unobserveDeep(debounce), () => routing.unobserveDeep(debounce));
    // Initial publish
    this.publish();
  }

  stop(): void {
    for (const u of this.unsubs) u();
    if (this.timer) clearTimeout(this.timer);
  }

  private async publish(): Promise<void> {
    const catalog = computeCueCatalog(this.deps.doc);
    this.deps.events.publish({ type: 'cue-catalog-updated', show_id: catalog.show_id, catalog, ts: Date.now() });
    try {
      await writeCatalogCache(this.deps.pkgPath, catalog);
    } catch (err) {
      this.deps.log.warn(`catalog cache write failed`, { error: String(err) });
    }
  }
}
```

### Cache write

```ts
// src/modules/cuelist-core/src/catalog/cacheWrite.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../persistence/atomicWrite';

export async function writeCatalogCache(pkgPath: string, catalog: object): Promise<void> {
  const cacheDir = path.join(pkgPath, 'media', '.cache');
  await fs.mkdir(cacheDir, { recursive: true });
  await atomicWriteFile(path.join(cacheDir, 'cue-catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
}
```

### Integration

`CuelistCore.start()` instantiates `CatalogPublisher` with the loaded show's pkgPath. Pkg path is provided via `ctx.persisted.load(...)` config OR a dedicated `ctx.showPath` if shell exposes it.

## Test plan

### `summarize.test.ts`

1. OSC payload: summary contains address + device_id + arg count.
2. MSC GO payload: summary mentions "GO", cue number, list, device.
3. LXRef payload: summary matches "Eos/MA cue list X, cue Y → device".
4. MIDI note_on: full message detail.
5. MIDI cc: controller + value.
6. MIDI raw: byte count.
7. Webhook: method + URL.
8. Wait: duration_ms.
9. Group: count + fire mode.
10. Unknown type: graceful fallback.

### `cueCatalog.test.ts`

11. Empty show: catalog has empty cues array, empty devices_referenced, empty payload_types_used.
12. Show with 3 cues + mixed payloads: catalog.cues.length === 3; payload_types_used deduplicated.
13. Devices referenced aggregated correctly — device 'dev_eos' referenced by 5 lx_ref + 2 osc payloads → count=7, types=[lx_ref, osc].
14. CatalogPublisher fires on Y.Doc cue insert (after 100ms debounce).
15. CatalogPublisher fires on routing change.
16. Multiple rapid mutations within 100ms result in 1 catalog publish (not N).
17. cue-catalog-updated event payload matches CueCatalog shape exactly.
18. Cache file written to `<pkgPath>/media/.cache/cue-catalog.json` after publish.
19. Cache write atomicity: failure during write doesn't corrupt prior file.
20. `start()` triggers initial publish immediately (before any debounce).

## Out of scope

- Routing module UI consumption (post-MVP separate module).
- External Companion module catalog parsing (B003-021 — uses cache file).
- Catalog diffing for incremental updates (post-MVP optimization).
- Persistence of catalog to Y.Doc (it's derived; never in CRDT).
- Cloud Sync catalog upload (post-MVP).
- Schema migration for catalog format (schema_version=1 stable for 0.1).

## Notes for Critic

- Verify catalog is NEVER written to Y.Doc — it's derived; lives in EventBus events + cache file only.
- Verify debounce timer is cleared on stop() to prevent post-stop publishes.
- Verify cache write is atomic (uses B003-003's atomicWriteFile).
- Confirm cache path is `<pkgPath>/media/.cache/cue-catalog.json` (within media subdir).
- Verify summary strings are stable (deterministic given same payload) — tests use string equality.
- Verify `payload_types_used` is JSON array (no Set serialization issue).
- Confirm initial publish on start() — consumers should not wait for first mutation to see catalog.
- Verify EventBus event type name is `cue-catalog-updated` (kebab-case per module_loader.md §9.1).
