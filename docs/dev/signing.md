# Signing & Notarization Setup

This document describes the one-time setup Jindřich must perform before signed DMGs can be built.

## Prerequisites

- macOS with Xcode Command Line Tools installed (`xcode-select --install`)
- Active Apple Developer Program membership
- **Developer ID Application** certificate in your keychain (see below)
- An App-Specific Password for notarization (different from your Apple ID password)

---

## Step 1 — Import Developer ID Application Certificate

1. Open [developer.apple.com → Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Create or download a **Developer ID Application** certificate for XLAB s.r.o. (Team ID: `XXXXXXXXXX` — replace with real Team ID)
3. Double-click the `.cer` file to import it into Keychain Access (login keychain)
4. Verify it appears:
   ```bash
   security find-identity -v -p codesigning | grep "Developer ID Application"
   ```
   You should see a line like:
   ```
   1) ABC123... "Developer ID Application: XLAB s.r.o. (TEAMID)"
   ```

### Optional: set CSC_NAME (if multiple Developer ID certs present)

If you have more than one Developer ID cert, set `CSC_NAME` to the full cert name so electron-builder picks the right one:
```bash
export CSC_NAME="Developer ID Application: XLAB s.r.o. (TEAMID)"
```

If only one cert is present, electron-builder auto-discovers it. `CSC_NAME` is optional.

---

## Step 2 — Store Notarization Credentials

Notarization requires an **App-Specific Password** (not your Apple ID password):
1. Go to [appleid.apple.com → Sign-In and Security → App-Specific Passwords](https://appleid.apple.com/account/manage)
2. Generate a new password named "ShowX notarize"
3. Store it in the keychain profile named `showx-notary`:

```bash
xcrun notarytool store-credentials "showx-notary" \
  --apple-id <YOUR_APPLE_ID_EMAIL> \
  --team-id <TEAM_ID> \
  --password <APP_SPECIFIC_PASSWORD>
```

This stores credentials securely in the system keychain. You only run this once per machine.

Verify the profile exists:
```bash
xcrun notarytool history --keychain-profile "showx-notary"
```

### Override profile name (optional)

The default keychain profile name is `showx-notary`. To use a different name:
```bash
export SHOWX_NOTARY_PROFILE="my-profile-name"
```

---

## Step 3 — Run the Signed Build Pipeline

```bash
# Optional: pin the cert name if multiple Developer ID certs present
export CSC_NAME="Developer ID Application: XLAB s.r.o. (TEAMID)"

# Build signed DMG (typecheck + tests + build + electron-builder --mac)
./scripts/build-release.sh 0.4.0 --signed

# Submit to Apple notarization, wait for approval, staple ticket
./scripts/notarize-release.sh 0.4.0

# Final verification: signature + staple + Gatekeeper + SHA-256
./scripts/verify-release.sh 0.4.0
```

The final artifact is at `releases/0.4.0/ShowX-0.4.0.dmg`.

---

## Graceful fallback (no cert)

If `--signed` is requested but no Developer ID Application cert is found in the keychain,
`build-release.sh` automatically falls back to an unsigned build and prints a clear warning.
This lets CI pipelines continue without a cert (e.g., pull-request builds).

---

## Env var reference

| Variable | Default | Purpose |
|---|---|---|
| `CSC_NAME` | (auto-detect) | Full name of the Developer ID Application cert |
| `CSC_IDENTITY_AUTO_DISCOVERY` | `true` | Set to `false` to skip code signing entirely (unsigned builds) |
| `SHOWX_NOTARY_PROFILE` | `showx-notary` | Keychain profile name for notarytool |

---

## Entitlements

`build/entitlements.mac.plist` is pre-configured with the entitlements required for ShowX:

| Entitlement | Reason |
|---|---|
| `com.apple.security.cs.allow-jit` | Electron's V8 JIT compilation |
| `com.apple.security.cs.allow-unsigned-executable-memory` | Electron renderer |
| `com.apple.security.cs.disable-library-validation` | Native addons (`@julusian/midi`, `keytar`) |
| `com.apple.security.network.client` | LAN + mDNS |
| `com.apple.security.network.server` | PWA asset server + y-websocket broker |

The entitlement file does not need to be changed for standard ShowX builds.

---

## Native addon unpacking

`electron-builder.yml` includes `asarUnpack: ["**/*.node"]` which extracts native `.node` binaries
from the asar archive into `app.asar.unpacked/`. This is required for `@julusian/midi` and `keytar`
to be dlopen()-able by the OS after notarization (notarization restricts loading binaries
packed inside asar).
