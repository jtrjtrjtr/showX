---
id: "B003-604"
title: "Dark sweep round 2 — CueEditor, payload editors, CuelistCorePanel, variants + CueRow label overflow"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
bundle: "ShowX-3.6"
depends_on: []
target_files:
  - "pwa/src/components/cuelist/CueEditor.tsx"
  - "pwa/src/components/cuelist/AddPayloadMenu.tsx"
  - "pwa/src/components/cuelist/OperatorCueRow.tsx"
  - "pwa/src/components/cuelist/PayloadList.tsx"
  - "pwa/src/components/cuelist/payloadEditors/**"
  - "pwa/src/components/cuelist/variants/**"
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "src/modules/cuelist-core/src/ui/**"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "Every file in target set swept to B003-501 dark tokens: no hardcoded '#fff'/'#FAF8F1'/light hexes left (grep gate in done report); every text element explicit color; legacy aliases (cream/gray_50/gray_300/gray_700) in tokens.ts may now be DELETED if no consumer remains — verify with grep, document result."
  - "Shell window top section (CuelistCorePanel + ui/* components incl. FirstLaunchPicker, RecentShowsList, DevicesTable, RoutingTable, StatusStrip, dialogs) fully dark — the LAST light surface goes away. ui/tokens.ts in cuelist-core merges/aligns with pwa theme values (same hex values; keep separate file, document why or unify via showx-shared if trivial)."
  - "CueRow label overflow fix (3.5 polish note): grid label track gets minWidth:0 + label text ellipsis with title tooltip; 'Announce' no longer collides with description at 1200px viewport."
  - "Contrast: all swept text ≥ 4.5:1 on its surface (spot-check the 5 worst cases in done report)."
  - "Visual regression guard: keep all data-testids; existing tests updated where they assert styles."
  - "`pnpm -r typecheck` clean, tests pass, `pnpm --filter showx-pwa build` succeeds."
  - "No edits outside target_files."
---

## Context

B003-501 swept the station views; editor screens (CueEditor, payload editors) and the shell window panel were explicitly out of scope and are still light — Jindřich: "druhá obrazovka ShowX vypadá pořád blbě". This closes the theme.

Critic's 501 review listed the exact offenders: CueEditor.tsx, AddPayloadMenu.tsx, OperatorCueRow.tsx, payloadEditors/*, variants/*.

## Watch out

- payloadEditors have many small inputs — use shared input style object, don't copy-paste 30 style literals.
- StatusStrip/StationsTable live in cuelist-core/src/ui (module-owned UI) — separate package; imports of pwa tokens are NOT allowed cross-package; align values, not imports (or move tokens to showx-shared — only if typecheck stays clean across all packages).
