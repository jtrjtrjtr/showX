---
id: "B007-005"
title: "Rehearsal pre-generation → .showx/media"
type: "implementation"
estimated_size_lines: 420
priority: "P1"
bundle: "ShowX-7"
depends_on: ["B007-002", "B007-004"]
target_files:
  - "src/modules/cuelist-core/src/caller/preGenerate.ts"
  - "src/modules/cuelist-core/src/mode/transitions.ts"
  - "src/modules/cuelist-core/src/persistence/showxPackage.ts"
  - "src/main/src/ipc/**"
  - "tests/unit/**"
acceptance_criteria:
  - "preGenerateCallerAudio(doc, cuelistId, pkgPath, ttsClient, voiceId): for every cue with caller_lines, synthesize standby (per dept) + go audio via B007-004 TTS, write to .showx/media/<cue_id>_<dept>_standby.mp3 + <cue_id>_go.mp3 (media/ dir exists). Idempotent: skip already-generated unchanged lines (hash text → skip if file current)."
  - "Hook into REHEARSAL→SHOW transition (transitions.ts ~:56, after writeSnapshot, before payload freeze): trigger pre-gen so SHOW has all audio local. Pre-gen is also runnable on-demand during REHEARSAL (preview/regenerate a cue) via IPC — showcaller hears it ahead of time."
  - "A manifest maps cue_id+dept+kind → media file (so playback B006 can resolve without network). Stored in the package."
  - "Graceful: no voice profile / no API key → pre-gen skipped with a clear status (show still works, caller falls back to live template/manual). Partial failures logged per-cue, don't abort the whole transition."
  - "Unit tests (mocked TTS): pre-gen writes expected files + manifest; idempotent skip; transition hook triggers pre-gen; no-key skips gracefully; per-cue failure isolated."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context
Per decision §4 — the LAN-first core. Audio is generated at REHEARSAL (network OK) and frozen into .showx; SHOW plays locally (no latency, no internet). Mirrors payload_frozen_at philosophy.

## Implementation notes
- transitions.ts REHEARSAL→SHOW is the hook (seam map). Don't break existing snapshot/freeze.
- Idempotency via text hash → avoid re-synthesizing unchanged lines (cost + time).
- Manifest so playback resolves files offline.

## Test plan
- See ACs (mock TTS, no real ElevenLabs call).

## Out of scope
- TTS client (004). Playback (006). Generation (002).
