# 06 — Compound cues

A cue with payloads for two or more departments fired by one GO. Example: "BLACKOUT" cue containing LX scene 47 + SX music stop + VIDEO fade-to-black.

## Why they matter

Theatre cues often coordinate. Without compound cues you'd need:

- LX 47 (manual, dept LX)
- SX mute (auto-continue 0ms after LX 47, dept SX)
- VIDEO fade (auto-continue 0ms after LX 47, dept VIDEO)

That's 3 cues with race-condition timing. A compound cue is one atomic operation.

## Structure

A compound cue is just a regular cue with `department.length >= 2`. Payloads inside carry an implicit dept (Q4: inferred from cue + tag heuristic in 0.1; first-class field in 0.2).

```ts
const compound = makeCompoundCue({
  departments: ['LX', 'SX', 'VIDEO'],
  label: 'Blackout',
  payloads: [
    { type: 'lx_ref', cue_number: 47, _tag: 'LX' },
    { type: 'osc',    address: '/qlab/cue/mute', _tag: 'SX' },
    { type: 'osc',    address: '/notch/fade/black', _tag: 'VIDEO' },
  ],
})
```

`_tag` is a free-text discriminator used by the heuristic. The payload editor in PWA writes the canonical tag based on the dept selector.

## Mutators

`src/cue/compoundCue.ts`:

```ts
makeCompoundCue(init): Y.Map<unknown>            // factory with ≥2 dept assertion
isCompound(cue): boolean
splitCompoundCue(cuelist, cue): Y.Map<unknown>[] // distributes payloads, returns new cues
mergeCues(cuelist, cueIds, mergedInit): Y.Map<unknown>  // concat depts + payloads
```

### splitCompoundCue

Distributes payloads to per-dept cues. For each dept in original:

1. Create new cue with `department = [dept]`
2. Pick payloads where `_tag === dept` (or fall back to first dept if untagged)
3. New cue's `sort_key` = `original.sort_key + i * 0.001` (preserves ordering)
4. Original cue is removed
5. All new cues inherit label suffix (e.g., "Blackout · LX", "Blackout · SX")

Returns array of new Y.Map references (already integrated).

### mergeCues

Inverse: takes ≥2 cue IDs, combines into one compound:

- `department = dedupe(union(cue.department))`
- `payloads = concat(all payloads, tagging each with source cue's first dept)`
- `sort_key = first cue's sort_key`
- Other cues removed

Cycle detection: if any source cue is itself compound, payloads keep their tags (no double-tagging).

## Invariants

`src/cue/invariants.ts` — `assertCueInvariants(cue)`:

| Check | Why |
|---|---|
| `department.length >= 1` | Q6 ruling: every cue must own at least one dept |
| `unique(department)` | dedupe LX/LX → just LX |
| `unique(payloads.id)` | Y.Array CRDT can produce dup ids on concurrent add; catch on read |
| `payload.type in known types` | forward-compat: `unknown_*` types allowed (won't dispatch but won't crash) |

**Critical:** invariants must run on the INTEGRATED Y.Map (post-`cues.push`), not the prelim map. Validation order: pre-integration validates input shape, post-integration validates merge result.

The B003-006 round 1 issue was: `assertCueInvariants` was defined, exported, tested, but NEVER called from mutators. Round 2 wired 8 call sites:

```
cue.ts:         addCue, insertCueAfter, setCueDepartments
payload.ts:     addPayload, removePayload, updatePayload
compoundCue.ts: makeCompoundCue, splitCompoundCue (per new cue), mergeCues
payloadOps.ts:  reorderPayloads
```

Wrapper: `assertCueMapValid(cueMap)` is the private helper invoked after each `doc.transact(...)` — keeps the call short at use site.

## payloadOps

`src/cue/payloadOps.ts`:

```ts
payloadsByDepartment(cue, allDepts): Map<dept, Payload[]>
addPayloadWithDepartmentTag(cue, payload, dept): Y.Map<unknown>
reorderPayloads(cue, newOrder: payloadId[]): void
```

`payloadsByDepartment` uses the Q4 heuristic — tag wins, then cue.department.length === 1 fallback, then "all-dept" bucket for compound un-tagged.

`reorderPayloads` is delete-all + reinsert (Y.Array doesn't support O(1) reorder; we accept the cost because payload reorder is rare).

## Operator view interaction

Compound cues in the LX Operator view show only LX-tagged payloads in bold; SX/VIDEO payloads are visible as dimmed context (PT's awareness of the bigger picture). Per [05-view-filter.md](05-view-filter.md) highlight rules.

## Tests

- `tests/unit/modules/cuelist-core/cue/compoundCue.test.ts` — make/split/merge + sort_key preservation
- `tests/unit/modules/cuelist-core/cue/invariants.test.ts` — each invariant + regression for B003-006 round 2 (`setCueDepartments(['LX','LX'])` throws)
- `tests/unit/modules/cuelist-core/cue/payloadOps.test.ts` — tag-based grouping + reorder + CRDT dup-id catch

## Open issues for 0.2

- First-class `payload.department` field replacing the tag heuristic (Q4 second half)
- Per-cue lock for compound cues (Q6 advanced) — currently compound treated as whole
- Drag-and-drop visualization for splitCompoundCue in editor (currently command-palette only)
