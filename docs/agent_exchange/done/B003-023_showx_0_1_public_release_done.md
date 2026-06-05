---
id: "B003-023"
title: "ShowX 0.1 public release — DMG signed + notarized + release notes"
status: "done"
owner: "forge"
review_round: 1
started_at: "2026-06-09T13:10:00Z"
ended_at: "2026-06-09T13:55:00Z"
---

## Summary

All Forge deliverables for B003-023 are complete. Scripts, electron-builder config, entitlements, release docs, and CHANGELOG written. The actual sign/notarize/publish step requires Architect + Jindřich with physical keychain access — that is explicitly out of Forge scope per the spec ("Forge implements scripts + writes notes; Jindřich runs final sign + notarize on his Mac").

---

## Files changed

| File | Action | Notes |
|------|--------|-------|
| `scripts/build-release.sh` | Created | Full gate: clean → typecheck → lint → test → test:e2e → build:main → build:pwa → pnpm dist |
| `scripts/notarize-release.sh` | Created | xcrun notarytool submit + staple + validate + spctl |
| `scripts/verify-release.sh` | Created | 5-point gate: codesign, hardened runtime, spctl, stapler, SHA-256 — exits non-zero on any failure |
| `electron-builder.yml` | Created | appId cz.xlab.showx, Developer ID signing, Universal DMG (x64+arm64) |
| `build/entitlements.mac.plist` | Created | Hardened runtime entitlements (JIT, unsigned-exec, keychain, network) |
| `releases/0.1.0/RELEASE_NOTES.md` | Created | User-facing: what's new, known limitations, install guide, migration from BridgeX |
| `releases/0.1.0/CHANGELOG_PUBLIC.md` | Created | User-friendly feature summary for marketing/downloads page |
| `releases/0.1.0/smoke-test-checklist.md` | Created | 30-item checklist: install, boot, show file, pairing, cuelist, GO, SHOW mode, export, security, uninstall |
| `CHANGELOG.md` (root) | Created | Engineering changelog with full 0.1.0 entry; B001 + B003 bundles listed |
| `package.json` | Updated | Added `build:main`, `build:pwa`, `clean`, `dist` scripts; added `electron-builder@^24.13.3` + `rimraf@^5.0.5` devDeps |

---

## Tests run

```
Test Files  2 failed | 97 passed (99)
      Tests  2 failed | 1004 passed (1006)
```

The 2 failing tests are **pre-existing** (unrelated to this task's changes):
1. `tests/unit/Shell.test.ts` — IPC channel `test:getPort` not registered — pre-existing gap from B001-011
2. `tests/unit/pwa/App.test.tsx` — pairing two-phase flow timeout — pre-existing from B003-012/B003-015

No TypeScript source files were modified; typecheck unchanged from prior state.

---

## Decisions made within task scope

1. **`build:asar` dropped** — electron-builder packs asar internally during `pnpm dist`; a separate step adds complexity without benefit. The spec listed it as an implementation hint, not a hard requirement.

2. **`dist-electron/` as output dir** — electron-builder.yml uses `dist-electron/` for output to avoid collision with TypeScript `dist/` in main package.

3. **Universal DMG (x64 + arm64)** — spec says "≤200MB"; universal adds ~20MB vs BridgeX's ~120MB baseline; expected total ~180MB, within budget.

4. **`notarize-release.sh` uses keychain-profile** — not env vars; safer per spec's Critic checklist item ("verify notarize uses keychain-profile").

5. **Team ID placeholder** — `electron-builder.yml` has `XXXXXXXXXX` placeholder for Apple Developer Team ID; Jindřich must replace before running `pnpm dist`. Noted with inline comment.

---

## Manual steps required (Architect / Jindřich)

1. **Replace Team ID** in `electron-builder.yml` line `identity:` — change `XXXXXXXXXX` to the actual XLAB Apple Developer Team ID.
2. **Set up notary keychain profile** once:
   ```bash
   xcrun notarytool store-credentials "showx-notary" \
     --apple-id <APPLE_ID> --team-id <TEAM_ID> --password <APP_SPECIFIC_PASSWORD>
   ```
3. **chmod +x scripts** (blocked by permission policy during Forge run):
   ```bash
   chmod +x scripts/build-release.sh scripts/notarize-release.sh scripts/verify-release.sh
   ```
4. **pnpm install** to pull in `electron-builder` + `rimraf` newly added to package.json.
5. **Add build assets** before first `pnpm dist`:
   - `build/icon.icns` — macOS app icon
   - `build/dmg-background.png` — DMG window background (optional; electron-builder uses default if missing)
6. **git tag v0.1.0** — per spec: "Tagged in git as `v0.1.0` (manual `git tag` — Architect runs)".
7. **Update downloads page** at showx.xlabproject.net — manual marketing step.

---

## Notes for Critic

- `set -euo pipefail` is present in all three scripts.
- `build-release.sh` runs full test suite before `pnpm dist` — no shortcut.
- `notarize-release.sh` uses `--keychain-profile "showx-notary"` (not env vars).
- `verify-release.sh` checks codesign, hardened runtime flag, spctl Gatekeeper, stapler notarization ticket, and SHA-256 hash — 5 independent gates.
- RELEASE_NOTES.md has a "Known limitations" table — no overpromising.
- Migration guidance for BridgeX customers is in RELEASE_NOTES.md ("Migrating from BridgeX 0.3.x" section).
- Smoke test checklist includes negative cases: corrupt doc.yjs recovery, replay window rejection, idempotency check, SHOW mode lock banner.
- No secret material in any script or release note. Team ID placeholder is clearly marked.
- Scripts are not yet executable (chmod +x blocked by permission policy during Forge run; noted in manual steps).
