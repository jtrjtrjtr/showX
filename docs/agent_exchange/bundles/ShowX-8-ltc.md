---
bundle_id: "ShowX-8"
title: "LTC — Linear Timecode (audio SMPTE) in + out"
status: "in_progress"
opened_at: "2026-06-14T05:40:00Z"
goal: "Dokončit timecode story z F2: LTC generate (ShowX jako SMPTE master, audio out) + LTC decode/chase (ShowX slave na externí LTC, audio in). Pluguje na F2 master clock přesně jako MTC, jen přes audio. Native: audify + libltc-wrapper."
tasks: ["B008-001","B008-002","B008-003","B008-004","B008-005"]
phase_ref: "LTC (deferred from F2; showx_final_product_design.md)"
budget_usd: 30
---

## Why this bundle

F2 dodalo internal clock + MTC, LTC odložilo (potřebuje native audio addony). Jindřich 2026-06-14: LTC completion. Architektura: `decisions/2026-06-14_ltc_architecture.md`. Out+In v jednom bundlu, native deps schválené, bez HW testu teď (decode unit-test proti syntetickým sampům, živý lock později Jindřich/Kobbi).

## Tasks

- **B008-001** Native deps (audify + libltc-wrapper) + asarUnpack + audio device enumeration
- **B008-002** LTC generate (out) — libltc encode + master clock + device select
- **B008-003** LTC decode (in/chase) — audify in + libltc decode + clock chase + lock state
- **B008-004** LTC source UI + clock source switching (internal/mtc/ltc) + indikátor
- **B008-005** Architect E2E gate (headless část + flag pro Jindřichův live signál test)

## Definition of done (bundle)

1. 4 impl tasků accepted, typecheck 0, suite zelená (vč. packageJsonIntegrity guard).
2. E2E gate (B008-005) headless-ověřitelné: native moduly se načtou; audio device enumerace funguje; LTC encode→decode round-trip na syntetickém PCM projde; DMG se postaví s native asarUnpack. **Live signál (externí LTC zdroj → chase lock; LTC out → console/DAW) = Jindřich/Kobbi session.**
3. Decision note close + tag v0.7.0.

## Note
Nezávislý bundle (žádná tvrdá vazba na F5/F6). Native binárky plně notarizované až s Apple certem (F3 B006-002).
