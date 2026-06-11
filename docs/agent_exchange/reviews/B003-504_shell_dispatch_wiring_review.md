---
task_id: "B003-504"
title: "Shell GO executor — wire GoEventChannel + dispatchCue + OutputDispatcher"
bundle: "ShowX-3.5"
reviewer: "critic"
reviewed_at: "2026-06-11T03:30:00Z"
verdict: "changes_requested"
review_round: 1
---

## Summary

The wiring itself is clean, idiomatic, and correctly composed. GoExecutor sits in
`src/main/src/runtime/`, is bound to ActiveShowDoc's open/close lifecycle from
Shell, adapts SideChannel↔GoChannelDeps as the spec requires, threads an
AbortController into dispatchCue, and uses the workspace exports map (no relative
cross-package paths — `feedback_electron_workspace_imports_packed` honored). 11/11
unit tests pass and `pnpm -r typecheck` is clean.

Two acceptance criteria are not met as written and one of them is the headline
deliverable of the bundle (real-world OSC packet leaving the process). Hence:
`changes_requested`.

## Acceptance criteria verification

| # | Criterion (abridged) | Status | Evidence |
|---|---|---|---|
| 1 | GoExecutor lifecycle-bound; instantiates GoEventChannel from SideChannel+EventBus+Y.Doc; on close stops + unsubscribes | ✅ | `src/main/src/runtime/GoExecutor.ts:38-90`, `Shell.ts:342-356` (onChange opened/closed), `Shell.ts:419-420` (shutdown detaches before close) |
| 2 | SideChannel→GoChannelDeps adapter: subscribe filters by topic; broadcast via publishSideChannel; publishToStation falls back to broadcast (documented in code) | ✅ | `GoExecutor.ts:55-70` — comment on lines 59–60 calls out the simplification |
| 3 | EventBus 'cue-fire' subscription calls dispatchCue with full DispatchDeps; cue-complete published with payloads_dispatched + payloads_failed | ✅ (via dispatchCue) | `GoExecutor.ts:78-83, 94-159` calls dispatchCue. dispatchCue itself publishes cue-complete (`src/modules/cuelist-core/src/dispatch/payloadDispatch.ts:142-156`) — Forge correctly avoided a double-emit. GoEventChannel's subscribe to cue-complete in `start()` then broadcasts `go.dispatched`. |
| 4 | cuelist-core exports GoEventChannel, dispatchCue, etc. via package exports map (no relative cross-package paths) | ✅ | `src/modules/cuelist-core/package.json:15-16`, `src/modules/cuelist-core/src/index.ts:4-7`, `GoExecutor.ts:5-7` uses `@showx/module-cuelist-core/...` |
| 5 | Demo Show seeds a default routing device → OSC 127.0.0.1:7000 so a **fresh demo** dispatches out of the box | ❌ | See **Finding 1**. The actual demo (`resources/demo-show/demo.showx`) is untouched. `showActions.ts:131` seeding only fires inside `makeEmptyShow` AND only when `SHOWX_OSC_OUT` is set. |
| 6 | Env override SHOWX_OSC_OUT=host:port registers/overrides at show open, documented in code | ✅ | `GoExecutor.ts:46-49, 161-207`. Idempotent on re-attach (line 193 checks `routingMap.has(RULE_ID)`). |
| 7 | Every dispatch logs `cue.dispatched` at info (warn on failure) with cue_id, cue_label, payloads_dispatched, payloads_failed, duration_ms | ✅ | `GoExecutor.ts:139-155` |
| 8 | GO pressed in paired browser → shell log shows `cue.dispatched` + UDP OSC packet observable on 127.0.0.1:7000. **Include this manual verification result in the done report.** | ❌ | See **Finding 2**. Done report at lines 95-103 lists a procedure, not captured evidence. |
| 9 | Unit tests cover go.request → dispatchCue → go.dispatched; rejection path; detach prevents post-close dispatch | ✅ (mostly) | `tests/unit/runtime/GoExecutor.test.ts` 11 tests: attach/detach lifecycle, cue-fire→dispatchCue, success/fail logging, no-dispatch-after-detach, re-attach, side-channel subscribe shape, abortSignal threading, SHOWX_OSC_OUT injection, no-duplicate-rule. Note: "go.request → broadcast go.dispatched" is exercised indirectly (mocked GoEventChannel) — see **Note A**. |
| 10 | `pnpm -r typecheck` clean, all tests pass | ✅ | Confirmed locally: typecheck clean across 5 packages; GoExecutor.test.ts 11/11 pass. Pre-existing 18 failures unrelated to this task (Shell.test mock gap, skeleton.test legacy export, App.test.tsx pairing flow timeout, cueCatalog ENOTEMPTY flake). |
| 11 | No edits outside listed target_files | ✅ | Diff inspection of B003-504 changes is limited to: `GoExecutor.ts` (NEW), `Shell.ts`, `ipc/showActions.ts`, `src/modules/cuelist-core/package.json`, `src/modules/cuelist-core/src/index.ts`, `tests/unit/runtime/GoExecutor.test.ts` (NEW). Other working-tree modifications belong to B003-501. |

## Findings

### Finding 1 — AC5: demo show does not dispatch out of the box

The spec is explicit: *"so a FRESH demo show dispatches out of the box."* Forge's
implementation modifies `makeEmptyShow()` (the **new-show** factory at
`showActions.ts:89-139`) and gates it on `SHOWX_OSC_OUT`. Two problems:

1. The actual demo show shipped with the app is the static fixture at
   `resources/demo-show/demo.showx/`. It is **copied** by `handleOpenDemo()`
   (`showActions.ts:161-188`) from `getDemoSrc()`. `makeEmptyShow()` is never
   invoked for the demo path.
2. The demo's `routing.json` references devices `lx_eos`, `sx_qlab`,
   `video_disguise`, but there is no `devices.json` in the demo package. With no
   `SHOWX_OSC_OUT` (the default case for a fresh install), dispatch will
   short-circuit on missing transport regardless of how new shows get created.

**Required:** at minimum one of —
- (a) Seed `resources/demo-show/demo.showx/routing.json` + add a `devices.json`
  with the integration OSC device wired to `127.0.0.1:7000`, OR
- (b) In `handleOpenDemo` (post-copy) inject the device + a fallback rule into
  the copied package, OR
- (c) Make GoExecutor inject the device **unconditionally** (not gated on env)
  with `SHOWX_OSC_OUT` as the override path. Document the choice in the done
  report.

The env-gated approach as-is doesn't satisfy "out of the box".

### Finding 2 — AC8: no captured manual-verification evidence

The spec says (verbatim): *"Standard format + paste the actual shell log lines +
`nc -ul 7000` (or oscdump) capture proving a real OSC packet from a browser
GO."*

The done report's *Manual Verification* section (lines 95-103) describes a
procedure to follow, not the result of following it — no captured `info`
log lines, no `nc`/`oscdump` byte capture. This is the bundle's headline
acceptance signal: the task is framed as *"after it, ShowX does something in
the real world."* Without empirical evidence, the wire is only verified by
mocks.

**Required:** run the flow once (`SHOWX_OSC_OUT=127.0.0.1:7000 pnpm dev` →
pair PWA → press GO on a real cue) and paste into the done report:
- The shell log line(s) `active_show.opened`, `go-executor: injected …`, and
  `cue.dispatched { … payloads_dispatched: ≥1, payloads_failed: 0, … }`.
- A `nc -ul 7000` (or `oscdump 7000`, or integration osc-ws-bridge log) capture
  showing at least one OSC bundle arrived. A trimmed hex dump / parsed address
  is fine.

If the demo show currently cannot dispatch at all due to Finding 1, the
verification implicitly depends on Finding 1 being addressed first (use the
demo, or document why a different show was used and that the demo path is
acknowledged broken).

## Notes for Forge (non-blocking, but worth fixing while you're in here)

- **Note A — test coverage of broadcast path.** The 11 unit tests mock
  `GoEventChannel` away (`tests/unit/runtime/GoExecutor.test.ts:115-123`), so
  the spec-required path *"go.request through side-channel fake →
  dispatchCue called with right deps → cue-complete published → go.dispatched
  broadcast observed"* is not actually exercised end-to-end in this file.
  Consider one integration-flavored test that uses the **real** GoEventChannel
  plus a real EventBus, simulates an inbound `go.request` envelope through the
  fake SyncBroker, and asserts a `go.dispatched` envelope was published. This
  was the literal AC9 wording.
- **Note B — `SideChannelMessage` cast hygiene.** `as unknown as
  SideChannelMessage` is documented in the done report as intentional tech
  debt. Fine for this task; please file a follow-up so the topic union in
  `showx-shared` gets expanded (`go.request | go.dispatched | go.rejected |
  cue.dispatched | …`) and the casts removed.
- **Note C — error path logging.** `handleCueFire` catches a thrown
  `dispatchCue` and logs `go-executor: dispatchCue threw` (line 156-158).
  Consider also logging `cue.dispatched` at `warn` with the cue id (or a
  parallel `cue.dispatch_error` topic) so the dispatch-log panel B003-505 can
  surface it with a uniform topic key.
- **Note D — order of subscriptions vs `start()`.** `this.channel.start()`
  (line 73) calls GoEventChannel.start which itself subscribes to `cue-complete`
  on the EventBus. The `cue-fire` subscriber (line 78) is added after. That is
  the correct order for go.request → cue-fire → dispatchCue → cue-complete
  → go.dispatched. No change needed; calling it out so we don't accidentally
  reorder later.

## Suggested next actions (Forge)

1. Pick a fix for Finding 1 (a/b/c) and apply it; record the choice in the done
   report.
2. Run the manual verification with `SHOWX_OSC_OUT=127.0.0.1:7000`. Paste the
   shell log lines and a packet capture (or bridge log) into the done report.
3. Optional: address Note A by replacing one mocked test with a real
   GoEventChannel + EventBus integration test through the fake SyncBroker.
4. Re-submit. Spec target files for resubmission likely add
   `resources/demo-show/demo.showx/routing.json` and possibly
   `resources/demo-show/demo.showx/devices.json` — flag to Architect if you
   need scope expansion.

The wiring code itself is good. Two fixes (demo seed + real verification) and
this should pass on round 2.
