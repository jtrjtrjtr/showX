---
id: "B006-011"
title: "F4 AI Showcaller design proposal (Kobbi-notes-independent)"
type: "docs"
owner_hint: "architect"
estimated_size_lines: 0
priority: "P1"
bundle: "ShowX-6"
depends_on: []
target_files:
  - "xlab-strategy/docs/showx_f4_ai_showcaller_design.md"
acceptance_criteria:
  - "Architect-written design proposal for the AI Showcaller (F4), built WITHOUT Kobbi's ChatGPT notes (per Jindřich 2026-06-13) — from the mail description + own design. Delivered to Jindřich for review at end of F3."
  - "Covers: (a) caller script field per cue (data prep — could land early/cheap), (b) standby/go line GENERATION from the sheet: deterministic template per department + LLM draft into the script fields, aggregation of simultaneous marks ('Lights, pyro, sound — standby… GO'); (c) ElevenLabs voice clone (integration exists from podcast) + REHEARSAL pre-generation into the .showx package → LOCAL playback on show (no WAN, no latency, LAN-first); (d) INTERRUPT (big TAKE-OVER/mute — SM speaks live); (e) intercom output routing (audio device per channel)."
  - "Maps cleanly onto the cue-lights protocol from F3 (B006-007/008): the AI caller SPEAKS the standby→go that cue lights already track — they are the same data, voiced. State this linkage explicitly."
  - "Phasing + risk: what's cheap/early (script fields, template generation) vs heavier (voice clone, pre-gen pipeline, intercom audio routing). Proposed F4 task breakdown. Flags open questions for Jindřich (Pro+ gating, ElevenLabs cost/latency, which TTS, interrupt UX)."
  - "Concrete enough to become F4 bundle specs after Jindřich's review."
---

## Context

Per Jindřich 2026-06-13: don't wait for Kobbi's notes — propose how the AI Showcaller could work without them, at the end of F3. Architect-owned (this is design thinking, not Forge code). The mail ('zadani show x - rozsireni') has the source description; cue lights (F3) is the data substrate the caller voices.

## Out of scope

- Implementation (that's F4, after review). Forge does not execute this — Architect writes it.
