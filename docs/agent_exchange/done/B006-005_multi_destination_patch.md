---
id: "B006-005"
title: "Multi-destination patch — primary + backup"
type: "implementation"
estimated_size_lines: 360
priority: "P1"
bundle: "ShowX-6"
depends_on: []
target_files:
  - "src/modules/cuelist-core/src/document/routing.ts"
  - "src/modules/cuelist-core/src/dispatch/resolveRouting.ts"
  - "src/modules/cuelist-core/src/dispatch/payloadDispatch.ts"
  - "src/modules/cuelist-core/src/ui/RoutingTable.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "RoutingRule (routing.ts:15-21) gains optional `backup_device_id?: string`. When set, a payload routed by that rule sends to the primary target; if the primary DispatchResult.ok===false, it sends to the backup (failover). Both-send vs failover: implement FAILOVER (backup only on primary fail) — documented."
  - "resolveRouting/payloadDispatch (resolveRouting.ts:178-213, payloadDispatch.ts:143-200) handle the backup: attempt primary, on failure attempt backup, aggregate result (ok if either succeeded). Dispatch Log shows which device fired (primary or backup-after-failover)."
  - "RoutingTable UI lets the user set a backup device per rule (optional dropdown). Clear which is primary vs backup."
  - "No behavior change when backup_device_id unset (single-target, exactly as today)."
  - "Unit tests: primary ok → backup not attempted; primary fail → backup attempted; both fail → error; unset backup → unchanged; log reflects fired device."
  - "`pnpm --filter showx-pwa build` clean (if PWA touched), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §4 + competitive map P1 (QLab multi-destination primary+backup). For redundancy (main + backup console/server). Keep it to primary+backup failover, not arbitrary fan-out.

## Implementation notes

- routing.ts RoutingRule add optional field; resolveRouting returns primary + optional backup descriptor.
- Failover semantics (backup only on primary fail) — simplest, matches 'backup' intent.

## Test plan

- See ACs. Cover ok/fail/both-fail/unset.

## Out of scope

- N-way fan-out. Health (B006-003).
