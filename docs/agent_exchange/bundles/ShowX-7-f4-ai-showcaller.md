---
bundle_id: "ShowX-7"
title: "F4 — AI Showcaller (v0.6)"
status: "in_progress"
opened_at: "2026-06-14T00:00:00Z"
goal: "AI Showcaller: standby/go hlášky showcallerovým naklonovaným hlasem, generované ze scénáře, předgenerované při zkoušce, přehrávané LOKÁLNĚ na show, kdykoli přerušitelné. Diferenciátor, který nikdo nemá. Staví na F3 cue lights (táž data: světlo vs hlas)."
tasks: ["B007-001","B007-002","B007-003","B007-004","B007-005","B007-006","B007-007","B007-008","B007-009"]
phase_ref: "F4 (showx_final_product_design.md + showx_f4_ai_showcaller_design.md)"
budget_usd: 30
---

## Why this bundle

Kobbiho klíčový diferenciátor (mail „zadani show x - rozsireni"). Jindřich „jed f4" 2026-06-14 (přímo, LTC odloženo). Architektura: `decisions/2026-06-14_f4_ai_showcaller_architecture.md`. Návrh: `xlab-strategy/docs/showx_f4_ai_showcaller_design.md`.

Klíč: cue lights (F3) a AI caller = táž data. Caller konzumuje standby→ack→GO stav a VYSLOVÍ ho. LAN-first: pre-gen při zkoušce, lokální playback na show.

## Tasks

- **B007-001** caller_lines datový model + UI editace u cue
- **B007-002** Deterministický generátor standby/go ze sheetu + agregace souběžných marků
- **B007-003** LLM draft hlášek (Claude) do caller_lines (editovatelné)
- **B007-004** ElevenLabs Node client + voice clone onboarding + voice profil + API key v SecretStore
- **B007-005** Rehearsal pre-generace audia → .showx/media (hook v REHEARSAL→SHOW)
- **B007-006** Playback engine (shell renderer Web Audio + setSinkId) + cue-lights subscribe + offline fallback
- **B007-007** Interrupt (TAKE OVER/MUTE <200ms) + AI/ruční stav
- **B007-008** Intercom out (audio device select)
- **B007-009** Architect E2E gate F4

## Definition of done (bundle)

1. 8 impl tasků accepted, typecheck 0, suite zelená.
2. E2E gate (B007-009): caller_lines se vygenerují ze sheetu (šablona) + volitelně LLM; pre-gen při REHEARSAL→SHOW vyrobí audio do .showx/media; na show se přehraje standby na standby.broadcast + GO na go.dispatched přes zvolený audio device; interrupt stopne <200ms; agregace souběžných marků; offline fallback. (Funkční/audio část — Architect ověří co půjde headless, audio výstup + kvalita hlasu = Jindřichova GUI session, batched s F1-F3.)
3. F4 design otevřené otázky (cloning kvalita, ElevenLabs cena) zflagované.
4. Decision note F4 close + tag v0.6.0.

## Deferred / parallel
- LTC bundle (timecode audio) — samostatně, kdykoli (nemá vazbu na F4).
- Signing full run čeká na Jindřichův Apple cert (B006-002).
