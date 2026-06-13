---
id: "B004-010"
title: "CSV import — QLab pre-wait → pre_wait_ms"
type: "implementation"
estimated_size_lines: 160
priority: "P2"
bundle: "ShowX-4"
depends_on: ["B004-001"]
target_files:
  - "src/modules/cuelist-core/src/**/csvHeuristics.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "Locate csvHeuristics.ts (CSV import heuristics). QLab 'Pre Wait' column now maps to cue.pre_wait_ms (from B004-001), NOT to auto_continue.delay_ms."
  - "QLab 'Post Wait' + continue mode still maps to the NEXT cue's trigger (auto_continue{delay_ms} / auto_follow / manual) per decisions/2026-06-13_prewait_timing_model.md mapping table — verify current behavior, fix only if it was conflating pre-wait."
  - "Pre Wait + Post Wait both present on a QLab row → pre→pre_wait_ms, post→next cue trigger. No double-counting."
  - "Unit tests with a QLab-dialect CSV fixture containing Pre Wait and Post Wait columns asserting correct mapping to pre_wait_ms vs next-cue trigger."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Audit + timing decision: csvHeuristics currently maps QLab pre-wait → auto_continue(delay_ms), which is the post-wait slot (semantically wrong). With B004-001's real pre_wait_ms field, fix the mapping.

## Implementation notes

- Small, surgical. Find where pre-wait/post-wait columns are parsed; redirect pre-wait to the cue's pre_wait_ms.
- Keep all other CSV behavior (Eos dialect, label/number heuristics) untouched.

## Test plan

- CSV row: Pre Wait 2.0, Post Wait 1.5, Continue=Auto → imported cue pre_wait_ms=2000; next cue trigger auto_continue delay_ms=1500.
- Pre Wait only → pre_wait_ms set, no spurious next-cue trigger change.

## Out of scope

- Engine timing (B004-001). USITT/QLab native import (later).
