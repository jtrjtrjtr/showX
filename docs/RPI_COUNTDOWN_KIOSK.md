# Raspberry Pi Countdown Kiosk — ShowX Supported Recipe

> **What this is:** A step-by-step guide to turning a Raspberry Pi 4 + HDMI display into a ShowX
> countdown station. The Pi runs Chromium in kiosk mode pointed at the ShowX countdown view.
>
> **What this is not:** A pre-built SD image. This is a "supported recipe" — tested steps you
> follow once per Pi. (Shipping a signed SD image is deferred per design decision §7 / Q4 default.)
>
> **Rationale (Kobbi's words):** "No heavy computer on stage. Small box, big numbers."

---

## Requirements

| Item | Notes |
|---|---|
| Raspberry Pi 4 (2 GB RAM minimum) | Pi 5 also works |
| HDMI display (any resolution, any size) | Typical: 32–55" TV on stage, or 15" monitor on SM desk |
| MicroSD card, 8 GB+ | Class 10 / A1 recommended |
| LAN cable or 5 GHz Wi-Fi | Wired strongly preferred on stage |
| FOH Mac running ShowX | Must be on the same LAN segment |

---

## Step 1 — Flash Raspberry Pi OS

Use **Raspberry Pi OS (32-bit) with Desktop** (bookworm or later).  
*Why Desktop and not Lite:* Chromium is pre-installed; avoids manual X11 + GPU driver setup.

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/).
2. Select `Raspberry Pi OS (32-bit)` → write to SD card.
3. Before writing, open the gear icon in Imager and set:
   - Hostname: `showx-countdown` (so it appears on the LAN as `showx-countdown.local`)
   - Enable SSH (optional, useful for remote fixes)
   - Set your Wi-Fi SSID + password if not using a cable
4. Insert SD card, power on, complete the first-boot wizard.

---

## Step 2 — Disable screen blanking and power saving

Open a terminal on the Pi (or SSH in):

```bash
sudo raspi-config
```

Navigate to:
- **Display Options → Screen Blanking → No**

Then add these lines to `/etc/xdg/lxsession/LXDE-pi/autostart` to be sure:

```
@xset s off
@xset -dpms
@xset s noblank
```

---

## Step 3 — Set display rotation and resolution (if needed)

Edit `/boot/config.txt` (or `/boot/firmware/config.txt` on bookworm):

```ini
# Force 1080p at 60 Hz — remove or adjust if your display is different
hdmi_group=1
hdmi_mode=16

# Rotate display 90° clockwise (portrait, tall stage screen) — remove if landscape
display_rotate=1
```

Common `hdmi_mode` values:

| Mode | Resolution |
|---|---|
| 4 | 720p 60 Hz |
| 16 | 1080p 60 Hz |
| 97 | 4K 30 Hz |

Reboot after changes: `sudo reboot`

---

## Step 4 — Find the ShowX station URL

On the **FOH Mac**:

1. Open **ShowX** → the shell shows the mDNS name and port in the pairing panel (e.g. `showx-foh.local:5300`).
2. The URL you need is:
   ```
   http://<foh-hostname>.local:5300
   ```
   Replace `<foh-hostname>` with what ShowX shows (often the Mac's computer name + `.local`).

If mDNS doesn't resolve on your network, use the Mac's LAN IP address instead:
```
http://192.168.1.42:5300
```
(Find it with `System Settings → Network → details → IP Address` on the Mac.)

---

## Step 5 — Pair the Pi as a Countdown station

**First time only** — the Pi needs a PIN from ShowX.

1. Open ShowX on the FOH Mac → go to the **Pairing** panel → note the 4-digit PIN shown there.
2. On the Pi, open Chromium manually (start from the desktop) and navigate to the URL from Step 4.
3. The ShowX pairing screen appears. Enter the PIN, choose **Role: Countdown display**.
4. The Pi now shows the full-screen countdown view.
5. The session is stored in browser `localStorage` — after this first pairing, the Pi reconnects
   automatically without re-entering the PIN.

> **Tip:** If you pass the PIN in the URL, the pairing screen pre-fills it:
> ```
> http://showx-foh.local:5300/?pin=1234
> ```

---

## Step 6 — Kiosk autostart

Create the autostart file so Chromium launches on boot in kiosk mode:

```bash
mkdir -p /home/pi/.config/autostart
nano /home/pi/.config/autostart/showx-kiosk.desktop
```

Paste this content (replace the URL with yours from Step 4):

```ini
[Desktop Entry]
Type=Application
Name=ShowX Countdown Kiosk
Exec=chromium-browser --kiosk --noerrordialogs --disable-session-crashed-bubble --disable-infobars --check-for-update-interval=31536000 --noerrdialogs --start-maximized http://showx-foh.local:5300
X-GNOME-Autostart-enabled=true
```

> **Key flags explained:**
> - `--kiosk` — full-screen, no address bar, no exit gesture
> - `--noerrordialogs` + `--disable-session-crashed-bubble` — suppresses the "Chromium didn't
>   shut down correctly" dialog after a power-cut
> - `--check-for-update-interval=31536000` — disables Chromium's auto-update check (1 year TTL)
> - `--noerrdialogs` — belt-and-suspenders on error dialogs

Reboot to test:

```bash
sudo reboot
```

The Pi should boot directly into the countdown view, no desktop visible.

---

## Auto-reconnect behaviour

ShowX's countdown view handles network blips automatically:

- The PWA's Yjs layer reconnects to the ShowX sync broker (WebSocket) with exponential backoff.
- The session token (`showx_pair_token` in `localStorage`) survives reboots — the Pi does not
  need to re-pair after a network interruption or power cycle.
- If the FOH Mac restarts and gets a new show, the Pi re-syncs within seconds of the Mac coming
  back online.
- If the LAN is down for more than ~30 s, the countdown view shows a connection-lost indicator
  (grey dimmed state); it recovers automatically when LAN is restored.

No manual intervention needed for normal network blips.

---

## Systemd alternative (headless / Pi OS Lite)

If you prefer Pi OS Lite + minimal X:

```bash
sudo apt install --no-install-recommends xserver-xorg xinit chromium-browser
```

Create `/etc/systemd/system/showx-kiosk.service`:

```ini
[Unit]
Description=ShowX Countdown Kiosk
After=network-online.target
Wants=network-online.target

[Service]
User=pi
Environment=DISPLAY=:0
ExecStartPre=/bin/sleep 5
ExecStart=/bin/bash -c 'xinit /usr/bin/chromium-browser --kiosk --noerrordialogs \
  --disable-session-crashed-bubble \
  http://showx-foh.local:5300 \
  -- :0 vt7'
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable showx-kiosk
sudo systemctl start showx-kiosk
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Chromium shows "This site can't be reached" | Check the FOH Mac is running ShowX + same LAN segment. Try the IP address instead of `.local`. |
| Pairing screen asks for PIN every boot | The Pi's Chromium lost `localStorage` — check Chromium is not in guest mode; disable "Clear cookies on exit" if set. |
| Screen goes black after a few minutes | Confirm Step 2 (disable blanking) was applied and the `autostart` entries were saved. |
| Display is rotated wrong | Adjust `display_rotate` in `/boot/config.txt` (0=normal, 1=90°CW, 2=180°, 3=90°CCW). |
| mDNS name `showx-foh.local` doesn't resolve | Use the IP address, or install `avahi-daemon` on the Pi: `sudo apt install avahi-daemon`. |
| Clock shows wrong time | `sudo timedatectl set-ntp true` on the Pi. ShowX clock is synced from the FOH Mac, but system time affects NTP-dependent features. |

---

## Cross-reference

- **Countdown view implementation:** `pwa/src/components/cuelist/CountdownView.tsx` (B005-008)
- **Pairing flow:** `docs/specs/pairing_auth.md`
- **User guide:** `docs/USER_GUIDE_cues_devices_routing.md`
