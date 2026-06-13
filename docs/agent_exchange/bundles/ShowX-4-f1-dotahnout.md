---
bundle_id: "ShowX-4"
title: "F1 — Dotáhnout co papírově je (v0.3)"
status: "in_progress"
opened_at: "2026-06-13T00:00:00Z"
goal: "Dotáhnout do reálné funkčnosti všechno, co je v ShowX papírově slíbené, ale audit 2026-06-13 odhalil jako stub/chybějící: payload authoring v praxi, DMX payload, webhook out/in, pre-wait timing model, disarm, audition GO, hotkey trigger. Závěr = vše slíbené v 0.1/0.2 reálně funguje."
tasks: ["B004-001","B004-002","B004-003","B004-004","B004-005","B004-006","B004-007","B004-008","B004-009","B004-010","B004-011","B004-012"]
phase_ref: "F1 (showx_final_product_design.md)"
budget_usd: 30
---

## Why this bundle

Gap audit 2026-06-13 (4 agenti, evidence v showx_final_product_design.md §2) ukázal, že část slíbených featur je stub nebo chybí. Jindřich (mail "zadani show x - rozsireni"): „dotáhni vše co tam dnes papírově je ale vlastně není." F1 to zavírá před tím, než stavíme nové vrstvy (F2 Time, F3 Trust, F4 AI showcaller).

Pre/post-wait architektura vyřešena v `decisions/2026-06-13_prewait_timing_model.md` (jediné nové pole `pre_wait_ms`).

## Tasks

- **B004-001** Pre-wait data model + engine (P0) — `pre_wait_ms` do Cue, dispatch honoruje, cue-fire timing
- **B004-002** Pre-wait + timing UI (P0) — sloupec/edit + armed-waiting countdown
- **B004-003** DMX payload typ + dispatch (P0) — `dmx` payload → existující Art-Net/sACN drivery
- **B004-004** DMX payload editor UI (P0) — DmxPayloadEditor + Add menu
- **B004-005** Webhook OUT real HTTP (P1) — nahradit stub
- **B004-006** Webhook IN listener (P1) — HTTP endpoint → InputRegistrar
- **B004-007** Disarm cue (P1) — armed flag, skip+advance, hatched UI
- **B004-008** Audition/Preview GO (P1) — dry-run dispatch, suppress real sends
- **B004-009** Hotkey trigger typ (P2) — key binding → fire cue
- **B004-010** CSV import pre-wait oprava (P2) — QLab pre-wait → pre_wait_ms
- **B004-011** Payload authoring UX discoverability + Jindřich test-feedback flex (P1)
- **B004-012** Architect E2E gate F1 (verification, architect)

## Definition of done (bundle)

1. Všech 11 implementačních tasků `accepted` Criticem, `pnpm -r typecheck` 0 errors, celá suite zelená.
2. E2E gate (B004-012): production DMG → instalace → eyes-on. Konkrétně ověřeno NA INSTALOVANÉ APP:
   - Vytvořím vlastníma rukama nový payload KAŽDÉHO typu (osc/midi/msc/lx_ref/dmx/webhook/wait/group) v browser stanici i shellu.
   - OSC/MIDI/DMX/webhook payload reálně odejde na drát (nc/listener/Art-Net capture).
   - Pre-wait: cue s pre_wait_ms 2000 → vizuální armed-waiting 2s → pak dispatch.
   - Disarm: disarmovaný cue se přeskočí, řetěz pokračuje.
   - Audition GO: cue se "vystřelí" do Dispatch Logu jako [AUDITION] bez reálného outputu.
   - Screenshoty prohlédnuté OKEM (layout, čitelnost).
3. Decision note F1 close + tag v0.3.0 + push.
4. HALT → checklist pro Jindřichův test.
