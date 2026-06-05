# 01 — Module overview

## What Cuelist Core is

A single ShowX module that contains the entire cuelist product: data model, persistence, REHEARSAL/SHOW state, view filter, trigger engine, GO event channel, payload dispatch, cue catalog, electron-side panel UI, and the PWA frontend pieces that drive station displays.

It is intentionally one module rather than a constellation. Per data_model.md §1, splitting cuelist concerns across modules creates synchronization seams between things that need to mutate in a single Yjs transaction. We pay the cost of one larger module to keep the show document atomic.

## Manifest

`src/manifest.ts`:

```ts
{
  slug: 'cuelist-core',
  name: 'Cuelist Core',
  version: '0.1.0',
  tier: 'free',
  default_enabled: true,
  persistedConfigSchemaVersion: 1,
  requires: {
    transports: ['osc-out', 'midi-out', 'msc-out', 'webhook-out'],
    depends_on: [],
  },
  uiPanel: () => import('./ui/index.js'),
}
```

`tier: 'free'` — module loader gates Pro+ modules behind a license check; Cuelist Core is always loaded.

`requires.transports` — listed for documentation; OutputDispatcher pool actually owns these. Dispatch falls back to `not_implemented` for unavailable transports rather than failing module init.

`depends_on: []` — Cuelist Core is foundational. EventX Bridge, SHOW mode, and Custom Router will depend on it in future bundles.

## Lifecycle

`CuelistCore implements Module` (`src/CuelistCore.ts`):

| Hook | What happens |
|---|---|
| `init(ctx)` | Caches `ctx` reference, loads persisted config via `ctx.persisted.load(configSchema)`, sets `state = 'inited'` |
| `start()` | Future home of trigger engine + go channel instantiation (currently a logger emit). Reports healthy on HealthBus |
| `stop()` | Aborts via `ctx.abortSignal`, sets `state = 'stopped'` |
| `teardown()` | Idempotent cleanup; resets `state = 'idle'` |
| `getConfigSchema()` | Returns the Zod descriptor for IPC-driven settings UI |
| `onHealthCheck()` | Returns `{ healthy, message }` based on current state |

State transitions: `idle → inited → started → stopped → (teardown returns to idle)`.

Each hook respects `ctx.abortSignal`. Throwing in `start()` aborts module load; the loader marks it crashed and isolates other modules.

## Configuration

`src/config/schema.ts` defines the Zod schema. Defaults per data_model.md §12:

| Field | Default | Why |
|---|---|---|
| `autosave_interval_ms` | 30 000 | Tradeoff between responsiveness and disk churn |
| `history_rotation_size_bytes` | 50 000 000 | 50 MB before history.jsonl rotates |
| `history_rotation_max_age_days` | 10 | Whichever hits first |
| `presence_color_palette` | `null` | Q11 ruled SM-assignable at pairing; no fixed palette in 0.1 |
| `idempotency_lru_size` | 1000 | Q9 ruled default, configurable |

Config is persisted via `ctx.persisted` (B001-004 PersistedStore — encrypted-at-rest on macOS).

## Shared services consumed

Cuelist Core touches every shared service except `MdnsService` (mDNS is the shell's job):

- **Logger** — every mutator emits structured log lines
- **EventBus** — publishes `show-mode-change`, `cue-fire`, `go-dispatched`; subscribes to `cue-complete` from trigger engine
- **HealthBus** — reports `healthy` / `degraded` based on auto-recovery state
- **PersistedStore** — config + last-opened-show path
- **SecretStore** — pairing PINs (cleaned at startup), short-lived tokens
- **AssetServer** — serves `.showx/media/` files to PWAs over HTTP
- **SyncBroker** — embedded y-websocket broker; cuelist publishes side-channel envelopes here
- **OutputDispatcher** — fire-and-forget transport pool
- **InputRegistrar** — future OSC/MIDI listeners for external GO triggers (0.2)
- **PairingStore** — read-only; cuelist UI shows paired stations

## Where state lives

| State | Location |
|---|---|
| Show document (cues, payloads, meta) | Yjs Y.Doc, persisted as `<show>.showx/doc.yjs` |
| Show projection (JSON cache for inspection) | `<show>.showx/show.json`, `cuelists/*.json` |
| History (append-only event log) | `<show>.showx/history.jsonl` |
| Snapshots (pre-mode-flip) | `<show>.showx/snapshots/<timestamp>.json` |
| Cue catalog (for routing UI) | `<show>.showx/media/.cache/cue-catalog.json` |
| Module config | macOS Keychain via PersistedStore |
| Pairing PINs (short-lived) | SecretStore (memory + Keychain) |
| Live presence / awareness | Yjs awareness (in-memory, not persisted) |

## Hot reload / dev loop

Currently no hot reload. `pnpm dev:electron` rebuilds the main process from source. PWA has Vite HMR. Future task to add cuelist-core hot-reload via module loader.

## Seam to extension

To extend Cuelist Core without modifying it:

1. Listen on `EventBus` for `cue-fire`, `go-dispatched`, `show-mode-change`
2. Render extra UI in the Electron panel by mounting a custom React component via `manifest.uiPanel` (only one module can claim the main panel slot, but module-private panels are fine)
3. Add new payload types by extending the `Payload` discriminated union in `showx-shared` — but this requires upstream coordination

To extend by modifying:

- Add a new mutator → put it in `document/*.ts`, write tests, ensure it goes through `assertEditAllowed` if it touches show data
- Add a new trigger type → see [07-trigger-taxonomy.md](07-trigger-taxonomy.md)
- Add a new transport → see [09-payload-dispatch.md](09-payload-dispatch.md)
