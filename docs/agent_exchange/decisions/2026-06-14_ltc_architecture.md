# Decision — LTC (Linear Timecode) architecture

**Date:** 2026-06-14
**Author:** Architect (Opus)
**Status:** RATIFIED (Jindřich 2026-06-14: LTC completion; scope out+in jeden bundle; native deps OK; bez HW testu teď).
**Inputs:** F2 LTC/MTC research agent + F2 master-clock architecture (LTC = MTC's audio sibling on the same clock seams).
**Blocks:** LTC bundle (ShowX-8) specs.

---

## Keystone decisions

### 1. LTC plugs into the F2 master clock — same chase/generate seams as MTC
- **Generate (out):** master clock `totalFrames` (F2) → libltc encoder → PCM samples → audio output device (audify/CoreAudio). Mirror of MTC generate, over audio.
- **Decode (in/chase):** audio input device → PCM → libltc decoder → timecode → master clock `setSource('ltc')` + locate (chase). Mirror of MTC chase. The clock already reserves source `'ltc'` (F2 type) — was inert, now wired.
- Frame rates 24/25/29.97df/30 already in the clock model (F2). LTC carries the rate; feed it to the clock.

### 2. Native deps (Jindřich approved)
- `libltc-wrapper` (bitfocus N-API binding to x42 libltc; prebuilt macOS arm64; LTCDecoder + encoder; production-used by Companion; npm 1.1.2/2022 — pin it).
- `audify` (RtAudio → CoreAudio; full-duplex PCM I/O; maintained 2025).
- **asarUnpack** the native `.node` binaries (lesson feedback_electron_workspace_imports_packed). electron-builder rebuilds native deps (already does @julusian/midi + keytar).
- Full notarized signing of the native binaries needs Jindřich's Apple cert (F3 B006-002) — unsigned local builds load via asarUnpack now.

### 3. Audio device selection
- audify enumerates CoreAudio input + output devices. User picks LTC-in device (decode) + LTC-out device (generate). Persist per machine/show. Same pattern as F4 intercom device select (setSinkId there; audify here in main).

### 4. LTC decode is fiddly — unit-test against synthetic samples; live lock = Jindřich/Kobbi later
- Biphase-mark clock recovery is notoriously sensitive. libltc handles the hard part; we feed it PCM.
- No LTC hardware now → decode verified via SYNTHETIC LTC PCM (generate known TC → encode → decode → assert round-trip) in unit tests. Real-world lock against a console/DAW = Jindřich's GUI+audio session later.
- Lock state: N consistent frames → locked; timeout → lock lost, hold last value (mirror MTC chase from F2 B005-005).

### 5. What's headless-verifiable by Architect (more than F4 audio)
- Native modules LOAD in Node (require audify + libltc-wrapper, no crash).
- Audio device ENUMERATION (list devices — no display needed).
- LTC encode→decode ROUND-TRIP on synthetic PCM (no hardware).
- DMG builds with native asarUnpack.
- NOT verifiable headless: real audio signal in/out on hardware, actual device output sound. → Jindřich/Kobbi.

---

## LTC bundle task breakdown (ShowX-8)
B008-001 native deps + asarUnpack + audify audio-device enumeration (foundation) · B008-002 LTC generate (out) — libltc encode + clock + device · B008-003 LTC decode (in/chase) — audify in + libltc decode + clock chase + lock · B008-004 LTC source UI + clock source switching (internal/mtc/ltc) + indicator · B008-005 Architect E2E gate (headless: module load, device enum, synthetic round-trip, DMG; live signal → Jindřich).

## Note
This is a parallel/independent bundle (no hard dep on F5 EventX Bridge or F6). Completes the timecode story started in F2 (which shipped internal clock + MTC, deferred LTC).
