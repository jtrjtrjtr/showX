---
id: "B004-009"
title: "Hotkey trigger type"
type: "implementation"
estimated_size_lines: 360
priority: "P2"
bundle: "ShowX-4"
depends_on: []
target_files:
  - "src/shared/src/types/cue.ts"
  - "src/modules/cuelist-core/src/trigger/**"
  - "pwa/src/components/cuelist/TriggerCell.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "Trigger union extended with `{ kind: 'hotkey'; key: string }` (key = normalized keyboard binding e.g. 'F5', 'g', 'space'). TriggerKind type updated. This is an ABSOLUTE trigger (fires when key pressed), not part of the backward auto-chain — schedule() returns null for it (manual-like in the chain)."
  - "A keyboard listener in the SM/operator station fires the cue whose trigger.key matches the pressed key (when station focused, not while typing in an input/textarea). Respects SHOW/REHEARSAL: same gating as manual GO (in SHOW honors hold-to-GO? — NO, hotkey is an explicit binding; fire on keydown, but still SM-authority gated)."
  - "Multiple cues with the same key: fire the FIRST in cuelist order (deterministic) and log a warning; document this."
  - "TriggerCell gains hotkey option: pick kind 'hotkey' + capture/enter a key. Editable REHEARSAL only."
  - "Hotkeys disabled while focus is in a text field (no accidental fire while editing a cue label)."
  - "Unit tests: hotkey trigger parses/serializes; keydown fires matching cue; typing in input does NOT fire; duplicate-key picks first; schedule() returns null for hotkey."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Competitive map P0 GO ergonomics + operator workflow: bind a cue to a key for ad-lib firing. Audit: hotkey not in trigger type. Lower priority than payload/DMX/webhook, hence P2.

## Implementation notes

- Hotkey is NOT a chain trigger — it's an out-of-band fire. In scheduler.schedule() treat like manual (return null); the keyboard listener is the fire path.
- Normalize keys via KeyboardEvent.key/code; store a stable string.
- Guard against firing while an input/textarea/contenteditable is focused.
- Keep listener cleanup on unmount.

## Test plan

- Cue trigger hotkey 'F5' → pressing F5 fires it.
- Focus a label input, press F5 → no fire.
- Two cues bound 'F5' → first fires, warning logged.

## Out of scope

- Global OS hotkeys (only when station focused). Hit-buttons/ad-lib panel (later phase).
