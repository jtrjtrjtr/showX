---
bundle_id: "ShowX-6"
title: "F3 — Trust + Cue Lights (v0.5)"
status: "in_progress"
opened_at: "2026-06-13T20:25:00Z"
goal: "Profík tomu svěří ostrou show: device health, device feedback, multi-destination patch, pre-show health wizard, signed DMG — PLUS cue lights protokol (standby→ack→GO, diferenciátor) + SHOW-mode proposals + per-operator authority. Otevírá první externí betu. DMG packaging fix (task 1) odblokuje batched gate."
tasks: ["B006-001","B006-002","B006-003","B006-004","B006-005","B006-006","B006-007","B006-008","B006-009","B006-010","B006-011","B006-012"]
phase_ref: "F3 (showx_final_product_design.md)"
budget_usd: 30
---

## Why this bundle

Po F1 (dotaženo) + F2 (čas) je F3 o DŮVĚŘE — věci, bez kterých profík nepustí ostrou show. Plus cue lights (mezera #2: ETC CueSystem mrtvý, DIY na r/techtheatre) jako diferenciátor. Architektura: `decisions/2026-06-13_f3_trust_cuelights_architecture.md`.

DMG packaging regrese (`decisions/2026-06-13_dmg_packaging_regression.md`) = task 1; po fixu proběhne batched funkční+eyes-on gate F1+F2+F3 na jednom v0.5 DMG.

## Tasks

- **B006-001** DMG packaging fix + boot verify (P0) — odblokuje gate
- **B006-002** Signed + notarized DMG pipeline (P1; full signing potřebuje Apple cert od Jindřicha)
- **B006-003** Per-device connection health green/red (P0)
- **B006-004** Device feedback confirmed-state (P1, OSC-reply best-effort)
- **B006-005** Multi-destination patch primary+backup (P1)
- **B006-006** Pre-show health check wizard (P1)
- **B006-007** Cue lights: protokol + state + SM standby send (P0)
- **B006-008** Cue lights: operator receive + acknowledge UI (P0)
- **B006-009** SHOW-mode proposals UI (P1)
- **B006-010** Per-operator authority/registry (P1)
- **B006-011** F4 AI Showcaller design proposal (architect, docs — Kobbi-notes-independent)
- **B006-012** Architect E2E gate F3 (batched F1+F2+F3)

## Definition of done (bundle)

1. 11 impl/docs tasků accepted, typecheck 0, suite zelená.
2. **B006-001 produces a DMG that BOOTS** (empirical, not just green build).
3. E2E gate (B006-012) na INSTALOVANÉ app v0.5: device health green/red reálně reaguje; multi-dest backup funguje při výpadku primary; health wizard projde demo; cue lights standby→ack→GO mezi 2 stanicemi; proposals submit+review; + **batched F1+F2 checklist** (payloady, clock, timecode, MTC, countdown — vše z B004-012 + B005-010).
4. F4 design proposal (B006-011) doručen Jindřichovi k revizi.
5. Decision note F3 close + tag v0.5.0 (signed pokud cert k dispozici).

## Deferred to next bundle (ShowX-7)
- LTC in/out (native audify+libltc-wrapper, asarUnpack) — staví na F3 signed-DMG pipeline.
