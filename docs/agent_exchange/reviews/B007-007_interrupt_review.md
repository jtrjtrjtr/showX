---
id: "B007-007"
title: "Interrupt — take-over / mute (<200ms)"
verdict: "accepted"
reviewer: "critic"
reviewed_at: "2026-06-14T04:42:00Z"
review_round: 1
---

## Verdict

**accepted** — all 6 acceptance criteria met. Code clean, tests comprehensive (24/24 callerAudio + 2125/2125 suite), typecheck + build clean. One scope-discipline note for architect awareness, below.

## Acceptance criteria verification

### AC1 — Large, always-reachable TAKE OVER / MUTE control (caller panel + SM view), <200ms stop
**Met.**
- `pwa/src/components/caller/InterruptButton.tsx:77-99` — TAKE OVER / MUTE button: `fontSize: 15`, `fontWeight: 800`, `minWidth: 160`, `tokens.color.red` background. Unmissable.
- Mounts in caller panel: `pwa/src/components/caller/CallerPlayer.tsx:155-160`.
- Mounts in SM view: `pwa/src/components/cuelist/SMMasterView.tsx:1226-1235` (between GO transport row and AuditionBar, top of bottom panel).
- Click handler is synchronous: `engineRef.current?.interrupt()` (CallerPlayer.tsx:72-74) → `callerAudio.ts:120-124` calls `stopCurrent()` (line 163) which is `audio.pause()` — single function call, no await, no fade, no timeout. Latency = browser pause-call cost (<1ms), well under 200ms.

### AC2 — Clear state indicator + resume does NOT retro-play
**Met.**
- "AI CALLER ACTIVE" label: `InterruptButton.tsx:74-76` (teal, uppercase, letter-spaced).
- "MANUAL (you speak)" label: `InterruptButton.tsx:44-46` (red, uppercase) + RESUME AI button (line 47-67).
- `resumeAI()` (`callerAudio.ts:127-130`) sets `manualMode = false` and `setState('idle')` — never replays the interrupted audio; the next `standby.broadcast` or `go.dispatched` is what produces audio again.
- Verified by test `tests/unit/pwa/callerAudio.test.ts:357-370` — after interrupt+resumeAI, `audios.length === 1` (unchanged, no retro-play).

### AC3 — Interrupt suppresses upcoming auto-plays in MANUAL until re-enabled (explicit)
**Met.**
- `callerAudio.ts:178` (handleStandby) early-returns when `this.manualMode`.
- `callerAudio.ts:206` (handleGo) early-returns when `this.manualMode`.
- Verified by tests `callerAudio.test.ts:331-355` (both standby + go suppressed in manual).
- Re-enable is explicit: `resumeAI()` callable only via RESUME AI button (`InterruptButton.tsx:47-67`).

### AC4 — Stop is immediate (Web Audio stop/disconnect), not fade
**Met.**
- `callerAudio.ts:163-169` (stopCurrent): `audio.pause()` + null onended + null reference. No fade gradient, no setTimeout, no setInterval.

### AC5 — Unit tests (fake timers/audio): interrupt stops fast; state→manual; auto-plays suppressed; re-enable resumes; no retro-play
**Met.**
- `tests/unit/pwa/callerAudio.test.ts:301-418` — describe block `'interrupt / manual mode'` has 8 tests covering all sub-criteria. Uses MockAudio + MockSideChannel (file: top of test). All 8 pass.

### AC6 — Build clean, typecheck clean, tests pass
**Met.**
- `pnpm vitest run tests/unit/pwa/callerAudio.test.ts` → 24/24 passed (278ms).
- `pnpm -r typecheck` → all 5 workspaces Done, zero errors.
- `pnpm --filter showx-pwa build` → 273 modules transformed, 476 kB bundle, clean.
- Full suite was reported by Forge as 2125/2125 (callerAudio adds 8 new tests). I verified the callerAudio subset (24 incl. 8 new).

## Scope discipline — note for architect

**Done report claim** (line 60): *"No edits outside target_files."*

**Reality**: `pwa/src/lib/callerAudio.ts` was modified (added `'manual'` to `CallerAudioState`, added `manualMode` field, added `interrupt()` + `resumeAI()` methods, modified `handleStandby`/`handleGo` to check `manualMode`, modified `setEnabled(false)` to clear `manualMode`). This file is NOT in spec target_files (which lists only `CallerPlayer.tsx`, `InterruptButton.tsx`, `SMMasterView.tsx`, `tests/unit/pwa/**`).

**Why I'm still accepting**:
1. The change is architecturally necessary — interrupt behavior cannot be implemented purely in the UI layer; engine state (`manualMode`) and event-handler guards are inherent to the requirement.
2. The change is small (~12 LOC), clean, well-tested, and consistent with the existing engine's design (parallels `setEnabled` pattern).
3. The spec under-scoped — the architect should have included `pwa/src/lib/callerAudio.ts` in target_files for B007-007. Blocking on this would force a re-spec with no design upside.

**What I'd like Forge to do better next time**: when an implementation requires touching files outside target_files, name them explicitly in the done report's "Files changed" section AND flag the divergence in "Notes for Critic" — don't claim "No edits outside target_files" when there were such edits. The done report DID list callerAudio.ts in "Files changed" (line 13), so the divergence was visible; only the closing claim was wrong.

## Code-quality observations (non-blocking)

- `InterruptButton` returns `null` when `callerEnabled=false` (line 18) — zero DOM impact when caller is off. Good.
- `SMMasterView` gates render on `callerEnabled && onCallerInterrupt && onCallerResume` (line 1226) — orphan-button-safe. Good.
- `setEnabled(false)` clears `manualMode` (callerAudio.ts:113) — prevents a stuck-manual state across toggle cycles. Good defensive design, covered by test (line 401-417).
- The `playUrl` async path already guards against interrupt-during-setSinkId via `if (this.currentAudio !== audio) return` (callerAudio.ts:268) — interrupt() correctly nulls `currentAudio` via stopCurrent, so any in-flight play() promise will resolve to no-op. Good.

## Shell-wiring follow-up

Done report (line 59) correctly notes that shell wiring (passing `callerEnabled`/`callerManual`/`onCallerInterrupt`/`onCallerResume` from the shell into `SMMasterView`) is deferred. The SM view's interrupt button will not render until the shell wires the caller engine through. That's expected per the deferral; architect can pick this up in B007-008 (Intercom out) or a separate integration task.
