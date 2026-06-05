---
id: "B002-015"
title: "ShowX 0.5 internal release: DMG signed + notarized + smoke verified"
type: "implementation"
estimated_size_lines: 150
priority: "P0"
depends_on: ["B002-013", "B002-014"]
target_files:
  - "releases/0.5.0/README.md"
  - "releases/0.5.0/release-notes.md"
  - "releases/0.5.0/smoke-test-report.md"
  - "CHANGELOG.md"
  - "package.json"
  - "src/modules/eventx-bridge/package.json"
  - "src/modules/eventx-bridge/src/manifest.ts"
acceptance_criteria:
  - "Root `package.json` version bumped to `0.5.0`"
  - "Module `src/modules/eventx-bridge/package.json` version bumped to `0.5.0`"
  - "Module `manifest.ts` version field updated to `'0.5.0'`"
  - "DMG built via `./scripts/build-mac.sh` (B002-014) — signed by Developer ID + notarized by Apple"
  - "`xcrun stapler validate dist/release/ShowX-0.5.0.dmg` exits 0 (notary ticket attached)"
  - "`codesign --verify --deep --strict dist/release/mac-universal/ShowX.app` exits 0"
  - "`spctl --assess --type execute dist/release/mac-universal/ShowX.app` exits 0 (Gatekeeper accepts)"
  - "Smoke test executed on 3 platforms minimum (or 2 if Windows Electron build deferred): Mac Apple Silicon, Mac Intel; Windows 11 IF Electron supports (defer if not)"
  - "Each smoke test verifies: app launches; EventX Bridge module loads (visible tab); login succeeds with test EventX credentials; event picker lists events; Start/Stop runtime works; test submission fires expected OSC packet to mock receiver; activity log shows packets"
  - "Release notes document the migration story + parity status + known issues"
  - "Smoke test report captures: tester name, date, hardware, OS version, app version, pass/fail per test step, screenshots/logs of any issues"
  - "`CHANGELOG.md` entry added under `## 0.5.0 — 2026-12-XX` with summary of EventX Bridge module shipped + BridgeX 0.3.x parity validated + migration path documented"
  - "Internal release announcement note drafted (not sent) at `releases/0.5.0/internal-announcement.md` for Architect → XLAB team comms"
  - "DMG artifact uploaded to release storage (Architect specifies destination — Netlify drop, XLAB drive, etc — coordinate before this task starts)"
---

## Context

The release task. Everything from B002-001 through B002-014 builds up to this: produce a signed + notarized DMG that the first 3 BridgeX 0.3.x customers will install (private beta per `bridgex_absorption.md` §7 Step 7 + §10 Q4 2026 column).

This task is **gating**:
- If parity tests (B002-010..012) didn't all pass → DO NOT proceed; escalate to Architect.
- If migration test (B002-013) didn't pass → DO NOT proceed.
- If signing pipeline (B002-014) doesn't produce a valid DMG → DO NOT proceed.

Each precondition is independently verifiable. Forge confirms ALL THREE before running this task.

## Implementation notes

### Pre-flight checklist

Before running the build:

1. Verify all prior B002-* tasks accepted:
   ```bash
   ls docs/agent_exchange/reviews/B002-0*.md | xargs grep -l '"accepted"' | wc -l
   # Should print 14 (B002-001..014)
   ```
2. Run full test suite:
   ```bash
   pnpm test
   pnpm parity:basic    # PT-001..015 (B002-010)
   pnpm parity:errors   # PT-016..025 (B002-011)
   pnpm parity:perf     # PT-034 (PT-035 manual only)
   ```
3. Confirm `build/.env.production` exists with valid Apple creds (do NOT commit).
4. Confirm `dist/release/` empty (previous builds removed).

### Version bumps

```diff
// package.json (root)
- "version": "0.4.0",
+ "version": "0.5.0",
```

```diff
// src/modules/eventx-bridge/package.json
- "version": "0.0.1",
+ "version": "0.5.0",
```

```diff
// src/modules/eventx-bridge/src/manifest.ts
- version: '0.0.1',
+ version: '0.5.0',
```

(Module version aligned with shell version for ShowX 0.5 — independent module versions are a post-1.0 concern per module-loader spec §11.)

### Build

```bash
cd /Users/machintoshhd/Daniel-local/showX
./scripts/build-mac.sh
# Expected output: dist/release/ShowX-0.5.0-arm64.dmg + ShowX-0.5.0.dmg (x64)
# Or universal binary depending on electron-builder config
```

Verification (per B002-014 docs/build/signing-pipeline.md):

```bash
codesign --verify --deep --strict --verbose=2 dist/release/mac-universal/ShowX.app
spctl --assess --type execute dist/release/mac-universal/ShowX.app
xcrun stapler validate dist/release/ShowX-0.5.0.dmg
```

All three must exit 0. If notary submission times out (Apple EU evening queue can stall), retry; document delay in smoke report.

### Smoke test plan

3 hardware/OS combos minimum:

| # | Hardware | OS | Tester |
|---|---|---|---|
| 1 | Mac Apple Silicon (M1+) | macOS 14+ | Forge (CI runner or Architect's MBP) |
| 2 | Mac Intel | macOS 13+ | Architect (Mac mini Intel) |
| 3 | Windows 11 | x64 | (DEFER if Electron Windows build not configured in B002-014) |

If only 2 platforms available, document why in smoke-test-report.md.

Smoke test steps (per platform):

1. Mount DMG. Drag ShowX.app to /Applications.
2. Right-click → Open (first launch Gatekeeper bypass). Verify dialog shows "ShowX is signed by Developer ID Application: Jindrich Trapl" + Notarized check.
3. App launches; left sidebar shows EventX Bridge tab.
4. Click EventX Bridge tab. Login form visible.
5. Log in with test EventX credentials.
6. Event picker dropdown populated; select test event.
7. Click Start.
8. From a second device: submit a test wordcloud entry to the event.
9. Verify ShowX activity log shows `→ /eventx/<shortId>/wordcloud/add ['hello', 1]`.
10. Verify mock OSC receiver (or running QLab on same LAN) receives the packet.
11. Click Stop.
12. Logout. Quit app. Re-launch. Confirm session restored.

Smoke test report captures each step pass/fail + any screenshots/logs.

### Release notes

```markdown
<!-- releases/0.5.0/release-notes.md -->
# ShowX 0.5.0 Internal Release

**Date:** 2026-12-XX
**Status:** Private beta — 3 BridgeX 0.3.x customers
**Type:** Internal release (not public)

## Highlights

- **EventX Bridge module shipped.** BridgeX 0.3.x functionality absorbed
  as the `eventx-bridge` module inside ShowX. All audience-platform routing
  (wordcloud, poll, quiz, hundred points, scales, multitap, QA, sensor race,
  show control) functional.
- **100% parity with BridgeX 0.3.x** on the validated `event_bridge_outputs`
  test suite (35 scenarios, see `tests/parity/scenarios/`). Customer
  configurations transfer byte-identically.
- **Automatic config migration.** First-launch detection of BridgeX 0.3.x
  install + import of `bridgex-config.json` to ShowX persistedStore. Customers
  do NOT need to re-enter host/port/event settings.
- **Apple-signed + notarized DMG.** Same Developer ID + Team as BridgeX
  0.3.x. No new Apple paperwork.

## Migration path

See `docs/migration/bridgex-to-showx.md` for the customer playbook.

## Known limitations (parity preserved)

- `event_bridge_outputs` hot-reload not supported (matches BridgeX 0.3.x —
  restart-required for config changes). Will revisit for ShowX 0.1 public.
- BridgeX session file (`bridgex-session.enc`) cannot be automatically migrated
  due to cross-process keychain isolation. Customers re-login on first launch.
- Sensor race 30 Hz emit may briefly drop to 29 Hz under high CPU load (same
  as BridgeX 0.3.x).

## What's next

- ShowX 0.1 public Q1 2027 (Cuelist Core + SHOW mode + Custom Router modules).
- BridgeX 0.3.x EOL announce Q2 2027.

## Tested on

- macOS 14.5 Apple Silicon (M1 Pro)
- macOS 14.5 Intel (Mac mini 2018)
- (Windows 11 TBD per build config)

## Credits

Built with Claude Code three-agent workflow:
- Architect: Jindřich Trapl (XLAB) via Opus
- Forge (implementer): Sonnet via LaunchAgent
- Critic (reviewer): Opus via LaunchAgent

Migration plan: `docs/specs/bridgex_absorption.md`
Bundle: `docs/agent_exchange/bundles/ShowX-2-eventx-bridge-module.md`
```

### Smoke test report template

```markdown
<!-- releases/0.5.0/smoke-test-report.md -->
# ShowX 0.5.0 Smoke Test Report

**Build:** ShowX-0.5.0-{arm64|x64|universal}.dmg
**SHA256:** (computed via `shasum -a 256`)
**Notary ticket:** (stapler verify timestamp)

## Test matrix

### Platform 1 — Mac Apple Silicon
- Hardware: ___
- OS version: ___
- Tester: ___
- Date: ___

| Step | Pass | Notes |
|---|---|---|
| 1. Mount DMG | | |
| 2. Drag to /Applications + first-launch Gatekeeper | | |
| 3. App launches | | |
| 4. EventX Bridge tab visible | | |
| 5. Login form | | |
| 6. Login successful | | |
| 7. Event picker populated | | |
| 8. Start runtime | | |
| 9. Submit wordcloud entry | | |
| 10. Activity log shows packet | | |
| 11. Mock OSC receiver receives | | |
| 12. Stop runtime | | |
| 13. Logout + quit + relaunch + session restored | | |

### Platform 2 — Mac Intel
(same table)

### Platform 3 — Windows 11 (if applicable)
(same table; otherwise document why deferred)

## Issues found
(list any failures + severity + fix path)

## Approval

- [ ] Architect signoff
- [ ] Jindřich review
- [ ] Cleared for private beta to 3 customers
```

### CHANGELOG entry

```markdown
<!-- CHANGELOG.md (prepend) -->
## 0.5.0 — 2026-12-XX

### Added
- EventX Bridge module (absorbed BridgeX 0.3.x source)
- Shell module loader (B001-010)
- Shared OutputDispatcher with refcounted pool (B001-007)
- Supabase subscriber + reconnect logic
- Rule engine + event_bridge_outputs Zod schema
- Automatic config migration from BridgeX 0.3.x
- React UI panel for EventX Bridge (event picker, sender stats, listener, activity log)
- 35-scenario parity test suite vs BridgeX 0.3.x
- Apple-signed + notarized DMG pipeline

### Internal release
- Private beta to 3 BridgeX 0.3.x customers
- 0.1 public release Q1 2027

### References
- `docs/specs/bridgex_absorption.md`
- `docs/agent_exchange/bundles/ShowX-2-eventx-bridge-module.md`
- `docs/migration/bridgex-to-showx.md`
```

### Internal announcement

```markdown
<!-- releases/0.5.0/internal-announcement.md -->
# (DRAFT) ShowX 0.5.0 Internal Release — Team Announce

**To:** XLAB team
**From:** Architect
**Subject:** ShowX 0.5 ready — BridgeX absorption complete

ShowX 0.5 internal release available. The EventX Bridge module is functional,
parity-validated against BridgeX 0.3.x, and signed + notarized.

**What this means for you:**

- BridgeX is now ShowX. Same product, new container, more room to grow.
- 3 customers will get private beta in Dec 2026.
- BridgeX 0.3.x continues bugfix-only through Q1 2027.
- Public ShowX 0.1 ships Q1 2027.

**Action items:**

- Margaret: draft customer comms per `docs/specs/bridgex_absorption.md` §10
  Q4 2026 row.
- Sales: hold on new BridgeX brand activity — pivot all messaging to ShowX
  for new prospects.
- Marketing: ShowX hero asset job is open (Margaret + Jindřich brief).

Questions: ping Architect in the XLAB Slack #showx channel.

(SEND DATE TBD — Architect confirms with Jindřich before sending.)
```

### Release directory

```
releases/0.5.0/
├── README.md                       (index: what's here + checksums)
├── release-notes.md                (above)
├── smoke-test-report.md            (filled in during smoke)
├── internal-announcement.md        (draft)
└── ShowX-0.5.0.dmg                 (NOT committed; uploaded separately)
```

`README.md` of the release dir:

```markdown
# ShowX 0.5.0 Release Artifacts

| File | SHA256 | Size |
|---|---|---|
| ShowX-0.5.0-arm64.dmg | (sha256) | (size) |
| ShowX-0.5.0-x64.dmg | (sha256) | (size) |

Release notes: ./release-notes.md
Smoke test report: ./smoke-test-report.md
Internal team announcement: ./internal-announcement.md

DMG location: (Architect specifies; e.g. https://drop.xlab.cz/showx/0.5.0/)
```

## Test plan

This task IS the test — the DMG must build, sign, notarize, and pass smoke on 2+ platforms.

If smoke test reveals issues:
1. Triage: minor (cosmetic) vs blocking (runtime/crash)?
2. Minor → note in smoke-test-report + ship; queue patch task for 0.5.1.
3. Blocking → DO NOT release; escalate to Architect; queue fix task in ShowX-2 (or open ShowX-2.1 patch bundle).

## Out of scope

- Customer comms send-out (Architect + Margaret).
- Public release (ShowX 0.1, Q1 2027).
- BridgeX 0.3.x EOL announce (Q2 2027).
- Multi-customer beta coordination (Architect).
- Auto-update from 0.5 → 0.5.1 (deferred).
- Sparkle/Squirrel update framework (deferred).
- Cuelist Core / SHOW mode modules (ShowX-3+).

## Notes for Critic

- Verify all 14 prior B002-* tasks have `verdict: accepted` reviews before this task starts.
- Verify root + module version bumps consistent (all show 0.5.0).
- Verify build script runs to completion + DMG produced.
- Verify `stapler validate` + `codesign --verify` + `spctl --assess` all exit 0.
- Verify smoke test report filled in honestly (not pre-populated with passes).
- Verify CHANGELOG entry added (and existing entries below preserved).
- Verify DMG NOT committed to git (large binary; release artifact storage handles).
- Verify internal-announcement.md is marked DRAFT (Architect controls send timing).
- If any parity scenarios still failing at this point → BLOCK with detailed failure analysis. Do not ship a non-parity DMG.
