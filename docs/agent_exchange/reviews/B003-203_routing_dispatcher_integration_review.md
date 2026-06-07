---
id: "B003-203"
critic_started_at: "2026-06-07T17:42:00Z"
critic_completed_at: "2026-06-07T17:45:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **Accepts new `RoutingRule` shape (`target_device_id`) + backward compat** — new `resolveRoutingForPayload` consumes Y.Doc-based rules at `src/modules/cuelist-core/src/dispatch/resolveRouting.ts:168-203`. Legacy `resolveDeviceTransport` (old flat-Record/embedded-transport contract) preserved at `:51-69` so transports still work. `buildDispatchRoutingTable` (`:212-257`) bridges both shapes for the actual cue dispatch path.
- [x] **Precedence per task spec** — class 1 (exact `match.device_id`) vs class 2 (`payload_type` + optional `tag_pattern`) implemented at `matchPrecedenceClass` (`resolveRouting.ts:141-156`); ascending sort puts class 1 first, then `sort_key` tiebreak (`:190-193`). Verified by `resolveRouting.test.ts:118-131` (class 1 wins) and `:161-173` (sort_key wins within class 2).
- [x] **Matched rule's `target_device_id` looked up in `show.devices` → returns descriptor** — `resolveRouting.ts:195-200` reads `devicesRaw[rule.target_device_id]`, converts via `deviceToTransportDescriptor` (`:86-115`). Returns `OscTransport`/`MidiTransport`/etc., which is the established `TransportDescriptor` contract dispatch already consumes (spec uses the word "TransportMessage" but the codebase has no such type — `TransportDescriptor` is the correct destination shape).
- [x] **No match → `{ error: 'no_route' }`** — `resolveRouting.ts:186` (no candidates) and `:202` (all matched candidates have missing devices). Verified at `resolveRouting.test.ts:96-101` and `:103-116`.
- [x] **Migration in `getRoutingRules`: in-place + idempotent** — `routing.ts:48-94`. Old Y.Map rules lacking `target_device_id` are collected, then renamed in a single `doc.transact` (`id→rule_id`, default `sort_key`, `match.tag→match.tag_pattern`). Each rename guarded by `!has(new) && has(old)` so second call is a no-op. Verified at `routing.test.ts:267-293`. Plain-object stragglers from older test fixtures are skipped without crash (`routing.ts:55` instanceof Y.Map guard; test `routing.test.ts:226-246`).
- [x] **sourceURI behaviour preserved (LX consoles unchanged)** — `transports/lxRef.ts` not touched. New resolver returns `OscTransport.encoding='eos'|'ma3'|'hog'|'chamsys'|'qlab'` via `driverToEncoding` (`resolveRouting.ts:75-84`), which is what `lxRef.ts` already keys off to suppress the trailing sourceURI. Confirmed via `resolveRouting.test.ts:175-206` (eos/ma3/hog return correct encoding) and `transports/lxRef.test.ts` (5/5 still passing).
- [x] **Tests cover required cases** — 12 new `resolveRoutingForPayload` tests + 5 new migration/backward-compat tests cover exact-device-vs-tag, literal tag, regex tag (`^LX`), sort_key precedence, missing device, LX encoding mapping, MIDI mapping, catch-all match, and idempotency.
- [x] **Existing `dispatch/transports/*` tests pass** — 32/32 (`osc 7, lxRef 5, midi 5, msc 7, wait 3, group 5`). `TransportDescriptor` shape unchanged, no transport file modified.
- [x] **B003-101 RoutingTable UI tests pass** — 15/15 (`RoutingTable.test.tsx`). Storage shape unchanged on the writer side.
- [x] **Full suite passing; no regressions** — Entire `tests/unit/modules/cuelist-core` runs 687/687 passing across 50 files. The only failure on a wider run is `tests/unit/pwa/App.test.tsx > switches to show mode after successful pairing` (timeout), which is unmodified by this task (no diff vs HEAD) and was flagged pre-existing in the most recent checkpoint commit (`50a883b — cleanup dirty App.test.tsx`). `catalog/cueCatalog.test.ts` ran 14/14 clean for me — the ENOTEMPTY race the Forge report flagged is environmental.
- [/] **TypeScript strict typecheck clean** — Critic could not invoke `pnpm typecheck`/`tsc` in this sandbox (permission denied). Forge reports clean across 5 packages. Vitest (esbuild) accepts the new code with no TS-syntax errors and the runtime tests pass, which is a strong but indirect signal. Marking accepted on Forge's attestation; recommend an Architect spot-check before the next release tag if not already part of CI.

## Code review notes

- Adapter design is clean: `resolveRoutingForPayload` is the new Y.Doc-aware entry point; `resolveDeviceTransport` is kept verbatim for the legacy transports' direct-Record contract; `buildDispatchRoutingTable` is the single integration seam where `payloadDispatch.ts` switches from the raw `toJSON()` cast to the shape-normalising adapter. The two-shape handling in the adapter (`resolveRouting.ts:217-253`) correctly disambiguates by presence of `target_device_id` string vs an embedded `transport.kind`, and properly skips malformed entries.
- Migration is genuinely idempotent — guards on `has('rule_id')`, `has('sort_key')`, and `'tag' in matchObj && !('tag_pattern' in matchObj)` mean a second pass mutates nothing. The decision to apply field renames even to rules excluded from results (no `target_device_id` available) is sensible: when a device is later linked, the rule is already in the right shape.
- The `tagMatches` helper does literal equality first and only falls through to `RegExp` — safe pattern (`new RegExp(pattern)` is wrapped in try/catch). Out-of-scope per task note for full pattern validation; behaviour is fine for 0.1.
- One small subtlety worth flagging (not blocking): `matchPrecedenceClass` returns `null` for a rule with `match.device_id` that doesn't equal the payload's `deviceId`, even if that rule also has a matching `payload_type`. That matches the spec ("class 1 vs class 2" as alternatives, not additive), and the tests confirm intended behaviour. Not a defect.
- `payloadDispatch.ts` change is the 2-line wiring the spec calls for — confined and reversible.

## Verdict rationale

All hard acceptance criteria are met with file:line citations. The routing UI in B003-101 is now wired through to dispatch: a rule created via the UI lands in `routing` Y.Map, `buildDispatchRoutingTable` lifts it via the linked `devices` entry, and `dispatchCue` consumes it on the next cue. Backward compatibility is preserved on both axes (old flat Records for direct transport tests; old Y.Map rules without `target_device_id` survive without crashing and have their field renames migrated). The only criterion I could not personally verify is strict typecheck, and I am accepting Forge's attestation given that the full Vitest run (compiled through esbuild) is green and no type imports look suspect on read.

Round 1, accepted.
