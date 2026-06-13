---
id: "B005-009"
title: "Pi kiosk recipe (docs)"
type: "docs"
estimated_size_lines: 150
priority: "P2"
bundle: "ShowX-5"
depends_on: ["B005-008"]
target_files:
  - "docs/RPI_COUNTDOWN_KIOSK.md"
acceptance_criteria:
  - "A clear setup guide docs/RPI_COUNTDOWN_KIOSK.md: turn a Raspberry Pi 4 + HDMI display into a ShowX countdown module. Covers: Pi OS (Lite + minimal X / or full), Chromium kiosk autostart pointed at the ShowX countdown station URL, how the Pi pairs as a 'countdown' role station over LAN (mDNS/URL + PIN), display rotation/resolution, auto-reconnect on network blip, and disabling screen blanking."
  - "Includes the exact kiosk launch command/flags (chromium-browser --kiosk --noerrordialogs --disable-session-crashed-bubble <url>) and a sample systemd/autostart snippet."
  - "Notes Kobbi's rationale (no heavy computer on stage; small box + big numbers) and that this is a 'supported recipe', not a shipped SD image (per design decision §7 / Q4 default)."
  - "Cross-linked from the countdown view section of the user guide if one exists; otherwise standalone."
---

## Context

Per design §C + decision §7. Kobbi wants a hardware countdown box on stage (Pi, not Arduino). Since the countdown view (B005-008) runs in any browser, a Pi in Chromium kiosk is the hardware module. This is documentation, not code.

## Implementation notes

- Pure docs. Be concrete and copy-pasteable. Assume the reader is a tech, not a Linux expert.

## Out of scope

- Shipping an SD image (deferred per design). Code (B005-008 owns the view).
