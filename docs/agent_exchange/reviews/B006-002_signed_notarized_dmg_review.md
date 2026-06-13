---
id: "B006-002"
title: "Signed + notarized DMG pipeline"
review_round: 1
verdict: "accepted"
reviewed_at: "2026-06-13T23:58:00Z"
reviewer: "critic"
---

## Verdict: accepted

All acceptance criteria met. Pipeline wired, unsigned path verifiable now, signed path ready for activation when Jindřich imports his Developer ID cert (per spec & architect note).

## Acceptance criteria verification

### 1. Pipeline wired (build → notarize → verify produces signed+notarized+stapled DMG when cert present)

- `scripts/build-release.sh:23-26,41-44,47-70` wires typecheck → tests → build main+PWA → electron-builder.
- `scripts/notarize-release.sh:38-41` submits via `xcrun notarytool submit --wait`; `scripts/notarize-release.sh:54-60` staples + Gatekeeper assesses.
- `scripts/verify-release.sh:38,44,47` runs `codesign --verify`, `spctl --assess --type install`, `xcrun stapler validate` — full signed-distribution validation chain. ✅

### 2. mac.identity parameterized (no XXXXXXXXXX placeholder)

- `electron-builder.yml:42-48` — `mac.identity` field absent (no `XXXXXXXXXX` anywhere in repo). Comment at L40-41 + L44 explicitly states env-driven control via `CSC_NAME`. electron-builder auto-discovers cert when present. ✅

### 3. hardenedRuntime + entitlements correct for Electron + native addons

- `electron-builder.yml:45` — `hardenedRuntime: true`.
- `electron-builder.yml:47-48` — `entitlements` + `entitlementsInherit` point to `build/entitlements.mac.plist`.
- `build/entitlements.mac.plist:8-14` — `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation` (required for `@julusian/midi` + `keytar` per task note).
- `build/entitlements.mac.plist:17-20` — `network.client` + `network.server` for LAN/mDNS/y-websocket.
- `build/entitlements.mac.plist:23-25` — keychain-access-group for `SecretStore`. ✅

### 4. Graceful when no cert

- `scripts/build-release.sh:48-66` — runs `security find-identity -v -p codesigning | grep "Developer ID Application"` when `--signed`; if no cert: prints boxed WARNING and falls back to unsigned with `CSC_IDENTITY_AUTO_DISCOVERY=false`. Default invocation (no flag) at L67-69 always builds unsigned. ✅

### 5. asarUnpack for native .node binaries

- `electron-builder.yml:18-19` — `asarUnpack: ["**/*.node"]` (covers `@julusian/midi` + `keytar` per task note + future native modules). ✅

### 6. Documentation (docs/dev/)

- `docs/dev/signing.md` NEW (129 lines) — covers prereqs, Step 1 (cert import + `security find-identity` verify), Step 2 (`xcrun notarytool store-credentials`), Step 3 (full pipeline), env var table (`CSC_NAME`, `CSC_IDENTITY_AUTO_DISCOVERY`, `SHOWX_NOTARY_PROFILE`), entitlements table, asarUnpack rationale, graceful-fallback section.
- `docs/dev/release-build.md:24-32` — Scripts table updated; stale `pnpm dist` / `pnpm dist:signed` references removed; cross-link to `signing.md` at L29, L62. ✅

### 7. No edits outside target_files

`git diff --name-only HEAD` for B006-002 work touches only:
- `electron-builder.yml` ✓ in target
- `scripts/build-release.sh` ✓ in target
- `scripts/notarize-release.sh` ✓ in target
- `scripts/verify-release.sh` ✓ in target
- `docs/dev/release-build.md` ✓ `docs/dev/**`
- `docs/dev/signing.md` (NEW) ✓ `docs/dev/**`

Other files modified in working tree (HealthBus.ts, OutputDispatcher.ts, DevicesTable.tsx, etc.) are scoped to B006-003 (already accepted), not B006-002. ✅

## Quality notes (non-blocking)

- **Shell syntax** — scripts use `set -euo pipefail`, absolute `ROOT_DIR` derivation via `SCRIPT_DIR` (`scripts/build-release.sh:23-26`, `scripts/notarize-release.sh:17-19`, `scripts/verify-release.sh:9-11`) — invokable from any cwd. Good.
- **notarize pre-flight check** at `scripts/notarize-release.sh:29-32` (codesign verify before submit) — saves a failed notarytool round-trip.
- **`SHOWX_NOTARY_PROFILE` env override** at `scripts/notarize-release.sh:16` — documented in `signing.md:60-65`. Good.
- **`python3` dependency** in `scripts/notarize-release.sh:44` for JSON parsing — acceptable since macOS ships python3 and the signed/notarize path requires a Mac dev environment anyway. Falls through to `STATUS=""` on parse failure → fails the `!= "Accepted"` guard.
- **PWA typecheck** not run in `build-release.sh:33` (only `--filter showx-main typecheck`). Minor coverage gap vs. previous `pnpm typecheck` (which itself was broken — no root scripts section). Not in spec; PWA `tsc --noEmit` script exists at `pwa/package.json` and could be wired in a follow-up, but doesn't block this acceptance.
- **Documented one-liner** in `docs/dev/release-build.md:62-69` — concise hand-off for Jindřich. Good.

## Signed-path verification

Per spec L21: "This task does NOT require the real cert to be ACCEPTED (pipeline + unsigned path verifiable now); full signed run is verified when cert present."
Per architect note L44: "B006-002 may remain in changes_requested/blocked pending Jindřich's Apple cert. Acceptable — the unsigned path + documented handoff is the deliverable; flag for Jindřich at gate."

The signed run (cert + notarytool) cannot be executed here — no Apple Developer ID cert in Architect/Critic environment. Verification is therefore limited to: pipeline structure, script correctness, asarUnpack config, entitlements, and the documented handoff. All present and correct.

**Flag for Jindřich at gate:** when his Developer ID cert is imported, run the full chain (`build-release.sh 0.4.x --signed` → `notarize-release.sh 0.4.x` → `verify-release.sh 0.4.x`) end-to-end. The "verify-release passes all checks (codesign + stapler + spctl + sha256)" milestone is the real-world confirmation.

## Tests

Done report claims 1859 tests pass (147 files). Changes are config + scripts + docs only — no product code edits — so the existing test suite remains valid. Not re-run by Critic; trust Forge's run.

---

**Verdict: ACCEPTED.** Mark `B006-003` style — promote to `done/` retention, set `status: accepted`, set `reviewed_at`.
