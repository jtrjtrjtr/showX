# ShowX site content brief — v0.7.0 (for testers)

> Authoritative inventory + canonical CZ/EN terminology for updating showx.xlabproject.net (apps/marketing).
> Goal (Jindřich 2026-06-14): a FULLY-VALUABLE site for TESTERS — all existing features documented, extended docs + scenarios, complete install guide. "Final product description" minus EventX integration.

## HARD RULES
1. **NO EventX integration / EventX Bridge.** Jindřich: don't discuss EventX integration yet. Remove "EventX Bridge" as a featured module. (It's F5, not built.) If mentioned at all → a one-line "on the roadmap", not a feature.
2. **Version = v0.7.0 internal preview.** Update every stale "v0.5", "Foundation 13/13", "cuelist UI lands Q1 2027" — the cuelist UI + much more is BUILT now. Still internal/for testers, not public sale.
3. Bilingual CZ + EN everywhere (match existing dict/data-structure pattern in each file). Preserve each page's existing structure + style; EXTEND, don't rewrite from scratch.
4. Use the EXACT canonical terms below (CZ/EN) so all pages are consistent.
5. Audience = testers: concrete, accurate, how-to. Honest about what needs hardware/keys.

## What is ShowX (one-liner)
- CZ: "LAN-first FOH show-control na Macu — cuelist, timecode, cue lights a AI showcaller. Stanice běží v prohlížeči, žádná instalace pro operátory."
- EN: "LAN-first FOH show control on a Mac — cuelist, timecode, cue lights and an AI showcaller. Stations run in any browser, zero install for operators."

## FEATURE INVENTORY (everything BUILT, v0.7.0)

### A. Cuelist Core (Free)
- Multi-operator cuelist, one shared show doc, per-department views (LX/SX/VIDEO/PYRO/FS/AUTO), REHEARSAL ↔ SHOW mode, compound cues (one cue, multiple department payloads).
- **Payloads (authorable in the browser):** OSC, MIDI, MSC (MIDI Show Control), DMX (Art-Net + sACN), webhook, wait, group, lx_ref (console cue ref: Eos/MA3/ChamSys/Hog).
- **Triggers:** manual GO, auto-follow (after previous completes), auto-continue (delay), timecode, hotkey (key binding).
- **Timing:** pre-wait, duration, live countdown in the row + elapsed/remaining header.
- **GO ergonomics:** armed green border, Back (uses target cue timing), hold-to-GO in SHOW, panic. **Disarm** (skip a cue, keep the chain). **Audition / preview GO** (fire a cue with NO real output — see what it would send).
- Inline editing, decimal cue numbers, cue authoring (add/insert/delete/drag) in the browser.
- Stations: PWA in any browser (iPad/Mac/Win), mDNS discovery, QR + PIN pairing, local-first (Yjs CRDT) — run the show even if Wi-Fi drops.
- CZ terms: cue / cuelist, oddělení, REHEARSAL/SHOW režim, payload, trigger, pre-wait (před-čekání), disarm (odjištění), audition (náhled GO).

### B. Time layer
- **Master clock** (internal free-run) — one source for everything.
- **Big timecode display** (HH:MM:SS:FF) on ALL views — SM, operator, shell, countdown.
- **MTC** (MIDI Time Code) chase IN + generate OUT.
- **LTC** (Linear/SMPTE audio timecode) chase IN + generate OUT. *(needs an audio interface; live-signal lock validated on hardware)*
- **Timecode-triggered cues** (fire when the clock crosses a TC).
- **Show-time OSC broadcast** (drive external displays/automation).
- **Countdown-only view** — giant digits for a wall display; runs on a Raspberry Pi in a Chromium kiosk (recipe in docs).
- CZ: hlavní hodiny, timecode/časový kód, MTC/LTC chase (sledování) + generování, odpočtová stanice.

### C. Trust & Safety
- **Per-device health** (green/red) in Routing + stations — from real dispatch outcomes.
- **Device feedback** (confirmed state via OSC reply, where the gear supports it — Eos/QLab).
- **Multi-destination patch** (primary + backup; failover).
- **Pre-show health check wizard** (devices reachable? assets present? stations paired?).
- **Cue lights protocol** — SM sends STANDBY to a department → operator station shows a big STANDBY + ACKNOWLEDGE → SM sees who's ready → GO. (Software cue lights — ETC's CueSystem is discontinued; this is the modern replacement.)
- **SHOW-mode proposals** — operators propose edits during a locked SHOW; SM reviews/accepts.
- **Per-operator authority** — who may GO what (SM vs per-department).
- CZ: zdraví zařízení, potvrzený stav, primární+záložní cíl, předshow kontrola, cue lights (standby→potvrzení→GO), návrhy změn v SHOW, oprávnění operátorů.

### D. AI Showcaller (Pro+) — the differentiator
- **Caller script per cue** (per-department standby + go text).
- **Generate from the sheet** — deterministic template + aggregation of simultaneous marks ("Lights, pyro, sound — standby… GO"). Optional **LLM draft** (Claude) for natural phrasing — always editable.
- **Voice clone** (ElevenLabs) — the showcaller's own voice. *(needs an ElevenLabs API key)*
- **Rehearsal pre-generation** → audio frozen into the .showx package → **local playback at show** (no internet, no latency — LAN-first).
- **Interrupt** — big TAKE OVER / MUTE, cuts the AI in <200 ms so the showcaller speaks live.
- **Intercom out** — caller voice routed to a chosen audio device (intercom).
- Key insight: cue lights and the AI caller are the SAME data — one shown as light, one spoken.
- CZ: AI showcaller, caller script/hlášky, generování ze scénáře, agregace souběžných marků, klonování hlasu, předgenerování při zkoušce, lokální přehrávání, interrupt (převzetí), intercom výstup.

### E. Protocols I/O (reference)
OSC (out+in), MIDI (out+in), MSC, DMX Art-Net, DMX sACN, webhook (out+in), MTC (in+out), LTC (in+out), mDNS discovery. Routing UI maps payloads → devices; per-device health.

### F. Import / Export
CSV import (QLab + Eos dialects, incl. pre-wait/post-wait mapping), JSON export, PDF export, open `.showx` package (Yjs doc + cuelists + snapshots + media + history).

## TIERS (keep from Pricing, don't invent)
Free (cuelist + 1 REHEARSAL) · Pro ($29/seat/mo, all modules + multi-op + SHOW) · Production ($99/show) · Team ($499/mo). AI Showcaller = Pro+.

## INSTALL GUIDE (testers) — must be on the site
1. Download `ShowX-0.7.0-arm64.dmg` (Apple Silicon Mac). It's UNSIGNED (internal) → first open: right-click → Open, or `xattr -dr com.apple.quarantine /Applications/ShowX.app`.
2. Drag ShowX to Applications.
3. Launch. For testing, a fixed pairing PIN: launch with `SHOWX_PAIRING_TEST_PIN=000000` (terminal) → PIN 000000 never expires.
4. Open a show (demo show included) or create one.
5. On another device (or browser tab), open the station URL shown in ShowX (mDNS / LAN IP), scan QR or enter the PIN, pick a role (SM / operator / countdown).
6. Optional keys: ElevenLabs (AI voice), Anthropic (LLM draft) — set in app; without them those features gracefully disable.
7. Verify OSC on the wire: `nc -ul 7000`. DMX: Art-Net/sACN capture. 
- Note: signed/notarized build + full LTC hardware validation are pending.

## SCENARIOS to cover (concrete walk-throughs)
1. **Theatre cue calling with cue lights** — SM calls standby to LX/SX, operators acknowledge on phones, GO. (+ optional AI showcaller voicing it.)
2. **Timecode-locked show** — ShowX chases incoming LTC/MTC from a video server; cues fire on timecode automatically; countdown view on stage.
3. **AI showcaller rehearsal → show** — write caller scripts, generate from sheet, pre-gen voice at rehearsal, run the show with the AI calling standby/go, interrupt when going off-script.
4. **Corporate AV with redundancy** — multi-destination primary+backup to two media servers, pre-show health check, device health monitoring.
5. **Festival / multi-operator** — per-department views, multiple operators on browser stations over LAN, SM master, disarm risky cues, audition before the doors open.
6. **Cross-platform booth** — QLab-style cuelist but Windows/iPad operators (browser stations), CSV import from an existing QLab/Eos sheet.

## STATUS framing
v0.7.0 internal. Built across F1 (operator essentials) → F2 (time) → F3 (trust + cue lights) → F4 (AI showcaller) → LTC. ~2240 tests. For testers / preview, not public sale. Public 1.0 target later (roadmap: rundown layer, pricing live, product web).
