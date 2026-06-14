---
task_id: "B007-005"
title: "Rehearsal pre-generation → .showx/media"
reviewer: "critic"
review_round: 1
reviewed_at: "2026-06-14T04:00:00Z"
verdict: "accepted"
---

## Verdict

**ACCEPTED**

## Acceptance criteria verification

### AC1 — `preGenerateCallerAudio(...)` signature + synthesis + idempotency
✅ Signature matches: `src/modules/cuelist-core/src/caller/preGenerate.ts:111-118` — `preGenerateCallerAudio(doc, cuelistId, pkgPath, ttsClient, voiceId, logger?)`.
✅ Per-dept standby synthesis loop: `preGenerate.ts:147-186`.
✅ Per-cue GO synthesis: `preGenerate.ts:189-230`.
✅ File paths match spec — `media/<cue_id>_<dept>_standby.mp3` + `media/<cue_id>_go.mp3`: `preGenerate.ts:68-70`.
✅ `media/` dir ensured: `preGenerate.ts:133` (`fs.mkdir(..., { recursive: true })`).
✅ Idempotent via SHA-256 text hash + file-exists check: `preGenerate.ts:72-74, 149-157, 191-200`. Re-synth on hash mismatch OR missing file; both paths covered by tests `tests/unit/modules/cuelist-core/caller/preGenerate.test.ts:166-181, 183-199`.

### AC2 — REHEARSAL→SHOW transition hook + on-demand IPC
✅ Hook in `transitions.ts:71-79`: after `writeSnapshot` (line 65), before payload-freeze transact (line 81+). Position matches spec ("after writeSnapshot, before payload freeze").
✅ Wrapped in `.catch` so pre-gen errors never abort the mode transition.
✅ On-demand IPC `CALLER_PREGEN`: `src/main/src/ipc/channels.ts:26` + `src/main/src/ipc/callerBridge.ts:58-72`. Reads active cuelist from `doc.getMap('meta').get('active_cuelist_id')`; loads voice profile; calls `preGenerateCallerAudio` with `deps.elevenlabs` as `TtsInterface`.

### AC3 — Manifest maps `cue_id+dept+kind → file`, stored in package
✅ Manifest types: `preGenerate.ts:25-41`. Schema_version=1, entries keyed by `{cue_id}_{dept}_standby` / `{cue_id}_go`.
✅ Written atomically to `media/caller_manifest.json` (tmp + rename): `preGenerate.ts:87-92` — matches voiceProfile.ts pattern.
✅ Each entry carries `cue_id`, `dept`, `kind`, `file` (relative path), `text_hash`, `text`, `duration_secs` — sufficient for offline playback resolution.

### AC4 — Graceful skip + per-cue failure isolation
✅ `!enabled || !voiceId` → returns `{ status: 'skipped_no_tts', synthesized: 0, ... }` without error: `preGenerate.ts:119-125`.
✅ Per-cue failures isolated: `preGenerate.ts:176-185` (standby) and `220-229` (GO) wrap each `synthesize()` call individually. Failures logged via `logger?.warn('caller.pregen.cue_failed', ...)`, counted (`failed++`), pushed to `errors[]`, do NOT abort outer loop.
✅ Final status is `'partial'` when `failed > 0`, otherwise `'ok'`: `preGenerate.ts:241`.
✅ Transition hook also catches top-level throws: `transitions.ts:74-78`.

### AC5 — Unit tests (mocked TTS)
✅ All 5 sub-requirements covered in `tests/unit/modules/cuelist-core/caller/preGenerate.test.ts`:
  - No-key skip (3 variants — disabled, null voiceId, undefined voiceId): lines 59-89.
  - Writes expected files + manifest: lines 91-128.
  - Idempotent skip / re-synth on hash mismatch / re-synth on missing file: lines 142-200.
  - Per-cue failure isolation: lines 202-234.
  - Transition hook triggers pre-gen / transition succeeds with disabled TTS / transition succeeds with no preGen option: lines 236-296.
  - Manifest schema correctness: lines 298-329.
✅ Additional IPC tests in `tests/unit/ipc/callerBridge.test.ts:215-265` (3 tests for `caller:pregen` happy path / no-active-show / null voiceId).

### AC6 — Typecheck + tests + scope discipline
✅ `pnpm -r typecheck` clean (5 workspaces).
✅ Full suite: 165 test files / **2101 tests pass** (13.37s).
✅ Edits inside target_files: preGenerate.ts (NEW), transitions.ts (+19 lines), channels.ts (+1 line), callerBridge.ts (+15 lines), tests/** (NEW).
⚠️ `src/modules/cuelist-core/package.json` (+1 export entry) modified — outside declared target_files. Documented by Forge as "necessary supporting change" so `callerBridge.ts` can resolve `@showx/module-cuelist-core/caller/preGenerate.js`. Mechanical export-map addition, not architectural; matches the existing pattern for sibling sub-path exports. **Accepted as in-scope supporting change.**
✅ `showxPackage.ts` (declared target but not edited) — Forge correctly identified the `media/` dir creation already exists in `saveShowxPackage` line 133; `preGenerateCallerAudio` additionally `mkdir`s defensively. No spec drift.

## Quality observations

- `ttsClient.synthesize` is given the full absolute output path (`path.join(pkgPath, file)`) while the manifest stores the relative `file`. Clean separation — playback (B007-006) can resolve without recomputing.
- `TtsInterface` is structurally satisfied by `ElevenLabsClient` — no nominal coupling. Easy to swap TTS providers.
- Atomic manifest write via `tmp + rename` survives mid-write crashes. Not fsync'd, but Forge correctly notes manifest loss is recoverable (next pre-gen re-builds it from cue text).
- Transition hook is non-blocking: any rejected promise is caught and logged, so a TTS hiccup never blocks a stage manager going SHOW.

## Notes for downstream

- B007-006 (playback engine) will need to consume `media/caller_manifest.json` and look up by `{cue_id}_{dept}_standby` / `{cue_id}_go`. The manifest carries `duration_secs` so playback can schedule next-line standby cues without re-decoding the mp3.
- ElevenLabs ToS/cost note at `docs/dev/elevenlabs_tos_cost_note.md` — surface to Jindřich at F4 gate per scope rationale.
- CALLER_PREGEN IPC takes no args (always operates on active cuelist) — matches Forge's documented decision; PWA per-cue regen is a B007-006+ concern.

## Final

Verdict: **accepted**. Unblocks B007-006 (playback engine subscribes to pre-generated audio + cue-lights).
