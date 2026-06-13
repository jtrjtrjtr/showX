# Decision — Pre/post-wait timing model (blokující F1)

**Date:** 2026-06-13
**Author:** Architect (Opus)
**Status:** RATIFIED (Jindřich schválil defaulty designu showx_final_product_design.md 2026-06-12)
**Blocks:** F1 bundle (ShowX-4), specs B004-001/002, CSV import fix

---

## Problém

`showx_final_product_design.md` G9: jen `duration_hint_ms`. QLab-style pre/post-wait nerozhodnuto, blokuje další specs. Audit 2026-06-13: CSV heuristiky mapují QLab pre-wait → `auto_continue(delay_ms)`, což je sémanticky špatně (mapuje pre-wait na post-wait).

## Analýza současného modelu (kód, ne papír)

ShowX používá **backward-pointing trigger**: každý cue deklaruje, jak se spustí vůči předchůdci (`src/shared/src/types/cue.ts:8-14`, `trigger/scheduler.ts`).

| QLab pojem | ShowX ekvivalent | Stav |
|---|---|---|
| **Post-wait + auto-continue** | `auto_continue { delay_ms }` na NÁSLEDUJÍCÍM cue (`scheduler.ts:20-30`) | ✅ existuje |
| **Auto-follow (po dokončení akce)** | `auto_follow { prev_cue_id }` + `duration_hint_ms` (`scheduler.ts:32-47`) | ✅ existuje |
| **Duration / action length** | `duration_hint_ms` | ✅ existuje |
| **Pre-wait (prodleva trigger→akce)** | — | ❌ CHYBÍ |

Backward a forward reprezentace jsou pro lineární řetěz **izomorfní**: „cue A: post-wait pak continue na next" ≡ „cue B: auto_continue delay_ms od startu A". Separátní `post_wait` pole = redundantní.

## Rozhodnutí

**Přidat JEDINÉ cue-level pole `pre_wait_ms: number` (default 0). Trigger union beze změny. Žádné separátní `post_wait` pole.**

### Sémantika
- `pre_wait_ms` = prodleva mezi spuštěním cue (GO nebo auto-trigger vystřelí) a **dispatchem payloadů**.
- Implementace v **dispatch path** (GoExecutor / payloadDispatch), NE v trigger engine.
- `cue-fire` event (který řídí scheduling dalšího cue) se emituje **až po uplynutí pre_wait, v okamžiku dispatche akce**. Tím `auto_continue.delay_ms` následujícího cue měří od startu akce (= QLab-faithful post-wait), ne od raw triggeru.
- Countdown/armed UI: během pre_wait je cue ve stavu „armed/waiting" (vizuální odlišení), pak „firing".

### Mapování QLab → ShowX (kanonické, pro import i docs)
| QLab pole | ShowX |
|---|---|
| Pre Wait | `cue.pre_wait_ms` |
| Duration / Action | `cue.duration_hint_ms` |
| Post Wait + Continue=Auto-continue | následující cue `trigger = auto_continue { delay_ms = post_wait }` |
| Continue = Auto-follow | následující cue `trigger = auto_follow { prev_cue_id }` |
| Continue = Do Not Continue | následující cue `trigger = manual` |

### Migrace
- Existující cues bez pole → `pre_wait_ms = 0` (lazy default při čtení; bez destruktivní migrace dokumentu).
- CSV import: QLab `Pre Wait` sloupec → `pre_wait_ms` (oprava `csvHeuristics.ts`); QLab `Post Wait` + continue mode → trigger následujícího cue (beze změny).

### Out of scope (potvrzeno)
- Žádné `post_wait` pole na cue (redundantní s next.auto_continue).
- Žádná QLab timeline kompozice více wait fází uvnitř jednoho cue (na to je `wait` payload).
- Pre-wait se NEpoužije pro timecode triggery (ty řeší F2 master clock).

## Důsledky pro F1
- B004-001: pre_wait do typu + dispatch + cue-fire timing + validace + lazy default.
- B004-002: pre-wait UI sloupec/edit + armed-waiting countdown stav.
- B004-010: CSV import oprava pre-wait mapování.
