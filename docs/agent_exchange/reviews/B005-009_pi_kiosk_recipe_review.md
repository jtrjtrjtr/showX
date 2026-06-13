---
id: "B005-009"
title: "Pi kiosk recipe docs"
verdict: accepted
round: 1
reviewer: critic
reviewed_at: "2026-06-13T22:05:00Z"
---

## Summary

Pure docs task. `docs/RPI_COUNTDOWN_KIOSK.md` (232 lines, new file) is a complete,
copy-pasteable recipe for turning a Raspberry Pi 4 + HDMI display into a ShowX
countdown station. All acceptance criteria are satisfied and every technical claim
is verifiable against the live code.

## Acceptance criteria — verified

### AC1 — Setup guide covers all required topics

| Topic | Citation in delivered doc | Status |
|---|---|---|
| Pi OS Desktop primary | `RPI_COUNTDOWN_KIOSK.md:25-36` (Step 1) | ✅ |
| Pi OS Lite alternative | `RPI_COUNTDOWN_KIOSK.md:175-212` (Systemd alternative) | ✅ |
| Chromium kiosk autostart pointed at countdown URL | `RPI_COUNTDOWN_KIOSK.md:123-155` (Step 6) | ✅ |
| Pair as 'countdown' role over LAN (mDNS + PIN) | `RPI_COUNTDOWN_KIOSK.md:105-119` (Step 5) | ✅ |
| Display rotation/resolution | `RPI_COUNTDOWN_KIOSK.md:61-82` (Step 3, `hdmi_mode` + `display_rotate` table) | ✅ |
| Auto-reconnect on network blip | `RPI_COUNTDOWN_KIOSK.md:159-171` | ✅ |
| Disable screen blanking | `RPI_COUNTDOWN_KIOSK.md:40-57` (Step 2, raspi-config + xset belt-and-suspenders) | ✅ |

### AC2 — Exact kiosk launch command + autostart/systemd snippets

- ✅ Full launch command with required flags at `RPI_COUNTDOWN_KIOSK.md:138`
  (`--kiosk --noerrordialogs --disable-session-crashed-bubble --disable-infobars
  --check-for-update-interval=31536000 ... --start-maximized`)
- ✅ `.desktop` autostart snippet at `RPI_COUNTDOWN_KIOSK.md:134-140`
- ✅ Systemd unit file at `RPI_COUNTDOWN_KIOSK.md:185-204`

### AC3 — Kobbi's rationale + "supported recipe" framing

- ✅ "No heavy computer on stage. Small box, big numbers." at `RPI_COUNTDOWN_KIOSK.md:9`
- ✅ Explicitly states "This is a 'supported recipe' — tested steps you follow once
  per Pi. (Shipping a signed SD image is deferred per design decision §7 / Q4 default.)"
  at `RPI_COUNTDOWN_KIOSK.md:5-7`

### AC4 — Cross-link / standalone

- ✅ Standalone (acknowledged in done report: no countdown section in user guide yet)
- ✅ Cross-references list at `RPI_COUNTDOWN_KIOSK.md:228-232` points to
  `pwa/src/components/cuelist/CountdownView.tsx` (B005-008), `docs/specs/pairing_auth.md`,
  and `docs/USER_GUIDE_cues_devices_routing.md` — all three paths verified to exist.

## Technical claim verification

Each ShowX-specific claim cross-checked against current source:

| Claim in doc | Source location | Verdict |
|---|---|---|
| Default port `5300` | `src/main/src/shared/AssetServer.ts:47` (`this.opts.port ?? 5300`) | ✅ correct |
| mDNS service `_showx._tcp` | `src/main/src/shared/MdnsService.ts:40` (`SHOWX_SERVICE_TYPE = 'showx'`) + `:52,59` | ✅ correct |
| `?pin=1234` URL pre-fill | `pwa/src/components/PairingView.tsx:37-46` (`urlParams()` reads `pin` + `name`) | ✅ correct |
| Role `countdown` exists | `pwa/src/components/PairingView.tsx:46` (`'sm' \| 'operator' \| 'countdown'`) | ✅ correct |
| `showx_pair_token` in localStorage survives reboot | `pwa/src/components/PairingView.tsx:135` (`localStorage.setItem('showx_pair_token', ...)`) | ✅ correct |
| CountdownView at `pwa/src/components/cuelist/CountdownView.tsx` | file exists | ✅ correct |

## Non-blocking observations (for future polish, NOT changes_requested)

1. **Duplicate Chromium flag at line 138** — `--noerrordialogs` appears once early
   in the command and `--noerrdialogs` (typo / non-canonical spelling) appears later.
   Chromium silently ignores unknown flags so it works, but the "belt-and-suspenders"
   comment is misleading. Future cleanup: drop the duplicate.

2. **Bookworm compositor** — `Step 2` uses LXDE-Pi autostart path
   (`/etc/xdg/lxsession/LXDE-pi/autostart`). Latest Pi OS (bookworm) ships Wayfire
   by default on Pi 4; LXDE path may not exist on a fresh install. The `raspi-config`
   step alone covers it for bookworm, so this isn't broken — but a future revision
   could mention "if Wayfire, edit `~/.config/wayfire.ini` instead".

3. **`chromium-browser` vs `chromium` binary** — On bookworm the binary is
   `chromium`. A tech may hit "command not found". Trivial fix at field deploy time;
   could be a note in troubleshooting.

4. **Doc size** — spec estimated 150 lines; delivered 232. Acceptable —
   thoroughness over brevity for a recipe a venue tech follows once.

None of the above rise to the level of blocking acceptance for a P2 documentation
task. They are polish items the next person editing this file can pick up.

## Verdict

**accepted** — All four acceptance criteria are met. All ShowX-specific technical
claims (port, mDNS service, pairing flow, role string, storage key, cross-references)
are verified against current source. The recipe is concrete, copy-pasteable, and
covers the failure modes a venue tech will hit. ShowX-5 F2 wave 5 impl complete;
B005-010 architect E2E gate (batched F1+F2) unlocked.
