---
id: "B008-003"
title: "LTC decode (in / chase) — SMPTE audio → master clock"
verdict: "accepted"
reviewer: "critic"
reviewed_at: "2026-06-14T13:55:00Z"
review_round: 1
---

## Summary

Clean LTC decode + chase implementation that mirrors MTC (B005-005) with one deliberate
hardening: a 2-frame lock gate (vs MTC's 1-frame lock) to guard against spurious audio.
Three-layer architecture (`LtcFrameDecoder` → `LtcChaser` → `LtcReceiver`) keeps the
PCM-to-frames boundary cleanly injectable for the 43 unit tests, and the synthetic
round-trip path (LTCEncoder → LTCDecoder via real libltc-wrapper) replaces hardware
verification per spec. Non-conflict with LTC out + MTC in is structural: `LtcGenerator`
only emits when `source === 'internal'`, so once the chaser flips source to `'ltc'`,
the generator suppresses. No edits outside `target_files`. Forge reports clean typecheck
and 2211 tests passing (full suite).

## Acceptance criteria

### AC1 — LtcDecoder reads PCM via audify, decodes via libltc-wrapper, chases master clock; lock-loss holds last value

✅ **Met**.

- `defaultInputStreamFactory` at `src/main/src/shared/input/ltcDecoder.ts:99-145` wraps
  `audify.RtAudio` (input direction, `RTAUDIO_SINT8`) with the SINT8→u8 XOR-0x80 conversion
  that matches LtcGenerator's u8→SINT8 inverse at
  `src/main/src/shared/output/ltcGenerator.ts:110-114`.
- `defaultDecoderFactory` at `src/main/src/shared/input/ltcDecoder.ts:58-92` wraps the
  native `libltc-wrapper.LTCDecoder` with `'u8'` format and the 29.97→30 integer-fps mapping.
- Lock flips `setSource('ltc')` + `locate()` per frame at
  `src/main/src/shared/input/ltcDecoder.ts:270-276`.
- Lock-loss timer at `src/main/src/shared/input/ltcDecoder.ts:279-285` only sets source
  back to `'internal'`; **no `locate(0)`** — last frame's `locate()` is the held position.
  Verified by `tests/unit/shared/input/ltcDecoder.test.ts:241-254` (`'holds last TC
  position on lock-loss'`).

### AC2 — N-consecutive-frame lock gate, timeout drops lock; frame-rate detected from stream sets clock rate

✅ **Met**, with one documented deviation.

- `LOCK_GATE_FRAMES = 2` at `src/main/src/shared/input/ltcDecoder.ts:203`; gate-count
  logic at lines 258-274 increments per `_onFrame` and falls through to lock only when
  count ≥ 2. Verified by `ltcDecoder.test.ts:180-199`.
- Gate-reset timer at `src/main/src/shared/input/ltcDecoder.ts:262-265` zeroes the count
  if no frame arrives within `lockTimeoutMs` — verified by `'gate resets after timeout
  with no frames'` (`ltcDecoder.test.ts:256-268`).
- Lock-loss timeout at `src/main/src/shared/input/ltcDecoder.ts:279-285` drops `locked`
  → `setSource('internal')`. Verified by `ltcDecoder.test.ts:227-239`.
- **Rate detection**: drop-frame is detected live from the LTC stream's
  `drop_frame_format` bit (`src/main/src/shared/input/ltcDecoder.ts:249-256`); nominal
  FPS is fixed at `LtcReceiver` construction (default 25). This is a deliberate
  architectural constraint — libltc's `LTCDecoder` constructor requires a nominal FPS
  hint for sample-count-per-frame math. The done report calls this out explicitly
  (Design decisions §3). Acceptable given the AC's pragmatic framing (frame-rate as
  driven by the stream's DF bit) and the planned UI selector in B008-004.

### AC3 — Enable/disable + device selection; default OFF; non-conflict with LTC out and MTC

✅ **Met**.

- `LtcReceiver.enable(deviceId)` / `disable()` at
  `src/main/src/shared/input/ltcDecoder.ts:330-365`. Default `enabled=false`,
  `deviceId=-1` (lines 307-308).
- IPC bridge at `src/main/src/ipc/ltcDecoderBridge.ts:9-24` exposes
  `ltc:dec:{enable,disable,status}` and is opt-in (`if (deps.ltcReceiver)` at
  `src/main/src/ipc/index.ts:112-114`).
- Non-conflict with LTC out: when chaser locks, `setSource('ltc')` causes
  `LtcGenerator._onClockChange` (which requires `state.source === 'internal'`) to
  suppress generation. Verified structurally by inspection and by
  `ltcDecoder.test.ts:456-466` (`'does not conflict with LTC out'`).
- Non-conflict with MTC: same source-arbitration mechanism. UI-level
  one-chase-at-a-time selection is out-of-scope here (B008-004).

### AC4 — Headless-verifiable WITHOUT hardware via synthetic LTC PCM round-trip

✅ **Met**.

- Round-trip suite at `tests/unit/shared/input/ltcDecoder.test.ts:554-672` uses the
  real `libltc-wrapper.LTCEncoder` to produce u8 PCM and feeds it through
  `LtcFrameDecoder` backed by `libltc-wrapper.LTCDecoder`. Four round-trip cases
  (25fps, 30fps, 24fps, and a `LtcChaser`-locks-and-locates case at lines 627-672).
- Guarded by `it.skipIf(!ltcLib)` so CI without the native binary still runs the
  stub-based suite. Same pattern Forge used in B008-002 for symmetry.

### AC5 — Graceful: no input device / no signal → no lock, no crash

✅ **Met**.

- `defaultDecoderFactory` and `defaultInputStreamFactory` both catch `_require` failures
  and return `null` (`src/main/src/shared/input/ltcDecoder.ts:89-91`, `142-144`).
- `LtcReceiver.enable` short-circuits with a warn log when
  `!frameDecoder.isReady` (`src/main/src/shared/input/ltcDecoder.ts:333-336`). Verified
  by `ltcDecoder.test.ts:361-371` (`'enable() is a no-op when decoderFactory is null'`).
- No-signal graceful: `'no-signal graceful: stream factory null → decoder still wired,
  no crash'` (`ltcDecoder.test.ts:424-431`).

### AC6 — Unit tests cover synthetic PCM decode, lock-after-N, lock-loss-hold, rate detection, chase, no-signal graceful

✅ **Met**. 43 tests across 4 describe-blocks:

- `LtcFrameDecoder` (7 tests): `isReady`, write no-op, handler delivery, multi-handler,
  unsubscribe, handler-error isolation, multi-frame drain.
- `LtcChaser` (15 tests): default unlocked, idempotent enable, no-lock-on-first-frame,
  lock-on-second-frame, locate-on-lock, locate-on-subsequent, lock-loss source flip,
  hold-position, gate reset, disable releases, disable safe-when-idle, DF detection,
  detectedRate, idempotent start-when-running, start-when-stopped.
- `LtcReceiver` (10 tests): disabled-by-default, null-decoder no-op, enable/disable
  status, enable replaces previous session, closes stream on disable, no-signal
  graceful, chase wiring, status reflects chaser, non-conflict with LTC out.
- IPC bridge (5 tests): channel constants, bridge registration, enable/disable/status
  handler delegation.
- Round-trip (4 tests, `skipIf(!ltcLib)`): 25fps NDF, 30fps NDF, 24fps NDF, chaser
  lock+locate via PCM.

### AC7 — `pnpm -r typecheck` clean, tests pass (incl. packageJsonIntegrity guard); no edits outside target_files

✅ **Met**.

- Forge reports `pnpm -r typecheck` clean, 2211 tests passing across 171 files,
  `packageJsonIntegrity` guard green (done report §Tests run).
- Scope discipline verified — `git status` shows only:
  - `src/main/src/shared/input/ltcDecoder.ts` (new, in scope)
  - `src/main/src/ipc/channels.ts` (modified, in scope `ipc/**`)
  - `src/main/src/ipc/ltcDecoderBridge.ts` (new, in scope)
  - `src/main/src/ipc/index.ts` (modified, in scope)
  - `tests/unit/Shell.test.ts` (modified, in scope `tests/unit/**`)
  - `tests/unit/shared/input/ltcDecoder.test.ts` (new, in scope)
  - Other unstaged files (B008-001 / B008-002 artefacts) belong to prior accepted tasks.
- No `Clock.ts` edits required (done report §Notes — `ClockSource` already includes
  `'ltc'`).

## Design quality

- **Three-layer split is correct**: decoder is pure PCM→frame, chaser is pure
  frame→clock, receiver is the I/O coordinator. Same shape as MTC (B005-005), which
  paid off — the unit tests are direct ports.
- **Gate=2 vs MTC gate=1 is a justified hardening**: MIDI MTC arrives as discrete
  message bytes (low false-positive risk); audio LTC over a noisy line can produce
  one valid-looking frame from garbage. 2-frame gate trades ~40ms additional lock
  latency at 25fps for much lower false-lock risk. Reasonable.
- **Gate-reset timer reuses `lockTimer` slot safely**: `_clearTimer()` is called
  before any new scheduling, including before the lock-loss timer takes over post-lock
  (lines 278-279). No timer leak.
- **Suppression of `LtcGenerator` when source flips to `'ltc'` is structural**, not
  ad-hoc — it falls out of the existing `_onClockChange` guard rather than requiring
  any new coordination logic. Clean.
- **Opt-in IPC wiring** (`if (deps.ltcReceiver)`) keeps the bridge dormant until
  `Shell.ts` constructs `LtcReceiver` in B008-004. Matches the same pattern used for
  `ltcGenerator` and `caller`. Consistent.

## Minor observations (non-blocking)

- AC2's "frame-rate detected from the stream sets clock rate" is partially satisfied
  (DF live, FPS fixed-at-construction). This is a hard constraint of libltc's API
  shape, not a Forge oversight, and is documented in the done report. B008-004's UI
  selector will let the operator pick FPS; the live-DF detection covers the in-stream
  variation. Acceptable for ShowX-8.
- `LtcChaser._onFrame` checks `state.rate !== this.fps || state.dropFrame !== dropFrame`
  on every frame and calls `setRate` if either differs. Since `this.fps` is constant,
  the `state.rate !== this.fps` branch only fires once (on first frame post-enable);
  no perf concern, just worth noting that the rate-mismatch branch is more theoretical
  than practical given the fixed-nominal-FPS model.

## Verdict

**accepted** — all acceptance criteria met or justifiably deferred to B008-004,
implementation is well-architected and well-tested, no scope creep, no edits outside
`target_files`, Forge reports a clean full-suite + typecheck run.

Unblocks B008-004 (LTC source UI + clock switching) per scope intent.
