---
id: "B007-003"
title: "LLM draft caller lines (Claude) into editable fields"
type: "implementation"
estimated_size_lines: 320
priority: "P1"
bundle: "ShowX-7"
depends_on: ["B007-001"]
target_files:
  - "src/main/src/caller/llmDraft.ts"
  - "src/main/src/ipc/**"
  - "pwa/src/components/cuelist/CallerLinesEditor.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "Optional LLM draft: for a cue (or batch), call Anthropic API (Claude) to draft more natural standby/go phrasing from cue context (label, departments, description, surrounding cues), writing into caller_lines as EDITABLE drafts (human has final say — never auto-fires unreviewed). Use the latest appropriate Claude model id."
  - "Runs in MAIN process (network); API key via SecretStore (NOT plaintext/env). IPC bridge for PWA 'draft caller lines' action. Graceful when no API key (feature disabled, deterministic generator from B007-002 still works)."
  - "Drafted lines flagged as LLM-drafted (vs deterministic vs hand-edited) so the showcaller knows what to review."
  - "Failure (API error, no key) → clear message, falls back to deterministic generator; never blocks the cue."
  - "Unit tests with a mocked LLM client: draft populates caller_lines; no-key disables gracefully; error falls back; flag set correctly."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context
Per decision §2. For cues where the deterministic template (B007-002) is too robotic, Claude drafts richer phrasing — but into editable fields the showcaller reviews. Optional layer on top of the free deterministic path.

## Implementation notes
- Main process Anthropic call; SecretStore for key (consult claude-api reference for current model id + SDK).
- Keep deterministic generator as the always-available baseline.

## Test plan
- Mock LLM → caller_lines drafted + flagged; no key → disabled; error → fallback.

## Out of scope
- Voice/TTS (004). Deterministic generation (002).
