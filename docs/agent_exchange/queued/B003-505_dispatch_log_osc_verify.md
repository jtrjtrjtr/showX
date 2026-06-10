---
id: "B003-505"
title: "Dispatch visibility — live Dispatch Log panel in shell + OSC verification path"
type: "implementation"
estimated_size_lines: 250
priority: "P1"
bundle: "ShowX-3.5"
depends_on: ["B003-504", "B003-501"]
target_files:
  - "src/main/src/runtime/GoExecutor.ts"
  - "src/main/src/ipc/dispatchLogBridge.ts"
  - "src/main/src/ui/preload.cts"
  - "pwa/src/components/ShellRouter.tsx"
  - "pwa/src/components/DispatchLogPanel.tsx"
  - "tests/unit/ipc/dispatchLogBridge.test.ts"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "GoExecutor keeps an in-memory ring buffer (last 100) of dispatch records: {ts, cue_id, cue_label, transport_summary, payloads_dispatched, payloads_failed, duration_ms, fired_by}."
  - "New IPC bridge (src/main/src/ipc/dispatchLogBridge.ts, follow existing ipc/* patterns): `dispatchLog.list()` returns buffer; `dispatchLog.onAppend(cb)` push event to shell renderer on each new record. Exposed via preload like existing bridges."
  - "New DispatchLogPanel.tsx in shell window (ShellRouter): live-scrolling list, newest on top, each row shows time HH:MM:SS.mmm, cue label, payload count ok/failed (failed in red), duration. Uses B003-501 dark tokens. Empty state: 'No cues fired yet'."
  - "Rows with payloads_failed > 0 render the failure reasons expandably (failure list already in record)."
  - "Manual E2E in done report: browser GO on Demo Show cue → row appears in shell Dispatch Log panel within 500ms + OSC packet visible via integration osc-ws-bridge (`cd ../integration && node dist/osc-ws-bridge/server.js` or its npm script, watch console) OR `nc -ul 7000`. Paste evidence."
  - "Unit tests: ring buffer caps at 100; IPC list/append flow with fake records."
  - "`pnpm -r typecheck` clean, all tests pass."
  - "No edits outside listed target_files."
---

## Context

B003-504 makes GO actually dispatch OSC. This task makes it VISIBLE — Jindřich must see every fire land, in the shell window, without reading log files. This is the operator's trust instrument ("did my GO do something?") and our E2E verification surface.

The Integration project's osc-ws-bridge (../integration/src/osc-ws-bridge/server.ts) listens UDP 127.0.0.1:7000 and rebroadcasts to the Notch simulator — Demo Show's default OSC device (seeded in B003-504) targets exactly that. Full chain: browser GO → shell dispatch → UDP 7000 → simulator visual.

## Implementation notes

- Record append point: the same place GoExecutor logs 'cue.dispatched' (B003-504) — push to ring buffer + fire IPC event.
- IPC pattern: mirror cuelistCoreShowStateBridge.ts / cuelistCoreDeviceBridge.ts (registration in Shell.ts wiring where other bridges mount — if Shell.ts edit is unavoidable for mounting, it's allowed as it's in B003-504's target set; keep the diff minimal and note it in done report).
- Panel placement: ShellRouter below/beside existing show state UI; collapsible like Stations panel (B003-503). If B003-503 hasn't landed yet, don't depend on its components — plain section is fine.
- transport_summary: derive from dispatch result details (e.g. 'osc×2' or 'osc×1 midi×1').

## Done report

Standard format + evidence block (log lines, panel screenshot path optional, OSC capture).
