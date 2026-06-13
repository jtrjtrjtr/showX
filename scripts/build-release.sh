#!/usr/bin/env bash
set -euo pipefail

# Build ShowX release DMG.
# Usage:
#   ./scripts/build-release.sh [version] [--signed]
#
# Unsigned (local/CI gate, no cert required):
#   ./scripts/build-release.sh 0.4.0
#   → runs: pnpm dist   (CSC_IDENTITY_AUTO_DISCOVERY=false baked into npm script)
#
# Signed (B006-002, requires Apple Developer ID cert in keychain):
#   ./scripts/build-release.sh 0.4.0 --signed
#   → runs: pnpm dist:signed
#   Requires: valid Developer ID Application cert; set CSC_NAME env if needed.

VERSION="${1:-0.4.0}"
SIGNED=false
if [[ "${2:-}" == "--signed" ]]; then
  SIGNED=true
fi

DIST_DIR="releases/$VERSION"

echo "=== ShowX release build v${VERSION} (signed=$SIGNED) ==="
mkdir -p "$DIST_DIR"

# 1. Type-check — hard gate
pnpm typecheck

# 2. Full test suite
pnpm test

# 3. Build production bundles (skip if already built)
echo "Building main + pwa..."
pnpm build:main
pnpm build:pwa

# 4. DMG via electron-builder
# The electron-builder.yml extraMetadata.main: index.js patch ensures the
# packed package.json points at the in-asar entry (flattened from src/main/dist).
# The package.json files entry ensures the root package.json is present in the asar.
if [[ "$SIGNED" == "true" ]]; then
  echo "Building SIGNED arm64 DMG..."
  pnpm dist:signed
else
  echo "Building UNSIGNED arm64 DMG (no cert required)..."
  pnpm dist
fi

# 5. Collect artifact
DMG_SRC=$(find dist-electron -name "ShowX-*.dmg" | head -1)
if [[ -z "$DMG_SRC" ]]; then
  echo "ERROR: DMG not found in dist-electron/" >&2
  exit 1
fi

cp "$DMG_SRC" "$DIST_DIR/ShowX-${VERSION}.dmg"
shasum -a 256 "$DIST_DIR/ShowX-${VERSION}.dmg" > "$DIST_DIR/ShowX-${VERSION}.dmg.sha256"

echo ""
echo "=== Build complete ==="
echo "DMG:    $DIST_DIR/ShowX-${VERSION}.dmg"
echo "SHA256: $(cat "$DIST_DIR/ShowX-${VERSION}.dmg.sha256")"
echo ""
if [[ "$SIGNED" == "false" ]]; then
  echo "Unsigned build — for distribution run with --signed (B006-002)."
  echo "Boot verify: SHOWX_PAIRING_TEST_PIN=000000 dist-electron/mac-arm64/ShowX.app/Contents/MacOS/ShowX"
fi
