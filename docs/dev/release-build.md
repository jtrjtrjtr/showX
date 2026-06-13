# Release Build Guide

## Quick start (unsigned arm64 — for local testing)

```bash
# Build main + PWA first
pnpm build:main
pnpm build:pwa

# Then produce unsigned DMG
pnpm dist
```

Output: `dist-electron/ShowX-0.4.0-arm64.dmg`

Boot verify after build:
```bash
SHOWX_PAIRING_TEST_PIN=000000 dist-electron/mac-arm64/ShowX.app/Contents/MacOS/ShowX
```

Confirm: shell window loads with title "ShowX". No infinite "Loading..." hang.

## Scripts

| Script | When |
|---|---|
| `pnpm dist` | Unsigned arm64 DMG — local testing, CI gate |
| `pnpm dist:signed` | Signed arm64 DMG — requires Apple Developer ID cert in keychain |
| `./scripts/build-release.sh 0.4.0` | Full unsigned release with typecheck + tests |
| `./scripts/build-release.sh 0.4.0 --signed` | Full signed release |

## How packaging works

`electron-builder.yml` maps:
- `package.json` → asar root (with `extraMetadata.main: index.js` patch applied)
- `src/main/dist/**` → asar root (flattened — `index.js`, `Shell.js`, etc.)
- `pwa/dist/**` → `<asar>/pwa/`

Shell.js packed-mode path detection (`pwaDistPath()`, `modulesRootPath()`) depends on this layout being stable. Do not change `to:` on the `src/main/dist` mapping.

## Known packaging history

**v0.2.0–v0.2.1 (Jun 11):** working signed DMGs.

**Post v0.2.1 regression:** `pnpm dist` failed at electron-builder sanityCheckPackage:
1. `Application entry file "src/main/dist/index.js" in app.asar does not exist` — wrong main path in packed package.json.
2. `Application "package.json" in app.asar does not exist` — package.json not present in asar.

**Root cause:** app-builder-lib 24.x changed behavior for custom `files` arrays — the root `package.json` is no longer auto-injected into the asar when a custom `from/to` mapping is used.

**Fix (B006-001):**
- Added `- package.json` to `files` array in `electron-builder.yml` → explicitly includes root package.json in asar.
- Added `extraMetadata.main: index.js` → patches the packed package.json main to point at the in-asar entry.
- Removed `mac.identity` from yml (hardcoded placeholder `XXXXXXXXXX`); identity now controlled by `CSC_NAME` env var for signed builds.
- Removed missing `build/dmg-background.png` reference from dmg config.
- Version bumped to 0.4.0 in root `package.json`.

## Signing (B006-002)

Signing is handled in B006-002. For signed builds:
```bash
export CSC_NAME="Developer ID Application: XLAB s.r.o. (TEAMID)"
pnpm dist:signed
```

## Native deps

`@julusian/midi` is a native addon. electron-builder rebuilds it for the target Electron version/arch during packaging. If you see native rebuild errors, ensure Xcode Command Line Tools are installed.

If `@julusian/midi` version drift occurs (installed 3.6.x vs pinned 3.5.0 in package.json), run `pnpm install` to reconcile.
