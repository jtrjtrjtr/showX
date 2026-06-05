#!/usr/bin/env bash
set -euo pipefail

# Submit ShowX DMG to Apple notarization service, wait for approval, staple ticket.
# Requires: xcrun notarytool, keychain profile named "showx-notary".
# Set up profile once with:
#   xcrun notarytool store-credentials "showx-notary" \
#     --apple-id <APPLE_ID> --team-id <TEAM_ID> --password <APP_SPECIFIC_PASSWORD>
# Usage: ./scripts/notarize-release.sh [version]

VERSION="${1:-0.1.0}"
DIST_DIR="releases/$VERSION"
DMG="$DIST_DIR/ShowX-${VERSION}.dmg"

if [[ ! -f "$DMG" ]]; then
  echo "ERROR: DMG not found at $DMG" >&2
  echo "Run ./scripts/build-release.sh ${VERSION} first." >&2
  exit 1
fi

echo "=== Notarizing ShowX v${VERSION} ==="

# Submit to Apple notary service; --wait blocks until notarization completes or fails
NOTARIZE_OUTPUT="$DIST_DIR/notarize.json"
xcrun notarytool submit "$DMG" \
  --keychain-profile "showx-notary" \
  --wait \
  --output-format json | tee "$NOTARIZE_OUTPUT"

# Check submission status
STATUS=$(python3 -c "import json,sys; d=json.load(open('$NOTARIZE_OUTPUT')); print(d.get('status',''))" 2>/dev/null || echo "")
if [[ "$STATUS" != "Accepted" ]]; then
  echo ""
  echo "ERROR: Notarization status is '$STATUS' (expected 'Accepted')" >&2
  echo "Full log saved to: $NOTARIZE_OUTPUT" >&2
  exit 1
fi

# Staple the notarization ticket into the DMG
echo "Stapling notarization ticket..."
xcrun stapler staple "$DMG"

# Validate the staple
xcrun stapler validate "$DMG"

# Final Gatekeeper check
spctl --assess --type install -vv "$DMG"

echo ""
echo "=== Notarization complete ==="
echo "DMG: $DMG"
echo "Log: $NOTARIZE_OUTPUT"
echo ""
echo "Next step: run ./scripts/verify-release.sh ${VERSION}"
