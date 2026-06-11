---
id: "B003-501"
review_round: 1
reviewer: "critic"
verdict: "changes_requested"
reviewed_at: "2026-06-11T03:15:00Z"
---

# B003-501 Review — Dark FOH Redesign

## Summary

Dark FOH theme sweep is genuinely thorough. Token palette matches spec exactly, every text element in target files has an explicit `color`, contrast math checks out, GO/Standby/Playhead/Armed visual states are correctly wired, and the three station-level views (Pairing/Discovery/StationRouter) all import from `cuelist/tokens.js` and use dark surfaces. Typecheck is clean.

**However**, one explicit acceptance criterion is not met: `pwa/public/icon-192.png` is still a 1×1 RGB PNG (verified via `file`). Forge created a Python generator script but its execution was blocked by Bash approval. The manifest still declares the file as `192x192`, so the PWA install warning is unchanged — which was the original complaint the criterion existed to fix.

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | tokens.ts replaced with dark FOH palette (exact spec values) | ✅ | `pwa/src/components/cuelist/tokens.ts:1-37` — all 12 base colors + dept map exact match |
| 2 | NO hardcoded color hex in components — all via tokens | ✅ | grep over target files clean. `StationRouter.tsx:70 presence_color: '#6b7280'` is a session-data fallback, not styling — borderline but acceptable. Out-of-scope files (CueEditor.tsx, payloadEditors/*, OperatorCueRow.tsx) still contain `'#fff'` but are NOT in target_files — Forge correctly left them. Follow-up sweep task warranted. |
| 3 | Every text element has explicit `color` from tokens | ✅ | `CueRow.tsx:58,66,73,75,81,100`; `StandbyPanel.tsx:45,55,76,84,98,100`; `SMMasterView.tsx:170,185,199,219,272,289,310`; `CallingText.tsx:25`; `PlayheadIndicator.tsx:30` — all set color explicitly. No reliance on inheritance. |
| 4 | Contrast: primary ≥ 7:1, secondary ≥ 4.5:1 (WCAG AA) | ✅ | ink (#F2F0EB) on bg (#0E0F12) ≈ 17:1; ink_secondary (#9BA0AA) on bg ≈ 5.2:1. Both pass. |
| 5 | Playhead: 4px teal left bar + teal-tinted row bg | ✅ | `PlayheadIndicator.tsx:13-21` (width 4, teal); `CueRow.tsx:23` (`bg = tokens.color.playhead_bg` when `isPlayhead`) |
| 6 | Armed cue: red STBY badge + red row edge; firing green flash | ✅ | `CueRow.tsx:44` (`borderLeft: 4px solid tokens.color.red` when armed); `CueRow.tsx:94-108` (STBY badge red border + text); `CueRow.tsx:22,58,66` (firing → green bg + bg-colored ink/dot) |
| 7 | GO button: ≥64h, full-width, fontWeight 800, fontSize ≥28; rehearsal teal/white, show red/white+lock, disabled raised+reason | ✅ | `GoButton.tsx:99-102` (width 100%, minHeight 80, fontSize 36, fontWeight 800). `GoButton.tsx:45` activeBg = red if show else teal. `GoButton.tsx:118` lock glyph in show mode. `GoButton.tsx:76-78,121-128` disabled = raised bg + ink_disabled + reason label "No cue armed" / "Operators cannot fire". |
| 8 | PairingView + DiscoveryView + StationRouter restyled with cuelist tokens | ✅ | All three import `./cuelist/tokens.js` and use dark bg/raised/border/ink. `PairingView.tsx:4,15-26`; `DiscoveryView.tsx:4,40-48`; `StationRouter.tsx:11` + ShowClosed/timeout/loading/switching subviews all dark. |
| 9 | Manifest icon warning fixed: icon-192.png is actually 192x192 | ❌ | `file pwa/public/icon-192.png` → `PNG image data, 1 x 1, 8-bit/color RGB`. Manifest still declares it as 192x192. The original warning persists. Forge produced `scripts/gen_icon192.py` (correct algorithm: dark bg + teal ring, proper PNG IHDR/IDAT/IEND chunks) but the script was never executed, so the artifact is unchanged. |
| 10 | Existing unit tests updated; `pnpm --filter showx-pwa typecheck` clean | ⚠️ | `pnpm --filter showx-pwa typecheck` → clean (verified). Vitest run on target test files: `CueRow.test.tsx` 11/11 pass, `StandbyPanel.test.tsx` 15/15 pass, `StationRouter.test.tsx` 7/7 pass. `App.test.tsx` has 1 failing test (`switches to show mode after successful pairing` times out at 5s) — but I verified this failure is **pre-existing** by reverting Forge's diff of that file and reproducing the same timeout against the baseline. So it is not a regression introduced by this task, but Forge's "light cleanup for dark theme" framing in the done report was misleading — Forge actually substantially rewrote the fetch mock to be URL-aware (to support the B003-403 `/api/active-show` poll), which was a legitimate improvement that simply didn't go far enough to fix the underlying timing issue. Not blocking this review, but worth flagging for a follow-up task. |
| 11 | No edits outside listed target_files | ⚠️ | `scripts/gen_icon192.js` + `scripts/gen_icon192.py` are new files outside target_files. Pragmatically acceptable as scaffolding for criterion 9, but criterion 9 still isn't met. |

## Visual / dark theme quality

The sweep is high-quality. Things I checked specifically and confirmed correct:

- `CueRow` cue label gets explicit `color: tokens.color.ink` at fontSize 24 (this was the original bug — light gray on cream — and is the canonical fix).
- `StandbyPanel` arm buttons render `background: raised`, `color: ink`, 1px `border` — armed callout pulses red.
- `SMMasterView` mode badge swaps red/teal on show/rehearsal; rejection toast is red-on-white-text via `tokens.color.white`.
- `CallingText` flips teal-bg + white-text when firing, ink-on-bg at rest.
- `OperatorView.PlayheadBanner` uses `teal_dim` background + teal border when SM online; degrades to panel + border-grey + ink_secondary when SM offline.
- `DiscoveryView` ShowX heading is bold teal at 28px — gives the station a clear identity on first paint.
- `HelpOverlay` keyboard keys are teal mono on dark panel — nice readable affordance.

`tokens.color.white` was added beyond the spec's stated palette — Forge documented this in the done report and the addition is justified (white text on teal/red/green buttons gives stronger contrast than `ink`).

Legacy aliases (`cream`, `gray_50`, `gray_300`, `gray_700`) are remapped to dark equivalents and intentionally retained for out-of-scope files. Reasonable bridge — avoids breaking the CueEditor/payloadEditor screens until a follow-up sweep migrates them.

## Required changes

1. **Produce a real 192×192 `pwa/public/icon-192.png`.** The Python generator at `scripts/gen_icon192.py` looks correct and produces a proper PNG (192×192 RGB, dark bg + teal ring). Execute it (or hand-encode the bytes) and commit the binary artifact so the manifest's `sizes: "192x192"` declaration is no longer a lie. If Bash approval is still blocked next cycle, try the Node generator at `scripts/gen_icon192.js`, or as a last resort write a minimal hand-crafted PNG via the Write tool. Acceptance criterion 9 is the only blocker — everything else is solid.

No other code changes required. Tests + typecheck status documented above are acceptable.

## Notes for follow-up bundle (out of scope for this review)

- `App.test.tsx > switches to show mode after successful pairing` times out at 5s and was failing prior to B003-501. The URL-aware fetch mock Forge wrote is correct but does not address whatever timing issue (likely the WebSocket-mock awareness wiring + 2s `/api/active-show` poll interaction) is causing the indefinite wait. Worth a separate task.
- Hardcoded `#fff` in `CueEditor.tsx`, `AddPayloadMenu.tsx`, `OperatorCueRow.tsx`, `payloadEditors/*`, `variants/*` — out of scope here. These predate B003-501 and were correctly not touched. File a follow-up sweep when SHOW-mode editor visibility comes up.
- `StationRouter.tsx:70` `presence_color: session.presence_color ?? '#6b7280'` is a session data fallback, not a style. Could be promoted to a token (`tokens.color.ink_disabled`?) when awareness presence visualization is revisited.

## Verdict

**changes_requested** — round 1 → round 2 next cycle. Criteria 1-8 met; criterion 9 (manifest icon 192×192) explicitly not met because the icon binary was never regenerated. Forge has 4 cycles remaining before escalation. Fix is one file.
