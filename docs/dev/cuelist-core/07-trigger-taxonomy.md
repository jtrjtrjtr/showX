# 07 — Trigger taxonomy

How a cue decides when to fire.

## Four kinds

```ts
type Trigger =
  | { kind: 'manual' }
  | { kind: 'auto_follow'; from_cue_id?: string }
  | { kind: 'auto_continue'; from_cue_id?: string; delay_ms: number }
  | { kind: 'timecode'; ref: string }
```

| Kind | Semantics |
|---|---|
| `manual` | Default. Waits for GO. |
| `auto_follow` | Fires when the previous cue COMPLETES (using its `duration_hint_ms`). |
| `auto_continue` | Fires `delay_ms` after the previous cue STARTS. `delay_ms = 0` = immediately. |
| `timecode` | Fires when external timecode matches `ref`. 0.2 feature; 0.1 emits info log + returns null. |

## Q5 ruling

If an `auto_follow` cue's previous cue has `duration_hint_ms === null`, what happens?

**Default (B003-024 ruling applied via [04]):** fire IMMEDIATELY on previous cue start. Equivalent to `auto_continue(0)` semantically.

Rationale: matches QLab / Eos behavior. Predictable for SM mental model.

## TriggerEngine

`src/trigger/triggerEngine.ts` — instantiated in `CuelistCore.start()`, listens to `cue-fire` events on EventBus.

```ts
class TriggerEngine {
  constructor(deps: TriggerEngineDeps) { /* ... */ }

  onCueFire(event: CueFireEvent): void {
    // Look up cue, find followers (auto_follow / auto_continue), schedule them
    const followers = this.scheduler.schedule(event.cue, this.now())
    for (const f of followers) this.pending.set(f.cueId, f.timer)
  }

  onCueComplete(event: CueCompleteEvent): void {
    // Q5 path: if previous had duration_hint_ms === null, an auto_follow
    // attached to it was already auto-fired via setTimeout(0) in onCueFire.
    // Guard against double-fire here.
    if (this.pending.has(event.cueId)) { /* skip — already pending */ }
  }

  cancel(cueId: string): void { /* clear timer, log */ }
}
```

## scheduler

`src/trigger/scheduler.ts`:

```ts
export function schedule(
  cue: CueData,
  followers: CueData[],
  now: number,
): ScheduledFire[] {
  return followers
    .filter(f => isAutoTriggered(f.trigger, cue))
    .map(f => ({
      cueId: f.id,
      fireAt: computeFireAt(f.trigger, cue, now),
      reason: f.trigger.kind,
    }))
}

export function isAutoTriggered(trigger: Trigger, parent: CueData): boolean {
  if (trigger.kind === 'manual') return false
  if (trigger.kind === 'timecode') return false
  return true   // auto_follow + auto_continue
}

export function getFollowSource(trigger: Trigger, cuelist: CueData[]): CueData | null
```

## Loop guard

If cue A auto-continues to cue B, and B auto-continues back to A → infinite loop.

`TriggerEngine` tracks the chain of cue IDs fired within a single GO context. If a follower's id appears in the chain, the engine logs `loop_detected` and refuses to schedule. Chain TTL: cleared when the originating manual GO completes.

`tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts:200-240` covers this.

## Cancellation

`engine.cancel(cueId)` clears the pending timer. Called when:

- User manually fires another cue mid-auto-chain (the chain breaks)
- Cuelist is closed / app shuts down
- REHEARSAL ↔ SHOW transition (chain is reset)

## Timecode deferred

B003-007 round 1 was rejected by Critic because the implementation silently returned null for timecode triggers. Round 2 added an info-level log:

```ts
if (trigger.kind === 'timecode') {
  this.deps.log.info('timecode trigger deferred to 0.2', { cuelist_id, cue_id })
  return null
}
```

Test: `triggerEngine.test.ts:296-307` asserts the log fires with correct payload.

This is the canonical pattern for "feature scaffolding for 0.2" — emit an audible log, never silent skip.

## EventBus contract

The engine subscribes to (events emitted by GO event channel + dispatch):

| Event | Payload | Source |
|---|---|---|
| `cue-fire` | `{ cuelist_id, cue_id, source: 'manual' \| 'auto' \| 'group', actor }` | [08-go-event-channel.md] |
| `cue-complete` | `{ cuelist_id, cue_id, duration_ms }` | [09-payload-dispatch.md] |

The engine emits:

| Event | Payload | Consumer |
|---|---|---|
| `cue-fire` (with `source: 'auto'`) | same shape | re-enters dispatch pipeline |

## Tests

- `tests/unit/modules/cuelist-core/trigger/scheduler.test.ts` (16 tests)
- `tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts` (19 + 1 log assertion) — Q5 path, loop guard, cancellation

## Gotcha

`onCueComplete` and `onCueFire` are both called for null-duration auto_follow cues. The race:

```
T0: cue A fires (duration_hint_ms = null)
T0: trigger engine sees A.fire → schedules B (auto_follow on A) via setTimeout(0)
T0+epsilon: B fires
T0+epsilon: trigger engine receives cue-complete for A → tries to schedule B again
```

The double-fire guard:

```ts
if (prevCue?.duration_hint_ms === null && this.pending.has(followerId)) return
```

`tests/unit/modules/cuelist-core/trigger/triggerEngine.test.ts` covers this.
