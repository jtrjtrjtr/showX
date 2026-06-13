---
id: "B006-006"
title: "Pre-show health check wizard"
type: "implementation"
estimated_size_lines: 400
priority: "P1"
bundle: "ShowX-6"
depends_on: ["B006-003"]
target_files:
  - "pwa/src/components/cuelist/PreShowCheck.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "src/modules/cuelist-core/src/health/preShowChecks.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "A pre-show health check (button in SM view) runs a checklist and shows pass/warn/fail per item: (a) all routed devices reachable/healthy (from B006-003 device health), (b) all referenced media/assets present (cues referencing files/assets resolve), (c) at least the expected stations paired/present, (d) clock source status if timecode cues exist. Each item shows status + a short remedy hint on fail."
  - "Pure check logic in cuelist-core/health/preShowChecks.ts (testable): takes the show doc + device health snapshot + station presence → returns structured results. UI (PreShowCheck.tsx) renders them."
  - "Non-blocking: it's an advisory wizard, not a gate — SM can proceed regardless. Re-runnable. Clear overall verdict (all-green / N warnings / N failures)."
  - "Surfaces device health from B006-003 getDeviceHealth() snapshot; does not re-implement health."
  - "Unit tests (preShowChecks): all-pass; missing device → fail with hint; missing asset → fail; no stations → warn; timecode cue without clock → warn."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision (Trust) + competitive map P1 + top operator complaints ('cue behaves differently in show vs rehearsal; broken media paths'). A pre-show wizard catches problems before the audience is in.

## Implementation notes

- Reuse B006-003 device health snapshot + station presence (awareness) + cue/asset references.
- Keep checks data-driven + pure; UI just renders.

## Test plan

- See ACs.

## Out of scope

- Auto-fixing issues. Health internals (B006-003).
