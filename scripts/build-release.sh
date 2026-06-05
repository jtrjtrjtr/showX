#!/usr/bin/env bash
set -euo pipefail

# Build signed DMG for ShowX release.
# Requires: Apple Developer ID in keychain, TEAM_ID env var set.
# Usage: ./scripts/build-release.sh [version]

VERSION="${1:-0.1.0}"
DIST_DIR="releases/$VERSION"

echo "=== ShowX release build v${VERSION} ==="
mkdir -p "$DIST_DIR"

# 1. Clean prior build artifacts
pnpm clean

# 2. Type-check + lint — hard gate, no untested code ships
pnpm typecheck
pnpm lint

# 3. Full test suite
pnpm test
pnpm test:e2e

# 4. Build production bundles
pnpm build:main   # TypeScript compile for Electron main + modules
pnpm build:pwa    # Vite production build for PWA

# 5. Signed DMG via electron-builder
# Reads electron-builder.yml — appId: cz.xlab.showx
# mac.identity must resolve to a valid Developer ID Application cert in keychain
pnpm dist

# 6. Collect artifacts in release dir
DMG_SRC="dist-electron/ShowX-${VERSION}.dmg"
if [[ ! -f "$DMG_SRC" ]]; then
  # electron-builder may use a different naming pattern
  DMG_SRC=$(find dist-electron -name "*.dmg" | head -1)
  if [[ -z "$DMG_SRC" ]]; then
    echo "ERROR: DMG not found in dist-electron/" >&2
    exit 1
  fi
fi

cp "$DMG_SRC" "$DIST_DIR/ShowX-${VERSION}.dmg"
shasum -a 256 "$DIST_DIR/ShowX-${VERSION}.dmg" > "$DIST_DIR/ShowX-${VERSION}.dmg.sha256"

echo ""
echo "=== Build complete ==="
echo "DMG:    $DIST_DIR/ShowX-${VERSION}.dmg"
echo "SHA256: $(cat "$DIST_DIR/ShowX-${VERSION}.dmg.sha256")"
echo ""
echo "Next step: run ./scripts/notarize-release.sh ${VERSION}"
