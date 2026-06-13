---
bundle_id: "ShowX-5"
title: "F2 — Time vrstva (v0.4)"
status: "in_progress"
opened_at: "2026-06-13T17:05:00Z"
goal: "Master clock + velký timecode displej na všech views + timecode triggery live + MTC chase in/out + show-time OSC broadcast + countdown-only view pro Pi kiosk. Kobbiho 'stoprocentně chybějící vrstva' (mail 2026-06-12) existuje."
tasks: ["B005-001","B005-002","B005-003","B005-004","B005-005","B005-006","B005-007","B005-008","B005-009","B005-010"]
phase_ref: "F2 (showx_final_product_design.md)"
budget_usd: 30
---

## Why this bundle

Jindřich mail „zadani show x - rozsireni" + Kobbi: timecode/show-time je vrstva, „která by měla vidět na všech pracovištích" — u nás dnes „někde úplně malej" (MX4D screenshot = velké číslice referenční vzor). Audit 2026-06-13 G1: timecode trigger má UI ale engine vrací null, žádný clock, žádný LTC/MTC, nikde se TC nezobrazuje.

Architektura: `decisions/2026-06-13_f2_time_layer_architecture.md` (totalFrames clock, anchor+interpolace broadcast, MTC hand-roll, LTC deferred).

## Tasks

- **B005-001** Master clock service (internal, totalFrames model)
- **B005-002** Clock broadcast (anchor) + PWA useClock interpolace
- **B005-003** Big timecode display komponenta (všechny views)
- **B005-004** Timecode trigger live (fire z master clocku)
- **B005-005** MTC decode — chase in
- **B005-006** MTC generate — out
- **B005-007** Show time OSC broadcast out (Kobbi: řídí externí zařízení)
- **B005-008** Countdown-only view + 'countdown' role (Pi kiosk)
- **B005-009** Pi kiosk recept (docs)
- **B005-010** Architect E2E gate F2

## Definition of done (bundle)

1. 9 impl/docs tasků accepted, typecheck 0, suite zelená.
2. E2E gate (B005-010) eyes-on na INSTALOVANÉ app: clock běží; velký TC HH:MM:SS:FF viditelný na shell+SM+operator+countdown; timecode-trigger cue reálně vystřelí z clocku; MTC out čte jiný SW/MTC-capable zařízení; MTC in chase (clock následuje externí MTC); countdown view běží na 2. zařízení (browser kiosk); show-time OSC zachycen na `nc -ul`. Screenshoty okem.
3. Decision note F2 close + tag v0.4.0.
4. **F1 eyes-on gate se testuje SPOLU s F2** (Jindřich: „otestujeme více věcí najednou") — batch test F1+F2 na jednom DMG.

## Explicitly deferred

- LTC in/out → samostatný bundle (native addony audify+libltc-wrapper, DMG asarUnpack/notarizace) gated za F3 signed-DMG práci.
