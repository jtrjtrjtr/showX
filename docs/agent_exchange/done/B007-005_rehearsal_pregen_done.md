---
id: "B007-005"
title: "Rehearsal pre-generation → .showx/media"
status: "done"
owner: "forge"
started_at: "2026-06-14T05:00:00Z"
ended_at: "2026-06-14T06:00:00Z"
review_round: 1
---

## Files changed

- `src/modules/cuelist-core/src/caller/preGenerate.ts` — NEW: `preGenerateCallerAudio(doc, cuelistId, pkgPath, ttsClient, voiceId, logger?)` → `PreGenResult`. Iterates cues with `caller_lines`, synthesizes standby (per dept) + go audio via injected `TtsInterface`, writes to `.showx/media/<cue_id>_<dept>_standby.mp3` / `<cue_id>_go.mp3`. Idempotent via SHA-256 text hash (skips if manifest entry hash matches AND file exists). Writes `media/caller_manifest.json` mapping `{cue_id}_{dept}_standby` / `{cue_id}_go` → `CallerMediaEntry` (file, text_hash, text, duration_secs). Graceful: `!enabled || !voiceId` → `status: 'skipped_no_tts'` without error. Per-cue failures are isolated (logged + counted, don't abort). Types exported: `TtsInterface`, `PreGenLogger`, `CallerMediaEntry`, `CallerManifest`, `PreGenResult`, `PreGenStatus`, `PreGenError`.

- `src/modules/cuelist-core/src/mode/transitions.ts` — Added `PreGenOptions` interface + optional `preGen?` field to `TransitionContext`. Hook between `writeSnapshot` and payload-freeze: if `params.preGen` provided, calls `preGenerateCallerAudio`; `.catch` ensures pre-gen errors never abort the transition. Imports `preGenerateCallerAudio`, `TtsInterface`, `PreGenLogger` from `../caller/preGenerate.js`.

- `src/modules/cuelist-core/package.json` — Added `"./caller/preGenerate.js"` to exports map so `callerBridge.ts` can import via package path.

- `src/main/src/ipc/channels.ts` — Added `CALLER_PREGEN: 'caller:pregen'`.

- `src/main/src/ipc/callerBridge.ts` — Added `CALLER_PREGEN` IPC handler: gets `doc` + `pkgPath` from `activeShow`, resolves `active_cuelist_id` from `doc.getMap('meta')`, loads voice profile, calls `preGenerateCallerAudio` with `deps.elevenlabs` (which satisfies `TtsInterface` structurally). Returns `PreGenResult`. Graceful short-circuit if no active show.

- `tests/unit/modules/cuelist-core/caller/preGenerate.test.ts` — NEW: 13 tests across 6 describe blocks: no-TTS-key (disabled / null voiceId / undefined voiceId), writes expected files + manifest, idempotency (hash match skips / hash mismatch re-synths / missing file re-synths), per-cue failure isolation, transition hook integration, manifest schema correctness.

- `tests/unit/ipc/callerBridge.test.ts` — Added 3 tests for `caller:pregen`: full call + args check, no active show returns skipped_no_tts, null voiceId when no voice profile.

## Tests run

```
Test Files  165 passed (165)
     Tests  2101 passed (2101)
  Duration  13.46s
```

New tests: 75 total (13 preGenerate + 3 callerBridge, plus existing 59 that stayed green).

## Decisions made

- **TtsInterface in cuelist-core**: dependency injection interface defined in `preGenerate.ts` so callers can supply any TTS-compatible object. `ElevenLabsClient` satisfies it structurally — no explicit declaration needed.
- **Manifest atomic write**: uses pid + randomUUID tmp file suffix → rename, matching voiceProfile.ts pattern. Not fsync'd (manifest loss on crash is recoverable; re-gen is cheap).
- **IPC CALLER_PREGEN takes no args**: always operates on the active cuelist from `doc.getMap('meta').get('active_cuelist_id')`. Per-cue regeneration deferred to B007-006 or later.
- **package.json export added**: `./caller/preGenerate.js` export is a necessary supporting change to enable cross-package import from callerBridge.ts. Judges scope as clean: no logic outside target_files changed.
- **Transition hook catch**: `preGenerateCallerAudio` already handles per-cue errors internally. The outer `.catch` in `transitions.ts` is for unexpected top-level throws (e.g., media dir creation fails).

## Notes for Critic

- The `showxPackage.ts` target file was not modified — the media dir is already created inside `saveShowxPackage` (line 133: `fs.mkdir(path.join(pkgPath, 'media'), { recursive: true })`). `preGenerateCallerAudio` also ensures the dir exists via its own `fs.mkdir` call.
- `ElevenLabsClient` satisfies `TtsInterface` structurally (both have `isEnabled()` and `synthesize()`). No explicit `implements` needed.
- The IPC `caller:pregen` handler does not require `cuelistId` as a parameter — it reads `active_cuelist_id` from the doc's meta map. This keeps the PWA API simple.
- ElevenLabs ToS/cost note is already at `docs/dev/elevenlabs_tos_cost_note.md` (written by B007-004). Surface to Jindřich at F4 gate.
- `pnpm -r typecheck` clean (all 5 workspaces). All 2101 tests pass.
