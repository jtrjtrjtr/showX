---
id: "B003-022"
title: "First paid pilot deployment — playbook + customer comms drafts"
type: "docs"
estimated_size_lines: 300
priority: "P1"
depends_on: ["B003-020"]
target_files:
  - "docs/migration/first-pilot-playbook.md"
  - "docs/customer-comms/pilot-outreach-theatre.md"
  - "docs/customer-comms/pilot-outreach-corporate-av.md"
  - "docs/customer-comms/pre-pilot-checklist.md"
  - "docs/customer-comms/post-pilot-debrief-template.md"
  - "docs/customer-comms/pilot-success-criteria.md"
acceptance_criteria:
  - "`first-pilot-playbook.md` documents: pre-pilot venue prep (network, FOH Mac, station iPads), install steps (DMG download + first launch), pairing (SM iPad + 2-3 operator stations), show file creation/import, rehearsal day-1 sequence, performance day sequence, fallback plan if ShowX fails"
  - "Theatre outreach email draft: addressed to SM at named theatre, mentions Q3 BridgeX customer relationships, offers free 0.1 deployment in exchange for feedback, names Jindřich as point of contact"
  - "Corporate AV outreach email: similar but framed for conference / event AV producer audience"
  - "Pre-pilot checklist: 15-point list — venue network speed test, FOH Mac specs, station device inventory, existing cue list export, console firmware versions, OSC port access, time slot for install + test"
  - "Post-pilot debrief template: 12-question survey covering install difficulty, learnability, multi-op collaboration value, missing features, bugs, NPS, would-recommend, willingness-to-pay"
  - "Success criteria: 3 concrete metrics — 1 successful rehearsal completed, 1 successful performance run, ≥7/10 NPS from SM + ≥1 operator"
  - "Fallback plan: if ShowX hard fails during show, operators switch to printed PDF cue sheets (B003-019) + verbal comms — no broken show"
  - "Architect-led, not Forge production code — this is a content task: well-organized markdown + ready-to-send email drafts"
  - "Cross-reference: mention dependency on ShowX-1+2+3 acceptance, ShowX 0.1 DMG ready (B003-023)"
---

## Context

The first paid pilot is what turns ShowX from "we built a thing" into "someone paid us to use it". This task delivers the playbook + customer comms so Jindřich + Margaret can convert the existing BridgeX customer pipeline into ShowX pilot bookings post-0.1 release.

Forge is mostly typing markdown here — but the content needs to be production-grade. Jindřich uses these emails verbatim with real customers; the playbook is read at the venue during install. Tone matters: warm, professional, technically credible.

## Implementation notes

### Playbook structure

```markdown
# ShowX 0.1 — First Pilot Playbook

> **Status:** Production-ready
> **Audience:** XLAB pilot coordinator (Jindřich or Margaret)
> **When:** First 5 paid pilots Q1 2027

## 1. Pre-pilot prep (T-7 days)

### Venue assessment
- Confirm venue LAN is gigabit + has at least 1 spare port + WiFi 5/6 AP for stations
- Confirm FOH Mac specs: macOS 13+ (Ventura), 8GB+ RAM
- Inventory stations: iPads (12.9" preferred for SM), laptops for ops
- Confirm consoles: Eos / MA3 / Hog4 firmware versions
- OSC port access — request IT to whitelist UDP 5300, 5305

### Pre-install ZIP
Send: ShowX 0.1 DMG, PDF guide, pre-pilot checklist, video walkthrough link

### Show file prep
- Customer exports current QLab/Eos cue list → CSV
- Coordinator runs B003-017 csvImport → generates initial .showx
- Coordinator reviews compound cue inference, dept mapping
- Send back .showx for customer review

## 2. Install day (T-2 days)

### FOH Mac setup
1. Download DMG from showx.xlab.cz
2. Drag to Applications
3. First launch — accept macOS Gatekeeper warning (signed but not first-launched)
4. Grant Network + Bonjour permissions when prompted
5. Open imported .showx file

### Pairing stations
1. SM iPad: open Safari → http://showx.local:5300/pairing → scan QR or enter PIN
2. Set display name "SM iPad", role "SM", departments=[SM]
3. Repeat for LX laptop (departments=[LX]) and SX iPad (departments=[SX])
4. Verify presence indicators on FOH shell — all 3 stations green

### Initial smoke test
1. SM: press Q on cue 1 → standby appears on all stations
2. SM: press Space → GO fires; operator stations see fire animation
3. Verify Eos console fired the cue (check Eos status)
4. Repeat for 3 cues mixing LX + SX

## 3. Rehearsal day (T-1 days)

- Run full cue list in REHEARSAL mode
- Allow operators to edit own cues live
- SM marks any wrong cues with notes
- Track latency: GO press → cue fired on console should be <100ms
- End of rehearsal: SM exits ShowX cleanly (Cmd+Q)

## 4. Performance day

### Pre-show
1. Launch ShowX → opens last .showx
2. SM checks station presence: all green
3. SM clicks "LOCK SHOW" → mode goes to SHOW (red badge)
4. SM does pre-show check: standby Q1, GO, verify console fires

### During show
- SM calls show as normal; arrow keys / Q / Space
- Operators see their dept's cues, monitor + GO if cuelist is per_dept
- If a station goes red (offline): SM continues via SM iPad; backup paper sheet ready

### Post-show
- SM clicks LOCK SHOW again → SHOW → REHEARSAL → unlock
- Snapshot retained in `.showx/snapshots/`
- History.jsonl audit trail saved

## 5. Fallback plan

If ShowX fails during performance:
1. SM switches to PDF cue sheets printed from B003-019 (kept on clipboard)
2. SM calls cues verbally over comms
3. Operators run their consoles manually per PDF
4. Post-show: send `~/Library/Logs/showx/` to XLAB for debugging

## 6. Post-pilot

Send debrief survey within 48h (post-pilot-debrief-template.md).
Schedule follow-up call with SM within 5 working days.
```

### Theatre outreach email

```
Subject: ShowX 0.1 — free pilot for [Theatre name]?

Ahoj [SM name],

We've been working on something new at XLAB — a cuelist app that runs on your FOH Mac with iPad stations for ops, per-department views, and REHEARSAL/SHOW mode. Think QLab meets Slack meets Eos cue list, designed for the way you actually run shows.

We shipped 0.1 last week. It's signed, notarized, runs offline, and is genuinely usable today.

I'd like to offer [Theatre name] a free pilot — we install it on your FOH Mac, set up your iPads, import your existing cue list, and you run it through one production. Free of charge in exchange for honest feedback. We're picking 3-5 venues for this round.

What would it take to get a look? I can demo over Zoom this week, or come in person if you're in [region].

Best,
Jindřich Trapl
Founder, XLAB s.r.o.
jindrich.trapl@xlab.cz
+420 [number]
```

### Corporate AV outreach

```
Subject: ShowX 0.1 — multi-operator cue control for [Event company]

Hi [AV producer],

We've launched ShowX 0.1 — a Mac-based cue control system designed for corporate AV. Single FOH operator + multiple roaming techs on iPads, each with their own filtered view of the show. Works with Disguise, Resolume, QLab, and any OSC console.

The pitch: stop screen-sharing your master cue list. Each operator gets their own view; SM still authors the calls.

We're running 3-5 free pilots in Q1 2027 in exchange for feedback. If you have a corporate show coming up — anything from a product launch to a multi-day conference — I'd love to install it for you and run it through one event.

15-min Zoom this week?

Best,
Jindřich Trapl
XLAB s.r.o.
```

### Pre-pilot checklist

```markdown
# Pre-pilot checklist

## Venue
- [ ] Gigabit LAN available at FOH
- [ ] Spare ethernet port for FOH Mac
- [ ] WiFi 5/6 AP within 20m of FOH (5GHz)
- [ ] WiFi password shared with XLAB
- [ ] No corporate firewall blocking mDNS / UDP 5300 / 5305

## Hardware
- [ ] FOH Mac: macOS 13+ (Ventura), 8GB+ RAM, M1+ recommended
- [ ] SM device: iPad 11" or 12.9" (12.9" recommended)
- [ ] Operator devices: iPad or laptop, modern Safari/Chrome
- [ ] LX console: Eos / MA3 / Hog4 + firmware version recorded
- [ ] OSC connectivity verified (ping from FOH Mac to console IP)

## Show data
- [ ] Existing cue list exported as CSV (QLab / Eos format)
- [ ] Cue list reviewed for dept assignments
- [ ] Sample standby notes recorded for 5+ cues

## Time
- [ ] 4h install slot booked T-2 days before performance
- [ ] 2h rehearsal slot T-1 day
- [ ] SM available for 30min pre-show test on perf day

## Comms
- [ ] SM has XLAB Telegram/SMS number for emergency
- [ ] Backup PDF cue sheets printed (1 per operator)
- [ ] Post-pilot debrief scheduled within 48h
```

### Success criteria

```markdown
# Pilot success criteria

## Hard pass
- [ ] 1 complete rehearsal with no ShowX-caused fire failures
- [ ] 1 complete performance with no ShowX-caused fire failures
- [ ] SM NPS ≥ 7/10
- [ ] ≥ 1 operator NPS ≥ 7/10

## Soft pass (bonus)
- [ ] Customer expresses interest in paid plan
- [ ] Customer agrees to be reference for next pilot
- [ ] Customer commits to second production with ShowX

## Failure
- Any ShowX crash during performance → root cause + bug ticket
- Any cue mis-fire attributable to ShowX → root cause + bug ticket
- NPS < 5/10 → exit interview to understand why

Success = at least 3 of 5 pilots hard-pass.
```

### Debrief template

```markdown
# Post-pilot debrief

**Pilot:** [Venue / Customer]
**Production:** [Show name]
**Dates:** [rehearsal / perf dates]
**SM:** [name]
**Operators:** [LX, SX, etc.]

## Questions (15 min call)

1. Install: easy / okay / hard? Specifics?
2. Pairing stations: any friction?
3. SM master view: did you find what you needed?
4. Operator views: did ops find their cues quickly?
5. REHEARSAL mode editing: who edited what? Confusion?
6. SHOW mode lock: did it feel right?
7. GO authority: any miscalled GOs? Any rejected that should have fired?
8. Multi-operator collab: when did you feel the value? When did it feel in the way?
9. Latency: any noticeable lag between press and console fire?
10. Crashes / bugs: list them.
11. Missing features (top 3)?
12. NPS — 0-10, would you recommend ShowX to a fellow SM?
13. Pricing — what feels fair monthly?
14. Open feedback: anything not covered.
15. Reference — would you take a 5-min call from another venue evaluating ShowX?
```

## Test plan

N/A — content task. Validation = Architect reads + Jindřich uses unedited.

## Out of scope

- Actual outreach (Jindřich + Margaret execute).
- Pilot calendar booking (separate tooling).
- Paid plan pricing (Jindřich decides based on pilot feedback).
- Multi-pilot management dashboard (post-0.1).
- BridgeX customer migration coordination (parallel track — those customers stay on BridgeX 0.3.x until Q2 2027 sunset).

## Notes for Critic

- Verify the playbook is venue-actionable — instructions are concrete enough for a venue tech to follow without XLAB present.
- Verify emails are warm but professional; no marketing fluff; ends with low-friction CTA.
- Confirm pre-pilot checklist is comprehensive but not overwhelming (15 items max).
- Verify success criteria measurable (NPS, count of rehearsals/perfs).
- Confirm fallback plan is realistic — PDF backup works only if PDFs were generated AHEAD of time.
- Watch for missing details: who calls the customer for debrief? Who logs bugs in followup? Forge documents owner per step.
- Verify cross-reference to B003-019 (PDFs), B003-017 (CSV import), B003-023 (DMG).
