---
id: "B006-002"
title: "Signed + notarized DMG pipeline"
status: "done"
review_round: 1
ended_at: "2026-06-13T23:45:00Z"
---

## Summary

Signed + notarized DMG pipeline wired. Unsigned path (no cert required) verified; signed path ready for activation once Jindřich imports his Developer ID cert. All 1859 tests pass.

## Files changed

| File | Change |
|---|---|
| `electron-builder.yml` | Added `asarUnpack: ["**/*.node"]` — native addons extracted outside asar |
| `scripts/build-release.sh` | Rewrote to call electron-builder binary directly (avoids missing root pnpm scripts); added graceful cert detection with clear WARNING + unsigned fallback |
| `scripts/notarize-release.sh` | Added `SHOWX_NOTARY_PROFILE` env override; pre-flight codesign check before submitting; absolute ROOT_DIR paths |
| `scripts/verify-release.sh` | Added SCRIPT_DIR/ROOT_DIR derivation for correct path resolution when called from any cwd |
| `docs/dev/signing.md` | NEW — complete step-by-step cert handoff: import Developer ID cert, store notarytool credentials, env var reference, entitlements table, asarUnpack rationale |
| `docs/dev/release-build.md` | Updated Scripts table; removed stale `pnpm dist`/`pnpm dist:signed` references; added link to signing.md |

`build/entitlements.mac.plist` — no changes needed (already correct for Electron + native addons).

## Acceptance criteria verification

1. **Pipeline wired** — `build-release.sh → notarize-release.sh → verify-release.sh` sequence documented and functional. When cert + notarytool profile are present, the flow produces signed+notarized+stapled DMG (manually verifiable only with cert).

2. **mac.identity parameterized** — `identity` field absent from `electron-builder.yml`. electron-builder auto-discovers the cert or uses `CSC_NAME` env. No `XXXXXXXXXX` placeholder anywhere.

3. **hardenedRuntime + entitlements** — `hardenedRuntime: true` in yml; `build/entitlements.mac.plist` includes `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation` (needed for `@julusian/midi` + `keytar`), network client+server.

4. **Graceful when no cert** — `build-release.sh` runs `security find-identity -v -p codesigning` when `--signed` is requested. If no Developer ID Application cert found: prints a boxed WARNING, falls back to unsigned build, continues. Default (no `--signed`) always builds unsigned.

5. **asarUnpack** — `asarUnpack: ["**/*.node"]` added. electron-builder will extract all `.node` binaries to `app.asar.unpacked/` so the OS can dlopen() them after notarization.

6. **Documentation** — `docs/dev/signing.md` created with: prerequisite check, Step 1 (import cert + verify with `security find-identity`), Step 2 (notarytool store-credentials), Step 3 (full pipeline run), env var table, entitlements table, asarUnpack explanation.

7. **No edits outside target_files** — confirmed.

## Tests run

```
Test Files  147 passed (147)
     Tests  1859 passed (1859)
  Duration  12.10s
```

## Note for Critic

The unsigned path is fully testable now. The signed path (notarize → staple → spctl) requires Jindřich's Apple Developer ID cert — per spec, this is the expected state ("This task does NOT require the real cert to be ACCEPTED"). The architect note on the spec says B006-002 "may remain in changes_requested/blocked pending Jindřich's Apple cert" — this is acceptable.

One issue to note: the root `package.json` has no `scripts` section, so `pnpm dist` / `pnpm dist:signed` don't work as standalone commands. `build-release.sh` was updated to call the electron-builder binary directly (`node_modules/.bin/electron-builder`), avoiding this gap entirely without touching package.json (outside target_files). The docs/dev/release-build.md was updated to remove the stale `pnpm dist` references.
