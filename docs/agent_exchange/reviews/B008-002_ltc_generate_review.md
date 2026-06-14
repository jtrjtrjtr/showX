---
id: "B008-002"
critic_started_at: "2026-06-14T13:25:00Z"
critic_completed_at: "2026-06-14T13:32:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **Master-clock-master gating + libltc encode + audify stream** →
  - Gating: `src/main/src/shared/output/ltcGenerator.ts:208-229` (`isMaster = state.running && state.source === 'internal'`).
  - libltc encoder: `defaultEncoderFactory()` lines 57-81 — `LTCEncoder(sampleRate, fps, LTC_USE_DATE)` → `setTimecode` + `encodeFrame` + `getBuffer` (matches v1.1.2 API).
  - audify stream: `defaultOutputStreamFactory()` lines 88-131 — `RtAudio` + `openStream` with `RTAUDIO_SINT8`, `framesPerBuffer = sampleRate/fps`.
  - Rate-correct interval: line 254-256 — 29.97 uses `30000/1001 ms` (no FP drift); other rates use `1000/fps`.

- [x] **Enable/disable + device selection, default OFF, starts/stops with clock** →
  - Default OFF: constructor `enabled = false` (line 144), test line 82-87.
  - `enable(deviceId)` line 167-181, `disable()` line 183-193.
  - Starts with clock: `_onClockChange` lines 213-216 (isMaster && !prevMaster → startInterval).
  - Stops with clock: lines 223-226 (!isMaster && prevMaster → stopInterval + closeStream).
  - Tests: `closes the stream when clock stops` (line 181), `stops ticking after clock stops` (line 192).

- [x] **Frame-rate + drop-frame encoded correctly (libltc bit-packing, we feed right TC + rate)** →
  - Rate fed to encoder constructor: line 235 (`this._encoderFactory.create(this.sampleRate, this.currentRate)`).
  - TC computed via `framesToTc(state.totalFrames, state.rate, state.dropFrame)` (line 283) — uses shared util respecting drop-frame.
  - Rate-change rebuilds session: lines 217-222.
  - Round-trip tests at 25/30/24 fps confirm bit-packing correct (lines 349-369); `drop_frame_format: false` asserted at 25fps line 354.

- [x] **Headless-verifiable (synthetic round-trip, no hardware)** →
  - 4 native round-trip tests in `tests/unit/shared/output/ltcGenerator.test.ts:319-383`, gated via `it.skipIf(!ltcLibForRoundTrip)` so CI without `.node` still green.
  - Locally the native binary loaded — round-trip tests ran and PASSED (25fps 01:02:03:04 ↔ , 30fps 00:00:00:00 ↔, 24fps 00:59:59:20 ↔, buffer-length sanity).

- [x] **No conflict with MTC/OSC, failures logged, never crashes clock** →
  - Independent emitter: separate `setInterval`, own encoder/stream; no touching of MTC/OSC paths.
  - `_tick` wraps encode+write in try/catch line 285-290; logs error and continues.
  - Test `logs error and keeps running when encoder.encodeFrame throws` line 247-268 confirms one tick failure doesn't disable the generator.

- [x] **Unit tests: encode/decode round-trip; rate; start/stop; disabled = no output** →
  - 22 stubbed-factory tests + 4 native round-trip tests; all pass (verbose run).
  - "does NOT tick while clock is stopped" line 160 + "does NOT tick when clock source is external" line 169 confirm disabled-equivalent paths.

- [x] **typecheck clean, tests pass (incl. packageJsonIntegrity), no edits outside target_files** →
  - `pnpm -r typecheck` clean.
  - Full suite: **2168/2168 passing in 170 files**; `packageJsonIntegrity` green.
  - Diff vs HEAD: only `src/main/src/shared/output/ltcGenerator.ts` (new), `src/main/src/ipc/ltcGeneratorBridge.ts` (new), `src/main/src/ipc/channels.ts` (added 3 IPC constants), `src/main/src/ipc/index.ts` (LtcGenerator dep + conditional registration), `tests/unit/shared/output/ltcGenerator.test.ts` (new), `tests/unit/Shell.test.ts` (added `ltc:gen:` to OPTIONAL_PREFIXES — required by conditional registration). All within `target_files` (`src/main/src/ipc/**`, `tests/unit/**`, `src/main/src/shared/output/ltcGenerator.ts`).
  - `Clock.ts` correctly not modified — `MasterClock` interface already exposes everything needed; forge documented this.

## Code review notes

**Strengths**
- **Dependency injection**: `LtcEncoderFactory` / `LtcOutputStreamFactory` cleanly separates native deps from logic — every unit test bar 4 runs purely in-process with no native binary required. This is the right shape; matches `audioDevicesBridge` pattern from B008-001.
- **Real-rate guard for 29.97**: `30000/1001 ms` instead of `1000/29.97` avoids cumulative FP drift over long shows. Documented inline. Good catch.
- **u8 → s8 conversion**: `s8[i] = (buf[i] ^ 0x80) & 0xff;` at line 113-114 is the correct mapping for `RTAUDIO_SINT8` (libltc emits unsigned center=128, audify expects signed center=0). Polarity verified by hand: 0→−128, 128→0, 255→127.
- **Rate-change handling**: `setRate` re-anchors encoder + stream, doesn't just patch interval. This avoids splice glitches in the PCM bitstream.
- **Optional wiring**: `IpcDeps.ltcGenerator` optional + conditional `registerLtcGeneratorBridge` mirrors `caller`/`llmDraft` pattern — preserves existing Shell tests, doesn't force Shell wiring this task. Out-of-scope handoff documented for B008-004 UI wiring.

**Minor observations (non-blocking)**
- No explicit 29.97 **drop-frame** round-trip test. The 25fps NDF test does assert `drop_frame_format: false`. Given libltc handles bit-packing internally and the implementation correctly forwards rate + dropFrame via `framesToTc`, this is acceptable per AC ("libltc handles the bit packing; we feed it the right TC + rate"). Mention only — would be a useful addition in a later cleanup task.
- `LTC_USE_DATE = 1` flag passed unconditionally to the encoder. The done report notes this as "BGF bits; standard for clocks". Acceptable design choice within task scope.

## Verdict rationale

All 7 acceptance criteria met with file:line citations. Round-trip tests run **and pass** locally against real libltc-wrapper (binary present); CI fallback via `it.skipIf` preserved. Full 2168-test suite green, typecheck clean, packageJsonIntegrity guard holds. Diff stays inside declared `target_files`. Code quality is high: clean abstractions, deterministic teardown, proper error containment, no clock interference. Forge correctly identified that `Clock.ts` needed no changes and documented the reasoning.

**Verdict: accepted.**
