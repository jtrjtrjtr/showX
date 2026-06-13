---
id: "B006-002"
title: "Signed + notarized DMG pipeline"
type: "implementation"
estimated_size_lines: 220
priority: "P1"
bundle: "ShowX-6"
depends_on: ["B006-001"]
target_files:
  - "electron-builder.yml"
  - "scripts/build-release.sh"
  - "scripts/notarize-release.sh"
  - "scripts/verify-release.sh"
  - "build/entitlements.mac.plist"
  - "docs/dev/**"
acceptance_criteria:
  - "Wire the signing + notarization pipeline so that, WHEN an Apple Developer ID Application cert + notarytool keychain profile are present, `build-release.sh` → `notarize-release.sh` → `verify-release.sh` produce a signed+notarized+stapled DMG that passes `spctl --assess` + `stapler validate`."
  - "electron-builder.yml mac.identity is parameterized (env TEAM_ID / cert name), NOT the 'XXXXXXXXXX' placeholder. hardenedRuntime + entitlements correct for an Electron app using native modules (@julusian/midi, keytar) — include any needed entitlements (e.g. com.apple.security.cs.allow-jit / disable-library-validation as required by the native addons)."
  - "GRACEFUL when no cert: build-release.sh detects absence of signing identity and produces an unsigned arm64 DMG (current behavior) with a clear WARNING, rather than failing. Signing is opt-in via env."
  - "asarUnpack configured for native `.node` binaries (@julusian/midi, keytar) so they load in the notarized app (lesson feedback_electron_workspace_imports_packed)."
  - "Document in docs/dev/: exact steps Jindřich runs to provide the cert (keychain import + notarytool store-credentials profile name) + the env vars to set. This task does NOT require the real cert to be ACCEPTED (pipeline + unsigned path verifiable now); full signed run is verified when cert present."
  - "No edits outside target_files."
---

## Context

Per decision §1/§8. F3 ships the signed-DMG pipeline (prereq for external beta + for LTC's native addons later). Full signing needs Jindřich's Apple Developer ID cert in keychain — so wire the pipeline + make it graceful without the cert, document the cert handoff.

## Implementation notes

- notarize-release.sh + verify-release.sh already exist (seam map) — adapt, don't rewrite.
- asarUnpack glob for **/*.node.
- The CI/local must still build unsigned when cert absent.

## Test plan

- No cert: build-release.sh → unsigned DMG + warning.
- (When cert present, manual) signed → notarized → stapled → spctl pass.

## Out of scope

- Obtaining the cert (Jindřich). The DMG layout fix (B006-001).
---
ARCHITECT NOTE: B006-002 may remain in changes_requested/blocked pending Jindřich's Apple cert. Acceptable — the unsigned path + documented handoff is the deliverable; flag for Jindřich at gate.
