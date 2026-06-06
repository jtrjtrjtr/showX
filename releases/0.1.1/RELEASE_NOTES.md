# ShowX 0.1.1 — first usable beta

**Released 2026-06-07.** macOS Apple Silicon (arm64), unsigned. ~96 MB.

This is the release that turns ShowX from "shows the UI" into "you can open a show and fire cues at hardware." If you tried 0.1.0 and bounced on the blank empty panel, **this is the one to install.**

## What's new since 0.1.0

### 🎬 Demo show + first-launch picker
Open the app and you see three big cards: **Open Demo Show** / **Open Existing** / **New From Scratch**. The Demo card opens a 25-cue sample show with three departments (LX/SX/VIDEO), one compound cue (multi-dept), one group cue (parallel fire), three sample OSC devices, and routing rules wired up. You're driving cues in 60 seconds.

The demo is copied to `~/Documents/ShowX/Demo Show.showx` on open so you can edit it without affecting the bundled fixture.

Subsequent launches show your last 5 shows + the three buttons as pills.

Native macOS File menu wired: `Open Demo Show`, `Open…` (Cmd+O), `Open Recent →`, `New Show…` (Cmd+N).

### 🔌 Routing + Devices UI
Cuelist Core panel now has three tabs: **Show / Devices / Routing**.

- **Devices tab** — full CRUD for hardware endpoints (OSC, MIDI, MSC, DMX). Driver dropdown for OSC (Eos, MA3, Hog4, ChamSys, QLab). Test button sends a no-op packet to verify connectivity. Cascade-delete warning if routing rules reference the device.
- **Routing tab** — drag-handle priority reordering, match builder (payload type + tag pattern + device id), target device dropdown. Auto-rule is created when you add a device (smooths empty-state).

No more JSON editing to configure hardware.

### 🎯 Real-time playhead broadcast
SM moves the cursor → **operators see it in real time** on their PWAs.

Playhead state moved from local React state to Yjs awareness:
- SM-role station is the authority (writer)
- Operators are readers — `setPlayhead` from a non-SM station throws `NotAuthorityError`
- Rate-limited 10 Hz (no awareness storm from arrow-key spam)
- SM disconnect → playhead "freezes" with on-screen "SM offline" indicator
- Determined lowest-clientID fallback if no SM connected (stations don't disagree about which playhead to render)

This was the headline feature breaking before. Now it works.

## Known limitations

| Area | What |
|---|---|
| Routing dispatcher | The Routing UI saves rules in the new shape, but `dispatch/resolveRouting.ts` still reads the old shape. **Net effect:** rules created via Routing UI render correctly in the table but don't actually route to hardware yet. Old hand-coded routing rules continue to work. Fix incoming in 0.1.2. |
| cuelist-core IPC | The Open/New buttons in CuelistCorePanel may not yet wire through main process IPC (pre-existing gap). Use the File menubar (Cmd+O / Cmd+N) — that path is verified. |
| Demo devices | Built into a code constant, not in the bundled `demo.showx` JSON. They're available for routing UI but show as "Devices" entries via code, not via the JSON loader. Cosmetic; doesn't block use. |
| PDF Czech | Latin-1 only — Czech diacritics fall back to ASCII (`š → s`, `ě → e`). Subset font embedding in 0.2. |
| Signing | Still unsigned. Gatekeeper bypass required on first launch (right-click → Open, or `xattr -dr com.apple.quarantine /Applications/ShowX.app`). |
| macOS only | Apple Silicon only (arm64). Intel + Windows + Linux later. |
| Webhook | UI editor works but dispatch is a stub. Full impl in 0.2. |
| Timecode | UI present, dispatch logs "deferred to 0.2". |

## Install

1. Download `ShowX-0.1.1-arm64.dmg`
2. Open DMG → drag `ShowX.app` into `/Applications`
3. **First launch:** right-click `ShowX.app` → **Open** → confirm in dialog. Standard double-click is blocked by Gatekeeper.
4. Alternatively from Terminal: `xattr -dr com.apple.quarantine /Applications/ShowX.app`

## Pair an iPad as a station

1. Make sure iPad is on the same LAN as the Mac
2. Safari on iPad → `http://<mac-ip>:5300/pair`
3. In ShowX panel on Mac: **Add station** → pick role
4. Mac shows 6-digit PIN → enter on iPad
5. Name the station, choose departments, done

## How to report

- **GitHub Issues:** [github.com/jtrjtrjtr/showX/issues](https://github.com/jtrjtrjtr/showX/issues)
- **User guide:** [showx.xlabproject.net/guide](https://showx.xlabproject.net/guide)

Please include: macOS version, ShowX version (About menu), reproduction steps, last 100 lines of `~/Documents/ShowX/<show>.showx/history.jsonl`.

## Cumulative since 0.1.0

- **+3 new modules** to Cuelist Core (Devices, Routing, FirstLaunchPicker)
- **+~2000 LOC** source + tests
- **+~190 new tests** (cuelist-core unit + PWA + main process)
- **+1 IPC handler set** for show actions
- **+1 demo `.showx` fixture** bundled at `Resources/demo-show/`
- **+1 native File menu** wired through IPC

ShowX is now demo-ready. Open it, click "Open Demo Show", press Q + Space → GO. Workflow visible in 60 seconds.
