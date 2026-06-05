---
id: "B003-023"
title: "ShowX 0.1 public release — DMG signed + notarized + release notes"
type: "implementation"
estimated_size_lines: 200
priority: "P0"
depends_on: ["B003-001", "B003-002", "B003-003", "B003-004", "B003-005", "B003-006", "B003-007", "B003-008", "B003-009", "B003-010", "B003-011", "B003-012", "B003-013", "B003-014", "B003-015", "B003-016", "B003-017", "B003-018", "B003-019", "B003-020", "B003-021", "B003-022"]
target_files:
  - "releases/0.1.0/RELEASE_NOTES.md"
  - "releases/0.1.0/CHANGELOG_PUBLIC.md"
  - "releases/0.1.0/smoke-test-checklist.md"
  - "CHANGELOG.md"
  - "scripts/build-release.sh"
  - "scripts/notarize-release.sh"
  - "scripts/verify-release.sh"
acceptance_criteria:
  - "`scripts/build-release.sh` produces signed DMG via electron-builder (or electron-forge) with Apple Developer ID — re-uses BridgeX 0.3.x Developer ID + bundle id rebranding per B002-014 / bridgex_absorption.md"
  - "`scripts/notarize-release.sh` submits DMG to Apple notary service; waits for ticket; staples ticket"
  - "`scripts/verify-release.sh` runs spctl + codesign verification; refuses to publish unsigned/unnotarized artifact"
  - "`releases/0.1.0/RELEASE_NOTES.md` documents: what's new (Cuelist Core module, per-dept views, multi-op REHEARSAL), known limitations (no SHOW mode proposal queue, no Cloud Sync, no custom router, no timecode), installation steps, breaking changes from BridgeX (none — separate app, parallel install OK)"
  - "`releases/0.1.0/CHANGELOG_PUBLIC.md` is user-friendly per-feature summary"
  - "`CHANGELOG.md` (repo root) entry for 0.1.0 with detailed engineering changelog"
  - "Smoke test checklist: 20-item list run before publish — install on clean macOS, pair 2 stations, run 5-cue show, lock+unlock SHOW, export PDF, verify signature, verify notarization, verify DMG mounts, verify uninstall"
  - "DMG ≤ 200MB (current BridgeX 0.3.x is ~120MB; ShowX adds modules but should stay similar)"
  - "Signed with team identifier matching XLAB Developer account"
  - "Notarization log attached to release notes"
  - "Tagged in git as `v0.1.0` (manual `git tag` — Architect runs)"
  - "Downloads page at showx.xlab.cz (or showx.app) updated — manual Architect step, marketing"
  - "Architect-led production release; Forge implements scripts + writes notes; Jindřich runs final sign + notarize on his Mac"
---

## Context

ShowX 0.1 ships. This task is the final mile: signed DMG, notarized, release notes, public download. Forge writes the scripts + content; Architect + Jindřich execute the actual sign/notarize/publish (they need physical access to the signing key + Apple developer account).

The DMG distribution path is largely inherited from BridgeX 0.3.x (B002-014 already ratified the rebrand to ShowX bundle id). This task assembles everything; build scripts may exist already in shell/ShowX-1 — Forge wraps + extends for the release event.

## Implementation notes

### build-release.sh

```bash
#!/usr/bin/env bash
set -euo pipefail
# Build signed DMG for ShowX 0.1 release.
# Reuses BridgeX-era Apple Developer ID + bundle id `cz.xlab.showx`.

VERSION="0.1.0"
DIST_DIR="releases/$VERSION"
mkdir -p "$DIST_DIR"

# 1. Clean prior build
pnpm clean

# 2. Type + lint check
pnpm typecheck
pnpm lint

# 3. Test full suite
pnpm test
pnpm test:e2e

# 4. Build production bundles
pnpm build:main      # Electron main + modules
pnpm build:pwa       # PWA assets
pnpm build:asar      # asar pack

# 5. Electron-builder package as signed DMG
# Reads electron-builder.yml — Forge ensures it has:
#   appId: cz.xlab.showx
#   productName: ShowX
#   mac.identity: "Developer ID Application: XLAB s.r.o. (TEAM_ID)"
#   mac.hardenedRuntime: true
#   mac.entitlements: build/entitlements.mac.plist
pnpm dist

# 6. Move DMG to release dir
cp "dist/ShowX-$VERSION.dmg" "$DIST_DIR/ShowX-$VERSION.dmg"
shasum -a 256 "$DIST_DIR/ShowX-$VERSION.dmg" > "$DIST_DIR/ShowX-$VERSION.dmg.sha256"

echo "Build complete: $DIST_DIR/ShowX-$VERSION.dmg"
```

### notarize-release.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION="0.1.0"
DMG="releases/$VERSION/ShowX-$VERSION.dmg"

# Submit to Apple notary (requires APPLE_ID + APP_PASSWORD env or keychain profile)
xcrun notarytool submit "$DMG" \
  --keychain-profile "showx-notary" \
  --wait \
  --output-format json | tee "releases/$VERSION/notarize.json"

# Staple ticket
xcrun stapler staple "$DMG"

# Verify
xcrun stapler validate "$DMG"
spctl --assess --type install -vv "$DMG"

echo "Notarization complete"
```

### verify-release.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION="0.1.0"
DMG="releases/$VERSION/ShowX-$VERSION.dmg"

# Verify code signature
codesign -dv --verbose=4 "$DMG"
# Verify Gatekeeper acceptance
spctl --assess --type install -vv "$DMG"
# Verify notarization ticket
xcrun stapler validate "$DMG"
# Verify hash matches
EXPECTED=$(cat "releases/$VERSION/ShowX-$VERSION.dmg.sha256" | awk '{print $1}')
ACTUAL=$(shasum -a 256 "$DMG" | awk '{print $1}')
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "FAIL: hash mismatch"
  exit 1
fi

echo "DMG verified ✓"
```

### RELEASE_NOTES.md

```markdown
# ShowX 0.1.0 — Release Notes

**Released:** 2027-03-31
**Distribution:** signed + notarized DMG via showx.xlab.cz

## What's new

ShowX 0.1.0 is the first public release of XLAB's master FOH cuelist product.

### Cuelist Core module

- Multi-operator cue list with per-department views
- REHEARSAL mode collaborative editing via Yjs CRDT
- SHOW mode payload lock + history snapshots
- Compound cues (one cue → multiple department payloads)
- Trigger taxonomy: manual / auto_follow / auto_continue
- GO event side-channel with idempotency + replay protection
- Per-department PDF cue sheets

### EventX Bridge module (absorbed from BridgeX 0.3.x)

- All BridgeX 0.3.x functionality migrated to in-process module
- OSC / MIDI / DMX dispatch via shared OutputDispatcher
- BridgeX 0.3.x customers can migrate via included BridgeX import tool

### PWA stations

- iPads + laptops connect via LAN with QR / PIN pairing
- SM master view with calling text + standby panel
- Per-department operator views (LX, SX, VIDEO, AUTO, PYRO, FS)
- GO button + keyboard shortcuts
- Cue editor (REHEARSAL mode)

### Integration

- Stream Deck via Bitfocus Companion community module
- CSV import (QLab, Eos, generic)
- JSON .showx export + single-file portable format

## Known limitations (0.1)

- SHOW mode proposal queue stubbed — coming in 0.2
- Cloud Sync module not included — coming in 0.4
- Custom Router module not included — coming in 0.5
- Timecode triggers (LTC/MTC) not yet supported — coming in 0.4
- USITT ASCII import not yet supported — coming in 0.4
- Direct DMX from cuelist payloads not yet supported — use EventX Bridge code path

## Installation

1. Download `ShowX-0.1.0.dmg` from https://showx.xlab.cz/downloads
2. Open DMG, drag ShowX.app to Applications
3. First launch: macOS Gatekeeper may show "ShowX is from Apple Developer XLAB s.r.o." — accept
4. Grant Network + Bonjour permissions on first prompt
5. Open or create a `.showx` file

## Migrating from BridgeX 0.3.x

ShowX is a separate app with separate bundle id (`cz.xlab.showx`) — install alongside BridgeX 0.3.x. Both can run simultaneously on the same Mac. When ready, import BridgeX config: ShowX → Tools → Import BridgeX 0.3.x config.

BridgeX 0.3.x is frozen at 0.3.23 and supported until Q2 2027 sunset.

## Hardware requirements

- macOS 13 (Ventura) or later
- 8GB RAM (16GB recommended for ≥100 cues)
- Gigabit LAN at FOH for station connections
- WiFi 5/6 for iPad station connectivity

## Support

- Documentation: https://docs.showx.xlab.cz
- Email: support@xlab.cz
- Discord (community): https://discord.gg/[invite]

## License

ShowX is commercial software. 0.1.0 is free during the public beta period (2027-Q1 through 2027-Q3). Paid plans begin Q4 2027.

— XLAB s.r.o., Prague, March 2027
```

### CHANGELOG.md entry

```markdown
## 0.1.0 — 2027-03-31

### Added
- Cuelist Core module: Y.Doc-based show model, REHEARSAL/SHOW mode, per-dept views, compound cues, trigger engine, GO side-channel, payload dispatch, cue catalog publishing
- PWA: SM master view, operator views (LX/SX/VIDEO/AUTO/PYRO/FS variants), GO button + standby panel, cue editor
- Import: CSV (QLab/Eos/generic)
- Export: .showx package, single-file JSON, PDF per-department + SM master
- Stream Deck via Companion community module
- Multi-operator integration tests (Playwright E2E)
- First-pilot deployment playbook

### Changed
- BridgeX 0.3.x source absorbed as `eventx-bridge` module
- Module loader contract finalized (showx-shared/module.ts)

### Known limitations
- SHOW mode proposal queue stubbed
- No Cloud Sync, Custom Router, timecode, direct DMX from cuelist payloads
```

### smoke-test-checklist.md

```markdown
# 0.1.0 smoke test checklist

Run on clean macOS install before publish.

## Install
- [ ] DMG mounts; license shown
- [ ] Drag-to-Applications copies app
- [ ] First launch passes Gatekeeper without --strict bypass
- [ ] macOS Network + Bonjour prompt shown + accepted

## Boot
- [ ] App starts within 5s
- [ ] No errors in Console.app related to ShowX
- [ ] mDNS advertises `_showx._tcp.local`
- [ ] Asset HTTP server on :5300 responds with PWA index.html

## Show file
- [ ] Open existing .showx (test fixture) — show loads, doc.yjs preferred
- [ ] Create new show — title/venue/date prompt, saves to disk
- [ ] Corrupt doc.yjs → opens from JSON projections; recovery_from_json logged

## Pairing
- [ ] SM iPad pairs via QR code
- [ ] LX laptop pairs via PIN
- [ ] Presence indicators green on both

## Cuelist
- [ ] SM view shows all cues
- [ ] LX view filters correctly
- [ ] Compound cue visible in both
- [ ] SM edits label → LX sees update <1s

## GO
- [ ] SM presses Space → GO fires; both stations animate
- [ ] OSC packet sent to console (verify with OSC monitor or Eos status)
- [ ] go.dispatched broadcast received by both stations
- [ ] Replay window: stale request rejected
- [ ] Idempotency: same request_id → cached reply, no re-fire

## SHOW mode
- [ ] Lock → red badge on both stations
- [ ] LX op cue editor shows lock banner
- [ ] Meta edits (label) still allowed
- [ ] Unlock → back to REHEARSAL

## Export
- [ ] CSV import from QLab fixture → cues created
- [ ] .showx export to new path
- [ ] Single-file JSON export → re-import round-trip
- [ ] PDF cue sheets generated (1 per dept)

## Security / sign / notarize
- [ ] codesign -dv passes
- [ ] spctl --assess type install passes
- [ ] stapler validate passes

## Uninstall
- [ ] Drag ShowX.app to Trash removes app
- [ ] Library/Application Support/ShowX/ holds user data (not auto-deleted)
- [ ] No leftover LaunchAgents or system daemons
```

## Test plan

Smoke test checklist above IS the test plan. Forge runs locally; Architect re-runs on a clean macOS VM before publish. Failure on any item blocks release.

## Out of scope

- Beta-period plan pricing decision (post-release, Jindřich).
- Public website redesign (post-release).
- Multi-language docs (Czech + English, MVP English; Czech follow-up).
- App Store distribution (post-MVP, direct DMG only for 0.1).
- Linux / Windows builds (Mac only for 0.1).
- Auto-update mechanism (post-MVP — manual download for 0.1).
- BridgeX 0.3.x sunset announcement (separate task by Architect).

## Notes for Critic

- Verify scripts use `set -euo pipefail` (fail-fast on shell errors).
- Verify build-release runs full test suite — no shortcut to ship untested code.
- Verify notarize uses keychain-profile (not env vars; safer for CI).
- Confirm verify-release checks BOTH signature AND notarization staple.
- Verify CHANGELOG entries match what was actually built (cross-reference with B003-001 through B003-022 done reports).
- Confirm RELEASE_NOTES mentions known limitations clearly (no overpromising).
- Confirm migration guidance for BridgeX customers is in release notes.
- Verify smoke test checklist covers happy path + 2-3 negative cases (corrupt file, rejected GO).
- Confirm scripts are executable (chmod +x) — Forge may include in done report.
- Verify no secret material in scripts or release notes.
