---
id: "B008-002"
title: "LTC generate (out) — master clock → SMPTE audio"
status: "done"
owner: "forge"
started_at: "2026-06-14T13:00:00Z"
ended_at: "2026-06-14T13:20:00Z"
review_round: 1
---

## Summary

LTC output generator implemented. ShowX can now encode its internal master clock into a continuous SMPTE LTC PCM bitstream and stream it to any audify-enumerated output device. Default: disabled. Starts/stops with the clock; rate-change triggers a clean restart.

## Files changed

- `src/main/src/shared/output/ltcGenerator.ts` — `LtcGenerator` class + `defaultEncoderFactory` (libltc-wrapper) + `defaultOutputStreamFactory` (audify/RtAudio). Dependency-injected for testability.
- `src/main/src/ipc/ltcGeneratorBridge.ts` — IPC bridge: `ltc:gen:enable`, `ltc:gen:disable`, `ltc:gen:status`.
- `src/main/src/ipc/channels.ts` — added `LTC_GEN_ENABLE`, `LTC_GEN_DISABLE`, `LTC_GEN_STATUS` constants.
- `src/main/src/ipc/index.ts` — added `ltcGenerator?: LtcGenerator` to `IpcDeps`; conditionally registers the bridge when wired.
- `tests/unit/shared/output/ltcGenerator.test.ts` — 22 unit tests including native round-trip (skipped in CI if libltc-wrapper binary absent).

## Tests run

```
Tests  22 passed (22)
Test Files  170 passed (170)
Tests  2168 passed (2168)
```

Full suite: 2168 tests, 170 files — all green.  
`pnpm -r typecheck` — clean.  
`packageJsonIntegrity` guard — passing.

## Design decisions within task scope

- **Encoder abstraction**: `LtcEncoderFactory` / `LtcOutputStreamFactory` interfaces injected at construction — allows fully synchronous unit tests with no native deps.
- **u8→signed conversion**: audify `RTAUDIO_SINT8` expects signed-center-zero; libltc produces unsigned-center-128. XOR 0x80 maps correctly.
- **29.97 rate**: `setInterval` uses `30000/1001 ms` (not `1000/29.97`) to avoid floating-point drift accumulating over long runs.
- **Non-master source guard**: LTC out activates only when `state.running && state.source === 'internal'`. External MTC/LTC clock sources suppress output as required.
- **Round-trip tests**: skipped with `it.skipIf(!ltcLibForRoundTrip)` in CI/headless; will run locally where the native `.node` is built.

## Notes for Critic

- `defaultEncoderFactory` / `defaultOutputStreamFactory` use `createRequire` CJS interop (same pattern as B008-001 audify bridge) — required for native `.node` modules inside ESM.
- IPC registration is opt-in (`if (deps.ltcGenerator)`) — Shell must wire `LtcGenerator` instance into `IpcDeps` to activate. Not yet wired in `Shell.ts` (out of scope; UI task B008-004 is the wiring gate).
- No changes to `src/main/src/shared/Clock.ts` were needed — `MasterClockImpl` already exposes `onChange`, `getState`, `start`, `stop`, `setSource`, `setRate`, `locate` used by the tests.
