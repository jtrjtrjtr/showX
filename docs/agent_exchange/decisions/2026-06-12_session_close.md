# Architect session close — 2026-06-12

**Project:** showX
**Date:** 2026-06-12 ~20:15 CEST
**Source thread:** Architect hub chat (maraton 2026-06-10 večer → 2026-06-12: 3.5 close, 3.6, layout hotfix, 3.7, web docs)
**Status:** End-of-session ritual per WORKFLOW.md / DNA protocol

---

## Phase

M1 „Operator MVP" je kompletní. v0.2.1 nainstalovaná v /Applications, vše pushnuté na GitHub (e78fee7), dokumentace + scénáře živě na showx.xlabproject.net. Jindřich má v mailu testovací checklist; session končí čekáním na jeho test a na GO pro M2 (EventX Bridge). Žádný bundle otevřený, scope disabled.

---

## In-flight tasks

**None.** 67/67 dosud zadaných tasků accepted; 15 queued = B002-001..015 (ShowX-2 EventX Bridge specs, čekají na M2 GO, mimo scope). Scope: `enabled: false`, bundle `ShowX-3.7-CLOSED`.

---

## Decisions ratified this session

1. **Roadmapa M1→M5 + cílový stav** schválena Jindřichem („ano") — pořadí M1 (operator UI) před M2 (Bridge). `xlab-strategy/docs/showx_product_roadmap.md`.
2. **Competitive feature map** (10 produktů, 4 research agenti) jako backlog source. `showx_competitive_feature_map.md`.
3. **E2E gate binding** ve WORKFLOW.md + dodatek „screenshoty prohlížet okem" (po 3.6 layout regresi).
4. **Freeze výjimka** (Jindřich varianta A): showx runnery enabled navzdory stabilizačnímu freeze #104; eventx+bridgex zůstávají frozen.
5. **Dokumentace na web** = publikační pokyn — Scenarios stránka + User Guide 0.2 sekce + Downloads 0.2.1 nasazeny (Netlify CLI deploy, web NENÍ git-linked).
6. Drobné UX zámky z hotfixu: manual trigger glyph-only, STBY na vybraném řádku, klik=výběr / gutter=playhead.

---

## Open questions (for next session / user)

1. Jindřichův test v0.2.1 podle mailového checklistu — odhalí gaps pro feedback mini-bundle, nebo rovnou M2?
2. GO na M2 (ShowX-2 EventX Bridge, B002-001..015)? Pozn.: Kongres 17. 6. jede na BridgeX, M2 není pro Kongres kritické.
3. Visa Universe (říjen) jako první ostré nasazení v0.5 — potvrzeno z roadmapy jen rámcově („ano" na celý dotaz), stojí za explicitní potvrzení.
4. Pricing diskuze — roadmapa navrhuje otevřít u M4.
5. Pre/post-wait QLab kompozice = datový model — rozhodnout před M2 specs review (poznámka v 3.6 open decision).

---

## Next likely action (when Architect returns)

1. Read this session_close note + WORKFLOW.md + 2026-06-11_showx_3_7_bundle_complete.md.
2. Zpracovat Jindřichův feedback z testu v0.2.1 (pokud přišel) → případně mini-bundle 3.8.
3. Na GO: otevřít M2 — review B002 specs proti dnešnímu stavu kódu (vznikly 6. 6., před 3.3-3.7 změnami — NUTNÁ revize specs před enable!), pak scope enable.
4. Po Kongresu (17. 6.): ověřit konec stabilizačního freeze + případně re-enable eventx/bridgex runnerů.

---

## Polling state at close

**Mode:** PAUZA
**delaySeconds:** N/A
**Reason:** Bundle uzavřen, vše čeká na Jindřichův test/rozhodnutí — Architect dormantní do nového chatu.

---

## Memory updates this session

- `project_showx.md` — kompletní aktualizace na stav 2026-06-12 (M1 done, v0.2.1, provozní poznámky vč. manuálního Netlify deploye a CDP launch postupu); 06-07 handoff označen HISTORICKÉ.
- `feedback_e2e_gate_eyes_on.md` — NOVÁ lesson memory (gate = installed app + eyes-on screenshoty).
- `MEMORY.md` — oba indexové řádky aktualizovány.
- `~/Daniel/memory/session_log.md` — průběžné zápisy 2026-06-11 (3.5/3.6/3.7) už zapsány během maratonu.

---

## Project repo edits this session (Architect-scope)

- `docs/agent_exchange/decisions/` — bundle open/complete noty 3.5/3.6/3.7 + tento close
- `docs/agent_exchange/WORKFLOW.md` — E2E gate sekce + eyes-on dodatek
- `docs/agent_exchange/state.json` + `claude_runner_scope.json` — bundle lifecycle (Architect pravomoc)
- `docs/USER_GUIDE_cues_devices_routing.md`, `docs/TESTING_CHECKLIST_v0.1.14.md`
- `apps/marketing/` — Scenarios.tsx, UserGuide sekce, Downloads, Nav/App/i18n (web obsah; nasazeno na pokyn)
- Rescue mode (explicitně autorizováno): layout hotfix 0a0ae7c + E2E rescues v 3.5 (GoExecutor octx, resolveRouting, modeState, atomicWrite) — detail v bundle complete notách
- Pozn.: tento close note + memory zůstávají necommitnuté (hard limit: no git commit bez výzvy)

---

## Background monitors stopped

Žádné aktivní monitory — 3.7 monitor ukončen automaticky (FORGE-DONE exit) 2026-06-11; deploy watcher doběhl. TaskList ověřen při close.

---

## Closing note

Solidní: celý M1 za ~30 hodin od „neproklikatelné" v0.1.13 k v0.2.1 s authoringem, dispatchem a dokumentací; gate proces se prokazatelně učí (3.5: 4 rescues → 3.6: layout miss → 3.7: čisté). Genuinně otevřené: jestli Jindřichův reálný test odhalí UX díry, které z CDP prokliku nevidím (jeho screenshot 11. 6. byl cennější než celý můj gate), a revize stáří B002 specs před M2. Jindřich rozhoduje: feedback → mini-bundle vs. rovnou M2.
