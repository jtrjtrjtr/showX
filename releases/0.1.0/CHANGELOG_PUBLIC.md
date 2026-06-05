# ShowX 0.1.0 — What's New

## Your entire show, one app

ShowX replaces BridgeX as XLAB's master FOH product. Version 0.1.0 ships the **Cuelist Core** module — a live cue list system built for multi-operator teams, with real-time collaboration, per-department views, and full hardware dispatch.

---

## New features

### Cuelist Core

**Multi-operator collaboration**
Multiple people can work on the same cue list simultaneously. The Stage Manager sees everything; each operator sees their department. Changes sync instantly across all stations via a conflict-free CRDT — no merge conflicts, no "who has the master file" problems.

**REHEARSAL / SHOW modes**
- **REHEARSAL** — the default. Everyone can edit. Cues can be added, changed, reordered.
- **SHOW** — SM locks the cuelist. Operators see a read-only view. Every locked state is snapshotted to history so you can always roll back.

**Compound cues**
One cue can carry payloads for multiple departments at once. Press GO once and LX fades, SX starts playback, and the video wall changes — all simultaneously.

**Smart trigger types**
- **Manual** — Space bar / GO button / Stream Deck button
- **Auto Follow** — automatically fires the next cue when the current one completes
- **Auto Continue** — same, but with a configurable delay

**GO event protection**
Every GO request has a unique ID. The system rejects duplicates and replays within a 5-second window — no accidental double-fire even on a laggy network.

### Station views (PWA — iPad, laptop, desktop)

Connect any tablet or laptop to ShowX via LAN. No app install required — just open the URL.

| Role | What they see |
|------|---------------|
| Stage Manager | Full cuelist, calling text, standby panel |
| LX op | Only lighting cues + cross-dept highlights |
| SX op | Only sound cues + cross-dept highlights |
| VIDEO op | Only video cues + cross-dept highlights |
| AUTO / PYRO / FS | Same pattern for their department |

### Import / export

- **CSV import** — paste in a QLab, Eos, or spreadsheet cue list; ShowX creates cues automatically
- **.showx export** — native format with atomic saves (if the file is corrupted, ShowX falls back to the JSON backup automatically)
- **PDF cue sheets** — export print-ready A4 sheets per department or SM master layout

### Hardware dispatch

ShowX sends cue data to your hardware via:
- OSC (ETC Eos, QLab, and any OSC-capable console)
- MIDI (note on/off, program change, MIDI Show Control)
- DMX (Art-Net, sACN — via EventX Bridge)

### Stream Deck integration

Install the `showx-companion` Bitfocus Companion module and assign GO, standby advance, and cue jump to any Stream Deck button.

---

## Known limitations in 0.1

We've shipped the core of ShowX. A few things are on the roadmap but not in 0.1:

- **SHOW mode proposal queue** — operators can't suggest edits during show lock yet (0.2)
- **Cloud Sync** — remote backup and multi-venue sync coming in 0.4
- **Custom Router** — advanced rule-table routing coming in 0.5
- **Timecode triggers** — LTC and MTC in 0.4
- **Direct DMX from cuelist** — use EventX Bridge path for now; native in 0.3
- **Auto-update** — for now, download the new DMG manually

---

*ShowX 0.1.0 — June 2026 — XLAB s.r.o.*
