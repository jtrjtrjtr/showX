# ShowX 0.1 — First Pilot Playbook

> **Status:** Production-ready
> **Audience:** XLAB pilot coordinator (Jindřich or Margaret)
> **When:** First 5 paid pilots, Q1 2027
> **Prerequisites:** ShowX 0.1 DMG signed + notarized (B003-023), PDF cue-sheet export functional (B003-019), CSV import functional (B003-017)

---

## 1. Pre-pilot prep (T-7 days)

### 1.1 Venue assessment

Contact the SM or venue tech and confirm all of the following before booking the install slot:

- **LAN:** Gigabit switch at FOH with at least 1 spare port; WiFi 5/6 AP within 20m of FOH (5GHz preferred)
- **FOH Mac:** macOS 13+ (Ventura), 8 GB+ RAM (M1+ recommended); admin login available
- **Station devices:** iPad 11" or 12.9" for SM (12.9" strongly preferred), iPad or laptop for each operator dept (LX, SX, VIDEO, etc.)
- **Consoles:** Record Eos / MA3 / Hog4 firmware versions; confirm OSC is enabled and the console IP is known
- **Network rules:** Ask venue IT to whitelist UDP 5300 and 5305 if there is a managed firewall or VLAN; mDNS must not be blocked
- **Time slots:** Book a 4h install window T-2 days before first performance; a 2h rehearsal run T-1 day; 30min pre-show check on performance day

### 1.2 Pre-install package

Send to SM at least 5 days before install day:

1. `ShowX_0.1.dmg` (link from showx.xlabproject.net)
2. `ShowX_0.1_QuickStart.pdf` (one-page guide)
3. `pre-pilot-checklist.md` (printed or PDF)
4. Walkthrough video link (Loom, unlisted)

### 1.3 Show-file prep

**Owner: Coordinator (Jindřich or Margaret)**

1. Ask SM to export their existing cue list as CSV from QLab, Eos, or equivalent
2. Run CSV import (B003-017 `csvImport`): `File → Import CSV → map columns → review compound cue inference`
3. Review department assignments — confirm LX / SX / VIDEO / AUTO mappings are correct
4. Save the resulting `.showx` package
5. Send `.showx` back to SM for review; collect corrections via email

---

## 2. Install day (T-2 days)

**Duration:** 4 hours
**On-site: coordinator (or remote support via Zoom)**

### 2.1 FOH Mac setup

1. Download `ShowX_0.1.dmg` from showx.xlabproject.net
2. Open DMG → drag ShowX to Applications
3. First launch: macOS will show Gatekeeper prompt — click **Open**
4. Grant **Network** and **Bonjour** permissions when macOS prompts (required for mDNS station discovery)
5. **File → Open** → select the pre-imported `.showx` package; verify cue list loads correctly
6. Confirm version badge in title bar reads `0.1`

### 2.2 Pairing stations

For each station device (SM iPad first, then operator stations):

1. On the station device, open **Safari** or **Chrome** → navigate to `http://showx.local:5300`
   - If mDNS resolves, the pairing page loads automatically
   - If not, use the FOH Mac IP directly: `http://[FOH-MAC-IP]:5300`
2. Tap **Pair this device**; scan the QR code displayed on the FOH shell, or enter the 6-digit PIN manually
3. Set display name (e.g., "SM iPad", "LX Console Laptop", "SX iPad") and role:
   - **SM:** role = `SM`, departments = `[SM]`
   - **LX operator:** role = `operator`, departments = `[LX]`
   - **SX operator:** role = `operator`, departments = `[SX]`
4. Repeat for all stations
5. Back on the FOH shell — verify all stations show a **green presence indicator** in the status strip

### 2.3 Initial smoke test

Run immediately after all stations are paired:

1. SM presses **Q** on cue 1 → verify **STANDBY** indicator appears on all paired operator stations
2. SM presses **Space** (GO) → verify:
   - Fire animation on SM view and all operator stations
   - Eos/MA3/Hog4 actually executes the cue (check console status screen)
   - Latency: GO press → console response < 100ms (acceptable; < 50ms ideal)
3. Test 2–3 more cues mixing LX and SX payloads
4. Test one cue with `auto_follow` trigger — verify next cue loads on standby without SM input
5. If any step fails, stop and troubleshoot before handing over to SM

**Common issues:**

| Symptom | Likely cause | Fix |
|---|---|---|
| Station not discoverable | mDNS blocked | Use IP instead of `showx.local`; flag IT |
| GO fires but console silent | OSC port wrong or IP mismatch | Check OutputDispatcher config → Settings |
| Station goes red after 30s | WiFi signal weak | Move AP or station closer |

---

## 3. Rehearsal day (T-1 day)

**Duration:** 2 hours
**Present:** SM + at least one operator (LX preferred)

### 3.1 Setup

1. Launch ShowX on FOH Mac → open `.showx`
2. All stations reconnect automatically (Bonjour) — verify green presence indicators
3. Confirm SM is in **REHEARSAL mode** (orange badge, not red SHOW badge)

### 3.2 Full cue list run

- SM advances through entire cue list in REHEARSAL mode
- Operators edit their dept's cues live as notes arise (REHEARSAL mode allows edits from any station)
- SM marks wrong or missing cues with **notes** in the cue editor
- Track latency: coordinator watches FOH shell + console simultaneously; note any cues with >200ms lag
- If a cue misfires or throws an error: note cue number + payload type + time; do not skip — fix or flag

### 3.3 End of rehearsal

1. SM does **File → Save** (or Cmd+S) — `.showx` package auto-saves to disk
2. SM does **Cmd+Q** to quit ShowX cleanly
3. Coordinator exports updated PDF cue sheets: **File → Export PDF → All departments** — **print 1 copy per operator NOW** (fallback backup for performance)
4. Coordinator sends XLAB the rehearsal log file: `~/Library/Logs/showx/showx-latest.log`

---

## 4. Performance day

**Duration:** Full show day; coordinator available by phone

### 4.1 Pre-show (T-60 min)

1. Launch ShowX → opens last `.showx`
2. SM verifies station presence: all stations green
3. SM sets standby on Q1 — confirms it appears on all operator stations
4. SM presses GO on Q1 → confirm console fires
5. SM presses **Lock Show** (or Cmd+Shift+L) → mode transitions to **SHOW** (red badge; editing locked)
6. SM confirms the red SHOW badge is visible on all station devices
7. Backup PDF cue sheets are on each operator's clipboard

### 4.2 During show

- SM calls show normally: arrow keys to advance standby, **Space** to GO
- Operators see their dept's cues; if `per_dept` cuelist is configured, operators can GO their own cues when called
- If a station goes offline (red indicator):
  - SM continues via SM iPad; no show interruption
  - Operator switches to printed PDF backup
  - Coordinator notified by text; do not interrupt show
- If SM iPad goes offline: SM switches to FOH Mac keyboard; FOH shell is always authoritative

### 4.3 Post-show

1. SM presses **Lock Show** again → SHOW → REHEARSAL (unlocks editing)
2. Verify snapshot was saved: check `~/Library/Application Support/ShowX/[show-id]/snapshots/`
3. Verify history: `~/Library/Application Support/ShowX/[show-id]/history.jsonl` — file should have entries from the performance
4. Coordinator sends debrief survey within 48h (see `post-pilot-debrief-template.md`)
5. Coordinator schedules follow-up call with SM within 5 working days

---

## 5. Fallback plan

> **This plan activates if ShowX fails to function during performance.**

**Trigger:** Any of the following during a live show:
- ShowX crashes and does not relaunch within 60s
- GO button stops firing OSC/MIDI for 2+ consecutive cues
- All operator stations go offline simultaneously
- SM's primary device fails and FOH Mac is also unreachable

**Steps:**

1. SM switches to **printed PDF cue sheets** (generated in step 3.3 above — kept on SM clipboard throughout show)
2. SM calls cues **verbally** over intercom/comms to each operator
3. Each operator runs their console **manually** from their own PDF page
4. Continue show — audience should not notice a tool change
5. Post-show: SM sends `~/Library/Logs/showx/` to Jindřich via `jindrich.trapl@xlab.cz` for debugging

> **Preparation is the fallback.** PDFs must be printed before the show starts (step 3.3 is mandatory, not optional).

---

## 6. Post-pilot

**Owner: Jindřich + Margaret**

1. Send `post-pilot-debrief-template.md` to SM within 48h of final performance
2. Schedule 15-min debrief call within 5 working days
3. Log results against `pilot-success-criteria.md`
4. Any bugs found → file in XLAB issue tracker with `showx-0.1-pilot` label
5. Any feature requests → add to ShowX backlog with `pilot-feedback` tag
6. If hard-pass criteria met → propose paid plan terms (pricing TBD per Jindřich post-feedback)
7. If hard-pass criteria not met → schedule root-cause call, fix, re-pilot if customer willing

---

## Appendix: Key file locations

| Item | Location |
|---|---|
| Show package | `~/Library/Application Support/ShowX/<show-id>.showx/` |
| History log | `…/<show-id>/history.jsonl` |
| Snapshots | `…/<show-id>/snapshots/` |
| App log | `~/Library/Logs/showx/showx-latest.log` |
| PDF exports | Last export path used (prompted on export) |

---

*Cross-references: B003-017 (CSV import), B003-019 (PDF export), B003-020 (multi-operator integration tests), B003-023 (ShowX 0.1 DMG release).*
