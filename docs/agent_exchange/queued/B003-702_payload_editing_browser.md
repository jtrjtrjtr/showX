---
id: "B003-702"
title: "Payload editing v browseru — payload list + editory v CueEditDialog"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
bundle: "ShowX-3.7"
depends_on: ["B003-701"]
target_files:
  - "pwa/src/components/cuelist/CueEditDialog.tsx"
  - "pwa/src/components/cuelist/PayloadList.tsx"
  - "pwa/src/components/cuelist/AddPayloadMenu.tsx"
  - "pwa/src/components/cuelist/payloadEditors/**"
  - "src/modules/cuelist-core/src/document/payload.ts"
  - "src/modules/cuelist-core/src/index.ts"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "CueEditDialog (dblclick na cue) gains Payloads section: list existujících payloadů (typ, summary, device) + AddPayloadMenu + per-payload editor. REUSE existujících komponent (PayloadList, AddPayloadMenu, payloadEditors/* — dnes používané jen v shell CueEditor) — NE nová implementace; refactor na sdílení, pokud jsou shell-coupled."
  - "Minimálně tyto payload typy editovatelné: osc (address+args), lx_ref (cue_list, cue_number, device), midi (basic), wait (ms). Ostatní typy: read-only summary + poznámka 'edit in shell'."
  - "Writes via cuelist-core document/payload.js helpers (updatePayload/addPayload/removePayload — ověř existenci, případně doplň add/remove do knihovny s testy; NIKDY ad-hoc Y.Map v komponentě)."
  - "Validace před zápisem (existing ValidationError path); chybové stavy inline u pole."
  - "SHOW mode: payloads locked (payload_frozen_at UX zachováno). Propagace na druhou stanici live."
  - "Production build guard: ŽÁDNÝ node:* import nesmí přitéct do PWA bundle přes payload editory (lekce 3.5 — modeState split; ověř `pnpm --filter showx-pwa build`)."
  - "`pnpm -r typecheck` clean, tests pass."
  - "No edits outside target_files."
---

## Context
Slíbeno v USER_GUIDE jako M1: stanice = plnohodnotný editor. Shell CueEditor zůstává (panel v shell okně), ale browser dialog dostane payload editaci. Editory existují — úkol je je SDÍLET, ne psát znovu.
