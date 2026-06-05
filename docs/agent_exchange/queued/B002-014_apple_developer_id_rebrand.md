---
id: "B002-014"
title: "Apple Developer ID bundle rebrand (BridgeX → ShowX) + signed/notarized DMG pipeline"
type: "implementation"
estimated_size_lines: 200
priority: "P0"
depends_on: ["B002-012"]
target_files:
  - "build/electron-builder.yml"
  - "build/entitlements.mac.plist"
  - "build/.env.production.example"
  - "scripts/build-mac.sh"
  - "apps/showx/package.json"
  - "apps/showx/src/main/index.ts"
  - "assets/ShowX.iconset/README.md"
  - "docs/build/signing-pipeline.md"
acceptance_criteria:
  - "`build/electron-builder.yml` configured with `appId: cz.xlab.showx`, `productName: ShowX`, signing identity `'Developer ID Application: Jindrich Trapl (JG4DXAPTHM)'`, notarize: true"
  - "`build/entitlements.mac.plist` carries BridgeX 0.3.x entitlements (`allow-jit`, `allow-unsigned-executable-memory`, `allow-dyld-environment-variables`, `disable-library-validation`, `network.client`, `network.server`) PLUS adds `com.apple.security.device.midi` and `com.apple.security.device.audio-input` (per absorption spec §8)"
  - "`build/.env.production.example` documents required env vars: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, optional `SHOWX_BUILD_SKIP_NOTARIZE`, optional `SHOWX_EVENTX_SUPABASE_URL`, optional `SHOWX_EVENTX_SUPABASE_ANON_KEY`"
  - "`scripts/build-mac.sh` adapted from BridgeX: renamed `BRIDGEX_BUILD_SKIP_NOTARIZE` → `SHOWX_BUILD_SKIP_NOTARIZE`; bundle ID grep checks updated `cz.xlab.bridgex` → `cz.xlab.showx`; pre-build pnpm install + tsc + tests verified"
  - "Apple Developer ID UNCHANGED: same Team ID JG4DXAPTHM; same Developer ID Application cert; no new cert issuance"
  - "Notary credentials UNCHANGED: same APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID env vars"
  - "`docs/build/signing-pipeline.md` documents: cert location in keychain; notary submission flow; verification steps post-notarize (`stapler validate`); known-issue list (Apple EU evening queue delays per absorption §11)"
  - "Electron main entry created at `apps/showx/src/main/index.ts` if not already (B001-011 should have provided shell main process — verify)"
  - "Workspace package `apps/showx/` properly defined with electron-builder build target"
  - "Icon asset placeholder: `assets/ShowX.iconset/README.md` documents required file list (`icon_16x16.png` through `icon_1024x1024.png`); actual icons TODO via XLAB brand asset job (Margaret + Jindřich brief — out of Forge scope)"
  - "Bundle ID grep test: `grep -r 'cz\\.xlab\\.bridgex' build/ scripts/ apps/showx/` returns ZERO hits"
  - "`scripts/build-mac.sh --skip-sign --skip-notarize` produces unsigned DMG locally (validates pipeline plumbing without Apple submission)"
---

## Context

ShowX 0.5 ships as a signed + notarized DMG. The signing pipeline IS BridgeX's pipeline rebadged — same Apple Developer ID, same Team, same notary credentials. Only the bundle ID, product name, icon, and a few build-script variable names change.

This task ports the BridgeX 0.3.x `apps/bridgex-app/electron-builder.yml` + `scripts/build-mac.sh` over to ShowX with the rebrand applied. The actual icon asset creation is out of Forge's scope (Margaret/Jindřich brand asset task); Forge ships a placeholder + README documenting the required asset list.

B002-015 USES this pipeline to build + sign + notarize the actual 0.5 DMG. This task LAYS the pipeline.

## Implementation notes

### electron-builder.yml

```yaml
# build/electron-builder.yml
appId: cz.xlab.showx
productName: ShowX
copyright: © 2026 XLAB Studio s.r.o.

directories:
  buildResources: build
  output: dist/release

mac:
  category: public.app-category.utilities
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  identity: "Developer ID Application: Jindrich Trapl (JG4DXAPTHM)"
  notarize:
    teamId: ${env.APPLE_TEAM_ID}
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  icon: assets/ShowX.iconset/icon.icns

dmg:
  title: ${productName} ${version}
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# Module files included
files:
  - "dist/**/*"
  - "src/modules/*/dist/**/*"
  - "src/main/dist/**/*"
  - "src/shared/dist/**/*"
  - "pwa/dist/**/*"
  - "node_modules/**/*"
  - "package.json"

asarUnpack:
  - "node_modules/@julusian/midi/**/*"
  - "node_modules/bufferutil/**/*"
  - "node_modules/utf-8-validate/**/*"

afterSign: scripts/notarize.js
```

### entitlements.mac.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- From BridgeX 0.3.x: hardened runtime allowances -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>

  <!-- Network: required for Supabase + OSC + WS -->
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>

  <!-- ShowX additions (BridgeX 0.3.x reserved these — ShowX uses them) -->
  <key>com.apple.security.device.midi</key>
  <true/>
  <key>com.apple.security.device.audio-input</key>
  <true/>
</dict>
</plist>
```

### .env.production.example

```bash
# build/.env.production.example
# Copy to build/.env.production for local builds. NEVER commit .env.production.

# Apple notary credentials (required for signed + notarized DMG)
APPLE_ID=jindrich.trapl@xlab.cz
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=JG4DXAPTHM

# Skip notarization for fast local iteration (signed but not notarized)
# SHOWX_BUILD_SKIP_NOTARIZE=1

# Bake EventX Supabase URL + anon key into the build (optional — module can
# also pull from SecretStore at runtime). Used by AuthManager (B002-007) for
# first-launch credentials.
# SHOWX_EVENTX_SUPABASE_URL=https://xxxxxxxxxxxxxxx.supabase.co
# SHOWX_EVENTX_SUPABASE_ANON_KEY=eyJhbGciOiJI...
```

### scripts/build-mac.sh

```bash
#!/usr/bin/env bash
# scripts/build-mac.sh — ShowX macOS DMG signing + notarization pipeline
# Adapted from BridgeX 0.3.x scripts/build-mac.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Flags
SKIP_SIGN=0
SKIP_NOTARIZE=0
for arg in "$@"; do
  case "$arg" in
    --skip-sign) SKIP_SIGN=1; SKIP_NOTARIZE=1 ;;
    --skip-notarize) SKIP_NOTARIZE=1 ;;
  esac
done

# Load env
if [ -f build/.env.production ]; then
  set -a; source build/.env.production; set +a
fi

# Env overrides
if [ "${SHOWX_BUILD_SKIP_NOTARIZE:-0}" = "1" ]; then
  SKIP_NOTARIZE=1
fi

# Prereqs
if [ "$SKIP_SIGN" -eq 0 ]; then
  : "${APPLE_ID:?APPLE_ID required for signing}"
  : "${APPLE_TEAM_ID:?APPLE_TEAM_ID required for signing}"
fi
if [ "$SKIP_NOTARIZE" -eq 0 ]; then
  : "${APPLE_APP_SPECIFIC_PASSWORD:?APPLE_APP_SPECIFIC_PASSWORD required for notarization}"
fi

# Bundle ID sanity check — must NOT contain bridgex
if grep -qR "cz\.xlab\.bridgex" build/ scripts/ apps/showx/; then
  echo "ERROR: stale BridgeX bundle ID references found. Aborting." >&2
  grep -nR "cz\.xlab\.bridgex" build/ scripts/ apps/showx/
  exit 2
fi
if ! grep -q "cz\.xlab\.showx" build/electron-builder.yml; then
  echo "ERROR: electron-builder.yml missing cz.xlab.showx" >&2
  exit 2
fi

# Build steps
echo "[1/5] pnpm install"
pnpm install --frozen-lockfile

echo "[2/5] typecheck + test"
pnpm typecheck
pnpm test

echo "[3/5] pnpm build (workspaces)"
pnpm -r build

echo "[4/5] electron-builder"
BUILDER_ARGS=()
[ "$SKIP_SIGN" -eq 1 ] && BUILDER_ARGS+=(--config.mac.identity=null)
[ "$SKIP_NOTARIZE" -eq 1 ] && BUILDER_ARGS+=(--config.mac.notarize=false)
pnpm exec electron-builder --mac --config build/electron-builder.yml "${BUILDER_ARGS[@]}"

echo "[5/5] verify"
if [ "$SKIP_SIGN" -eq 0 ]; then
  codesign --verify --deep --strict --verbose=2 "dist/release/mac-universal/ShowX.app" || codesign --verify --deep --strict --verbose=2 "dist/release/mac/ShowX.app"
fi
if [ "$SKIP_NOTARIZE" -eq 0 ]; then
  xcrun stapler validate "dist/release/ShowX-${SHOWX_VERSION:-0.5.0}.dmg" || true
fi

echo "Build complete: dist/release/"
```

### docs/build/signing-pipeline.md

```markdown
# ShowX Signing + Notarization Pipeline

## Inheritance from BridgeX 0.3.x

ShowX uses the same Apple Developer ID, same Team, same notary credentials as
BridgeX 0.3.x. No re-enrollment. Only bundle ID + product name change.

| Field | BridgeX 0.3.x | ShowX 0.5 |
|---|---|---|
| `appId` | `cz.xlab.bridgex` | `cz.xlab.showx` |
| `productName` | `BridgeX` | `ShowX` |
| Signing identity | `Developer ID Application: Jindrich Trapl (JG4DXAPTHM)` | unchanged |
| Notary creds | `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` | unchanged |
| Entitlements | `allow-jit`, `allow-unsigned-executable-memory`, `allow-dyld-environment-variables`, `disable-library-validation`, `network.client`, `network.server` | + `device.midi`, `device.audio-input` |

## Build flow

1. Author writes code → commits → CI runs typecheck + tests.
2. Release manager creates a git tag `v0.5.0` → triggers release CI.
3. CI (or local) runs `./scripts/build-mac.sh`:
   - Reads `build/.env.production` for secrets
   - `pnpm install --frozen-lockfile`
   - `pnpm typecheck && pnpm test` (gates the build)
   - `pnpm -r build` (compiles all workspaces)
   - `electron-builder --mac` (produces DMG + sign + notarize)
   - `stapler validate` (verifies notary ticket attached)
4. DMG uploaded to release artifact storage (Netlify? XLAB internal?).

## Local iteration (skip notarize for speed)

```bash
SHOWX_BUILD_SKIP_NOTARIZE=1 ./scripts/build-mac.sh
```

Skips notary submission. Output: signed DMG (Gatekeeper will warn "unidentified developer" → bypass via right-click → Open).

## Local unsigned (fastest)

```bash
./scripts/build-mac.sh --skip-sign
```

Output: unsigned DMG. Useful for testing build plumbing without Apple credentials.

## Known issues

- **Apple EU evening queue delays:** Notary submission can take 30min-2h during EU evening hours (per BridgeX experience). Submit early or skip-notarize for iteration.
- **Hardened runtime + JIT + MIDI:** All required entitlements must be present; missing any → app crashes on launch with "EXC_BAD_ACCESS in V8" or "MIDI service denied".
- **Universal binary size:** ~280 MB DMG (Electron 32 + 2 architectures + native MIDI bindings + Supabase JS bundle).

## Verification post-notarize

```bash
codesign --verify --deep --strict dist/release/mac-universal/ShowX.app
spctl --assess --type execute dist/release/mac-universal/ShowX.app
xcrun stapler validate dist/release/ShowX-0.5.0.dmg
```

All three should exit 0.

## Apple credentials inventory

- Apple Developer account: `jindrich.trapl@xlab.cz`
- Team ID: `JG4DXAPTHM`
- Developer ID Application cert: present in login keychain (BridgeX 0.3.x verified)
- Cert hash: `47792CD21D3B5AD157B3D61A983E1F26A8958641`
- App-specific password: shared with BridgeX 0.3.x; stored in `build/.env.production` locally + 1Password XLAB vault
- Notary submission: Apple notary EU region (default)
```

### Icon placeholder

```markdown
<!-- assets/ShowX.iconset/README.md -->
# ShowX App Icon Asset Set

This directory should contain the macOS app icon assets in standard iconset
format. Created by Margaret + Jindřich brand asset job (XLAB design system).

## Required files (per Apple iconset spec)

- `icon_16x16.png`
- `icon_16x16@2x.png` (32×32)
- `icon_32x32.png`
- `icon_32x32@2x.png` (64×64)
- `icon_128x128.png`
- `icon_128x128@2x.png` (256×256)
- `icon_256x256.png`
- `icon_256x256@2x.png` (512×512)
- `icon_512x512.png`
- `icon_512x512@2x.png` (1024×1024)

Then run: `iconutil -c icns ShowX.iconset` to generate `icon.icns`.

## Brand reference

Per `~/Daniel-local/brand/xlab/` and `reference_xlab_brand.md`:
- 3 colors: ink (`#0f0f10`), cream (`#f6f1e7`), neon yellow (`#FFFF00`)
- GT America typeface
- XLAB brand symbol — used as primary mark

Until assets land, electron-builder will use a placeholder icon (default Electron).
```

## Test plan

1. `bash scripts/build-mac.sh --skip-sign` — should produce unsigned DMG locally.
2. `grep -r 'cz.xlab.bridgex' build/ scripts/ apps/showx/` returns zero hits.
3. `grep -r 'cz.xlab.showx' build/electron-builder.yml` returns at least 1 hit.
4. `electron-builder.yml` parses cleanly: `pnpm exec electron-builder --config build/electron-builder.yml --help` (validation).

No DMG actually signed in this task — that's B002-015.

## Out of scope

- Actual DMG signing + notarization (B002-015).
- Icon assets (Margaret/Jindřich brand task).
- Code signing for Windows / Linux (deferred — ShowX 0.5 macOS only per absorption spec).
- Auto-update flow (deferred to ShowX 0.1+).
- Sparkle/Squirrel integration (deferred).
- Customer-facing download page (Margaret coordinates with deploy).

## Notes for Critic

- Verify bundle ID `cz.xlab.showx` in electron-builder.yml.
- Verify NO `cz.xlab.bridgex` references anywhere under build/, scripts/, apps/showx/.
- Verify entitlements add MIDI + audio-input (NEW for ShowX).
- Verify signing identity string matches BridgeX 0.3.x exactly (cert is unchanged).
- Verify Team ID `JG4DXAPTHM` referenced.
- Verify `.env.production.example` provided (NOT `.env.production` itself — that's per-machine).
- Verify build script env var renamed `BRIDGEX_BUILD_SKIP_NOTARIZE` → `SHOWX_BUILD_SKIP_NOTARIZE` AND old name no longer referenced.
- Verify pre-build sanity check (grep for stale BridgeX bundle ID) is in build-mac.sh.
- Verify build script aborts cleanly when env vars missing (not silent failure).
- No real Apple credentials committed — `.env.production.example` only.
