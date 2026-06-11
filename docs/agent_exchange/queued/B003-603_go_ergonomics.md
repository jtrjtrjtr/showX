---
id: "B003-603"
title: "GO ergonomics — fat-finger guard, BACK button, last-fired affordance, SHOW-mode hold-to-GO"
type: "implementation"
estimated_size_lines: 250
priority: "P0"
bundle: "ShowX-3.6"
depends_on: ["B003-602"]
target_files:
  - "pwa/src/components/cuelist/GoButton.tsx"
  - "pwa/src/components/cuelist/TransportBar.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/hooks/useGoChannel.ts"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "GO debounce: after a GO fires, the button is inert for 300ms (visual: brief desaturation) — kills double-tap accidents. Keyboard Space respects the same guard."
  - "New TransportBar left of GO (flex row): BACK button (retreats playhead one cue + arms it + standby broadcast — i.e. 'stand by again on the previous cue'; does NOT fire anything) and UNARM button (Esc equivalent). Both 56px+ tall, raised bg, clearly secondary to GO."
  - "Post-GO state affordance (r/techtheatre 'worst mistakes' class): for 3s after a GO, GO button's bottom edge shows 'fired: {label}' in 11px — the operator's eyes never leave the button and still get confirmation. Complements PlaybackHeader (B003-602)."
  - "SHOW mode GO = hold-to-fire 250ms with radial fill indicator (replaces instant click; Space hold equally). Rehearsal mode unchanged (instant). Hold threshold constant exported for tests."
  - "If armed cue's trigger is auto_follow/auto_continue chain (next cues non-manual), GO button subtitle shows '+N follow' so the operator knows one press fires a sequence (QLab sequence awareness)."
  - "All existing keyboard shortcuts keep working; HelpOverlay updated (BACK = B, hold-Space behavior in show mode documented)."
  - "`pnpm -r typecheck` clean, tests pass (incl. debounce + hold timing with fake timers), `pnpm --filter showx-pwa build` succeeds."
  - "No edits outside target_files."
---

## Context

Research: the #1 recurring operator horror story is fat-finger GO into an auto-sequence + frantic recovery. ONYX/Eos solve with dedicated Back semantics; QLab with sequence visibility. We adapt to our model (no fade engine — Back is playhead+arm, not a timed restore).

## Watch out

- BACK must NOT dispatch anything — it's navigation + standby broadcast only. Assert in test.
- '+N follow' count: walk next cues in list order while trigger.kind !== 'manual', cap display at +9.
- Hold-to-fire must not break tap-GO on touch devices in rehearsal (only show mode changes).
- data-testids: `transport-back`, `transport-unarm`, `go-fired-confirm`.
