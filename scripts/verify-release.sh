#!/usr/bin/env bash
set -euo pipefail

# Verify ShowX DMG: code signature, notarization staple, Gatekeeper, and SHA-256 hash.
# Refuses to exit 0 unless ALL checks pass.
# Usage: ./scripts/verify-release.sh [version]

VERSION="${1:-0.1.0}"
DIST_DIR="releases/$VERSION"
DMG="$DIST_DIR/ShowX-${VERSION}.dmg"
HASH_FILE="$DIST_DIR/ShowX-${VERSION}.dmg.sha256"

PASS=0
FAIL=0

check() {
  local label="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== ShowX v${VERSION} release verification ==="

if [[ ! -f "$DMG" ]]; then
  echo "ERROR: DMG not found at $DMG" >&2
  exit 1
fi

# Code signature
check "Code signature (codesign -v)" codesign --verify --verbose=1 "$DMG"

# Hardened runtime
check "Hardened runtime flag" bash -c "codesign -d --entitlements :- \"$DMG\" 2>&1 | grep -q 'com.apple.security'"

# Gatekeeper acceptance
check "Gatekeeper (spctl --assess)" spctl --assess --type install "$DMG"

# Notarization staple
check "Notarization staple (stapler validate)" xcrun stapler validate "$DMG"

# SHA-256 hash integrity
if [[ -f "$HASH_FILE" ]]; then
  EXPECTED=$(awk '{print $1}' "$HASH_FILE")
  ACTUAL=$(shasum -a 256 "$DMG" | awk '{print $1}')
  if [[ "$EXPECTED" == "$ACTUAL" ]]; then
    echo "  PASS  SHA-256 hash matches"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  SHA-256 hash mismatch"
    echo "        expected: $EXPECTED"
    echo "        actual:   $ACTUAL"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  WARN  SHA-256 file not found: $HASH_FILE (skipping)"
fi

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"

if [[ $FAIL -gt 0 ]]; then
  echo "BLOCKED: DMG failed verification — do not publish." >&2
  exit 1
fi

echo "DMG verified — safe to publish."
