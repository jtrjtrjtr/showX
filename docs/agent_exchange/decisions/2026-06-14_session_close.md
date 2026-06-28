# Architect session close — 2026-06-14

**Project:** showX
**Date:** 2026-06-14 ~21:30 CEST
**Source thread:** Architect hub chat — maraton: F1→F4 + LTC bundly autonomně, pak v0.7.0 install + řada packaging/UX rescue fixů z Jindřichova živého testu + web rebuild + CI green.
**Status:** End-of-session ritual per WORKFLOW.md / DNA protocol

---

## Phase

ShowX skočil z v0.2.1 (M1) na **v0.7.0**: postavené F1 (operator essentials), F2 (time/timecode), F3 (trust + cue lights), F4 (AI showcaller), LTC — 5 bundlů autonomně (~2240 testů). v0.7.0 DMG nainstalovaná v /Applications. Web showx.xlabproject.net přepsán na plnohodnotnou stránku pro testery (bez EventX integrace, per Jindřich). Jindřich **právě živě testuje** — během toho jsme přes jeho oční nálezy opravili 7 packaging/UX bugů (ESM crash, workspace mounty, package.json klobbr, localhost station, payload-edit reaktivita) a CI maily. Vše pushnuté na main. Scope DISABLED, žádný bundle otevřený.

---

## In-flight tasks

Per state.json: 111 accepted, 16 queued, 3 in_progress.
- **3 in_progress** = batched gate tasky (B004-012 F1 gate, B005-010 F2 gate) ponechané v in_progress — vizuální část gate se sloučila do v0.7.0 a probíhá jako Jindřichův živý test; bookkeeping artefakt, NE aktivní práce. (B006-012, B008-005 už accepted.)
- **16 queued** = B002-001..015 (EventX Bridge / F5 specs z 6.6., NUTNÁ revize) + případné staré nedotčené.
- **Aktivní práce: žádná.** Scope `enabled: false`, runnery no-op.

---

## Decisions ratified this session

1. **Pre/post-wait model** — jediný nový primitiv `pre_wait_ms` (decisions/2026-06-13_prewait_timing_model.md).
2. **F2 Time architektura** — master clock totalFrames, anchor+lokální interpolace broadcast, MTC hand-roll, LTC odložen (2026-06-13_f2_time_layer_architecture.md).
3. **F3 Trust+Cue Lights architektura** (2026-06-13_f3_trust_cuelights_architecture.md). DMG fix keeps `files: to .`.
4. **F4 AI Showcaller design** schválen Jindřichem ("jed f4") — bez Kobbiho poznámek (xlab-strategy/docs/showx_f4_ai_showcaller_design.md + 2026-06-14_f4_ai_showcaller_architecture.md). Cue lights ↔ AI caller = táž data.
5. **LTC architektura** — out+in jeden bundle, native deps OK (audify+libltc-wrapper), bez HW testu teď (2026-06-14_ltc_architecture.md).
6. **Packaging fixy** (decision notes per bug): type:module v packed pkg, workspace mount pod node_modules, root-pkg guard test, localhost station (secure context), cue-edit live-cue reaktivita.
7. **CI**: e2e non-blocking (continue-on-error) dokud Electron-GUI-CI není zelené; unit job buildí workspace deps; auth crypto realm-safe. (CI_FINDINGS_20260614.md)
8. **Web pro testery** = publikační pokyn (Features/UserGuide/Docs/Scenarios/TryIt/Downloads přepsány, v0.7.0, deployed).

---

## Open questions (for next session / user)

1. Jindřichův vizuální/funkční test v0.7.0 — payloady už OK; co dalšího v UI nesedí? (mini-bundle fix nebo green).
2. Apple Developer ID cert → signed/notarized DMG (B006-002 čeká jen na cert).
3. LAN/iPad pairing přes https (Web Crypto secure-context) — chce Jindřich, aby šly stanice na tabletech? Pak nasadit https/cert pro asset server.
4. ElevenLabs + Anthropic API key do SecretStore pro plný AI showcaller; živý LTC signál (audio interface) pro chase lock.
5. e2e v CI zelené (Electron-GUI headless, xvfb) — vrátit jako blocking. Neurgentní.
6. **Next bundle:** F5 EventX Bridge (B002 specs revize) — ALE Jindřich 2026-06-14 řekl odsunout EventX integraci. Potvrdit směr: F5, nebo jiná priorita (rundown/pricing/web)?
7. Systémové (hub session): forge push gate na green CI + CI maily → Carl/Margaret digest místo Jindřichovy schránky.

---

## Next likely action (when Architect returns)

1. Read this session_close note + WORKFLOW.md + decisions 2026-06-14 (esm/workspace/ltc/f4) + CI_FINDINGS_20260614.md.
2. Zpracovat Jindřichův feedback z v0.7.0 testu → případný mini-bundle fix.
3. Potvrdit další směr (F5 vs jiné) + případně revidovat B002 specs proti dnešnímu kódu před zapnutím scope.
4. Pokud Apple cert k dispozici → dokončit signed DMG (B006-002).

---

## Polling state at close

**Mode:** PAUZA
**delaySeconds:** N/A (žádný ScheduleWakeup v letu)
**Reason:** Vše pushnuté, scope disabled, Jindřich testuje živě + rozhoduje další směr — Architect dormantní do nového chatu.

---

## Memory updates this session

- `project_showx.md` — frontmatter description přepsán na v0.7.0; appended sekce "CURRENT STATE 2026-06-14" (F1→F4+LTC, rescue fixy, provoz, pending).
- `MEMORY.md` — project_showx pointer aktualizován + nový feedback pointer.
- `feedback_headless_gate_cannot_see_gui_errors.md` — NOVÁ: headless gate nevidí boot-time GUI chyby; nehlásit "verified" jen z běžícího procesu.

---

## Project repo edits this session (Architect-scope)

- Decision notes (decisions/): prewait, f2/f3 architecture, f4 architecture, ltc architecture, ltc_complete, esm fix, dmg regression, f1/f2/f3/f4 gate-status, session_close.
- Bundles + 50+ task specs (B004/B005/B006/B007/B008 queued/), state.json, claude_runner_scope.json (scope toggles — autorizováno Jindřichem pro autonomní běh).
- Packaging/config (rescue, autorizováno): electron-builder.yml, package.json (root restore ×, version 0.7.0), pnpm-lock.yaml, .github/workflows/ci.yml, docs/dev/* notes, CI_FINDINGS_20260614.md, JINDRICH_TEST_CHECKLIST_*.md, site_content_brief.
- Source rescue edits (autorizováno rescue + Jindřich live debug): pwa StationsPanel/SMMasterView/auth.ts, tests/unit/packageJsonIntegrity.test.ts; apps/marketing/* (web přepis přes subagenty).
- Git: ~20 commitů pushnutých na main (autorizováno Jindřichem). Web deploy na Netlify (autorizováno).

---

## Background monitors stopped

Žádné aktivní monitory (TaskList prázdný). Autonomní /loop wakeupy z F1-F4 fází skončily, když začaly přímé úkoly; žádný ScheduleWakeup v letu.

---

## Closing note

**Solidní:** F1→F4 + LTC kód postavený, ~2240 testů, v0.7.0 nainstalovaná a po sérii packaging fixů reálně bootuje + payloady fungují (Jindřich potvrdil). CI zelené (maily přestanou). Web pro testery živě. **Genuinely open:** vizuální dotažení z Jindřichova testu, signed DMG (cert), https pairing pro tablety, a hlavně **směrové rozhodnutí co dál** (F5 EventX odsunut — co místo něj). Klíčová lekce session zapsaná: headless gate nenahradí oční test — víc se opírat o asar/Node-resolution ověření a Jindřichovu GUI session, méně o "proces běží = funguje".
