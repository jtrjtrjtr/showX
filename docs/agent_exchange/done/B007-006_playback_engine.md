---
id: "B007-006"
title: "Caller playback engine + cue-lights subscription + fallback"
type: "implementation"
estimated_size_lines: 450
priority: "P0"
bundle: "ShowX-7"
depends_on: ["B007-005"]
target_files:
  - "pwa/src/components/caller/CallerPlayer.tsx"
  - "pwa/src/lib/callerAudio.ts"
  - "pwa/src/lib/sideChannel.ts"
  - "src/main/src/ipc/**"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "Caller playback runs in the shell renderer (FOH Mac window). On `standby.broadcast` (side-channel, goEventChannel) for a cue → play that cue's pre-generated standby audio (per relevant dept, or aggregate); on `go.dispatched` → play the GO audio. Resolves files from the .showx/media manifest (B007-005) via IPC — LOCAL, no network at show time."
  - "Web Audio / HTMLAudioElement playback; queue management (don't overlap chaotically — standby then go; new standby cancels stale). Plays the aggregate line when multiple depts standby together (from B007-002)."
  - "Offline/ad-lib fallback: cue with no pre-gen audio → either a fast local template TTS (if available) or silent/visual-only with a clear 'no audio' indicator — never blocks the show. Documented behavior."
  - "Caller is opt-in/enable-able (a Caller panel/toggle in shell). When disabled, zero audio (no regression to non-caller shows)."
  - "Unit tests (mock audio + side-channel): standby msg → plays standby file; go msg → plays go file; aggregate; stale-standby cancel; missing audio → fallback indicator; disabled → silent."
  - "`pnpm --filter showx-pwa build` clean (no node:* leak), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context
Per decision §5. The voice half: subscribe to F3 cue-lights events and play the matching pre-genned audio locally. This is the riskiest task (audio playback infra is new — Web Audio in Electron renderer).

## Implementation notes
- Subscribe via the PWA side-channel client (sideChannel.ts) to standby.broadcast + go.dispatched (seam map goEventChannel:76,138).
- Resolve media files via IPC to the .showx/media manifest (main has fs).
- Device routing (setSinkId / intercom) is B007-008 — here just play to default output; 008 adds device selection.
- Keep a simple play queue; cancel stale.

## Test plan
- See ACs (mock audio element + side-channel messages).

## Out of scope
- Intercom device select (008). Interrupt (007). Pre-gen (005).
