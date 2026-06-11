# ShowX-3.5 bundle complete — Testable Station Loop + FOH Redesign LIVE

**Project:** ShowX
**Date:** 2026-06-11 ~10:45 CEST
**Bundle:** ShowX-3.5 (closed)
**Duration:** 2026-06-11 00:30 → 10:45 CEST (overnight autonomous run, Jindřich asleep "jed jak daleko to pujde")
**Opening decision:** `decisions/2026-06-11_showx_3_5_bundle_open.md`

## Outcome

**v0.1.14 DMG installed — complete testable loop verified end-to-end by Architect:**
pair once → dark FOH UI → ARM → GO → **real OSC packet captured** → dispatch log row → cue edit in browser → syncs → **survives app relaunch**.

| Task | Title | Critic | Round |
|---|---|---|---|
| B003-501 | Dark FOH redesign | accepted | r2 |
| B003-502 | SM presence + deterministic authority | accepted | r1 |
| B003-503 | Onboarding: session persistence, QR, open-browser | accepted | r1 |
| B003-504 | Shell GO executor (dispatch wiring) | accepted | r2 |
| B003-505 | Dispatch Log panel + OSC verification | accepted | r1 |
| B003-506 | Cue editing in PWA | accepted | r2 |

## E2E evidence (Architect live walkthrough, v0.1.14)

- **Session restore:** browser reload + app relaunch → straight to SM view, no PIN. ✅
- **Dark theme:** screenshots `.test-screens/3_dark_sm_view_live.png`, `4_shell_window.png`. ✅
- **SM presence:** no false "SM offline" banner with idle SM. ✅
- **GO → OSC:** shell log `cue.dispatched {cue_label:"House up", payloads_dispatched:1, payloads_failed:0, duration_ms:5}` + UDP capture `[10:39:42.665] 24B /eos/cue/1/0/fire` on 127.0.0.1:7000 (timestamps match to the ms). ✅
- **Dispatch Log panel:** row `10:39:42.659 House up — lx_ref×1 — 1ok — 5ms` in shell window. ✅
- **Stations panel:** LAN + mDNS pairing URLs with `?pin=000000` (test mode) + QR codes + "Open station in this Mac's browser". ✅
- **Cue editing:** dblclick → dialog → label "House up (E2E edit)" → saved → **survived app kill + relaunch + reopen**. ✅

## Architect rescues (post-Critic-accept, live E2E — same pattern as 3.4)

1. **GoExecutor passed no `octx`** → `sm_called` cuelists rejected every GO with `not_sm` (nobody could ever fire). Fix: OperatorContext built from PairingStore (operator_id == device_id, owned_departments from claim; PairingView already adds 'SM' for sm-role). + `OperatorContext` re-export from goEventChannel.
2. **Routing scoring bug:** `e.match.device_id === device_id` scored +4 when BOTH undefined, and an explicitly mismatched `match.payload_type` did NOT disqualify a rule → lx_ref payload routed to dead `test_eos` device (192.168.1.100:8000) instead of the integration fallback; dispatch reported "ok" (UDP fire-and-forget). Fix in `resolveDeviceTransport`: specified-but-mismatched field disqualifies; unspecified = wildcard worth 0; catch-all eligible at lowest priority.
3. **PWA production build broken** (`node:fs` in browser bundle): 506's `document/cue.js` import chain pulled `lockGuards → transitions → snapshot + historyJsonl`. Vite DEV tolerates (externalizes), BUILD hard-fails — nobody had run a production build during review. Fix: `getMode` extracted to browser-safe leaf `mode/modeState.ts`.
4. **`atomicWriteFile` concurrency bug:** all writers shared `${target}.tmp` — concurrent saves interleave + rename corrupted bytes (caught by catalog atomic-write test). Fix: unique tmp per call (pid + seq). Real .showx data-loss risk.
5. **Pre-existing test debt cleared:** StationRouter fixtures (getMap→getArray, 3.4 doc-shape), App.test localStorage stub (jsdom), skeleton.test named-class import (3.3 default-instance change), cueCatalog teardown ENOTEMPTY retry. **Full suite first time fully green: 1380/1380, 123 files.**

Also overnight (separate incidents, carl_it.md): claude binary moved to /opt/homebrew → runner code 127 → symlink fix; Wi-Fi dropped to iPhone hotspot 01:30–03:05 → Forge API stream timeouts → Architect rescue mode.

## Lesson (recurring, now 2 bundles in a row)

Critic + unit tests accepted everything; live E2E found 3 wiring-level bugs (authority context, routing fallback, prod build). **Next bundle: add a mandatory "Architect E2E gate" task to the bundle definition itself** — production build + one full station loop on installed DMG before bundle close. Candidate for WORKFLOW.md change (discuss with Jindřich).

## Cumulative ShowX

43/43 task specs accepted across 7 bundles. v0.1.14 unsigned DMG installed at /Applications.

## Scope flag

`claude_runner_scope.json` → `enabled: false`, `bundle_id: "ShowX-3.5-CLOSED"`.

---

**Architect:** Fable 5 (hub session, overnight autonomous per Jindřich GO)
**Close authorization:** pending Jindřich morning review + own checklist walkthrough
