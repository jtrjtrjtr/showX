# Native build requirement — CMake (for LTC audio deps)

The LTC bundle (ShowX-8) adds two native deps that electron-builder rebuilds
for the Electron ABI from source:

- `audify` (RtAudio/CoreAudio PCM I/O) — built via cmake-js
- `libltc-wrapper` (x42 libltc SMPTE binding) — native binding

Their prebuilt binaries don't match the Electron ABI, so `pnpm dist` runs a
source rebuild that **requires CMake** on the build machine.

## One-time setup on a build machine
```
brew install cmake
```
Without it, `pnpm dist` fails with: `CMake executable is not found`.

(`@julusian/midi` + `keytar` from earlier bundles use prebuilt binaries and
do not need cmake; only the LTC audio deps do.)

## Verified 2026-06-14
- After `brew install cmake`, `pnpm dist` rebuilds audify + libltc-wrapper for
  darwin arm64 and produces ShowX-0.7.0-arm64.dmg.
- Native `.node` binaries land in `app.asar.unpacked/node_modules/{audify,libltc-wrapper}/...`
  via the electron-builder.yml `asarUnpack` glob — they load in the packed app.
- Full notarized signing of these `.node` binaries still needs the Apple
  Developer ID cert (B006-002).
