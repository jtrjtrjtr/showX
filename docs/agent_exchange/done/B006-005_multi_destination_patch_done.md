---
id: "B006-005"
title: "Multi-destination patch — primary + backup"
status: done
round: 1
---

## Summary

Implemented failover backup device per routing rule. When a routing rule's primary dispatch fails, the payload is retried via the backup device if one is configured. Backup is never sent when primary succeeds.

## Files changed

- `src/modules/cuelist-core/src/document/routing.ts` — `RoutingRule` gains optional `backup_device_id?: string`. `addRoutingRule` and `updateRoutingRule` validate backup_device_id against the devices map.
- `src/modules/cuelist-core/src/dispatch/resolveRouting.ts` — Refactored `resolveRoutingForPayload` to use shared helper `findBestMatchingRuleWithTransport`. Added `resolveRoutingWithBackup` that returns primary + optional backup transport descriptor.
- `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts` — Added `payloadToResolveParams` (extracts routing params from osc/msc/lx_ref/midi payloads) and `buildBackupRoutingTable` (creates single-entry routing table for backup dispatch). Failover logic in `dispatchCue`: primary fail → attempt backup; detail transport label becomes `osc→backup` etc. when backup fires.
- `src/modules/cuelist-core/src/ui/RoutingTable.tsx` — Added "Backup Device" column. Shows backup device label + health dot, or "—" if unset. Header renamed "Target Device" → "Primary Device".
- `src/modules/cuelist-core/src/ui/RoutingRuleEditDialog.tsx` — Added "Backup Device (failover, optional)" dropdown field. Target Device label updated to "Target Device (primary)".
- `tests/unit/modules/cuelist-core/dispatch/backupFailover.test.ts` — New test file: 13 tests covering resolveRoutingWithBackup, addRoutingRule backup validation, and 5 dispatchCue failover scenarios.

## Tests run

```
pnpm vitest run — 149 test files, 1890 tests, all pass
pnpm --filter showx-pwa build — clean
pnpm -r typecheck — clean
```

## Decisions

- **Failover semantics only** (backup only on primary fail). Both-send (primary + backup always) is out of scope per task spec.
- **Dispatch log label**: `${payloadType}→backup` when backup fires (e.g. `osc→backup`). This appears in `CueDispatchResult.details[].transport` and flows into `buildTransportSummary` in GoExecutor.
- **Scope limited to osc/msc/lx_ref/midi**: `dmx` is not in `RulePayloadType` so is excluded from backup resolution. `webhook`/`wait`/`group` don't use device routing and are also excluded.
- **Fake routing table for backup dispatch**: backup retry calls the same transport dispatch functions with a single-entry routing table mapping `payload.device_id` → backup transport (device_id match = specificity 4). No transport files were modified.
- **No behavior change when backup_device_id unset**: the `payloadToResolveParams` + `resolveRoutingWithBackup` path is only entered on primary failure; all existing dispatch paths are unchanged.

## Notes for Critic

- The `resolveRoutingForPayload` refactor (extracting `findBestMatchingRuleWithTransport`) preserves all existing behavior — all 19 existing `resolveRouting.test.ts` tests still pass.
- The `RoutingTable.tsx` has a renamed header ("Primary Device" instead of "Target Device") — may want to confirm this is the right terminology in the UI.
- The fake routing table approach (`__backup__` key) works because `resolveDeviceTransport` picks by highest specificity; device_id match (specificity 4) always wins in the single-entry table.
- `updateRoutingRule` validates `backup_device_id` against devices but requires device to exist; clearing backup via `patch.backup_device_id = undefined` calls `m.delete('backup_device_id')` which is correct.
