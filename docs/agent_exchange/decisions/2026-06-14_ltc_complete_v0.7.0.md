# LTC (ShowX-8) COMPLETE — v0.7.0

**Date:** 2026-06-14 ~14:42 CEST
**Status:** 5/5 accepted. Headless gate fully passed. Only live-signal lock pending Jindřich/Kobbi hardware.

## Tasks — 5/5 accepted
001 native deps (audify + libltc-wrapper) + asarUnpack + audio device enum · 002 LTC generate (out) · 003 LTC decode (in/chase) · 004 source UI + clock switching (internal/mtc/ltc) · 005 gate. Clean (001-003 r1, 004 r2).

## Headless gate — PASSED (more verifiable than F4 audio)
- typecheck clean · pnpm test **2240/2240** (+107 LTC)
- require('audify') + require('libltc-wrapper') load (LTCEncoder/LTCDecoder present)
- synthetic LTC encode→decode round-trip in suite (no hardware needed)
- v0.7.0-arm64 DMG builds; native .node binaries in app.asar.unpacked (asarUnpack works)
- **packageJsonIntegrity guard held** — B008-001 added native deps WITHOUT clobbering root pkg (the guard added after F4's 2nd clobber did its job). package.json intact.

## Build-env note
electron-builder rebuilds audify + libltc-wrapper for the Electron ABI from source → requires **CMake** (`brew install cmake`, done on this machine). Documented: docs/dev/native-build-cmake.md.

## Pending (Jindřich/Kobbi — hardware)
- Real external LTC source → ShowX chase locks.
- ShowX LTC out → external console/DAW chases ShowX.
- On a real audio interface. (Architect context has no audio hardware.)
- Full notarized signing of native .node → Apple cert (B006-002).

## Timecode story now complete (F2 + LTC)
Internal clock + MTC in/out (F2) + LTC in/out (this bundle) = full timecode: internal master, MTC chase/gen, LTC chase/gen, all off one master clock, big display on all views, timecode triggers, countdown view, show-time OSC.

## Cumulative (F1→F4 + LTC)
44/45 impl tasks accepted across 5 bundles + F4 design, autonomous. Tests 1509 → **2240** (+731). Versions 0.2.1 → 0.7.0.

## Next (Jindřich)
F5 (EventX Bridge — needs B002 spec revision) / F6 (rundown, pricing, web) / or test the accumulated v0.7.0 (F1-F4 + LTC) first. Runners idle.
