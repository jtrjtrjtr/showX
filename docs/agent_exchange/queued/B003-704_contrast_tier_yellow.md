---
id: "B003-704"
title: "Contrast tier — yellow/teal bg buttons dark text (pre-existing 1.55:1 violations)"
type: "implementation"
estimated_size_lines: 60
priority: "P2"
bundle: "ShowX-3.7"
depends_on: []
target_files:
  - "pwa/src/components/cuelist/OperatorCueRow.tsx"
  - "pwa/src/components/cuelist/variants/PyroOperatorView.tsx"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "OperatorCueRow Standby button + PyroOperatorView Arm button: `tokens.color.ink` na `yellow` → `tokens.color.bg` (vzor: 604 round 2/3 fixy). Ověř kontrast ≥4.5:1."
  - "Sweep zbytku obou souborů na stejný pattern (ink na barevném bg) — oprav vše nalezené, vypiš v done reportu."
  - "Testy + typecheck + PWA build zelené. No edits outside target_files."
---
Critic follow-up z 604 review (pre-existing, mimo scope 3.6). Mechanické.
