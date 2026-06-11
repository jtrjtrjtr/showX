---
id: "B003-705"
title: "Architect E2E gate 3.7 — installed-DMG walkthrough (process)"
type: "verification"
estimated_size_lines: 0
priority: "P0"
bundle: "ShowX-3.7"
depends_on: ["B003-701", "B003-702", "B003-703", "B003-704"]
owner_hint: "architect"
target_files: []
acceptance_criteria:
  - "Architect po 4/4 accepted: full suite + production builds + DMG v0.2.x + instalace; walkthrough NA INSTALOVANÉ app: postavit novou show OD NULY z browseru (add cues, payloady, reorder, delete+undo), MIDI device v Routing UI, GO → OSC capture, vizuální kontrola layoutu OČIMA (screenshoty zobrazit, ne jen testid asserty — lekce z 3.6 layout regrese), žluté buttony kontrast."
  - "Evidence v close decision."
---
Per WORKFLOW E2E gate (binding). Doplněná lekce: screenshoty se PROHLÍŽÍ, layout regrese testidy nechytí.
