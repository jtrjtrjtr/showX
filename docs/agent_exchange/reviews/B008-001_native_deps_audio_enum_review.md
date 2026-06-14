---
id: "B008-001"
title: "Native deps (audify + libltc-wrapper) + asarUnpack + audio device enumeration"
verdict: "accepted"
round: 1
critic_reviewed_at: "2026-06-14T12:45:00Z"
---

## Verdict: accepted

Foundation task for ShowX-8 LTC is clean. All acceptance criteria met, surgical package.json edit (guard green), typecheck clean across all 5 workspaces, full suite 2146/2146 green (+9 new in `audioDevices.test.ts`).

## Acceptance criteria check

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 1 | Pin `audify` + `libltc-wrapper` to `dependencies`, no rewrite of root package.json | `package.json:68-69` — surgical 2-line add to `dependencies`. `packageJsonIntegrity.test.ts` passes (workspace name, dev main, scripts, devDeps count, workspaces all intact). | ✅ |
| 2 | `electron-builder.yml`: asarUnpack covers native `.node` binaries; F3 mapping intact | `electron-builder.yml:18-19` — existing `asarUnpack: "**/*.node"` wildcard glob already covers `node_modules/audify/build/Release/audify.node` + libltc-wrapper. F3 `files` + `extraMetadata.main` mapping untouched. Forge correctly identified no edit needed. | ✅ |
| 3 | `audioDevices.ts`: enumerate input + output via audify with IPC | `audioDevices.ts:52-86` — `enumerateAudioDevices()` iterates `RtAudio.getDeviceCount()` and emits `{id, name, in/out channels, defaults, sampleRate}`. IPC channel `audio:devices:list` registered at `index.ts:99` via `registerAudioDevicesBridge` (`audioDevicesBridge.ts:11-18`). | ✅ |
| 4 | Module-load smoke (architect-run at gate) | `audioDevices.ts:43-50` — `defaultAudifyFactory()` wraps `require('audify')` in try/catch and returns `null` on failure. Architect runs `require()` smoke against built node binaries at B008-005. Forge note acknowledged. | ✅ (deferred to gate per spec) |
| 5 | Graceful when audio unavailable (CI/headless) | `audioDevices.ts:59-62` returns `{status: 'unavailable', devices: []}` on null factory; `audioDevices.ts:82-85` same on `createRtAudio()` / `getDeviceCount()` throw. Two tests confirm (`audioDevices.test.ts:56-72`). | ✅ |
| 6 | Unit tests: shape, graceful empty, IPC contract; integrity guard intact | `audioDevices.test.ts` 9 tests covering happy path, null factory, throws on `createRtAudio`, throws on `getDeviceCount`, full shape, empty list, warn log, IPC channel name, IPC bridge registration + invocation. `packageJsonIntegrity.test.ts` 4 tests still pass. | ✅ |
| 7 | `pnpm -r typecheck` clean, tests pass, no edits outside `target_files` | Critic ran `pnpm -r typecheck` (5 workspaces, all Done) + `pnpm vitest run` (169 files, 2146 tests passed, 0 failed). Diff stat: only `package.json`, `src/main/src/ipc/{channels,index,audioDevicesBridge}.ts`, `src/main/src/shared/audio/audioDevices.ts`, `tests/unit/audioDevices.test.ts` — all within `target_files`. | ✅ |

## Code-quality notes

- DI pattern (`AudifyFactory` injectable, falls through to `defaultAudifyFactory()`) mirrors `midiIn.ts` and `mtcDecoder.ts` — consistent with project conventions.
- `RtAudioLike` / `RtAudioDeviceInfo` shapes are minimal type surface; uses optional fields with sensible defaults (44.1 kHz fallback, sequential `id`). Robust to audify's API surface drift.
- `createRequire(import.meta.url)` correctly handles ESM `require('audify')` for the native dep.
- `audioDevicesBridge.ts` registers the handler without conditional gating — sensible because `defaultAudifyFactory()` self-guards.
- Forge's interpretation that B008-001 only adds `libltc-wrapper` to `dependencies` (no wrapper code yet) matches the spec's "Out of scope" — encode/decode lands in B008-002/003.

## Tests independently re-run

```
pnpm vitest run tests/unit/audioDevices.test.ts tests/unit/packageJsonIntegrity.test.ts
→ 13 passed (4 + 9)

pnpm -r typecheck
→ 5 workspaces clean

pnpm vitest run
→ 169 files, 2146 tests passed, 0 failed (30.01s)
```

## What Architect should still verify at B008-005 gate

- `require('audify')` succeeds inside packed `.app` (CoreAudio binding loads) — note Forge cannot test natively here without `pnpm install` pulling the binary.
- `require('libltc-wrapper')` likewise — currently added to `dependencies` for the electron-builder rebuild step; the actual wrapper usage arrives in 002/003.
- Inside packed app, `**/*.node` asarUnpack glob produces an unpacked `audify.node` + `libltc-wrapper.node` (DMG quick check).

## Decision

Verdict: **accepted**. B008-002 (LTC generate) + B008-003 (LTC decode) can claim their slot once Architect opens scope.
