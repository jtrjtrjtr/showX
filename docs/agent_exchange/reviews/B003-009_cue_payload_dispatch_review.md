---
id: "B003-009"
title: "Cue payload dispatch — resolve routing + call OutputDispatcher per payload type"
verdict: "accepted"
reviewer: "critic"
review_round: 1
reviewed_at: "2026-06-07T17:55:00Z"
---

## Summary

Independent review of B003-009 (cue payload dispatch). Implementation, tests, and acceptance criteria verified against spec. All 49 dispatch tests pass. Verdict: **accepted**.

The dispatch tree is well-organised (one transport per file under `dispatch/transports/`, a single orchestrator at `payloadDispatch.ts`, with `resolveRouting.ts` + `cycleDetect.ts` as small focused helpers). The discriminated-union switch in `dispatchOne` cleanly matches the `Payload['type']` taxonomy.

Note on state hygiene: state.json still lists B003-009 as `queued` even though the done report has existed since 2026-06-07T17:55Z and the prior Forge run had moved files around. Treating this as the round-1 review.

## Acceptance criteria — verification

| # | Criterion | File:line | Status |
|---|-----------|-----------|--------|
| 1 | `dispatchCue(cue, deps): Promise<CueDispatchResult>` iterates payloads in order | `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts:96` (`for (const p of cue.payloads)`) | ✅ |
| 2 | `CueDispatchResult` shape: `{ok, payloads_dispatched, payloads_failed, duration_ms, details}` | `payloadDispatch.ts:16-27` | ✅ |
| 3 | `resolveRouting` per §10.3 — device_id=4, payload_type=2, tag=1, most-specific wins | `resolveRouting.ts:43-61` — `entries.filter(enabled)` → score → `sort((a,b)=>b.specificity-a.specificity)` | ✅ |
| 4 | OSC: device_id → host/port; sends `OscMessage` with trailing source URI string | `transports/osc.ts:39-61` + `buildOscArgs` (`osc.ts:29-37`) — sourceURI appended last | ✅ |
| 5 | MSC: SysEx bytes per §4.5 | `transports/msc.ts:23-35` (`buildMscSysEx`) — verified byte-by-byte in `msc.test.ts:42` (`[0xF0,0x7F,0x01,0x02,0x01,0x01,0x31,0x31,0x00,0x31,0x00,0xF7]`) | ✅ |
| 6 | LxRef: resolves console driver, formats OSC address per §3.4.2 | `transports/lxRef.ts:21-41` — eos/ma3/hog/chamsys/qlab branches; trailing sourceURI removed (consoles reject extra OSC args, see lxRef change log below) | ✅ |
| 7 | MIDI: builds bytes from discriminated kind, sends via midi transport | `transports/midi.ts:6-19` — note_on/off/cc/program_change/raw; channel-1 mapped to 0x0n | ✅ |
| 8 | Webhook: fails fast with `not_implemented`, no crash | `transports/webhook.ts:5-11` — returns `{ok:false, error:'webhook_not_implemented'}` | ✅ |
| 9 | Wait: `setTimeout`-based, respects abortSignal | `transports/wait.ts:4-20` — clearTimeout + reject on abort | ✅ |
| 10 | Group: recursive expand, parallel (`Promise.all`) vs series; cycle detector passed through | `transports/group.ts:13-37` + `payloadDispatch.ts:181-186` (closure captures `cycleCtx`) | ✅ |
| 11 | Cycle detection: emits `system-error code='group-cycle-detected'`; does not throw | `payloadDispatch.ts:69-89` — emits then early-returns with `payloads_failed: [{error:'group-cycle-detected'}]` | ✅ |
| 12 | Group nesting depth ≤ 4 (Q8); emits `group-nesting-too-deep` | `payloadDispatch.ts:47-67` — check `depth() >= MAX_GROUP_DEPTH=4` before entering; verified by `payloadDispatch.test.ts:233` (depth=4 → blocked) | ✅ |
| 13 | Pre-fire `validatePayload` re-run; on fail skip + warn + record | `payloadDispatch.ts:102-110` (try-catch around `validatePayloadSafe(p)`) — calls underlying `validatePayload` from `document/payload.ts:25` | ✅ |
| 14 | Emit `cue-complete` event on EventBus with required fields | `payloadDispatch.ts:141-156` (gated by `!_internal`); fields `success/errors/duration_ms/payloads_dispatched/payloads_failed/show_id/cuelist_id/cue_id` all set | ✅ |
| 15 | 30+ vitest tests | 49 tests across 8 files; `vitest run dispatch` → 8 files / 49 tests passed | ✅ |

## Test run

```
$ pnpm vitest run tests/unit/modules/cuelist-core/dispatch
 ✓ tests/unit/modules/cuelist-core/dispatch/resolveRouting.test.ts  (7 tests)
 ✓ tests/unit/modules/cuelist-core/dispatch/transports/osc.test.ts  (7 tests)
 ✓ tests/unit/modules/cuelist-core/dispatch/transports/msc.test.ts  (7 tests)
 ✓ tests/unit/modules/cuelist-core/dispatch/transports/lxRef.test.ts (5 tests)
 ✓ tests/unit/modules/cuelist-core/dispatch/transports/midi.test.ts  (5 tests)
 ✓ tests/unit/modules/cuelist-core/dispatch/transports/group.test.ts (5 tests)
 ✓ tests/unit/modules/cuelist-core/dispatch/payloadDispatch.test.ts (10 tests)
 ✓ tests/unit/modules/cuelist-core/dispatch/transports/wait.test.ts  (3 tests)

 Test Files  8 passed (8)   Tests  49 passed (49)   1.35s
```

## Strengths

- **Cycle detector + finally-cleanup**: `payloadDispatch.ts:91/128-130` enters the stack and guarantees `exit()` via `try/finally`. No leak on dispatch errors.
- **`_internal` flag for nested group dispatches** (`payloadDispatch.ts:36-40, 141`) cleanly suppresses spurious `cue-complete` events for child cues fired by a group, while still emitting one event for the top-level cue. Test `payloadDispatch.test.ts:279` exercises this.
- **LxRef sourceURI removal** (`lxRef.ts`) is the right call. Per protocol_dictionary §3.4.2 the LX console expects a clean cue-fire address; appending `showx://...` string would have caused MA3/Hog4 to error or treat it as an extra command argument. The Forge note in the done report explains the rationale.
- **Routing read once per cue** (`payloadDispatch.ts:94`) avoids re-serialising the routing Y.Map per payload; group recursion re-reads, which is the correct semantics for cross-cue refresh.
- **Group depth check at entry** (not at recursion site) prevents the 5th-level cue from doing any work before bailing.
- **MSC `device_id & 0x7F` masking** (`msc.ts:24`) enforces 7-bit SysEx invariant.

## Minor observations (non-blocking)

- `payloadDispatch.ts:11-12` imports `RoutingEntry` (used in cast at L94) — the cast `as Record<string, RoutingEntry>` is unverified at runtime. Acceptable for module-internal data, but if mutators in B003-002 don't pre-validate routing entries, malformed entries reaching `resolveDeviceTransport` would silently return null (which is then surfaced as "no routing for device …" — acceptable degradation).
- `validatePayloadSafe` wrapper at `payloadDispatch.ts:194-196` exists only to bridge a generic-type quirk; an inline cast at the call site would have been equally fine, but the helper makes intent explicit.
- `dispatchCue` is now ~160 lines with nested try/catch — readable, but if this file grows further during catalog publishing (B003-010) it would be worth extracting `dispatchOne` to its own file.
- `transports/group.ts:9` finds the child cue by `.find(m => m.get('id') === cueId)` — O(n) per child. Fine for typical cuelists (<200 cues); revisit if profiling shows cost on large shows.
- Spec criterion 9 mentions `webhook does NOT crash or block — fails fast`. Implementation logs a warn — verify `deps.log.warn` is non-blocking in shell's Logger (B001-003 contract). Visual inspection of `Logger` interface suggests it is. No test asserts non-blocking, but the synchronous `return` makes it a non-issue.

## Notes for follow-up tasks

- `CuelistCore.ts` wiring (`start()` subscribing to `cue-fire`) is correctly left for a follow-up task per spec (target_files limited to `dispatch/**`).
- Architect: state.json status "queued" vs done report being present needs a one-shot cleanup. This review transitions it to `accepted`.

## Verdict

**accepted** — all 15 acceptance criteria met with file:line citations, 49/49 tests pass, code quality is good. No changes requested.
