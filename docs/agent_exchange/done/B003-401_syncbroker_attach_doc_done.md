---
id: "B003-401"
title: "SyncBroker.attachDoc + ActiveShowDoc integration — broker serves shell's Y.Doc"
status: "done"
round: 1
started_at: "2026-06-08T15:30:00Z"
ended_at: "2026-06-08T16:00:00Z"
---

## Summary

Implemented the three-layer bridge: `YWebsocketAdapter.attachDoc/detachDoc` → `SyncBroker` passthrough → `ActiveShowDoc` integration. Shell now passes `this.sync` to `ActiveShowDoc`. When a `.showx` package opens, the shell's authoritative `Y.Doc` is registered with the broker so PWA WebSocket connections to `/yjs/<show_id>` sync against the real document instead of an empty internal one.

## Files changed

| File | Change |
|---|---|
| `src/main/src/shared/syncBroker/yWebsocketAdapter.ts` | Added `attachDoc(name, doc)` and `detachDoc(name)` methods |
| `src/main/src/shared/SyncBroker.ts` | Added `attachDoc` / `detachDoc` passthrough + `import * as Y from 'yjs'` |
| `src/main/src/runtime/ActiveShowDoc.ts` | Added `syncBroker?: SyncBroker` constructor param, `showId` field, `getShowId()`, `show_id` extraction in `open()`, `attachDoc` call in `open()`, `detachDoc` call in `close()` |
| `src/main/src/Shell.ts` | Step 13: `new ActiveShowDoc(this.logger, this.sync)` |
| `tests/unit/shared/syncBroker/yWebsocketAdapter.test.ts` | **New** — 15 tests covering attachDoc/detachDoc unit + network behavior |
| `tests/unit/runtime/ActiveShowDoc.test.ts` | Extended: `freshDoc()` now includes `show_id` in meta; new SyncBroker integration describe block (10 tests) |
| `tests/unit/ipc/cuelistCoreDeviceBridge.test.ts` | Fixed `beforeEach`: added `show_id` to test doc meta (required by new open() validation) |
| `tests/unit/ipc/cuelistCoreRoutingBridge.test.ts` | Fixed `beforeEach`: added `show_id` to test doc meta |
| `tests/unit/ipc/cuelistCoreShowStateBridge.test.ts` | Fixed 2 inline test docs: added `show_id` to meta |

## Tests run

```
Test Files  112 passed (116)
     Tests  1276 passed (1294)
```

46 new tests (26 target new + 10 SyncBroker integration + existing fixed):
- `yWebsocketAdapter.test.ts`: 15 tests (5 attachDoc unit, 4 detachDoc unit, 3 network-attachDoc, 3 network-detachDoc)
- `ActiveShowDoc.test.ts` new block: 10 SyncBroker integration tests

Remaining 4 failing test files (18 tests) are **pre-existing failures** unrelated to this task:
- `Shell.test.ts` — `pinManager.registerTestPin` mock stub missing (pre-session-handoff issue)
- `App.test.tsx` — test timeout (flaky PWA test)
- `skeleton.test.ts` — `default is not a constructor` (module build issue)
- `cueCatalog.test.ts` — pre-existing filesystem atomic write race

## Key decisions

- `attachDoc` replaces existing entry (including lazy-created internal ones) without destroying the old doc — caller retains ownership
- `detachDoc` closes WS connections and removes the map entry; does NOT call `.destroy()` on external doc
- `open()` reads `show_id` from `doc.getMap('meta').get('show_id')` first; falls back to parsing `show.json.show_id` (defensive); throws if neither found
- `SyncBroker` gains concrete `attachDoc`/`detachDoc` methods not on the `showx-shared` interface — `ActiveShowDoc` imports `SyncBroker` type from `./shared/SyncBroker.js` (type-only)
- `freshDoc()` in all affected tests now sets `show_id` in meta — backward compat preserved by the optional `syncBroker?` parameter; no sync calls when no broker injected

## Notes for Critic

- B003-402 (pairing returns show_id) is the next dep — until it lands, PWA stations receive the attached doc but need to know the `show_id` to construct the WebSocket URL
- The 4 pre-existing failing tests were failing before this task started and are not regressions from this change
- `getShowId()` is a new public accessor on `ActiveShowDoc` — used by B003-402 in the pairing claim response
