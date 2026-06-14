---
id: "B008-003"
title: "LTC decode (in / chase) — SMPTE audio → master clock"
status: "done"
owner: "forge"
started_at: "2026-06-14T13:35:00Z"
ended_at: "2026-06-14T13:55:00Z"
review_round: 1
---

## Summary

LTC decode / chase implemented. ShowX can now receive a SMPTE LTC audio signal from any audify-enumerated input device, decode it via libltc-wrapper, and lock the master clock to the incoming timecode. Default: disabled. Lock requires 2 consecutive frames (gate protects against spurious audio). Lock loss after timeout holds the last position and restores `source='internal'`.

## Files changed

- `src/main/src/shared/input/ltcDecoder.ts` — new. Three-layer architecture:
  - `LtcFrameDecoder` — pure PCM → timecode event emitter (wraps `LTCDecoder` from libltc-wrapper). Injection-testable, no audio I/O dependency.
  - `LtcChaser` — drives `MasterClock` to chase LTC frames. Mirror of `MtcChaser` (B005-005): 2-frame lock gate, timeout-based lock-loss, DF detection from `drop_frame_format` bit.
  - `LtcReceiver` — top-level coordinator wiring audify input stream to `LtcFrameDecoder` + `LtcChaser`. `enable(deviceId)` / `disable()` lifecycle.
- `src/main/src/ipc/channels.ts` — added `LTC_DEC_ENABLE`, `LTC_DEC_DISABLE`, `LTC_DEC_STATUS` constants.
- `src/main/src/ipc/ltcDecoderBridge.ts` — new IPC bridge: `ltc:dec:enable`, `ltc:dec:disable`, `ltc:dec:status`. Registration is opt-in (`if (deps.ltcReceiver)`).
- `src/main/src/ipc/index.ts` — added `ltcReceiver?: LtcReceiver` to `IpcDeps`; imports + registers the bridge.
- `tests/unit/Shell.test.ts` — added `'ltc:dec:'` to `OPTIONAL_PREFIXES` (channels are optional, like `ltc:gen:`).
- `tests/unit/shared/input/ltcDecoder.test.ts` — new. 43 unit tests.

## Tests run

```
Tests  43 passed (43)  [ltcDecoder.test.ts alone]

Test Files  171 passed (171)
Tests  2211 passed (2211)
```

Full suite: 2211 tests, 171 files — all green.  
`pnpm -r typecheck` — clean.  
`packageJsonIntegrity` guard — passing (no package.json edits).

## Design decisions within task scope

- **Three-layer architecture (mirror MTC)**: `LtcFrameDecoder` ↔ `MtcDecoder`, `LtcChaser` ↔ `MtcChaser`, `LtcReceiver` ↔ `MtcReceiver`. Same lock/timeout pattern, same `setSource('ltc')` + `locate()` per frame.
- **Lock gate = 2 frames**: Prevents false-lock on spurious audio. Frame 1 starts gate timer; frame 2 achieves lock. Gate timer resets `gateCount` to 0 on timeout so only consecutive frames count.
- **DF detection from stream**: `drop_frame_format` bit in each decoded frame drives `clock.setRate(fps, df)`. Nominal fps is fixed at `LtcReceiver` construction (default 25); DF is live-detected.
- **29.97 DF handling**: `fps === 29.97` → pass `30` as the integer fps to `LTCDecoder(sampleRate, 30, 'u8')`. libltc decode uses 30fps as the sample-count reference; `drop_frame_format` in the frame identifies it as DF.
- **audify SINT8 → libltc u8 conversion**: audify delivers SINT8 (signed, center=0); libltc `'u8'` expects unsigned (center=128). XOR 0x80 in the input callback — same inverse operation as the output side in `LtcGenerator`.
- **No-hardware verification**: All 43 tests use stub factories (pre-defined frame sequences) or skip on native binary absence (round-trip tests). Real hardware validation deferred to Jindřich/Kobbi gate per AC.
- **Non-conflicting with LTC out**: when source becomes `'ltc'`, `LtcGenerator._onClockChange()` sees `source !== 'internal'` → suppresses output. The two cannot fight.
- **IPC opt-in pattern**: `ltcReceiver` not wired in `Shell.ts` yet (out of scope; UI is B008-004). Shell must construct `LtcReceiver` and pass it to `IpcDeps`.

## Notes for Critic

- `defaultDecoderFactory` uses `createRequire` CJS interop (same pattern as B008-001 and B008-002) for the native `.node` libltc-wrapper module.
- Round-trip tests in `ltcDecoder.test.ts` use the same `it.skipIf(!ltcLib)` guard as in `ltcGenerator.test.ts` — they verify the full encode→decode path when the native binary is present.
- `LtcReceiver` is NOT wired in `Shell.ts` — that is intentionally left for B008-004 (LTC source UI + clock switching), per the task spec's out-of-scope note.
- `tests/unit/Shell.test.ts` needed `'ltc:dec:'` added to `OPTIONAL_PREFIXES` (parallel to `'ltc:gen:'` added for B008-002). This is within `tests/unit/**` target.
- No changes to `Clock.ts` were needed — `ClockSource` already includes `'ltc'` (per shared types), and `MasterClockImpl` already exposes all methods used by the chaser.
