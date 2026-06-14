---
id: "B007-008"
title: "Intercom out — audio device selection"
type: "implementation"
estimated_size_lines: 320
priority: "P1"
bundle: "ShowX-7"
depends_on: ["B007-006"]
target_files:
  - "pwa/src/lib/callerAudio.ts"
  - "pwa/src/components/caller/CallerSettings.tsx"
  - "pwa/src/components/caller/CallerPlayer.tsx"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "Caller audio output is routable to a SELECTED audio output device (the intercom channel) via HTMLMediaElement.setSinkId(deviceId). A CallerSettings UI lists available output devices (navigator.mediaDevices.enumerateDevices) and lets the user pick the intercom device; selection persists."
  - "Playback (B007-006) plays through the selected sink; default = system default if none chosen. Handles device disappearing (fallback to default + warn)."
  - "Permission handling: enumerateDevices labels may require permission — request/guide gracefully; degrade to default device if unavailable."
  - "Unit tests (mock mediaDevices + setSinkId): device list renders; selection applied to playback element; persistence; missing device → default fallback."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context
Per decision §5/§7 + mail (intercom modules: synthesis into intercom so everyone hears). The caller voice must go to the intercom audio device, not the Mac speakers.

## Implementation notes
- setSinkId on the audio element used by B007-006.
- enumerateDevices for the picker; persist choice.
- macOS: an aggregate/loopback or USB intercom interface is the typical target.

## Test plan
- See ACs.

## Out of scope
- Playback core (006). Interrupt (007). Hardware intercom wiring.
