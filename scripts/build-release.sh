#!/usr/bin/env bash
set -euo pipefail

# Build ShowX release DMG.
# Usage:
#   ./scripts/build-release.sh [version] [--signed]
#
# Unsigned (local/CI gate, no cert required):
#   ./scripts/build-release.sh 0.4.0
#
# Signed (requires Apple Developer ID cert in keychain):
#   ./scripts/build-release.sh 0.4.0 --signed
#   Optionally set CSC_NAME to the exact cert name if multiple certs are present:
#     export CSC_NAME="Developer ID Application: XLAB s.r.o. (TEAMID)"
#   See docs/dev/signing.md for full setup instructions.

VERSION="${1:-0.4.0}"
SIGNED=false
if [[ "${2:-}" == "--signed" ]]; then
  SIGNED=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/releases/$VERSION"
EB="$ROOT_DIR/node_modules/.bin/electron-builder"

echo "=== ShowX release build v${VERSION} (signed=$SIGNED) ==="
mkdir -p "$DIST_DIR"

# 1. Type-check — hard gate
echo "Type-checking..."
pnpm --filter showx-main typecheck

# 2. Full test suite
echo "Running tests..."
"$ROOT_DIR/node_modules/.bin/vitest" run --config "$ROOT_DIR/vitest.config.ts"

# 3. Build production bundles
echo "Building main process..."
pnpm --filter showx-main build

echo "Building PWA..."
pnpm --filter showx-pwa build

# 4. DMG via electron-builder
if [[ "$SIGNED" == "true" ]]; then
  # Detect whether a Developer ID Application cert is available
  CERT_FOUND=false
  if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
    CERT_FOUND=true
  fi

  if [[ "$CERT_FOUND" == "false" ]]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║  WARNING: --signed requested but no Developer ID Application   ║"
    echo "║  certificate found in keychain. Falling back to UNSIGNED build. ║"
    echo "║  See docs/dev/signing.md to import your cert.                   ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    CSC_IDENTITY_AUTO_DISCOVERY=false "$EB" --mac dmg --arm64
  else
    echo "Developer ID cert found — building SIGNED arm64 DMG..."
    "$EB" --mac dmg --arm64
  fi
else
  echo "Building UNSIGNED arm64 DMG (no cert required)..."
  CSC_IDENTITY_AUTO_DISCOVERY=false "$EB" --mac dmg --arm64
fi

# 5. Collect artifact
DMG_SRC=$(find "$ROOT_DIR/dist-electron" -name "ShowX-*.dmg" | head -1)
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
  echo "Unsigned build — for external distribution run with --signed."
  echo "See docs/dev/signing.md for cert setup instructions."
  echo ""
  echo "Boot verify: SHOWX_PAIRING_TEST_PIN=000000 dist-electron/mac-arm64/ShowX.app/Contents/MacOS/ShowX"
fi
