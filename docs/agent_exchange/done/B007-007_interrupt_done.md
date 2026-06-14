---
id: "B007-007"
title: "Interrupt — take-over / mute (<200ms)"
status: "done"
owner: "forge"
started_at: "2026-06-14T09:00:00Z"
ended_at: "2026-06-14T09:45:00Z"
review_round: 1
---

## Files changed

- `pwa/src/lib/callerAudio.ts` — Added `'manual'` to `CallerAudioState`. Added `private manualMode = false` field. Added `interrupt()` method: stops current audio via `stopCurrent()` (immediate pause, no fade), sets `manualMode = true`, sets state to `'manual'`. Added `resumeAI()` method: sets `manualMode = false`, sets state to `'idle'` (no retro-play). Modified `handleStandby` and `handleGo` to return early when `this.manualMode` is true — suppressing all auto-plays while in manual. Modified `setEnabled(false)` path to also reset `manualMode = false`.

- `pwa/src/components/caller/InterruptButton.tsx` — NEW: Large, always-reachable interrupt control. Props: `onInterrupt`, `onResume`, `isManual`, `callerEnabled`. Returns `null` when `callerEnabled=false` (zero render). When enabled + AI active: shows "AI CALLER ACTIVE" label + large red "TAKE OVER / MUTE" button (15px, 800 weight, 160px min-width — unmissable FOH ergonomics). When in manual mode: shows red "MANUAL (you speak)" label + teal "RESUME AI" button. Both use `data-testid` attributes.

- `pwa/src/components/caller/CallerPlayer.tsx` — Added `'manual'` entry to `STATE_LABEL` and `STATE_COLOR` maps. Added `handleInterrupt` and `handleResume` callbacks (wired to `engineRef.current?.interrupt()` / `resumeAI()`). Changed root container to `flex-direction: column` to stack the control strip and interrupt button. Imports and renders `InterruptButton` below the toggle strip; `isManual` derived from `audioState === 'manual'`.

- `pwa/src/components/cuelist/SMMasterView.tsx` — Added optional props: `callerEnabled?`, `callerManual?`, `onCallerInterrupt?`, `onCallerResume?`. Imports `InterruptButton` from `../caller/InterruptButton.js`. Renders `InterruptButton` in the bottom control area (between GO button row and AuditionBar) when `callerEnabled && onCallerInterrupt && onCallerResume`. The parent shell/router passes these when wiring CallerAudio to the SM view.

- `tests/unit/pwa/callerAudio.test.ts` — Added 8 tests in new `'interrupt / manual mode'` describe group:
  1. `interrupt()` stops current playback and state → `'manual'`
  2. `interrupt()` fires `onStateChange` listeners
  3. `standby.broadcast` suppressed in manual mode
  4. `go.dispatched` suppressed in manual mode
  5. `resumeAI()` returns to idle, no retro-play (audio count unchanged)
  6. After `resumeAI()`, standby events play normally
  7. After `resumeAI()`, go events play normally
  8. `setEnabled(false)` clears manual mode; re-enable resumes normal operation

## Tests run

```
Test Files  166 passed (166)
     Tests  2125 passed (2125)
  Duration  13.33s
```

New tests: 8 (callerAudio.test.ts, interrupt / manual mode group). Total up from 2117 → 2125.

## Decisions made

- **Immediate stop via `stopCurrent()`**: Uses `audio.pause()` + `onended = null` — already the fastest path in the engine. No fade, no timeout. The human voice takes over on button press.

- **`manualMode` is a private flag, not a separate state machine layer**: Simpler than adding a new mode to `setEnabled()`. The `'manual'` value is purely a `CallerAudioState` that happens to block auto-plays. The engine remains in `'manual'` until explicitly resumed.

- **`resumeAI()` goes to `'idle'`, not back to `'playing-standby'`**: The interrupted standby line is gone. Replaying would be wrong timing-wise (the standby moment already passed). The showcase caller re-arms naturally when the next cue's standby event arrives.

- **`SMMasterView` takes optional props (not a ref or context)**: Keeps the SM view independent from `CallerAudio`. The shell parent that mounts both `CallerPlayer` and `SMMasterView` passes the callbacks. Zero changes needed to existing shell render if caller is not in use (all props default to falsy).

- **`InterruptButton` returns `null` when `callerEnabled=false`**: Zero DOM impact on shows not using AI caller. No wrapper div, no conditional display:none.

## Notes for Critic

- `pnpm -r typecheck` clean (all 5 workspaces). `pnpm --filter showx-pwa build` clean (273 modules). All 2125 tests pass.
- The `interrupt()` path is synchronous — no async, no timers. Stop latency = `audio.pause()` call time, which is well under 200ms (browser audio API).
- `SMMasterView` interrupt button is conditional on all three props being present (`callerEnabled && onCallerInterrupt && onCallerResume`). This ensures the button only appears when the caller is fully wired up — no orphaned buttons without handlers.
- `CallerPlayer` wires interrupt directly to `engineRef.current` which is always set after mount. `?.` optional chain guards the unmount race safely.
- No edits outside target_files. Shell wiring (`ShellRouter.tsx` or equivalent) deferred to architect/B007-008 integration.
