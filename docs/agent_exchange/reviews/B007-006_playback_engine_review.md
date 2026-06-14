---
id: "B007-006"
title: "Caller playback engine + cue-lights subscription + fallback"
verdict: "accepted"
reviewed_at: "2026-06-14T04:25:00Z"
reviewer: "critic"
review_round: 1
---

## Verdict: accepted

All acceptance criteria met. Riskiest task (audio playback infra new to ShowX) delivered cleanly with strong test coverage, dependency-injection-friendly component, and no shell regressions for non-caller shows.

## Acceptance criteria audit

### AC1 — Subscribes to standby.broadcast + go.dispatched, plays from local manifest via IPC

✓ `pwa/src/lib/callerAudio.ts:80-83` constructor subscribes both topics.
✓ `pwa/src/lib/callerAudio.ts:146-172` handles standby (resolves & plays pre-genned standby audio).
✓ `pwa/src/lib/callerAudio.ts:174-193` handles go (resolves & plays GO audio).
✓ `src/main/src/ipc/callerBridge.ts:62-82` IPC `CALLER_MEDIA_MANIFEST`: reads `pkgPath/media/caller_manifest.json` from local disk, enriches each entry with `pathToFileURL()` absolute `file://` URL. No network. LOCAL.
✓ Manifest path matches B007-005 producer (`src/modules/cuelist-core/src/caller/preGenerate.ts:76` `MANIFEST_FILE = 'media/caller_manifest.json'`).
✓ Manifest entry keys match producer format: `{cue_id}_{dept}_standby` and `{cue_id}_go` (callerAudio.ts:200, 209 vs preGenerate.ts:64-66).

### AC2 — HTMLAudioElement playback; queue management (stale cancel); aggregate multi-dept

✓ `pwa/src/lib/callerAudio.ts:143` `new Audio(url)` — HTMLAudioElement playback.
✓ `pwa/src/lib/callerAudio.ts:132-138` `stopCurrent()` pauses + clears onended.
✓ Stale standby cancelled before new playback (callerAudio.ts:157).
✓ Stale standby cancelled before GO (callerAudio.ts:179) — standby → go transition clean.
✓ `pwa/src/lib/callerAudio.ts:195-205` `resolveStandbyUrl()` iterates departments in array order, picks first manifest hit — aggregates compound-cue standbys correctly (B007-002 generates identical text per dept, so first wins).
✓ Test `tests/unit/pwa/callerAudio.test.ts:110-121` aggregate verified.
✓ Test `tests/unit/pwa/callerAudio.test.ts:123-140` stale cancel verified.

### AC3 — Offline/ad-lib fallback: missing audio → no-audio indicator, never blocks show

✓ Missing manifest entry → `setState('no-audio')` (callerAudio.ts:166-168, 187-189) — no exception, no promise rejection.
✓ Manifest never loaded (null) → `'no-audio'` state (callerAudio.ts:159-163, 181-184).
✓ Play failures (e.g. file missing on disk) caught at `audio.play().catch()` (callerAudio.ts:226-231) → returns to idle silently.
✓ `pwa/src/components/caller/CallerPlayer.tsx:128-139` renders `⚠` indicator + tooltip when state is `'no-audio'`.
✓ Behavior documented in done report ("never blocks the show — no exception thrown").
✓ Tests verify missing standby and missing go both → `'no-audio'` (callerAudio.test.ts:156-166, 194-203).

Note: local template TTS not implemented (spec uses "either … or" — silent + visual indicator is the chosen path).

### AC4 — Opt-in panel/toggle; disabled = zero audio (no regression)

✓ `pwa/src/components/caller/CallerPlayer.tsx:117-143` panel with toggle button (`On`/`Off`, aria-pressed).
✓ `defaultEnabled` prop defaults to `false` (CallerPlayer.tsx:44) — opt-in.
✓ Both `handleStandby` and `handleGo` early-return when `!this.enabled` (callerAudio.ts:147, 175).
✓ `setEnabled(false)` stops current playback + sets idle (callerAudio.ts:108-111).
✓ Tests verify disabled = no playback (callerAudio.test.ts:207-217), disable-after-enable cancels (219-235).

Gap acknowledged: CallerPlayer is NOT mounted in ShellRouter. Forge correctly observed that `pwa/src/components/cuelist/ShellRouter.tsx` is outside `target_files` (which permits only `pwa/src/components/caller/`, `pwa/src/lib/callerAudio.ts`, `pwa/src/lib/sideChannel.ts`, `src/main/src/ipc/**`, `tests/unit/pwa/**`). Touching ShellRouter would have been scope creep. The component is dependency-injection-friendly (sideChannel + getManifest as props) and ready for 2-line shell mount in B007-007/008 or architect wiring. Not blocking — architect can sequence the mount.

### AC5 — Unit tests cover all listed cases

✓ All required cases present in `tests/unit/pwa/callerAudio.test.ts` (16 tests, 5 describe groups):
  - standby plays correct dept file (line 97)
  - go plays correct file (line 170)
  - aggregate multi-dept (line 110)
  - stale standby cancel (line 123)
  - missing audio → no-audio (line 156, 194)
  - disabled → silent (line 207, 219)
  - bonus: historic go ignored (line 183), onStateChange (line 253), manifest load-once (line 268), pre-enable events silent (line 284), destroy unsubscribes (line 302).

### AC6 — Build + typecheck + test gates, no edits outside target_files

✓ `pnpm vitest run` — 166 files, 2117 tests pass (verified locally).
✓ `pnpm -r typecheck` — 5 workspaces, all clean (verified locally).
✓ `pnpm --filter showx-pwa build` — 272 modules transformed, no node:* leak detected in dist bundle (verified locally; bundle string-scanned for `node:` / `require(`).
✓ Edits within `target_files`:
  - `src/main/src/ipc/channels.ts` ∈ `src/main/src/ipc/**` ✓
  - `src/main/src/ipc/callerBridge.ts` ∈ `src/main/src/ipc/**` ✓
  - `pwa/src/lib/callerAudio.ts` ∈ target ✓
  - `pwa/src/components/caller/CallerPlayer.tsx` ∈ target ✓
  - `tests/unit/pwa/callerAudio.test.ts` ∈ `tests/unit/pwa/**` ✓

`src/main/src/ipc/index.ts` modification (visible in `git status`) pre-dates this task — was already on disk from earlier B007 tasks (caller + llmDraft bridge wiring). Not introduced by B007-006. Confirmed by reading the diff: only callerBridge + llmDraftBridge registrations, no CALLER_MEDIA_MANIFEST glue.

## Code quality observations

- **Side-channel structural typing.** `CallerSideChannel` interface (callerAudio.ts:53-56) defines a structurally-narrower subtype of the full event payloads from `SideChannelClient`. SideChannelClient.on returns the full `StandbyBroadcast` / `GoDispatched` with topic + extra fields — these structurally satisfy the narrower interface used by the engine. Verified shape compatibility against `pwa/src/lib/sideChannel.ts:98-156`.

- **Historic GO filtering.** `pwa/src/lib/callerAudio.ts:177` ignores events with `historic: true` (set by SideChannelClient when `ageMs > 5000`, sideChannel.ts:268). Prevents replaying past GO audio on reconnect. Correct: GO is a one-shot fire event. Standby is intentionally NOT historic-filtered because standby is a state, not a fire event, and SideChannelClient's standby.broadcast doesn't carry `historic` (sideChannel.ts:294-295).

- **Manifest race protection.** `manifestLoading` guard (callerAudio.ts:73, 100-106) prevents double-fetch if `setEnabled(true)` is called twice in quick succession. Subtle but correct.

- **`as unknown as MockableAudio` cast.** Type assertion at callerAudio.ts:143 is annotated, narrow (single line), and runtime-safe (HTMLAudioElement structurally satisfies the interface — `play`, `pause`, `onended`, `src`). Acceptable trade-off.

- **CallerPlayer effect ordering.** Two `useEffect`s in CallerPlayer (lines 50, 70): the second calls `engineRef.current?.setEnabled(defaultEnabled)`. On first render React runs effects in declaration order, so the engine is created before setEnabled is called. Correct. On `defaultEnabled` prop change, the second effect re-syncs. The first effect's deps `[sideChannel, getManifest]` mean engine is recreated only if those identities change — caller should pass stable references (memoize), but that's an integration concern for the shell mount.

- **Stop on play-failure.** `audio.play().catch()` (callerAudio.ts:226-231) handles autoplay rejections (Chrome/Electron autoplay policy) and missing files gracefully. State returns to idle, no orphan reference. Good.

## Notes for architect / next tasks

- **CallerPlayer shell mount** is the carry-over. Spec target_files explicitly didn't include ShellRouter, so Forge stopped at the right boundary. Either:
  1. Architect wires it directly (1 import + 1 JSX line in ShellRouter), OR
  2. B007-007 (interrupt) or B007-008 (intercom out) includes ShellRouter in its target_files and mounts CallerPlayer as part of those wider integrations.

- **Manifest refresh after pre-gen.** `callerAudio.refreshManifest()` (callerAudio.ts:115-117) is exposed but not called from the UI. After running B007-005 pre-gen, the operator should refresh manifest. Could be wired in B007-007 (e.g. after pregen IPC resolves, call refresh). Not blocking for B007-006 acceptance.

- **No-audio fallback documentation.** Done report documents the behavior. Worth surfacing in operator docs (REHEARSAL → run pre-gen → ⚠ disappears).

Task accepted. Unblocks B007-007 (interrupt) and B007-008 (intercom out) which depend on B007-006. Also feeds into B007-009 (F4 E2E gate).
