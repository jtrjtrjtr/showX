---
id: "B008-005"
title: "Architect E2E gate — LTC"
type: "verification"
owner_hint: "architect"
estimated_size_lines: 0
priority: "P0"
bundle: "ShowX-8"
depends_on: ["B008-001","B008-002","B008-003","B008-004"]
target_files: []
acceptance_criteria:
  - "Full `pnpm -r typecheck` 0 errors + entire suite green (incl. packageJsonIntegrity guard)."
  - "v0.7.0 DMG builds with native asarUnpack (audify + libltc-wrapper .node binaries unpacked); asar correct; app launches as 0.7.0 foreground."
  - "HEADLESS-verifiable by Architect: require('audify') + require('libltc-wrapper') load (native binding OK); audio device enumeration returns a list (or graceful [] in headless); LTC encode→decode synthetic round-trip passes (TC in == TC out); clock source switching unit-level."
  - "FLAGGED for Jindřich/Kobbi (needs hardware + GUI+audio session): real external LTC source → ShowX chase locks; ShowX LTC out → external console/DAW chases ShowX; on real audio interface."
  - "Evidence in LTC close decision. Tag v0.7.0 (unsigned; full notarized native binaries need Apple cert from F3 B006-002)."
---

## Context

LTC gate. More is Architect-verifiable than F4 audio (module load + device enum + synthetic round-trip need no display/hardware). Only the real-signal lock needs Jindřich/Kobbi's hardware session.

## Out of scope
- Code. Real hardware signal test (Jindřich/Kobbi).
