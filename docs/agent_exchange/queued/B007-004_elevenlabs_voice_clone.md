---
id: "B007-004"
title: "ElevenLabs Node client + voice clone onboarding"
type: "implementation"
estimated_size_lines: 420
priority: "P1"
bundle: "ShowX-7"
depends_on: []
target_files:
  - "src/main/src/caller/tts/elevenLabsClient.ts"
  - "src/main/src/caller/tts/voiceProfile.ts"
  - "src/main/src/ipc/**"
  - "package.json"
  - "tests/unit/**"
acceptance_criteria:
  - "ElevenLabs TTS client in Node (main process): text → audio file (mp3). Use @elevenlabs/elevenlabs-js SDK OR direct REST (fetch) — model eleven_multilingual_v2 (CZ+EN). Reference podcast/src/tts.py + config.yaml for model/voice patterns (do NOT import Python)."
  - "API key from SecretStore (NOT env/plaintext). Graceful when absent: TTS disabled, deterministic text still available."
  - "Voice clone onboarding: record/upload a showcaller sample → ElevenLabs Instant Voice Clone → store the returned voice_id in a per-show voice profile (voiceProfile.ts, persisted with the show). IPC for the PWA onboarding flow (record sample → create clone → save voice_id)."
  - "synthesize(text, voiceId, outPath) → writes mp3; returns path + duration. Errors caught + surfaced, never crash."
  - "Unit tests with a mocked ElevenLabs client: synthesize writes file; voice profile create/store/load; no-key disables; error handling. (Real API call NOT required in tests.)"
  - "Document ElevenLabs cloning ToS/quality caveat + cost note in a docs/dev/ note for Jindřich/Rothschild."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context
Per decision §3. ShowX is TS/Electron → Node ElevenLabs client (Python podcast integration is reference only). Voice clone = the showcaller's own voice; pre-gen (B007-005) uses it.

## Implementation notes
- Add @elevenlabs/elevenlabs-js to deps (or use fetch against the REST API to avoid a heavy dep — your call, keep it lean).
- SecretStore for the key (existing service).
- Voice profile persists with the show (voice_id reference, not the audio).
- ⚠ flag cloning quality/ToS for short imperative phrases — note in docs.

## Test plan
- Mock client: synthesize → mp3 path; clone → voice_id stored; no key → disabled; error → handled.

## Out of scope
- Pre-gen orchestration (005). Playback (006). LLM text (003).
