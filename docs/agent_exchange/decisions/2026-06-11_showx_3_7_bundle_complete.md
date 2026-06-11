# ShowX-3.7 complete — M1 Operator MVP DONE, v0.2.1

**Date:** 2026-06-11 ~21:15 CEST · **Duration:** ~2h Forge/Critic + gate + Architect layout hotfix (0a0ae7c, pre-bundle per Jindřich live feedback)

## Outcome
5/5: 701 authoring r1 · 702 payload editing r1 · 703 MIDI r1 · 704 contrast r1 · 705 gate PASSED.
**Roadmap M1 hotové celé** — z browseru lze show postavit, naplnit payloady a odbavit. Suite 1509/1509 (+21).

## Gate evidence (installed v0.2.1)
- Insert-after: 25→26 řádků; delete: 26→25 + undo toast ✅
- CueEditDialog: Payloads sekce, 1 payload item ✅
- STBY z vybraného řádku → GO → `cue.dispatched` + UDP `[21:08:30.801] /eos/cue/1/0/fire` (ts match) ✅
- Screenshots PROHLÉDNUTY OČIMA (8_v021_station.png, 9_v021_shell.png): sloupce, řádkové akce, čitelný header, ELAPSED bold ✅

## Poznámka
2 bundly + layout hotfix za jeden den (3.6 ráno otevřeno → 3.7 večer zavřeno). Jindřichův live feedback (19:50 screenshot) chytil layout regresi, kterou gate v 3.6 minul — gate od teď povinně s vizuální prohlídkou (WORKFLOW dodatek).

**Next:** Jindřichův test v0.2.1 → M2 (ShowX-2 EventX Bridge, 15 specs ready).
