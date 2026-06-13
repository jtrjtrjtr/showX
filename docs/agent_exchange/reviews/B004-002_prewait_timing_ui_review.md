# Review — B004-002: Pre-wait UI + armed-waiting countdown

**Critic round:** 1
**Reviewed at:** 2026-06-13T14:38:00Z
**Verdict:** **accepted**

---

## Acceptance criteria check

### AC1 — Cue row shows pre-wait value when >0, inline-editable in REHEARSAL only, M:SS.S format
**Met.**
- `pre-wait-badge` rendered when `cue.pre_wait_ms > 0` at `pwa/src/components/cuelist/CueRow.tsx:432-444`, using `formatDuration(cue.pre_wait_ms)` which produces M:SS.S (e.g. `PRE 0:02.0`).
- Yellow color (`tokens.color.yellow`), mono font, sits in duration cell column.
- Inline edit guard `inlineEditField === 'pre_wait_ms' && mode === 'rehearsal'` at `CueRow.tsx:424` — REHEARSAL only.
- Patch routed through `updateFields` (B004-001 helper) via `SMMasterView.tsx:162-170` `handleInlineCommit`.

Note: spec says "compact, e.g. 'PRE 2.0s'" then "Format M:SS.S like duration". Forge chose M:SS.S consistent with duration. Acceptable.

### AC2 — CueEditDialog exposes pre_wait_ms field, locked in SHOW
**Met.**
- `cue-edit-prewait` text input at `pwa/src/components/cuelist/CueEditDialog.tsx:158-170`.
- Pre-fills from `cue.pre_wait_ms` via `durationSecs.toFixed(1)` at `:28-30`.
- `disabled={locked}` at `:167` — disabled in SHOW mode.
- Save converts seconds → ms, emits `pre_wait_ms: 0` when empty at `:48-51`.
- `preWaitSecs` added to `useCallback` deps at `:52` — stale-closure bug fixed.

### AC3 — Armed-waiting visual + live countdown using existing ticker
**Met.**
- `preWaitRemaining = preWaitUntil - now` at `CueRow.tsx:146-149` — uses parent's `now` prop (single rAF ticker from `SMMasterView.tsx:71-85`). No second ticker.
- `pre-wait-indicator` overlay at `CueRow.tsx:535-559` rendered when `isPreWaiting`, shows `WAIT M:SS.S`.
- Yellow left border at `CueRow.tsx:161-165` while pre-waiting (distinct from armed/counting red).
- `PlaybackHeader.tsx:93-120` adds WAITING indicator with cue label + countdown.
- Engine glue: `go.prewait` broadcast at `src/modules/cuelist-core/src/go/goEventChannel.ts:260-270` before pre-wait timer fires. `pwa/src/hooks/useGoChannel.ts:44-49` subscribes, sets `preWait` state. `pwa/src/lib/sideChannel.ts:91-96` adds `GoPreWait` interface.

Spec implementation notes ("If [waiting state] not exposed [by B004-001], add a minimal awareness/side-channel field (smallest possible)") explicitly authorize these out-of-target edits. B004-001's done report confirms the engine had `pendingPreWaits` and delayed `cue-fire` but no PWA-observable signal — so this glue was necessary and is minimal (single new topic + handler).

### AC4 — pre_wait_ms===0 → no badge, no indicator, no visual noise
**Met.**
- Badge guard `cue.pre_wait_ms && cue.pre_wait_ms > 0` at `CueRow.tsx:432`.
- Indicator guard `isPreWaiting && preWaitRemaining !== null` at `CueRow.tsx:535`.
- Tests cover both undefined and 0 cases (`CueRow.test.tsx:973-1009`).
- PlaybackHeader WAITING gated on both `preWaitingCueLabel !== null` and `preWaitRemaining !== null` at `:50`.

### AC5 — Dark FOH theme tokens
**Met.** All pre-wait visuals use `tokens.color.yellow`, `tokens.color.bg`, `tokens.color.ink_secondary`, `tokens.font.mono`. Background of `pre-wait-indicator` overlay is `tokens.color.bg` (dark), border yellow.

### AC6 — Unit tests for all required behaviors
**Met.**
- PRE badge >0 / 0 / undefined: `CueRow.test.tsx:950-1009` (3 tests).
- Inline edit REHEARSAL value: `CueRow.test.tsx:1011-1035`.
- Inline edit suppressed in SHOW: `CueRow.test.tsx:1037-1060`.
- Waiting countdown renders: `CueRow.test.tsx:1064-1087`.
- Waiting countdown absent when null/elapsed: `CueRow.test.tsx:1089-1128`.
- Dialog disabled in SHOW: `CueEditDialog.test.tsx:243-248`.
- Save patches `pre_wait_ms`: `CueEditDialog.test.tsx:225-241`.
- PlaybackHeader WAITING indicator: `PlaybackHeader.test.tsx:127-190` (4 tests).

Total new tests: 8 (CueRow) + 7 (CueEditDialog) + 4 (PlaybackHeader) = 19.

### AC7 — Build clean, typecheck clean, tests pass, no out-of-scope edits
**Met (with authorized glue).**
- `pnpm --filter showx-pwa build` clean: 426.72 kB bundle, no node:* leak.
- `pnpm -r typecheck` clean: all 5 workspace packages.
- `pnpm vitest run`: **1582/1582 passed** (135 files).
- Out-of-target edits (`goEventChannel.ts`, `sideChannel.ts`, `useGoChannel.ts`, `SMMasterView.tsx`) are explicitly authorized by spec implementation notes as minimal glue. Diff stats confirm scope: 595 lines / 10 files / 19 tests.

---

## Non-blocking observations

**O-1 — Stale WAITING indicator window (minor edge case).**
If SM starts pre-wait on cue A, then fires GO on cue B (with `pre_wait_ms=0`) before A's pre-wait expires, the engine cancels A's timer (`goEventChannel.ts:232`), and B dispatches immediately. But the PWA's `preWait` state for A is only cleared via `go.dispatched` for matching `cue_id` (`useGoChannel.ts:40`) — A's dispatch event never fires (cancelled). The stale WAITING indicator self-clears when A's `waiting_until` elapses naturally (within `pre_wait_ms` window).

Not a blocker; spec asks for "smallest possible" addition. Future improvement: emit `go.prewait.cancelled` envelope on cancellation. Architect can decide whether to file.

**O-2 — `go.prewait` not ring-buffered.**
`goEventChannel.ts:268` calls `this.deps.broadcast(envelope('go.prewait', ...))` directly without pushing to a ring. Done report acknowledges this is intentional (stale replay would be wrong). Reasonable choice given pre-wait state is transient — replay of an already-elapsed `waiting_until_ts` would render a never-counting indicator. Acceptable.

**O-3 — Duration field in CueEditDialog not locked in SHOW.**
`cue-edit-duration` input at `CueEditDialog.tsx:147-156` has no `disabled={locked}` guard, while the new `cue-edit-prewait` does. This is preexisting behavior (duration was already editable), not something B004-002 introduced. Out of scope for this task. Flag for Architect if the dialog locking story needs to be unified.

---

## Recommendation

Ship. B004-002 cleanly surfaces the engine-side pre-wait timing from B004-001 in the operator UI with proper visual hierarchy (yellow=waiting distinct from red=armed/counting), keeps the single-ticker discipline, gates editing correctly per mode, and ships solid unit coverage. The out-of-target side-channel glue is minimal and explicitly authorized by the spec.

**Verdict: accepted.**
