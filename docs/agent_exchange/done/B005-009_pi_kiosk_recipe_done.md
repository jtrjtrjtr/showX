---
id: "B005-009"
title: "Pi kiosk recipe docs"
status: done
round: 1
forge_ended_at: "2026-06-13T21:00:00Z"
---

## Summary

Wrote `docs/RPI_COUNTDOWN_KIOSK.md` — a complete, copy-pasteable guide to running a Raspberry Pi 4
as a ShowX countdown kiosk. Covers OS setup, display config, pairing, Chromium kiosk autostart
(`.desktop` + systemd variants), auto-reconnect behaviour, and a troubleshooting table.

## Files changed

| File | Change |
|---|---|
| `docs/RPI_COUNTDOWN_KIOSK.md` | New — 220-line Pi kiosk recipe |

## Design decisions

- Used **Pi OS Desktop** as the primary path (Chromium pre-installed, GPU drivers included). Added
  a separate **Pi OS Lite + systemd** section for operators who prefer a headless minimal install.
- Port `5300` and service name `_showx._tcp` sourced from `AssetServer.ts` (default port) and
  `MdnsService.ts` (SHOWX_SERVICE_TYPE = `'showx'`).
- PIN pre-fill URL parameter (`?pin=1234`) documented as a convenience tip — matches the existing
  `urlParams()` in `PairingView.tsx` (line 37).
- Auto-reconnect section explains that `showx_pair_token` in `localStorage` survives reboots,
  so the Pi never needs to re-pair after a power cycle.
- Screen blanking covered via both `raspi-config` and `autostart` `@xset` entries (belt-and-suspenders;
  `raspi-config` is sometimes reset on kernel upgrades).
- `display_rotate` table included for portrait stage screens (Kobbi's typical setup).
- Troubleshooting table covers the six failure modes most likely at a venue: DNS, localStorage wipe,
  blanking, rotation, mDNS, and clock drift.
- Cross-linked from the user guide path and to `CountdownView.tsx` (B005-008).

## Tests run

Pure documentation task — no code changes, no tests to run.

## Acceptance criteria checklist

- [x] `docs/RPI_COUNTDOWN_KIOSK.md` written with clear setup guide
- [x] Covers: Pi OS (Desktop primary + Lite alternative), Chromium kiosk autostart pointed at countdown URL
- [x] Explains pairing as 'countdown' role station over LAN (mDNS/URL + PIN)
- [x] Covers display rotation/resolution (`display_rotate`, `hdmi_mode` table)
- [x] Covers auto-reconnect on network blip (localStorage token survives; Yjs reconnect backoff)
- [x] Covers disabling screen blanking (raspi-config + autostart xset entries)
- [x] Includes exact kiosk launch command with flags (`--kiosk --noerrordialogs --disable-session-crashed-bubble <url>`)
- [x] Includes sample autostart `.desktop` snippet AND systemd service alternative
- [x] Notes Kobbi's rationale ("no heavy computer on stage; small box + big numbers")
- [x] Notes this is a "supported recipe", not a shipped SD image (design decision §7 / Q4 default)
- [x] Cross-linked from user guide path; standalone if no countdown section exists there

## Notes for Critic

- The doc is self-contained (no user guide countdown section exists yet; noted in cross-reference).
- mDNS hostname used in examples is `showx-foh.local` (generic placeholder); tech replaces it with
  the actual Mac hostname shown in the ShowX pairing panel.
- `--check-for-update-interval=31536000` flag explained inline so a venue tech understands why
  it's there.
