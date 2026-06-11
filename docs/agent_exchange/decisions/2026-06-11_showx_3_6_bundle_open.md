# ShowX-3.6 bundle open — Operator MVP

**Date:** 2026-06-11 ~11:30 CEST
**Authorized:** Jindřich — schválil roadmapu M1→M5 a pořadí M1 (Operator MVP) před M2 (EventX Bridge)

## Why

Competitive research (10 produktů, 4 research agenti — `xlab-strategy/docs/showx_competitive_feature_map.md`): operátorské minimum, bez kterého ShowX nesnese srovnání s QLab/Eos, je viditelný timing/trigger model, live countdown, bezpečné GO a konzistentní dark UI. Engine vše podstatné umí (trigger taxonomy B003-007, duration_hint_ms) — chybí UI vrstva.

## Decisions

- **MagicQ pattern pro trigger UX** (jedna editovatelná buňka) — máme jednotný Trigger union, ne QLab pre/post-wait kompozici. Pre/post-wait = M2 data-model diskuze.
- **ONYX caret≠selection** — selection (editace, arm) oddělena od playheadu (standby, GO). Odemyká single-key editaci.
- **Jediná data-model změna bundle = cue_number** (B003-605, free-text QLab semantics, s migrací). Vše ostatní čistě UI nad existujícím modelem.
- **E2E gate institucionalizován** (B003-606 + WORKFLOW.md amendment) — lekce z 3.4 (3 rescues) a 3.5 (4 rescues).
- Klávesa Q zůstává standby (shipped muscle memory); label edit = L.

## Scope flag

enabled: true, allowed: B003-601..605 (606 = architect-owned, Forge přeskakuje).
