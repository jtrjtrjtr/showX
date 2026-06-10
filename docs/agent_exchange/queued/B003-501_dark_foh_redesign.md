---
id: "B003-501"
title: "Dark FOH redesign — cuelist + pairing + station views, contrast-safe theme"
type: "implementation"
estimated_size_lines: 450
priority: "P0"
bundle: "ShowX-3.5"
depends_on: []
target_files:
  - "pwa/src/components/cuelist/tokens.ts"
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/components/cuelist/OperatorView.tsx"
  - "pwa/src/components/cuelist/StandbyPanel.tsx"
  - "pwa/src/components/cuelist/GoButton.tsx"
  - "pwa/src/components/cuelist/CallingText.tsx"
  - "pwa/src/components/cuelist/CueTypeBadge.tsx"
  - "pwa/src/components/cuelist/DepartmentChips.tsx"
  - "pwa/src/components/cuelist/PlayheadIndicator.tsx"
  - "pwa/src/components/cuelist/HelpOverlay.tsx"
  - "pwa/src/components/cuelist/GoConfirmDialog.tsx"
  - "pwa/src/components/PairingView.tsx"
  - "pwa/src/components/DiscoveryView.tsx"
  - "pwa/src/components/StationRouter.tsx"
  - "pwa/public/manifest.webmanifest"
  - "pwa/public/icon-192.png"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "tokens.ts replaced with dark FOH palette (exact values in spec body). NO component may hardcode a color hex — all colors via tokens."
  - "Every text element has explicit `color` from tokens — nothing inherits from global body style. Verification: grep cuelist components for elements without color in their style object where text is rendered on tokens.color.bg/panel."
  - "Contrast: primary text on bg >= 7:1, secondary text >= 4.5:1 (WCAG AA). Cue labels, standby panel buttons, STANDBY heading, GO label all clearly readable."
  - "Playhead row: 4px teal left bar + teal-tinted row background (tokens.color.playhead_bg). Clearly distinguishable from non-selected rows."
  - "Armed cue: red STBY badge (existing) + red-tinted row edge. Firing cue: green background flash, decays after 1.5s (existing isFiring window 2s is fine)."
  - "GO button: min-height 64px, full width, fontWeight 800, fontSize >= 28. Rehearsal: teal bg/white text. Show mode: red bg + lock glyph. Disabled: tokens.color.raised bg + disabled text + reason label visible."
  - "PairingView + DiscoveryView + StationRouter loading/closed/timeout states restyled to same dark theme tokens (import from cuelist/tokens.ts — move tokens to pwa/src/theme/tokens.ts if cleaner, update imports)."
  - "Manifest icon warning fixed: icon-192.png is actually 192x192 (regenerate or fix manifest declaration)."
  - "Existing unit tests updated where they assert on colors/styles; all tests pass; `pnpm --filter showx-pwa typecheck` clean."
  - "No edits outside listed target_files."
---

## Context

Live E2E test 2026-06-10 (Architect + Jindřich): cuelist UI is unusable. Root cause: PWA global style is dark (`body { color: #E0E0E0; background: #0a0a0a }`) while cuelist components paint their own light cream background (`#FAF8F1`) and DON'T set explicit text color on cue labels, StandbyPanel text, etc. Result: light gray text on cream = invisible.

Decision (Architect + Jindřich approved): instead of patching cream theme, go **dark FOH theme** — this is a Front-of-House tool used in dark venues; QLab/EOS/disguise are all dark-themed for this reason. One coherent dark theme across station UI.

## Design spec — token palette

Replace `tokens.color` with:

```ts
color: {
  // surfaces
  bg: '#0E0F12',          // app background
  panel: '#16181D',       // standby panel, header
  raised: '#1E2128',      // buttons, inputs
  border: '#2A2E37',      // row dividers, input borders
  // text
  ink: '#F2F0EB',         // primary text (cue labels, headings)
  ink_secondary: '#9BA0AA', // descriptions, payload summaries
  ink_disabled: '#5C6170',
  // semantic
  teal: '#2DD4BF',        // rehearsal accent, GO, playhead
  teal_dim: '#14534B',    // playhead row tint base
  playhead_bg: '#11302C', // playhead row background
  red: '#EF4444',         // show mode, armed, rejection
  green: '#34D399',       // firing flash
  yellow: '#F5B83D',
  // departments (brightened for dark bg)
  dept: {
    LX: '#F5B83D', SX: '#2DD4BF', VIDEO: '#A78BFA', AUTO: '#9BA0AA',
    PYRO: '#F87171', FS: '#E8D5A0', SM: '#E8E6DF', OTHER: '#6B7280',
  },
}
```

Spacing/font/radius tokens unchanged. Department side bars + chips keep dept colors (they pop nicely on dark).

## Implementation notes

- Sweep EVERY component in `pwa/src/components/cuelist/` + the three station-level views. Replace `cream`→`bg`, `gray_50`→`panel`, `gray_300`→`border`, `gray_700`→`ink_secondary`, and ADD explicit `color: tokens.color.ink` wherever text renders without one (cue label in CueRow is the worst offender — fontSize 24 with no color).
- StandbyPanel arm buttons: `background: tokens.color.raised`, `color: tokens.color.ink`, `border: 1px solid tokens.color.border`; armed one gets red border + red label.
- Search input + selects in PairingView: dark inputs (`raised` bg, `ink` text, `border`).
- Keep all data-testid attributes and aria labels intact — tests + Architect E2E rely on them.
- If you move tokens.ts to `pwa/src/theme/tokens.ts`, update every import; either location accepted.

## Done report

Standard format + include before/after screenshot paths if you can render (optional). List every file swept.
