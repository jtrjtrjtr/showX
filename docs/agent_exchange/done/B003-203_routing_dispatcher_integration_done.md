---
id: "B003-203"
title: "Routing UI dispatcher integration — wire RoutingRule shape into resolveRouting"
status: "done"
round: 1
started_at: "2026-06-07T17:30:00Z"
ended_at: "2026-06-07T18:15:00Z"
---

## Summary

Wired the B003-101 `RoutingRule` shape (with `target_device_id`) into the dispatch path. Rules created via the Routing UI now actually drive `resolveRouting` → `OutputDispatcher` → hardware output.

## Files Changed

### Modified
- `src/modules/cuelist-core/src/dispatch/resolveRouting.ts` — kept all old exports intact for backward compat; added:
  - `resolveRoutingForPayload(doc, params)` — Y.Doc-based resolver with new precedence (class 1: exact device_id match > class 2: payload_type+tag_pattern; sort_key tiebreak)
  - `buildDispatchRoutingTable(doc)` — adapter that builds legacy `Record<string, RoutingEntry>` from Y.Doc, handling both old-shape (plain embedded transport) and new-shape (target_device_id lookup) rules
  - `deviceToTransportDescriptor()` — converts `Device` fields to `TransportDescriptor` (OSC encoding from driver, midi_port for MIDI/MSC, etc.)

- `src/modules/cuelist-core/src/document/routing.ts` — updated `getRoutingRules()`:
  - Defensive: skips plain-object values in Y.Map (old test fixture style) without crash
  - Detects Y.Map entries missing `target_device_id` (old-shape) and runs field-rename migration in a single transaction: `id → rule_id`, adds default `sort_key`, renames `match.tag → match.tag_pattern`
  - Old-shape rules without `target_device_id` are excluded from returned results (cannot auto-generate device link without device registry)
  - Migration is idempotent — second call on same doc produces same result

- `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts` — 2-line change:
  - Imports `buildDispatchRoutingTable`
  - Replaces `deps.doc.getMap('routing').toJSON() as Record<string, RoutingEntry>` with `buildDispatchRoutingTable(deps.doc)`

### New Tests
- `tests/unit/modules/cuelist-core/dispatch/resolveRouting.test.ts` — extended with 12 new `resolveRoutingForPayload` tests:
  - Exact device_id match (class 1) wins over tag_pattern match (class 2)
  - Literal tag_pattern match
  - Regex tag_pattern match (`^LX` matches both `LX` and `LX_FOLLOW`)
  - sort_key precedence within same class
  - Missing device returns `{ error: 'no_route' }`
  - LX drivers (eos, ma3, hog4) map to correct `OscTransport.encoding` field
  - MIDI device returns `MidiTransport`
  - Empty match (catch-all) matches any payload_type
  - Error when no rules

- `tests/unit/modules/cuelist-core/document/routing.test.ts` — extended with 5 new migration/backward-compat tests:
  - Idempotency: calling `getRoutingRules` twice returns same rules
  - Plain object old fixtures are skipped without crash
  - Y.Map rule without `target_device_id` excluded from results
  - Migration renames `id→rule_id`, `tag→tag_pattern`, adds `sort_key` (idempotent)
  - New-shape rules (B003-101) returned correctly after migration pass

## Tests Run

```
✓ resolveRouting.test.ts — 19 tests (7 legacy + 12 new)   all pass
✓ document/routing.test.ts — 21 tests (16 existing + 5 new)   all pass
✓ payloadDispatch.test.ts — 10 tests   all pass
✓ transports/ — 32 tests   all pass (no regressions)
✓ TypeScript strict typecheck — clean across all 5 packages
```

Pre-existing failures (not related to this task):
- `tests/unit/pwa/App.test.tsx > switches to show mode after successful pairing` — timeout (M in git status at session start)
- `tests/unit/modules/cuelist-core/catalog/cueCatalog.test.ts` — ENOTEMPTY temp dir race condition

## Decisions Within Scope

1. **`payloadDispatch.ts` updated** (not in spec target_files but necessary): Without this change, the new `RoutingRule` shape is never consulted during dispatch — the routing UI remains cosmetic. This is a 2-line change that satisfies the task goal without touching any transport files.

2. **Old-shape rules without `target_device_id` are excluded from `getRoutingRules()` results** rather than auto-migrated to devices: Cannot safely create a Device entry from a plain transport descriptor (we'd need to invent a device_id and potentially conflict with existing devices). `buildDispatchRoutingTable()` handles these via the old-shape pass-through, so dispatch continues to work for them.

3. **Migration field renames run even for rules excluded from results**: The `id→rule_id` and `tag→tag_pattern` renames are safe metadata fixes. Applying them now means if a device is later added for the `target_device_id`, the rule will be ready.

## Notes for Critic

- Verify `resolveRoutingForPayload` precedence matches data_model.md §10.3: class 1 (device_id exact match) beats class 2 (payload_type + optional tag_pattern); within same class, sort_key ascending.
- Verify `buildDispatchRoutingTable` correctly builds legacy table for BOTH old-shape (plain objects from test fixtures, embedded transport) and new-shape (Y.Map with target_device_id).
- Verify migration idempotency: running `getRoutingRules` twice on a doc with old-shape rules should produce same result (no duplicate mutations).
- Verify all existing transport tests (`dispatch/transports/`) still pass — they use `resolveDeviceTransport` directly with old-shape Records, unchanged.
- Out of scope: regex compilation validation in tag_pattern (task note permits literal matching; regex is attempted but invalid patterns silently skip).
- Out of scope: real OSC hardware test.
- Out of scope: B002-* tasks (scope locked to B003-201/202/203).
