# Cuelist Core module — developer documentation

The Cuelist Core module is the foundation of ShowX as a product. Everything in ShowX-3 (and the next bundle) builds on the pieces documented here.

This directory complements the binding specs in `docs/specs/` — the specs define WHAT the system does; these docs explain HOW the implementation works, decisions made along the way, and the seams a developer needs to touch when extending.

## Feature catalog

| Doc | What it covers |
|---|---|
| [01-overview.md](01-overview.md) | Module shape, manifest, lifecycle (init/start/stop/teardown), shared service consumption, where each piece of state lives |
| [02-document-model.md](02-document-model.md) | Yjs CRDT document tree (Show / Cuelist / Cue / Payload), factory functions, mutator API, sort_key reorder workaround |
| [03-persistence.md](03-persistence.md) | `.showx` package read/write, atomic file writes, history.jsonl append-only log, recovery on corruption, migration system |
| [04-rehearsal-show-mode.md](04-rehearsal-show-mode.md) | REHEARSAL ↔ SHOW state machine, edit lock guards, snapshot-before-flip ordering, calling-layer integration |
| [05-view-filter.md](05-view-filter.md) | Per-department `visibleCues` / `isActionable` / `isContextOnly` algorithm, WeakMap memoization for referential equality, reactive subscriptions |
| [06-compound-cues.md](06-compound-cues.md) | Compound cue model (≥2 depts), payload tagging heuristic (Q4), split/merge mutators, invariant assertions |
| [07-trigger-taxonomy.md](07-trigger-taxonomy.md) | Manual / auto_follow / auto_continue / timecode triggers, scheduler with loop guard + cancellation, Q5 default (null duration_hint → fire-immediately) |
| [08-go-event-channel.md](08-go-event-channel.md) | Side-channel transport, sequence counter, idempotency LRU, replay window, ring buffer + gap envelope, 4 go_authority modes |
| [09-payload-dispatch.md](09-payload-dispatch.md) | Per-cue dispatch pipeline, routing resolution, transports (OSC / MSC / LXRef / MIDI / Webhook / Wait / Group), cycle detection |
| [10-cue-catalog.md](10-cue-catalog.md) | Publishing aggregated cue catalog for routing UI, 100ms debounce, atomic cache write |
| [11-pwa-data-layer.md](11-pwa-data-layer.md) | PWA-side connection + sync, useSyncExternalStore hook patterns, SideChannelClient with exponential backoff, awareness |
| [12-pwa-ui-components.md](12-pwa-ui-components.md) | SM master + 7 Operator variants + GO button + cue editor — component tree, design tokens, keyboard shortcuts, payload editors |
| [13-import-export.md](13-import-export.md) | CSV import (QLab/Eos/generic dialect heuristics), JSON .showx export + single-file roundtrip, PDF cue-sheet via pdf-lib |
| [14-stream-deck.md](14-stream-deck.md) | Companion community module structure, side-channel URL pattern, action/feedback/variable/preset mapping |
| [15-testing-strategy.md](15-testing-strategy.md) | Vitest unit + Playwright E2E layout, fixture conventions, CRDT merge testing patterns, mocking transport injection |

## Reading order

For new contributors:

1. Read this index + spec `docs/specs/module_loader.md` for module pattern
2. Read [01-overview.md](01-overview.md) — what cuelist-core looks like
3. Read [02-document-model.md](02-document-model.md) — the data is the product
4. Pick a feature you're touching and read its doc

For debugging:

- Bug in cuelist data → [02](02-document-model.md), [03](03-persistence.md)
- Bug in GO authority → [08](08-go-event-channel.md)
- Bug in payload not firing → [09](09-payload-dispatch.md)
- Bug in PWA UI → [11](11-pwa-data-layer.md), [12](12-pwa-ui-components.md)
- Bug in import / export → [13](13-import-export.md)

## Spec → impl crosswalk

Binding specs live at `docs/specs/`:

- `data_model.md` → implemented in [02](02-document-model.md), [03](03-persistence.md), [04](04-rehearsal-show-mode.md), [05](05-view-filter.md), [06](06-compound-cues.md)
- `protocol_dictionary.md` → implemented in [07](07-trigger-taxonomy.md), [08](08-go-event-channel.md), [09](09-payload-dispatch.md), [10](10-cue-catalog.md)
- `module_loader.md` → implemented in [01](01-overview.md)
- `pairing_auth.md` → implemented in `src/main/src/shared/PairingStore.ts` (B001-009, not here)

## Source tree

```
src/modules/cuelist-core/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                   # public exports (manifest, CuelistCore class)
│   ├── manifest.ts                # ModuleManifest
│   ├── CuelistCore.ts             # Module class (lifecycle)
│   ├── config/schema.ts           # Zod config + defaults
│   ├── document/                  # Yjs CRDT layer [doc 02]
│   │   ├── show.ts                # Show + meta + 7 root Y.Maps
│   │   ├── cuelist.ts             # Cuelist accessors + getCuesSorted
│   │   ├── cue.ts                 # Cue factory + mutators (addCue, reorderCues via sort_key)
│   │   ├── payload.ts             # Payload validation + factories
│   │   ├── schema.ts              # Re-exports
│   │   └── uuid.ts                # UUIDv7 helper (RFC 9562)
│   ├── persistence/               # .showx package I/O [doc 03]
│   │   ├── showxPackage.ts        # open/save coordination
│   │   ├── atomicWrite.ts         # write-temp-then-rename
│   │   ├── projections.ts         # Y.Doc ↔ JSON conversions
│   │   ├── historyJsonl.ts        # append-only event log
│   │   ├── recovery.ts            # corruption rebuild
│   │   └── infoPlist.ts           # UTI registration
│   ├── mode/                      # REHEARSAL ↔ SHOW [doc 04]
│   │   ├── rehearsalState.ts      # assertRehearsal / assertShow guards
│   │   ├── transitions.ts         # transitionMode (snapshot-then-flip)
│   │   ├── snapshot.ts            # snapshot file write
│   │   └── lockGuards.ts          # assertEditAllowed for mutators
│   ├── views/                     # per-dept filter [doc 05]
│   │   ├── departmentFilter.ts    # visibleCues + WeakMap memo
│   │   ├── highlights.ts          # highlightedPayloads / dimmedPayloads
│   │   └── viewProfiles.ts        # role → owned/watched defaults
│   ├── cue/                       # compound cues [doc 06]
│   │   ├── compoundCue.ts         # split / merge
│   │   ├── payloadOps.ts          # tag-based grouping
│   │   └── invariants.ts          # assertCueInvariants
│   ├── trigger/                   # auto-fire scheduler [doc 07]
│   │   ├── triggerEngine.ts       # TriggerEngine class
│   │   ├── scheduler.ts           # schedule() / isAutoTriggered
│   │   └── types.ts
│   ├── go/                        # GO event channel [doc 08]
│   │   ├── goEventChannel.ts      # main class + ring buffer + gap envelope
│   │   ├── sequence.ts            # SequenceCounter
│   │   ├── replayWindow.ts        # historic_replay classifier + RingBuffer
│   │   ├── idempotencyStore.ts    # LRU keyed by (show_id, request_id)
│   │   └── authority.ts           # authorise() across 4 modes
│   ├── dispatch/                  # payload → transport [doc 09]
│   │   ├── payloadDispatch.ts     # dispatchCue main loop
│   │   ├── resolveRouting.ts      # routing precedence
│   │   ├── cycleDetect.ts         # group recursion guard
│   │   ├── types.ts
│   │   └── transports/            # 7 transport adapters
│   │       ├── osc.ts, msc.ts, lxRef.ts, midi.ts, webhook.ts, wait.ts, group.ts
│   ├── catalog/                   # cue catalog publish [doc 10]
│   │   ├── cueCatalog.ts          # CatalogPublisher + computeCueCatalog
│   │   ├── summarize.ts           # summarizePayload (all 7 types)
│   │   └── cacheWrite.ts          # atomic cue-catalog.json write
│   ├── import/                    # CSV import [doc 13]
│   │   ├── csvImport.ts           # main importCsv entry
│   │   ├── csvDialects.ts         # QLab / Eos / Generic detection
│   │   ├── csvHeuristics.ts       # per-dialect field mapping
│   │   └── index.ts
│   ├── export/                    # JSON + PDF export [doc 13]
│   │   ├── singleFileExport.ts    # single .json envelope
│   │   ├── showxExport.ts         # .showx package export
│   │   ├── pdfExport.ts           # PDF entry
│   │   ├── pdfLayout.ts           # render functions
│   │   ├── pdfStyles.ts           # A4 constants
│   │   └── index.ts
│   ├── ui/                        # Electron panel UI
│   │   ├── CuelistCorePanel.tsx
│   │   ├── StatusStrip.tsx
│   │   ├── ShowFilePicker.tsx
│   │   ├── StationsTable.tsx
│   │   ├── tokens.ts
│   │   └── index.ts
│   └── migrations/                # schema migration registry (empty stub for 0.1)
│       └── index.ts
└── tests/unit/modules/cuelist-core/
    └── (mirrors src/ layout)
```

PWA components live in `pwa/src/components/cuelist/` and PWA hooks in `pwa/src/hooks/` — documented in [11](11-pwa-data-layer.md) and [12](12-pwa-ui-components.md).
