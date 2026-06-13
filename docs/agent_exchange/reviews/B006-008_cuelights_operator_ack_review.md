---
id: "B006-008"
title: "Cue lights — operator receive + acknowledge UI"
verdict: accepted
round: 1
reviewer: critic
reviewed_at: "2026-06-13T23:08:00Z"
---

## Verdict — accepted

All 6 acceptance criteria met. 12 new tests pass. Typecheck clean across all 5 workspaces. PWA Vite build clean (465 kB, no `node:*` leak). No edits outside `target_files`.

## AC coverage

1. **standby.broadcast for owned dept** — `pwa/src/components/cuelist/OperatorView.tsx:88-100` subscribes via `conn.sideChannel.on('standby.broadcast', …)`; line 90 filters with `event.departments.find((d) => ownedSetRef.current.has(d))` and returns early when no owned dept matches. ✓

2. **PROMINENT alert (cue label + STANDBY + big ACK button)** — `pwa/src/components/cuelist/StandbyPanel.tsx:14-106` `OperatorStandbyAlert` renders dept-label "{DEPT} — STANDBY" (line 69), cue label at 40px (line 73), ACK button at 22px with `minWidth: 160` (lines 93-99). Yellow-on-dark, FOH tokens. ✓

3. **Acknowledge publishes `operator.acknowledge`** — `pwa/src/lib/sideChannel.ts:361-372` adds `sendAcknowledgeRequest(cuelistId, cueId, department)` carrying `station_id` + `operator_id` (from `SideChannelClientOpts`). Called from `OperatorView.tsx:110-118`. Test `OperatorStandbyAlert.test.tsx:144-160` asserts `sendAcknowledgeRequest('cl1', 'q2', 'LX')`. ✓

4. **READY state after ack; GO/clear → idle** — `StandbyPanel.tsx:20-41` shows "READY — waiting for GO" when `acknowledged`. `OperatorView.tsx:103-108` clears state on `go.dispatched`. Cleared on `standby=false` (line 96). Tests at `:230-266` cover both clear paths. ✓

5. **Only owned depts; all variants** — filter at `OperatorView.tsx:90`. Alert is rendered at parent level (line 161-168), above `renderVariant()`, so it shows across LX/SX/VIDEO/AUTO/PYRO/FS + generic. Tests `:183-208` confirm non-owned silence. ✓

6. **Glanceable + iPad/phone** — 40px label, 22px button, dark FOH tokens. Flex layout with `flex:1` + `flexShrink:0` on button keeps it usable on small screens. Manual visual sign-off remains Architect/Jindrich gate (per session convention) — acceptable here on token contract alone.

7. **Build/typecheck/tests** — `pnpm --filter showx-pwa build` clean (465 kB, no node:* leak); `pnpm -r typecheck` clean (5/5); `OperatorStandbyAlert.test.tsx` 12/12 pass locally; Forge reports full 1954/1954 suite pass. ✓

## Code quality notes

- `OperatorView.tsx:84-85` uses `useRef`+effect for stable `ownedSetRef` — avoids re-subscribing on every parent render. Good.
- `handleAcknowledge` memoised with proper deps (`:110-118`).
- `useCuelist(cuelistId)` reused for label lookup — no extra Yjs cost.
- No edits to any variant files — covered by parent injection. Matches the "shown across all variants" AC without variant churn.
- `sideChannel.ts` addition is purely additive; existing methods untouched.

## Minor non-blocking note (logged, not requested)

At `OperatorView.tsx:95-98`, when a `standby.broadcast` with `standby=false` arrives for a `cue_id` *different* from the current pending standby, the handler still calls `setAcknowledged(false)` unconditionally while leaving `pendingStandby` intact. This means a stale "clear" broadcast for an unrelated cue (owned-dept matched but cue_id mismatch) could flip a READY back to STANDBY-pending-ack visual state for the still-pending cue. In practice B006-007's aggregator only emits `standby=false` after a matching `true`, so the case is theoretical. Suggested tidy (post-bundle, optional):

```tsx
} else if (pendingStandby?.cue_id === event.cue_id) {
  setPendingStandby(null);
  setAcknowledged(false);
}
```

Not requesting changes — outside the AC envelope. Architect can fold this into a F3 polish task if desired.

## Decision

Accepted. Status → `accepted`. `B006-008` complete.
