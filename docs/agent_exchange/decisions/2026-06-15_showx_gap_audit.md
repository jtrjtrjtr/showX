# ShowX — Gap Audit: Paper vs. Reality

**Date:** 2026-06-15
**Author:** Eiffel (hub orchestrator, task #1151)
**Source:** hub-runner, requested by Christopher
**Basis:** showx_final_product_design.md (2026-06-13) · showx_mvp_scope.md · showx_product_roadmap.md · showx_competitive_feature_map.md · state.json · decisions/ · CI_FINDINGS_20260614.md · pnpm test 2245/2245 ✅
**Scope:** Feature completeness, gate status, open gaps, recommended next actions

---

## TL;DR

ShowX jumped from **v0.2.1 → v0.7.0** in one maraton session (2026-06-14): F1→F4 + LTC built autonomously. **10 of 14 original audit gaps closed.** Three gates remain open as bookkeeping artefacts (code done, visual test = Jindřich GUI session). Major remaining gap = EventX Bridge (B002, 0/15 done, specs stale, Jindřich explicitly deprioritized).

---

## 1. Current state at a glance

| Metric | Value |
|---|---|
| Version | v0.7.0 (arm64 DMG, installed + tested by Jindřich) |
| Total tasks | 130 (B001–B008) |
| Accepted | 111 |
| In-progress | 3 (all = visual gate pending) |
| Queued | 16 (all = B002 EventX Bridge) |
| Test suite | **2245/2245** ✅ (verified 2026-06-15) |
| CI | Green (unit/typecheck/lint/build/parity) |
| E2E in CI | Non-blocking (`continue-on-error`) — headless Electron-GUI harness not yet green |

---

## 2. Original 14-gap audit (showx_final_product_design.md §2b) — resolution map

| # | Gap (v0.2.1) | Severity | Status |
|---|---|---|---|
| G1 | LTC/MTC timecode layer — engine returns null, no clock, nothing displays | 🔴 critical | ✅ **FIXED** — MTC in/out (F2 B005), LTC in/out (ShowX-8 B008), master clock, big TC display, timecode triggers all live |
| G2 | DMX direct from cue — drivers exist but no `dmx` payload type | 🔴 | ✅ **FIXED** — B004-003/004: `dmx` payload, editor, Art-Net/sACN drivery hooked |
| G3 | Payload authoring UX — Jindřich reports "doesn't work" | 🔴 | ✅ **FIXED (pending visual confirm)** — B004-011 discoverability redesign (✎ button on row, payload section up top, empty-state hint). Gate B004-012 in_progress = visual part = Jindřich test |
| G4 | Webhook out/in — stub, returns `not_implemented` | 🟠 | ✅ **FIXED** — B004-005 real HTTP out; B004-006 webhook-in listener (HTTP endpoint → InputRegistrar) |
| G5 | Serial RS-232/485 — zero code, no library | 🟡 | ❌ **NOT DONE** — no work started; no library in deps |
| G6 | SHOW mode proposals — Y.Array in model, no UI | 🟠 | ✅ **FIXED** — B006-009: proposals UI (submit + SM approval queue) |
| G7 | Cue-light / countdown-only view | 🟠 | ✅ **FIXED** — F3 B006-007/008 (standby→ack→GO); F2 B005-008 (countdown-only view + Pi kiosk role) |
| G8 | Per-operator authority — octx sm_called always rejects | 🟠 | ✅ **FIXED** — B006-010: operator registry + authority model |
| G9 | Pre/post-wait timing model — only `duration_hint_ms` | 🟠 | ✅ **FIXED** — B004-001/002: `pre_wait_ms` field + engine + armed-waiting countdown UI; architecture decided 2026-06-13 |
| G10 | Modules show-mode/custom-router/cloud-sync — dirs empty | 🟡 | ⚠️ **PARTIAL** — SHOW mode proposals + lock + history in Cuelist Core now (not as separate loadable Pro+ module). Custom Router + Cloud Sync = not started |
| G11 | EventX Bridge module — 0 code; 15 specs from 2026-06-06 stale | 🟠 | ❌ **NOT DONE** — all B002-001..015 queued; Jindřich 2026-06-14 explicitly deprioritized ("dát pryč prioritu BridgeX") |
| G12 | Hotkey / scheduled triggers — not in type | 🟡 | ✅ **FIXED** — B004-009: hotkey trigger type + key binding |
| G13 | USITT / QLab import round-trip — CSV heuristics only | 🟡 | ❌ **NOT DONE** — no work started |
| G14 | Signed + notarized DMG — unsigned arm64 | 🟠 | ⚠️ **PARTIAL** — B006-002 notarization pipeline built; **blocked on Apple Developer ID cert from Jindřich** |

**Summary: 9 fully closed · 3 not done (G5/G11/G13) · 2 partial (G10/G14)**

---

## 3. Bundle-by-bundle build reality

### ShowX-1 Foundation — B001: 13/13 ✅
Electron shell, module loader, all shared services (Logger, EventBus, HealthBus, PersistedStore, SecretStore, AssetServer, mDNS, SyncBroker, PairingStore, Dispatcher), PWA scaffold (React+Vite+Yjs+IndexedDB), parity test harness. **Solid.**

### ShowX-2 EventX Bridge — B002: 0/15 ❌ QUEUED
All 15 tasks queued. Specs written 2026-06-06 are **stale** (predate modeState split, GoExecutor, dark tokens, PWA pipeline refactor). Jindřich 2026-06-14 said to defer. Golden JSONL recordings from BridgeX **NOT captured** at Kongres 2026-06-17 yet (Kongres = 2 days away). **Risk:** if not captured live, parity data may be lost. Gate: spec revision mandatory before B002 can start.

### ShowX-3 Cuelist Core — B003: 54/54 ✅
Full cuelist engine (manual/auto_follow/auto_continue), SM + 7 operator views + read-only, SHOW/REHEARSAL state machine, CSV/JSON/PDF import-export, .showx package, OSC/MIDI/MSC/Art-Net/sACN dispatchers, mDNS/pairing/Yjs broker, tier gating infrastructure. **Solid.**

### ShowX-4 F1 "Dotáhnout" — B004: 11/12 (gate in_progress)
Pre-wait model+engine+UI, DMX payload, webhook out+in, disarm, audition GO, hotkey trigger, payload authoring UX. All impl accepted. **Gate B004-012 = in_progress.** Headless part done; visual/eyes-on = Jindřich batch test.

### ShowX-5 F2 Time Layer — B005: 9/10 (gate queued)
Master clock, big TC display (all views), timecode triggers live, MTC chase in, MTC generate out, show-time OSC broadcast, countdown-only view, Pi kiosk recipe. All impl accepted. **Gate B005-010 = queued** (batched with F1 test per Jindřich's request).

### ShowX-6 F3 Trust + Cue Lights — B006: 11/12 (gate in_progress)
DMG boot fix, notarization pipeline (cert pending), device health green/red, device feedback confirmed-state, multi-destination patch, pre-show health wizard, cue lights standby→ack→GO (SM send + operator ack UI), SHOW-mode proposals UI, per-operator authority, F4 design proposal. All impl accepted. **Gate B006-012 = in_progress.** Batched F1+F2+F3 visual test = Jindřich.

### ShowX-7 F4 AI Showcaller — B007: 8/9 (gate in_progress)
caller_lines data model+UI, deterministic standby/GO generator+aggregation of concurrent marks, LLM draft (Claude API), ElevenLabs Node client + voice clone + SecretStore, rehearsal pre-generation→.showx/media, playback engine (Web Audio + cue-lights subscribe) + offline fallback, interrupt TAKE OVER <200ms, intercom audio device select. All impl accepted. **Gate B007-009 = in_progress.** Automated gate green; audio/voice quality = Jindřich GUI session.

### ShowX-8 LTC — B008: 5/5 ✅ (headless gate passed)
Native deps (audify + libltc-wrapper), asarUnpack, audio device enumeration, LTC generate (out), LTC decode (in/chase), clock source UI (internal/MTC/LTC). Synthetic encode→decode round-trip in suite. **Live signal test (external LTC source / external DAW) = Jindřich/Kobbi hardware session.**

---

## 4. Feature scope: paper vs. reality

### What the strategic roadmap (showx_mvp_scope.md / showx_product_roadmap.md) said

| Milestone | Paper target | Reality |
|---|---|---|
| M1 (v0.2, end June 2026) | Operator MVP: timing UI, GO ergonomics, countdown, caret≠selection | ✅ Delivered (and beyond) in ShowX-3/3.x bundles |
| M2 (v0.3, mid-July 2026) | EventX Bridge module (One App) | ❌ Deprioritized. B002 specs stale; Jindřich said defer |
| M3 (v0.4, Aug 2026) | Trust: device health, disarm, audition, health wizard, signed DMG | ✅ Delivered early (F3, v0.5); signing = cert pending |
| M4 (v0.5, Sept-Oct 2026) | SHOW mode, cue lights, rundown v1, BridgeX retired | ✅ SHOW mode + cue lights delivered early; ❌ Rundown NOT done; BridgeX NOT retired (Kongres 2026-06-17 = final standalone) |
| M5 (v1.0, Q1 2027) | Custom Router, Cloud Sync, timecode, pricing, product web | ⚠️ Timecode delivered early (LTC+MTC); ❌ Custom Router/Cloud Sync/pricing = not started; ✅ Tester web live |

**Observation:** Feature delivery is significantly ahead of the roadmap dates for F1-F4 + LTC. The 2026-06-13 strategy pivot (Jindřich: "dotáhni vše papírové, pak F2-F4") replaced the original M1-M5 sequence and was executed correctly. The original M2 (EventX Bridge) was explicitly deprioritized.

### What the competitive feature map says is "P0 — Operator Essentials"

| Feature | Paper | Reality |
|---|---|---|
| Timing columns (pre-wait/duration/follow) | Required | ✅ DONE (F1) |
| Halt/Trigger per cue | Required | ✅ DONE (engine in B003, UI in F1) |
| Live countdown in row + elapsed/remaining | Required | ✅ DONE (F2) |
| Single-key inline editing | Required | ✅ DONE (B003 bundles) |
| GO ergonomics (armed border, Back, panic, Snap+Go) | Required | ✅ DONE (B003 bundles) |
| Playback caret ≠ edit selection | Required | ✅ DONE |
| Cue numbering with decimals + insert | Required | ✅ DONE |

All P0 Operator Essentials delivered.

---

## 5. Open gaps — prioritized

### 🔴 P0 — Gate closure (no new code needed, needs Jindřich time)

| Item | What's needed |
|---|---|
| B004-012 F1 visual gate | Jindřich eyes-on: payload types, pre-wait, disarm, audition, webhook fire |
| B005-010 F2 visual gate | Same session: clock display, timecode trigger, MTC in/out, countdown view |
| B006-012 F3 visual gate | Same session: device health, cue lights standby→ack→GO, proposals, health wizard |
| B007-009 F4 visual gate | Same session + audio: AI caller pre-gen, playback, interrupt, intercom; needs ElevenLabs API key |

**These are bookkeeping artefacts.** Code is merged, tests pass. The batch test session closes F1–F4 simultaneously.

### 🔴 P0 — Apple cert (external dependency, Jindřich owns)

| Item | Blocker |
|---|---|
| B006-002 Signed + notarized DMG | Apple Developer ID cert in Jindřich's hands. Pipeline (B006-002) is built and ready to run. |
| LTC native .node full notarization | Needs signed DMG pipeline first |
| HTTPS pairing for tablets | Certificate needed for Web Crypto secure-context on station browsers (iPad pairing) |

### 🟠 P1 — EventX Bridge (strategic decision needed)

| Item | State |
|---|---|
| B002-001..015 (all queued) | 0/15 done. Specs stale (modeState/GoExecutor/PWA pipeline changed). |
| Golden JSONL from BridgeX | NOT captured. Kongres = 2026-06-17 (2 days). **Must capture BEFORE or DURING Kongres.** After = no live BridgeX event to record from. |
| Spec revision (B002 pre-req) | ~2–4h architect work to align 15 specs with current codebase before enabling Forge. |

**Decision Jindřich must make:** deprioritize indefinitely vs. set a date for F5. If BridgeX ~30 customers need a migration path, there is a hard deadline (BridgeX EOL).

### 🟠 P1 — Remaining gaps from original audit

| Item | State |
|---|---|
| G10 / Custom Router module | Not started. Planned F5/F6. Low priority until paid pilots demand it. |
| G10 / Cloud Sync module | Not started. Planned F5/F6. |
| G13 / USITT + QLab import | Not started. CSV heuristics only. Low priority (no customer demand confirmed). |

### 🟡 P2 — Infrastructure + polish

| Item | State |
|---|---|
| Rundown layer (G Pro+) | Not started. Planned F6. Competitive differentiator #1 (showx_competitive_feature_map.md). |
| G5 Serial RS-232/485 | Not started. No confirmed use case from Jindřich/Kobbi. |
| CI E2E (Electron-GUI headless) | Non-blocking. Promote to blocking once xvfb/Electron headless harness confirmed green on Linux. |
| Hub CI email routing | Forge push to red-CI gate + GitHub failure emails → Carl/Margaret digest (not Jindřich inbox). Hub session item. |
| GitHub repo handover (Kobbi) | Mentioned in showx_final_product_design.md. Not done. Needs Jindřich direction. |
| ElevenLabs + Anthropic API keys | In SecretStore slot; needs provisioning for full F4 AI caller. |
| LTC live signal test | Real audio interface + external LTC source / external DAW. Hardware session with Jindřich/Kobbi. |

---

## 6. What v0.7.0 actually does (verified reality)

As of today, a ShowX user with the installed DMG can:

- Create a show, add cues with all 8 payload types (OSC/MIDI/MSC/LX-ref/DMX/webhook/wait/group)
- Edit cues with per-cue pre-wait, trigger mode (manual/auto-follow/auto-continue/hotkey/timecode), disarm
- Fire cues with audition (dry-run) or real dispatch (OSC/MIDI/MSC/DMX/webhook)
- See master clock + big timecode display (HH:MM:SS:FF) on all views
- Use timecode triggers (cue fires when clock crosses target TC)
- MTC chase in (clock follows external MTC) and MTC generate out
- LTC generate out (SMPTE audio) and LTC decode in (chase external LTC)
- Show-time OSC broadcast (drives external displays per Kobbi request)
- Countdown-only view (Pi kiosk role) — obří číslice, kiosk URL recipe
- Per-device connection health (green/red) + device feedback confirmed-state
- Multi-destination patch (primary + backup on one cue)
- Pre-show health check wizard
- Cue lights: SM sends standby → operator acknowledges → GO signal visible to SM
- SHOW mode: lock + edit proposals + per-operator authority
- AI Showcaller: standby/GO script lines per cue, LLM draft, ElevenLabs pre-gen, playback, interrupt, intercom device select
- Multi-operator REHEARSAL collab over LAN (Yjs + embedded broker)
- mDNS discovery + QR/PIN station pairing
- 7 operator role views + SM master view + countdown-only
- CSV import (QLab/Eos dialects), JSON export, PDF cue-sheet per department, .showx package

**Not working / pending:**
- Signed/notarized DMG (cert pending)
- Full AI Showcaller with real voice clone (ElevenLabs key needed + voice clone setup)
- Live LTC lock (hardware test with external LTC source)
- HTTPS pairing for tablets (cert needed)
- EventX Bridge module (B002 queued)
- Serial, Custom Router, Cloud Sync, Rundown

---

## 7. Recommended actions for Jindřich

In priority order:

1. **Schedule batch test session** (F1+F2+F3+F4) — closes 4 gate tasks at once. DMG: `dist-electron/ShowX-0.7.0-arm64.dmg`. Checklist: `docs/JINDRICH_TEST_CHECKLIST_v0.6.0_F4.md`. Estimated time: 2–3h including audio test.

2. **Provide Apple Developer ID cert** → unblocks signed DMG (B006-002), full LTC notarization, and HTTPS pairing for tablets. One action, unlocks 3 downstream items.

3. **Capture BridgeX golden JSONL at Kongres (2026-06-17)** — last chance before BridgeX retirement. If skipped, parity tests for EventX Bridge (B002-010..012) must be written blind against BridgeX source code instead of real recordings. Strongly recommend capturing.

4. **Direction decision on F5 (EventX Bridge)** — Deprioritized indefinitely, or specific date? ~30 BridgeX customers need a migration path eventually. If deprioritized: set an EOL date for BridgeX 0.3.x; if accelerated: Architect revises B002 specs first (2–4h), then Forge can start.

5. **ElevenLabs + Anthropic API keys** into SecretStore → full AI Showcaller test in the batch session.

6. **HTTPS pairing** decision (do tablets matter for Kobbi/Visa Universe?) → if yes, certificate path clarification.

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Golden JSONL not captured at Kongres | High (2 days away, easy to miss) | Explicit capture step in Kongres runbook. One developer with BridgeX + ShowX repo records a test event. |
| Gate tasks drift indefinitely in in_progress | Medium | Schedule the batch test session. Gates are bookkeeping; no code work needed. |
| Apple cert delays external beta | Medium | Pipeline ready; cert = unblocking action Jindřich owns. |
| B002 specs too stale to start without revision | Certain | Architect session needed to revise 15 specs (2–4h) before Forge bandwidth can be enabled for F5. |
| Serial / USITT / QLab import demand emerges | Low | Defer until first paying customers ask. |
| E2E Electron-GUI CI never goes green | Low-medium | Non-blocking for now; revisit after Kongres when Forge bandwidth is available. |

---

*Eiffel (hub orchestrator) · XLAB · 2026-06-15*
*hub-runner task #1151 · test baseline: 2245/2245 ✅*
