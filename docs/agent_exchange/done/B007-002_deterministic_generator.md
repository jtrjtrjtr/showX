---
id: "B007-002"
title: "Deterministic caller generator + simultaneous-mark aggregation"
type: "implementation"
estimated_size_lines: 380
priority: "P0"
bundle: "ShowX-7"
depends_on: ["B007-001"]
target_files:
  - "src/modules/cuelist-core/src/caller/generateCallerLines.ts"
  - "src/modules/cuelist-core/src/caller/aggregate.ts"
  - "pwa/src/components/cuelist/CallerLinesEditor.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "Pure generator generateCallerLines(cue, cuelistContext) → CallerLineGroup from cue data (department[], cue_number, label): standby per dept = '{Dept} — standby for {cue_number} {label}', go = '{depts} — GO'. Deterministic, no LLM, no network."
  - "Aggregation (aggregate.ts): when multiple departments fire at the same moment (compound cue, or adjacent cues with same trigger instant), produce a combined aggregate line e.g. 'Lights, pyro, sound — standby… GO'. Pure logic over the compound-cue / trigger structure."
  - "UI: a 'Generate from sheet' action in CallerLinesEditor fills caller_lines via the deterministic generator (writes via setCueCallerLines from B007-001). Showcaller can then edit. Bulk 'generate for all cues' option."
  - "Idempotent + non-destructive option: generating does not silently overwrite manually-edited lines without confirmation (flag generated vs hand-edited, or confirm overwrite)."
  - "Unit tests: single-dept standby/go text; multi-dept aggregate; compound cue aggregation; cue_number/label interpolation; empty department handling."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context
Per decision §2. Covers most cues for free (no LLM, no cost). The aggregation of simultaneous marks ('Lights, pyro, sound — GO') is the showcaller's core repetitive task that the mail calls out.

## Implementation notes
- Pure functions; UI calls them and writes via B007-001 helper.
- Aggregation reads compound-cue structure (children firing together) + same-instant triggers.
- Don't clobber hand edits silently.

## Test plan
- See ACs.

## Out of scope
- LLM draft (003). TTS (004). Playback (006).
