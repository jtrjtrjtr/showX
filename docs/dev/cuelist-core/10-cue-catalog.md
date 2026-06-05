# 10 — Cue catalog publishing

A flat, denormalized snapshot of all cues + summaries for the routing UI to consume. Written to disk at `<show>.showx/media/.cache/cue-catalog.json`, refreshed on Y.Doc changes with 100ms debounce.

## Why

The routing UI needs to render a quick "pick a cue" picker without iterating the live Y.Doc on every render. The catalog is:

- Flat (no Y.Map / Y.Array — pure JSON)
- Denormalized (each entry has cuelist context, summary, dept tags)
- Stale-tolerant (UI re-renders on file change events; 100ms debounce ≈ frame budget)

## Schema

`src/types/cueCatalog.ts`:

```ts
type CueCatalog = {
  show_id: string
  generated_at: string         // ISO
  module_version: string       // '0.1.0'
  entries: CueCatalogEntry[]
}

type CueCatalogEntry = {
  cue_id: string
  cuelist_id: string
  cuelist_label: string
  cue_label: string
  department: string[]
  trigger_kind: 'manual' | 'auto_follow' | 'auto_continue' | 'timecode'
  summary: string              // human-readable payload summary
  sort_key: number
}
```

`summary` is human-readable text from `summarize.ts` — e.g., `"3 payloads: OSC /lx/cue/47, MIDI program 12, wait 500ms"`.

## CatalogPublisher

`src/catalog/cueCatalog.ts`:

```ts
class CatalogPublisher {
  constructor(opts: { doc: Y.Doc; pkgPath: string; log: Logger }) { /* ... */ }
  start(): void   // observes doc, publishes initially + on change
  stop(): void
}
```

On `start()`:

1. Compute `computeCueCatalog(doc)` synchronously
2. Atomic write to `<pkgPath>/media/.cache/cue-catalog.json` via `cacheWrite`
3. Subscribe `doc.on('updateV2', debouncedPublish)`
4. Emit `cue-catalog-updated` event on EventBus with `{ showId, path, entries: count }`

Debounce: 100ms via `setTimeout`. Multiple Y.Doc updates within 100ms collapse to one publish.

## computeCueCatalog

`src/catalog/cueCatalog.ts`:

```ts
export function computeCueCatalog(doc: Y.Doc): CueCatalog {
  const showId = getMeta(doc).get('show_id') as string
  const cuelists = getCuelists(doc)
  const entries: CueCatalogEntry[] = []
  for (const [cuelistId, cuelist] of cuelists) {
    const cuelistLabel = cuelist.get('label') as string
    for (const cue of getCuesSorted(cuelist)) {
      entries.push({
        cue_id: cue.get('id'),
        cuelist_id: cuelistId,
        cuelist_label: cuelistLabel,
        cue_label: cue.get('label'),
        department: cue.get('department'),
        trigger_kind: cue.get('trigger').kind,
        summary: summarizePayloads(cue.get('payloads')),
        sort_key: cue.get('sort_key'),
      })
    }
  }
  return { show_id: showId, generated_at: new Date().toISOString(), module_version: '0.1.0', entries }
}
```

Note: uses `getCuesSorted` (not raw `cues` Y.Array) — catalog reflects display order.

## summarize.ts

One summarizer per payload type. Examples:

| Type | Summary |
|---|---|
| `osc` | `OSC /lx/cue/47 → device:eos` |
| `msc` | `MSC cue 1.5 GO` |
| `lx_ref` | `LX 47 on Eos` |
| `midi` | `MIDI note_on ch1 60 v127` |
| `webhook` | `Webhook POST https://...` |
| `wait` | `wait 500ms` |
| `group` | `Group: parallel × 3 cues` |

`summarizePayloads` joins individual summaries with `; ` separator, truncating if total length > 80 chars (UI fits).

## cacheWrite.ts

```ts
export async function writeCueCatalogCache(
  pkgPath: string,
  catalog: CueCatalog
): Promise<void> {
  const targetDir = path.join(pkgPath, 'media', '.cache')
  await fs.mkdir(targetDir, { recursive: true })
  await atomicWriteFile(
    path.join(targetDir, 'cue-catalog.json'),
    Buffer.from(JSON.stringify(catalog, null, 2))
  )
}
```

Atomic via temp-then-rename. Indented JSON for human inspection.

## Event contract

`cue-catalog-updated` emitted on EventBus:

```ts
{ showId: string, path: string, entryCount: number }
```

Consumers (in 0.1, no real consumers yet — UI hot-reload TBD; routing UI would subscribe):

- Routing UI: re-reads catalog file on event
- Future: stream catalog over PWA awareness for offline-prepared routing

## Tests

- `tests/unit/modules/cuelist-core/catalog/summarize.test.ts` — 12 tests covering all payload types
- `tests/unit/modules/cuelist-core/catalog/cueCatalog.test.ts` — 14 tests covering compute + publish + debounce + initial publish on start

## Known flakes

`cueCatalog.test.ts` has occasional ENOTEMPTY race when fixture cleanup runs while atomic-write rename is in flight. Pre-existing flake, passes in isolation. Bug: `tests/setup/` should `await` the cleanup. Defer to test infra cleanup.

## Open issues

- `src/types/cueCatalog.ts` byte-for-byte duplicates the showx-shared definition (Critic non-blocking note B003-010). Consolidate post-bundle.
- Future: stream catalog updates over WebSocket instead of file polling for sub-100ms UI sync.
