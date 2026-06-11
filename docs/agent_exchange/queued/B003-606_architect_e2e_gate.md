---
id: "B003-606"
title: "Architect E2E gate — production build + installed-DMG walkthrough before bundle close (process task)"
type: "verification"
estimated_size_lines: 0
priority: "P0"
bundle: "ShowX-3.6"
depends_on: ["B003-601", "B003-602", "B003-603", "B003-604", "B003-605"]
owner_hint: "architect"
target_files:
  - "docs/agent_exchange/WORKFLOW.md"
acceptance_criteria:
  - "Executed by ARCHITECT (not Forge) after all other 3.6 tasks accepted: (1) pnpm -r typecheck + full test suite green; (2) `pnpm --filter showx-pwa build` + `pnpm build` + electron-builder DMG; (3) install to /Applications; (4) scripted walkthrough on the INSTALLED app: pair (session restore), trigger cell edit + propagation, countdown visible on GO, BACK/UNARM, hold-to-GO in show mode, dark editors (no light surface anywhere), inline edit N/L/D/O, cue_number survives relaunch, GO→OSC packet captured on UDP 7000; (5) evidence (log lines + capture + screenshots) in the bundle close decision."
  - "WORKFLOW.md amended with a permanent 'E2E gate' section: every bundle definition MUST include a final architect-owned verification task; bundle cannot close without it. Rationale referenced: 3.4 (3 rescues) + 3.5 (4 rescues) post-accept E2E findings."
---

## Context

Two consecutive bundles shipped Critic-accepted code with wiring-level bugs only live E2E caught (authority context, routing fallback, prod build node:fs). This formalizes the gate Jindřich approved 2026-06-11.

Forge: do NOT claim this task. It stays queued until Architect executes it; Forge runner should skip `type: verification` + owner_hint architect tasks (if the runner picks it up anyway, write a done report stating 'architect-owned, skipping' and move on — Architect will handle).
