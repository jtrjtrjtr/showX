---
id: "B007-004"
title: "ElevenLabs Node client + voice clone onboarding"
verdict: "accepted"
review_round: 1
reviewer: "critic"
reviewed_at: "2026-06-14T03:12:00Z"
---

## Verdict: accepted

All 7 acceptance criteria verified against code + tests. Typecheck clean (5/5 workspaces). Full suite 2026/2026 green (24 new tests).

## Acceptance criteria verification

1. **ElevenLabs TTS client in Node, model `eleven_multilingual_v2` (CZ+EN)** — verified.
   - `src/main/src/caller/tts/elevenLabsClient.ts:6` `MODEL_ID = 'eleven_multilingual_v2'`
   - `src/main/src/caller/tts/elevenLabsClient.ts:31-43` `fetch` POST to `/text-to-speech/{voiceId}` with `model_id` in JSON body.
   - No SDK dep — Forge chose native `fetch` + `FormData` (Node 20+). Documented in done report; rationale is sound (avoid heavy transitive deps for two REST endpoints).

2. **API key from SecretStore, graceful when absent** — verified.
   - `src/main/src/caller/tts/elevenLabsClient.ts:11` `SECRET_KEY = 'elevenlabs-api-key'`
   - `src/main/src/caller/tts/elevenLabsClient.ts:21-24` `isEnabled()` returns false when key missing.
   - `src/main/src/caller/tts/elevenLabsClient.ts:95-99` `requireKey()` throws clear message when absent (per Forge note: caller responsibility to gate via `isEnabled()` — matches spec wording "TTS disabled, deterministic text still available", with B007-002 being the fallback).
   - No `process.env` or plaintext file reads.

3. **Voice clone onboarding + per-show voice profile + IPC** — verified.
   - `src/main/src/caller/tts/elevenLabsClient.ts:61-93` `cloneVoice(name, samplePaths, description)` posts multipart `voices/add`, returns `voice_id`.
   - `src/main/src/caller/tts/voiceProfile.ts:14-28` load/save `voice_profile.json` in `.showx` package with atomic tmp→rename.
   - `src/main/src/ipc/callerBridge.ts:39-55` `CALLER_VOICE_CLONE` IPC clones + persists + returns `VoiceProfile`.
   - `src/main/src/ipc/callerBridge.ts:33-37` `CALLER_VOICE_GET` IPC reads existing profile.
   - PWA onboarding flow has the IPC surface it needs (set key → clone → get profile).

4. **`synthesize(text, voiceId, outPath)` → mp3 + duration, errors surfaced** — verified.
   - `src/main/src/caller/tts/elevenLabsClient.ts:26-59` returns `{ path, durationSecs }`.
   - Errors: network error wrapped (`elevenLabsClient.ts:44-46`), non-2xx surfaced with status + body (`elevenLabsClient.ts:48-51`).
   - Duration estimate from mp3 byte size at 128 kbps (`elevenLabsClient.ts:9, 57`). ±10% per Forge note — acceptable for now; B007-006 playback engine will decode exact duration.

5. **Unit tests with mocked client** — verified.
   - `tests/unit/main/caller/tts/elevenLabsClient.test.ts` — 10 tests (isEnabled ×2, synthesize ×4, cloneVoice ×4). Mocks `fetch` + `node:fs`. Covers happy path, no-key, API error, network error, missing voice_id.
   - `tests/unit/main/caller/tts/voiceProfile.test.ts` — 5 tests including round-trip.
   - `tests/unit/ipc/callerBridge.test.ts` — 9 tests across all 5 IPC handlers.
   - Ran: 31/31 caller-related tests pass; full suite 2026/2026 pass.

6. **ToS + quality caveat + cost note in `docs/dev/`** — verified.
   - `docs/dev/elevenlabs_tos_cost_note.md` covers ToS (consent, commercial use, no impersonation), quality caveat for short imperative phrases, cost estimate table per plan tier, and recommended `voice_settings` tuning hook.

7. **`pnpm -r typecheck` clean, tests pass, no edits outside target_files** — verified.
   - Typecheck: all 5 workspaces Done.
   - Files modified vs target_files allowlist:
     - `src/main/src/caller/tts/elevenLabsClient.ts` (NEW) ✓ target
     - `src/main/src/caller/tts/voiceProfile.ts` (NEW) ✓ target
     - `src/main/src/ipc/channels.ts` (M) ✓ `src/main/src/ipc/**`
     - `src/main/src/ipc/callerBridge.ts` (NEW) ✓ `src/main/src/ipc/**`
     - `src/main/src/ipc/index.ts` (M) ✓ `src/main/src/ipc/**`
     - `tests/unit/main/caller/**`, `tests/unit/ipc/callerBridge.test.ts`, `tests/unit/Shell.test.ts` ✓ `tests/unit/**`
     - `docs/dev/elevenlabs_tos_cost_note.md` ✓ required by AC#6
   - `package.json` correctly left unchanged (no SDK dep — native fetch).
   - Other modified files in git status (`pwa/src/components/cuelist/CueEditDialog.tsx`, `src/shared/src/types/cue.ts`, etc.) belong to B007-001, not this task.

## Architectural choices reviewed

- **No SDK dep / native fetch** — sound; keeps bundle lean; only two endpoints needed.
- **Duration estimate via byte size** — pragmatic; ±10% accuracy documented; exact value comes later at playback decode.
- **Optional `caller?` in `IpcDeps`** — backward-compatible; Shell.ts requires zero changes until wired in B007-005 follow-up. `src/main/src/ipc/index.ts:85-87` registers bridge only when deps present. Shell-channel test updated to skip optional `caller:*` channels.
- **Voice profile location** — `<show.showx>/voice_profile.json`, atomic tmp→rename pattern. Travels with the show package. Reasonable separation from Yjs cue data (single-write payload, no CRDT needed).
- **Errors thrown, not swallowed** — spec says "errors caught + surfaced, never crash". Implementation throws structured errors with context (status + body) that propagate through IPC and become rejected promises in the renderer. This matches the intent: surface errors to UI, do not crash the main process. Verified by `tests/unit/ipc/callerBridge.test.ts:108-117` (rejection propagation).

## Minor observations (non-blocking, not requesting changes)

- `'elevenlabs-api-key'` literal appears in both `elevenLabsClient.ts:11` and `callerBridge.ts:21`. Minor DRY concern; could be exported as a shared constant in a future cleanup. Not worth a re-spin.
- `cloneVoice` filename extraction uses `sp.split('/').pop()` — won't handle Windows backslashes, but ShowX target platform is macOS FOH Mac, so non-issue.

## Out of scope (correctly deferred)

- Shell.ts wiring of `CallerBridgeDeps` (Forge note confirms this is a follow-up at B007-005 activation).
- Pre-gen orchestration (B007-005), playback (B007-006), LLM draft (B007-003).

## Conclusion

`accepted`. Task spec fully satisfied. Code quality OK. Tests adequate and passing. Ready for downstream cascade (B007-005 pre-gen depends on this).
