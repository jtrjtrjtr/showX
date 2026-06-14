---
id: "B007-009"
title: "Architect E2E gate — F4 (batched with F1+F2+F3)"
type: "verification"
owner_hint: "architect"
estimated_size_lines: 0
priority: "P0"
bundle: "ShowX-7"
depends_on: ["B007-001","B007-002","B007-003","B007-004","B007-005","B007-006","B007-007","B007-008"]
target_files: []
acceptance_criteria:
  - "Full `pnpm -r typecheck` 0 errors + entire suite green."
  - "v0.6.0 DMG builds (extraMetadata fix from F3 holds) + asar correct + app launches as 0.6.0 foreground (Architect headless-verifiable part)."
  - "Architect headless-verifiable: caller_lines generate from sheet (deterministic) + aggregation correct; pre-gen writes audio files to .showx/media with manifest (mock or real TTS); playback logic resolves files + responds to standby/go messages (unit/integration level); interrupt stops playback in tests."
  - "JINDŘICH GUI session (batched F1+F2+F3+F4 on v0.6.0): actually HEAR caller voice on standby + GO through a chosen audio device; voice-clone quality acceptable; interrupt cuts <200ms live; aggregate line plays for simultaneous marks; + all prior F1/F2/F3 checklist items."
  - "Flag for Jindřich: ElevenLabs cloning quality verdict + cost (Rothschild) + intercom device on real hardware."
  - "Evidence in F4 close decision. Close B007-009 (+ note batched F1-F3 visual still pending if not yet done). Tag v0.6.0."
---

## Context
F4 gate. Audio quality + real device output inherently need Jindřich's GUI+hardware session (Architect context headless + no audio hardware). Architect verifies generation/pre-gen/playback-logic; Jindřich verifies the actual voice + intercom.

## Out of scope
- Code. LTC (separate bundle).
