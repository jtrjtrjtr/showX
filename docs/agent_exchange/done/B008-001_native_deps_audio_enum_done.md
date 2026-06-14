---
id: "B008-001"
title: "Native deps (audify + libltc-wrapper) + asarUnpack + audio device enumeration"
status: "done"
round: 1
forge_ended_at: "2026-06-14T06:30:00Z"
---

## Summary

Foundation task for ShowX-8 LTC bundle. Added native audio deps, verified asarUnpack coverage, implemented CoreAudio device enumeration with IPC, and wired unit tests. All 2146 tests pass; `pnpm -r typecheck` clean.

## Files changed

| File | Change |
|---|---|
| `package.json` | Added `audify@1.1.2` + `libltc-wrapper@1.1.2` to `dependencies` (surgical add only — scripts/devDeps/workspaces untouched; packageJsonIntegrity guard green) |
| `electron-builder.yml` | **No change** — existing `asarUnpack: "**/*.node"` already covers all `.node` binaries including audify and libltc-wrapper. |
| `src/main/src/shared/audio/audioDevices.ts` | **New.** `enumerateAudioDevices(log?, factory?)` — enumerates CoreAudio input/output devices via audify using an injectable factory (same DI pattern as `midiIn.ts`). Gracefully returns `{ status: 'unavailable', devices: [] }` when factory is `null` (audify absent in CI/headless) or when `createRtAudio()` / `getDeviceCount()` throws. Exports `AudioDevice`, `AudioDeviceList`, `AudioStatus`, `AudifyFactory`, `RtAudioLike`, `RtAudioDeviceInfo` types. |
| `src/main/src/ipc/channels.ts` | Added `AUDIO_DEVICES_LIST: 'audio:devices:list'` |
| `src/main/src/ipc/audioDevicesBridge.ts` | **New.** `registerAudioDevicesBridge(deps, ipc)` — registers `audio:devices:list` IPC handler. Accepts optional `audifyFactory` for test injection. |
| `src/main/src/ipc/index.ts` | Import + call `registerAudioDevicesBridge` inside `registerIpcHandlers`. |
| `tests/unit/audioDevices.test.ts` | **New.** 8 tests: device list shape, unavailable on null factory, unavailable on throws, all fields typed correctly, empty list, warn log, IPC channel name, IPC bridge handler registration + invocation. |

## Decisions within task scope

- **No change to `electron-builder.yml`** — the existing wildcard `**/*.node` already handles audify/libltc-wrapper `.node` binaries. No per-package entry needed.
- **Factory injection pattern** (not `vi.mock`) — consistent with `midiIn.ts` / `mtcDecoder.ts`. Allows unit tests to inject a fake `RtAudio` without the native binary being present in CI.
- **`libltc-wrapper` not wrapped here** — B008-001 scope is device enumeration only. The actual libltc encode/decode wrapper comes in B008-002 (generate) and B008-003 (decode). The package is added to `dependencies` now so electron-builder rebuilds it natively alongside audify.

## Tests run

```
Test Files  169 passed (169)
Tests       2146 passed (2146)   (+8 new in audioDevices.test.ts)
Duration    13.73s
```

`pnpm -r typecheck` clean across all 5 workspaces.

## Module-load smoke note

`require('audify')` and `require('libltc-wrapper')` will be tested by Architect at the E2E gate (B008-005) once `pnpm install` pulls the native binaries. The `defaultAudifyFactory()` in `audioDevices.ts` wraps the require in try/catch and returns `null` on failure — so CI without native binary support returns `status: 'unavailable'` without crashing. Headless fallback verified by the `null factory` unit test path.

## Notes for Critic

- `package.json` change is surgical: only two new `dependencies` lines added. No scripts/devDeps/workspaces modified. `packageJsonIntegrity.test.ts` passes.
- `electron-builder.yml` intentionally unchanged — verify `asarUnpack: "**/*.node"` covers the new binaries (it does: glob matches `node_modules/audify/build/Release/audify.node` etc. inside the asar).
- `audioDevicesBridge.ts` passes `audifyFactory` from deps — Shell would set this to `undefined` (default real audify) in production. Tests pass an explicit factory stub.
- The `audifyFactory?: AudifyFactory | null` optional on `AudioDevicesBridgeDeps` means Shell doesn't need to supply it explicitly — `enumerateAudioDevices(log, undefined)` falls through to `defaultAudifyFactory()` which does the real `require('audify')`.
