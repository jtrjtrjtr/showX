---
id: "B004-001"
title: "Pre-wait data model + dispatch timing"
type: "implementation"
estimated_size_lines: 420
priority: "P0"
bundle: "ShowX-4"
depends_on: []
target_files:
  - "src/shared/src/types/cue.ts"
  - "src/modules/cuelist-core/src/document/cue.ts"
  - "src/modules/cuelist-core/src/dispatch/payloadDispatch.ts"
  - "src/modules/cuelist-core/src/go/**"
  - "tests/unit/**"
acceptance_criteria:
  - "Cue gains field `pre_wait_ms: number` (default 0). Add to Cue interface in src/shared/src/types/cue.ts. Lazy default on read: cues without the field resolve to 0 (NO destructive document migration; follow existing nullable-field pattern e.g. cue_number)."
  - "Dispatch path honors pre_wait: when a cue is GO'd/auto-triggered, payload dispatch is delayed by `pre_wait_ms` (>0). During the wait the cue is in an 'armed/waiting' state; after the wait, payloads dispatch. pre_wait_ms===0 → dispatch immediately (no behavior change vs today)."
  - "cue-fire event (the one TriggerEngine consumes to schedule the NEXT cue) is published at DISPATCH time (after pre_wait elapses), NOT at trigger time. This makes a following auto_continue.delay_ms measure from action-start = QLab post-wait semantics. Verify TriggerEngine still chains correctly."
  - "Pre-wait is cancelable: if SM skips ahead / fires another GO / aborts during a pending pre_wait, the pending dispatch is canceled (mirror TriggerEngine pending-cancel pattern)."
  - "Document helper to set pre_wait_ms with validation (>=0 integer; reject negative/NaN via existing ValidationError path) and SHOW-mode lock guard (assertEditAllowed structure/timing — same lock as trigger edits)."
  - "Unit tests: pre_wait 0 = immediate; pre_wait 2000 = delayed dispatch (fake timers); cancel during wait; auto_continue on next cue measures from dispatch not trigger; lazy default for cue missing the field."
  - "`pnpm -r typecheck` clean, all tests pass. No edits outside target_files."
---

## Context

Per `decisions/2026-06-13_prewait_timing_model.md`: the only missing QLab timing primitive is **pre-wait** (delay between cue trigger and payload dispatch). Post-wait and follow are already expressed by the existing backward-pointing Trigger union (`auto_continue.delay_ms` / `auto_follow`). This task adds the single field + dispatch-timing behavior. NO post_wait field, NO trigger union change.

## Implementation notes

- Read the decision note first. The keystone insight: pre_wait lives in the **dispatch path**, not the trigger engine. The trigger engine decides WHEN a cue is triggered; pre_wait decides how long after trigger the payloads actually fire.
- Locate where a cue's payloads are dispatched on GO (GoExecutor / payloadDispatch / dispatchCue from ShowX-3.5 wiring). Insert the pre_wait delay there, before transport sends.
- The `cue-fire` event currently emitted on trigger must move to post-pre_wait. Trace its current emission point (likely in the GO executor or dispatch). Be careful: TriggerEngine.onCueFire schedules the next cue from this event — moving its timing is the whole point (post-wait correctness) but must not break the chain or the chain-depth/runaway guard.
- Use a cancelable timer (setTimeout + handle), cancel on: new GO for same cuelist, abort signal, REHEARSAL/SHOW transition. Mirror `TriggerEngine.cancelAllForCuelist` semantics.
- Lazy default: when reading a cue (toJSON), if pre_wait_ms is undefined → treat as 0. Do not rewrite existing documents.

## Test plan

- pre_wait_ms=0 → payloads dispatch synchronously on GO (existing tests still green).
- pre_wait_ms=2000 with fake timers → no dispatch at t=0, dispatch at t=2000.
- GO cue A (pre_wait 2000), then GO cue B at t=500 → A's pending dispatch canceled, no A output.
- Cue A (pre_wait 1000) followed by cue B trigger=auto_continue{delay_ms:3000} → B fires at A_trigger+1000+3000 (delay measured from A dispatch), assert via fake timers.
- Cue missing pre_wait_ms field → resolves 0.

## Out of scope

- No UI (B004-002).
- No CSV import change (B004-010).
- No post_wait field, no timecode.
