---
id: "B008-001"
title: "Native deps (audify + libltc-wrapper) + asarUnpack + audio device enumeration"
type: "implementation"
estimated_size_lines: 380
priority: "P0"
bundle: "ShowX-8"
depends_on: []
target_files:
  - "package.json"
  - "electron-builder.yml"
  - "src/main/src/shared/audio/audioDevices.ts"
  - "src/main/src/ipc/**"
  - "tests/unit/**"
acceptance_criteria:
  - "Add native deps `audify` (RtAudio/CoreAudio PCM I/O) + `libltc-wrapper` (bitfocus libltc binding), pinned versions. ONLY add to dependencies — DO NOT rewrite/minimize the root package.json (preserve scripts/devDeps — see packageJsonIntegrity.test.ts; that guard must stay green)."
  - "electron-builder.yml: asarUnpack the native `.node` binaries (audify, libltc-wrapper) so they load in the packed app. Keep extraMetadata.main + files mapping from F3 intact."
  - "audioDevices.ts: enumerate CoreAudio input + output devices via audify (id, name, in/out, default). IPC for the PWA to list devices (LTC-in + LTC-out + intercom reuse)."
  - "Module-load smoke: a test (or a documented node check) that require('audify') + require('libltc-wrapper') succeed (native binding loads) — Architect runs this headless at gate."
  - "Graceful when audio subsystem unavailable (CI/headless): enumeration returns [] + a clear 'audio unavailable' status, no crash."
  - "Unit tests: device enumeration shape (mock audify); graceful empty on failure; IPC contract. packageJsonIntegrity guard still passes."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision 2026-06-14_ltc_architecture §2/§3. Foundation for LTC: the native audio stack + device list. Both LTC out (B008-002) and in (B008-003) build on this. CRITICAL: do not clobber root package.json (recurring Forge mistake — guard test exists).

## Implementation notes

- Pin audify + libltc-wrapper exact versions. electron-builder already rebuilds native deps (@julusian/midi, keytar) — these join them.
- asarUnpack glob covers the new .node files.
- Device enumeration via audify; expose to PWA via IPC (shared with F4 intercom select where possible).

## Test plan

- Mock audify → device list shape; failure → []; require() smoke (headless, at gate).

## Out of scope

- LTC encode/decode (002/003). UI (004).
