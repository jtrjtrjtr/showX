---
id: "B007-004"
title: "ElevenLabs Node client + voice clone onboarding"
status: "done"
owner: "forge"
started_at: "2026-06-14T03:10:00Z"
ended_at: "2026-06-14T03:35:00Z"
review_round: 1
---

## Files changed

- `src/main/src/caller/tts/elevenLabsClient.ts` — NEW: `ElevenLabsClient` class; `isEnabled()`, `synthesize(text, voiceId, outPath)` → `{ path, durationSecs }`, `cloneVoice(name, samplePaths, description?)` → voice_id. Uses native `fetch` (Node 20+, no external SDK). API key from SecretStore (`elevenlabs-api-key`). Model: `eleven_multilingual_v2`. Duration estimated from mp3 file size at 128 kbps. Graceful when key absent (throws with clear message; callers use `isEnabled()` to gate).
- `src/main/src/caller/tts/voiceProfile.ts` — NEW: `VoiceProfile` interface; `loadVoiceProfile(pkgPath)` / `saveVoiceProfile(pkgPath, profile)`. Persists `voice_profile.json` inside the `.showx` package with atomic tmp→rename pattern.
- `src/main/src/ipc/channels.ts` — Added 5 caller channel constants: `CALLER_TTS_STATUS`, `CALLER_APIKEY_SET`, `CALLER_TTS_SYNTHESIZE`, `CALLER_VOICE_GET`, `CALLER_VOICE_CLONE`.
- `src/main/src/ipc/callerBridge.ts` — NEW: `registerCallerBridge(deps, ipc)` — 5 IPC handlers wiring ElevenLabsClient + VoiceProfile + SecretStore.
- `src/main/src/ipc/index.ts` — Added optional `caller?: CallerBridgeDeps` to `IpcDeps`; registers bridge when present. Backward-compatible: Shell.ts needs no changes until it wires ElevenLabs deps (follow-up task).
- `tests/unit/main/caller/tts/elevenLabsClient.test.ts` — NEW: 10 tests (isEnabled ×2, synthesize ×4, cloneVoice ×4). Mocks `fetch` globally.
- `tests/unit/main/caller/tts/voiceProfile.test.ts` — NEW: 5 tests (load ×3, save ×2). Mocks `node:fs`.
- `tests/unit/ipc/callerBridge.test.ts` — NEW: 9 tests (status ×2, apikey:set ×1, synthesize ×2, voice:get ×2, voice:clone ×2).
- `tests/unit/Shell.test.ts` — Updated channel registration test to exclude `caller:*` channels (optional deps).
- `docs/dev/elevenlabs_tos_cost_note.md` — NEW: ToS consent requirement, quality caveat for short imperative phrases, cost estimate table for Jindřich/Rothschild.

## Tests run

```
Test Files  160 passed (160)
     Tests  2026 passed (2026)
  Duration  13.55s
```

New tests added: 24 (10 + 5 + 9).

## Decisions made

- **No SDK dep**: Used native `fetch` (Node 20+) + `FormData` against ElevenLabs REST API directly. Avoids `@elevenlabs/elevenlabs-js` which pulls in heavy transitive deps; the two endpoints needed (TTS + voices/add) are simple REST calls.
- **Duration estimate**: ElevenLabs TTS endpoint returns raw mp3 bytes without a duration header. Duration is estimated as `fileSize / (128000/8)` bytes/sec. Accurate to ±10% for typical TTS; exact duration is available when the playback engine (B007-006) decodes the mp3.
- **Optional IPC deps**: `caller?` is optional in `IpcDeps` so Shell.ts requires zero changes now. The bridge registers only when deps are present. Shell wiring is a natural follow-up at the same time B007-005 (pre-gen) is activated.
- **SecretStore key**: `elevenlabs-api-key` — single key, consistent with other secrets pattern in the codebase.
- **Voice profile location**: `<show.showx>/voice_profile.json` — lives inside the show package, travels with it (ZIP/backup), and is separate from cue data (no Yjs CRDT needed for a single-write profile).

## Notes for Critic

- The `isEnabled()` check is the caller's responsibility before calling `synthesize()`/`cloneVoice()`. No auto-disable fallback inside the methods (they throw with clear messages). This matches the spec: "Graceful when absent: TTS disabled, deterministic text still available." — the deterministic generator (B007-002) is the fallback, not this module.
- Shell.ts wiring for the `caller` deps is NOT in scope here. The bridge is ready; the Shell will need `ElevenLabsClient` instantiated with the main process SecretStore and `ActiveShowDoc` reference. That wiring belongs to a follow-up or B007-005.
- No package.json changes needed — native `fetch` available in Node 20+, `FormData` likewise.
- `pnpm -r typecheck` clean (all 5 workspaces).
