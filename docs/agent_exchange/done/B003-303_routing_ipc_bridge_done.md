---
id: "B003-303"
slug: "routing_ipc_bridge"
title: "Routing IPC bridge — 4 invoke handlers + routing-changed broadcast"
status: "done"
owner: "forge"
review_round: 0
started_at: "2026-06-08T00:10:00Z"
ended_at: "2026-06-08T00:30:00Z"
---

## Summary

Implemented `cuelistCoreRoutingBridge` — 5 IPC invoke handlers (`get-routing`, `routing-add`, `routing-update`, `routing-remove`, `routing-reorder`) bridging `ActiveShowDoc` (B003-301) to the existing `src/modules/cuelist-core/src/document/routing.ts` CRUD layer. Y.Doc `observeDeep` listener on the `routing` map broadcasts `cuelist-core/routing-changed` for external mutations. Wired into `Shell.ts` boot after `registerDeviceBridge`.

## Files Changed

| File | Change | LOC delta |
|---|---|---|
| `src/main/src/ipc/cuelistCoreRoutingBridge.ts` | **NEW** — bridge implementation | +90 |
| `src/main/src/Shell.ts` | **MODIFIED** — import + register call | +2 |
| `tests/unit/ipc/cuelistCoreRoutingBridge.test.ts` | **NEW** — 18 unit tests | +260 |

## Decisions Made Within Task Scope

### Import path: dist/ relative imports

Used `../../../modules/cuelist-core/dist/document/routing.js` (compiled output) following the B003-301/302 precedent. The `routing.d.ts` declaration file was already written by B003-302.

### Double-broadcast by design

Mutation handlers call `broadcastRoutingChanged` explicitly AND the Y.Doc `observeDeep` also fires. The `observeDeep` exists to catch external mutations (multi-station collab via Yjs, undo/redo). The double-broadcast on the IPC-initiated path is intentional — the renderer is idempotent.

### Transact nesting

Each mutation handler wraps the document function in `doc.transact()`. The document functions (`addRoutingRule`, `updateRoutingRule`, etc.) also have their own internal `doc.transact`. Yjs nested transactions coalesce; observe callbacks fire once when the outermost transaction completes. No state corruption risk.

### `addRoutingRule` return capture

`addRoutingRule` returns the created rule synchronously inside a `doc.transact()` callback. Used `let created!: RoutingRule` (definite-assignment assertion) to satisfy TypeScript strict mode.

### No length-mismatch validation in bridge

The `reorderRoutingRules` document function throws if a provided `ruleId` is not found, but does not validate that all existing rules are present in `newOrder`. The spec notes "mismatched length throws" — this refers to the frontend's responsibility. The bridge surfaces whatever the document layer throws.

## Acceptance Criteria Checklist

- [x] `registerRoutingBridge(activeShow, ipc, logger)` exported from new file
- [x] `cuelist-core/get-routing` → returns `RoutingRule[]` via `getRoutingRules(doc)`; returns `[]` if no active show
- [x] `cuelist-core/routing-add` → transact wrapping, returns created rule with `rule_id` + `sort_key`, broadcasts
- [x] `cuelist-core/routing-update` → transact wrapping, broadcasts, returns `{ ok: true }`
- [x] `cuelist-core/routing-remove` → transact wrapping, broadcasts, returns `{ ok: true }`
- [x] `cuelist-core/routing-reorder` → transact wrapping, broadcasts, returns `{ ok: true }`
- [x] Y.Doc `observeDeep` on `doc.getMap('routing')` broadcasts on external mutation
- [x] `observeDeep` subscribed on `'opened'`, unsubscribed on `'closed'`
- [x] `'closed'` broadcasts `[]` to clear UI state
- [x] Mutation handlers throw `'No show open'` when doc is null
- [x] `get-routing` returns `[]` when doc is null
- [x] Wired in `Shell.ts` boot after `registerDeviceBridge`
- [x] Logger writes `logger.debug('routing.ipc', { channel, ruleId? })` per call
- [x] `pnpm --filter showx-main typecheck` clean (0 errors)
- [x] 18 new tests pass; 0 new failures introduced

## Tests Run

```
✓ tests/unit/ipc/cuelistCoreRoutingBridge.test.ts  (18 tests) 21ms

Full suite: 1253 passed | 11 failed (same 11 pre-existing failures as B003-302 baseline, minus 1 intermittent cueCatalog race)
```

Pre-existing failures (unchanged):
- `Shell.test.ts` — `test:getPort` channel never registered in `ipc/index.ts`
- `skeleton.test.ts` (9) — `default is not a constructor` (cuelist-core index.ts pre-existing issue)
- `App.test.tsx` — pairing timeout

## Notes for Critic

- `routing-add` returns the full `RoutingRule` (with assigned `rule_id` and `sort_key`) as specified. The document function returns synchronously so the definite-assignment assertion is safe.
- `routing-reorder` does not validate that the provided `ruleIds` array covers all existing rules. The document layer only validates that each provided ID exists. The spec's "mismatched length throws" is a frontend concern.
- B003-304 (show-state IPC) follows the same pattern and can now be implemented.
