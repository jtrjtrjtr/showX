---
id: "B003-203"
title: "Routing UI dispatcher integration — wire RoutingRule shape into resolveRouting"
type: "implementation"
estimated_size_lines: 300
priority: "P1"
depends_on: []
target_files:
  - "src/modules/cuelist-core/src/dispatch/resolveRouting.ts"
  - "src/modules/cuelist-core/src/document/routing.ts"
  - "src/types/routing.ts"
  - "src/shared/src/types/routing.ts"
  - "tests/unit/modules/cuelist-core/dispatch/resolveRouting.test.ts"
  - "tests/unit/modules/cuelist-core/document/routing.test.ts"
acceptance_criteria:
  - "`src/modules/cuelist-core/src/dispatch/resolveRouting.ts` accepts the new `RoutingRule` shape from B003-101 (with `target_device_id` field) AND maintains backward compatibility with any rules in the wild from prior to B003-101"
  - "Resolver reads routing rules from `show.routing` Y.Map (B003-101 storage) and matches them against payloads. Precedence per data_model.md §10.3:\n  1. Exact `match.device_id` match (rule matches if payload.device_id equals this rule's match.device_id)\n  2. `match.payload_type` + optional `match.tag_pattern` match (payload type matches, and if tag_pattern set, payload._tag matches as literal or regex)\n  3. Sort by `sort_key` ascending; first match wins"
  - "Matched rule's `target_device_id` looked up in `show.devices`; returns `TransportMessage` with destination from device (host + port for OSC, midi_port for MIDI, etc.)"
  - "No match → returns `{ error: 'no_route' }` per existing contract"
  - "Migration: if a show has the old `RoutingRule` shape (different field names per data_model.md §10.3 v0 / what existed before B003-101), `getRoutingRules` in document/routing.ts auto-migrates them in-place on load. Idempotent."
  - "Resolver also returns the `sourceURI` trailing arg for OSC (per protocol_dictionary.md §3.2) — EXCEPT for LX consoles (per B003-009 self-rescue fix: lxRef driver does NOT append sourceURI)"
  - "Tests cover: exact device_id match wins over tag_pattern; tag_pattern regex match; sort_key precedence; missing device returns error; LX driver omits sourceURI"
  - "Existing `dispatch/transports/*` tests still pass (they shouldn't need to change — TransportMessage shape unchanged)"
  - "B003-101 RoutingTable UI tests still pass (storage shape unchanged on the writer side)"
  - "Full suite passing; no regressions"
  - "TypeScript strict typecheck clean"
---

## Context

Per Critic B003-101 review (and Architect's audit), the Routing UI built in B003-101 stores routing rules with shape `{ rule_id, sort_key, match: { payload_type, tag_pattern, device_id }, target_device_id }` but the existing `dispatch/resolveRouting.ts` was built before B003-101 and reads the OLD shape. The Routing tab in CuelistCorePanel is cosmetic until this is fixed.

This task bridges the two. After 3.2 lands, a rule created via the UI actually drives `dispatch/resolveRouting` → output dispatch → hardware fires.

## Implementation notes

### Old shape (pre-B003-101)

Look at git history or the existing tests for `resolveRouting`. Likely something like:

```ts
type OldRoutingRule = {
  // Whatever data_model.md §10.3 had before the table UI shape
}
```

Forge: inspect `resolveRouting.ts` to see what it currently reads. Write a small migration `migrateOldRoutingRule(rule): NewRoutingRule` if needed.

### New shape (B003-101)

```ts
type RoutingRule = {
  rule_id: string;
  sort_key: number;
  match: {
    payload_type?: 'osc' | 'msc' | 'lx_ref' | 'midi' | 'webhook' | 'wait' | 'group';
    tag_pattern?: string;
    device_id?: string;
  };
  target_device_id: string;
  notes?: string;
};
```

### Precedence

Per data_model.md §10.3, most-specific wins:

1. Exact device match (rule has `match.device_id` and payload has `device_id`) → highest priority
2. Tag pattern match (rule has `match.tag_pattern`) — literal or regex matching against `payload._tag`
3. Type only (rule has only `match.payload_type`) — fallback

Among rules of same precedence class, sort by `sort_key` ascending; first match wins.

### Migration

Inside `getRoutingRules(doc)` (B003-101), check if rule has `target_device_id` field. If not, run migration to upgrade in place. Run inside `doc.transact(...)`. Idempotent — calling twice produces same result.

### sourceURI

OSC payloads get a trailing `sourceURI` arg per protocol_dictionary.md §3.2 EXCEPT when the target device's driver is one of `eos | ma3 | hog4 | chamsys` (the LX consoles reject extra trailing args — fix from B003-009 round 2). Handled in `transports/lxRef.ts`; this task should NOT touch it but verify it still works after routing changes.

## Notes for Critic

- Verify precedence rules per data_model.md §10.3 exactly
- Verify migration is idempotent (test: call twice on same doc, assert same state)
- Verify backward compat with rules from before B003-101 (use a fixture if needed)
- Verify dispatch tests still pass (`tests/unit/modules/cuelist-core/dispatch/`)
- Out of scope: real OSC hardware test
- Out of scope: regex compilation in tag_pattern (literal matching is OK for 0.1)

## Why this matters

Closes the loop from "Routing tab UI" to "actual OSC packet leaves the Mac." Without this task, the routing UI is decorative.
