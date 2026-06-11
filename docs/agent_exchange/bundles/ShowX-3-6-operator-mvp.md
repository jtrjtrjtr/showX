# Bundle ShowX-3.6 — Operator MVP (roadmap M1, část 1)

**Opened:** 2026-06-11
**Authorized:** Jindřich "ano" na roadmap M1-před-M2 (session 2026-06-11)
**Source:** `xlab-strategy/docs/showx_competitive_feature_map.md` (P0 items) + `showx_product_roadmap.md` M1

## Goal

UI snese srovnání s QLab/Eos: viditelný a editovatelný timing+trigger model, live countdown, bezpečná GO ergonomie, kompletně tmavé UI, single-key editace, cue čísla.

## Tasks

| ID | Title | Priority | Depends |
|---|---|---|---|
| B003-601 | Timing & trigger UI (trigger cell, duration, glyphs) | P0 | — |
| B003-602 | Playback status (countdown, header, caret≠selection, autoscroll) | P0 | 601 |
| B003-603 | GO ergonomie (debounce, BACK, hold-to-GO show mode) | P0 | 602 |
| B003-604 | Dark sweep round 2 (editory + shell panel + overflow) | P0 | — |
| B003-605 | Inline editing + free-text cue numbers (jediná data-model změna) | P1 | 601, 602 |
| B003-606 | **Architect E2E gate** (process — installed DMG walkthrough) | P0 | all |

Forge pořadí: 604 (nezávislé, viditelné hned) → 601 → 602 → 603 → 605. 606 = Architect.

## Out of scope

- Pre-wait/post-wait QLab kompozice (data model diskuze M2)
- Rundown vrstva, cue lights, device feedback (M3/M4)
- Audio/video playback engine (vědomě neděláme)

## Close criteria

6/6 accepted + B003-606 gate evidence v close decision. Verze v0.2.0.
