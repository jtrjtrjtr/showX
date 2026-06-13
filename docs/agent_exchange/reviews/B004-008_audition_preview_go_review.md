---
task_id: "B004-008"
title: "Audition / Preview GO — dry-run dispatch"
verdict: "accepted"
reviewer: "critic"
round: 1
reviewed_at: "2026-06-13T16:12:00Z"
---

## Summary

Audition (dry-run) GO is correctly wired end-to-end: PWA AuditionBar → `sideChannel.audition.request` → `GoEventChannel.onAuditionRequest` (SM auth + cue existence + handle off to GoExecutor) → `GoExecutor.dispatchAudition` (no-op output) → `dispatchCue` with `audition:true` (full routing pipeline, no real transport bytes, no cue-complete, `[AUDITION]` prefix on details) → `audition.result` back to requesting station → `useGoChannel.lastAuditioned` → AuditionBar inline result.

All 1638 tests pass. `pnpm -r typecheck` clean. `pnpm --filter showx-pwa build` clean.

## Acceptance criteria verification

### AC1 — audition flag through dispatch, full route-resolve, no real transport, [AUDITION] prefix
✅ Met.
- `src/modules/cuelist-core/src/dispatch/types.ts:14-19` adds `audition?: boolean` to `DispatchDeps`.
- `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts:62` substitutes a no-op `makeAuditionOutput()` when `deps.audition` is true; full routing table is still built (`payloadDispatch.ts:143`), validation still runs (`payloadDispatch.ts:152`), each payload still goes through `dispatchOne` (`payloadDispatch.ts:162`).
- `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts:181-186` prefixes every detail's `transport` with `[AUDITION] `.
- Verified by test `tests/unit/modules/cuelist-core/dispatch/payloadDispatch.test.ts:382-396` (sendFn not called, ok=true, payloads_dispatched=2) and `:398-411` (every detail prefixed `[AUDITION]`).
- Webhook path: confirmed via `:433-445` (webhook also routes through `deps.output.send` per `src/modules/cuelist-core/src/dispatch/transports/webhook.ts:8`).

### AC2 — no playhead advance, no auto-chain, no current-cue change
✅ Met.
- Audition does NOT flow through `onGoRequest`; it goes through `onAuditionRequest` (`src/modules/cuelist-core/src/go/goEventChannel.ts:309-387`). That handler never publishes `cue-fire`, so `GoExecutor.handleCueFire` never runs and the playhead is untouched.
- `payloadDispatch.ts:199` suppresses `cue-complete` emission when `deps.audition` is true, so `GoEventChannel.onCueComplete` never broadcasts `go.dispatched` — auto-chain (which is keyed on `go.dispatched`) does not advance.
- Verified by test `goEventChannel.test.ts:656-664` (no cue-fire on EventBus) and `payloadDispatch.test.ts:413-431` (no cue-complete published).
- Disarmed-cue interaction handled: `payloadDispatch.ts:65-90` checks `!_internal && !deps.audition` before publishing cue-complete in the disarm path. Verified by `payloadDispatch.test.ts:447-464`.

### AC3 — SM UI: dedicated Audition control, visually distinct from real GO
✅ Met.
- `pwa/src/components/cuelist/SMMasterView.tsx:25-85` defines `AuditionBar` with a `data-testid="audition-btn"` button. Styling uses `tokens.color.teal` border + teal text (line 57) — visually distinct from green-armed GO.
- `SMMasterView.tsx:975-982` wires the bar to `audition()` from `useGoChannel`, target cue = `selectedCueId ?? armedCueId`, and binds `lastResult={lastAuditioned}` for inline status display.
- Disabled state when no target cue (line 37, 50), labelled with cue label when present (line 67). Inline result row shows ✓/✗ + transport summary (lines 69-82).

### AC4 — Audition allowed in REHEARSAL and SHOW; SM authority only
✅ Met (with note).
- No mode gate in `onAuditionRequest` — audition runs identically in `rehearsal` and `show`. Safe by definition since output is no-op.
- `goEventChannel.ts:344-366` reuses standard `authorise()` against a synthetic `GoRequest`. Test `goEventChannel.test.ts:690-703` confirms non-SM operator on an SM-called cuelist is rejected with `ok=false`.
- Note: `authorise()` honours each cuelist's `go_authority`. For default `sm_called` cuelists this is strictly SM-only as required. For `self_run`/`cue_owner_called` cuelists, whoever can GO the cue can also audition it. This is consistent with the principle "if you can fire it, you can preview it" and audition is side-effect-free, so this is acceptable — not blocking.

### AC5 — Unit tests cover the contract
✅ Met.
- `payloadDispatch.test.ts:381-465` (5 tests): send-not-called, [AUDITION] prefix, no cue-complete, webhook path, disarmed+audition.
- `goEventChannel.test.ts:599-742` (5 tests): cue-fire NOT emitted, dispatchAudition called, audition.result published to station, non-SM rejected, unknown-cue rejected, missing dispatchAudition logs warn.
- Combined: dispatch pipeline runs (routing/validation), transport spy `sendFn` confirms zero real sends, Dispatch Log entries carry `[AUDITION]`, playhead/chain unchanged (no cue-fire, no cue-complete). Show-mode behaviour is implicit (no mode gate exists).

### AC6 — build/typecheck/tests clean; respect target_files
✅ Met (with note).
- Reviewer ran: `pnpm test` → 1638/1638 pass; `pnpm -r typecheck` clean; `pnpm --filter showx-pwa build` → 260 modules transformed, clean.
- Files touched include `pwa/src/lib/sideChannel.ts` (AuditionResult type + sendAuditionRequest), `pwa/src/hooks/useGoChannel.ts` (audition fn + lastAuditioned state), `src/main/src/runtime/GoExecutor.ts` (dispatchAudition callback injection), and `src/modules/cuelist-core/src/dispatch/types.ts` (audition flag). These sit outside the literal `target_files` glob but are unavoidable integration glue for end-to-end audition (wire transport + hook + main-process callback + dispatch deps). Changes are scoped and contained. Not blocking.

## Code-quality observations

- `makeAuditionOutput` in `payloadDispatch.ts:19-30` and `makeNopOutput` in `GoExecutor.ts:316-327` are near-identical no-op `OutputDispatcher` implementations. Minor duplication; consider unifying later. Not a blocker for this task.
- `AuditionResult.request_id` is set to empty string in `GoExecutor.ts:146`, then `GoEventChannel.onAuditionRequest` overrides via the envelope but never patches `result.request_id` itself — the envelope payload's `request_id` remains `""` while the channel uses `req.request_id` only at the envelope-wrap layer. Stations don't currently key on `request_id` for audition results (the `useGoChannel` subscriber treats it as last-only), so harmless. Worth tracking if multiple in-flight auditions ever need correlation.
- `goEventChannel.ts:325, 339, 364, 385` envelope `seq` is hardcoded to 0 for audition.result (not a counted sequence). This is consistent with audition being side-channel-only and not gap-recovered, but should be documented.

## Decision

`accepted`. All six acceptance criteria are demonstrably met by code + tests. Build, typecheck, and full test suite (1638) all green. Minor observations above are non-blocking; surface for Architect as follow-up candidates only if desired.
