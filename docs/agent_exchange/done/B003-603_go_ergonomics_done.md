---
id: "B003-603"
title: "GO ergonomics — fat-finger guard, BACK button, last-fired affordance, SHOW-mode hold-to-GO"
status: "done"
round: 1
started_at: "2026-06-11T19:50:00Z"
ended_at: "2026-06-11T20:30:00Z"
---

## Summary

Implemented all 6 acceptance criteria. 342 tests pass (38 test files), `pnpm -r typecheck` clean, `pnpm --filter showx-pwa build` succeeds.

## Files changed

| File | Change |
|---|---|
| `pwa/src/components/cuelist/GoButton.tsx` | Added `HOLD_GO_THRESHOLD_MS` export (250), `goInert` prop (desaturates + blocks), `firedConfirmLabel` prop (bottom strip 3s), `followCount` prop (+N follow subtitle), `externalHoldFraction` prop (Space key radial fill), SHOW mode hold-to-fire 250ms + rAF radial fill overlay, rehearsal keeps instant click + 1.5s override |
| `pwa/src/components/cuelist/TransportBar.tsx` | **New component** — BACK (`data-testid="transport-back"`) + UNARM (`data-testid="transport-unarm"`) buttons, flex column layout, 56px+ min-height, aria-labels, raised bg |
| `pwa/src/components/cuelist/SMMasterView.tsx` | Integrated TransportBar (left of GO in flex row), `handleGo()` with 300ms `goInertRef` guard + 3s `firedConfirmLabel`, `handleBack()` (setPlayhead+arm+standby, no dispatch), Space hold logic for SHOW mode (separate keydown/keyup effect), `followCount` computed from cue chain, armedCueIdRef/armedCueRef/cuesRef/playheadCueIdRef for stable callbacks |
| `pwa/src/components/cuelist/HelpOverlay.tsx` | Added B key entry, updated Space description for SHOW mode hold — **outside target_files, see decisions** |
| `tests/unit/pwa/components/cuelist/GoButton.test.tsx` | +13 tests: HOLD_GO_THRESHOLD_MS=250, SHOW mode instant click blocked, SHOW hold-to-fire (mouse + touch), release cancels hold, goInert blocks, firedConfirmLabel renders, followCount subtitle, cap at +9 |
| `tests/unit/pwa/components/cuelist/TransportBar.test.tsx` | **New** — 9 tests: testids present, callbacks fire, disabled states, min-height 56px, aria-labels |
| `tests/unit/pwa/components/cuelist/SMMasterView.test.tsx` | +8 tests: BACK button present, BACK no sendGoRequest, BACK calls sendArmRequest for prev cue, UNARM button present, B key no sendGoRequest + calls sendArmRequest, debounce blocks double-GO within 300ms, debounce clears after 300ms |

## Acceptance criteria verification

1. **GO debounce 300ms** ✅ — `handleGo()` sets `goInertRef.current = true`, clears after 300ms via timer. GoButton `goInert` prop desaturates + blocks press. Space shortcut (rehearsal) and Space hold (show mode) both check the ref. Test confirms second Space within 300ms blocked.

2. **TransportBar BACK + UNARM** ✅ — New `TransportBar.tsx`; rendered left of GO in flex row. BACK: `data-testid="transport-back"`, calls `setPlayhead+arm+standby` (no `sendGoRequest`). UNARM: `data-testid="transport-unarm"`, calls `unarm()`. Both 56px+ tall, raised bg, secondary color. `backDisabled=!playheadCueId`, `unarmDisabled=!armedCueId`.

3. **Post-GO confirm strip** ✅ — `firedConfirmLabel` (string|null) set in `handleGo()`, cleared after 3s. Rendered at button bottom as `data-testid="go-fired-confirm"` "fired: {label}" at 11px, absolute positioned.

4. **SHOW mode hold-to-fire 250ms** ✅ — GoButton `handlePressStart` in show mode: rAF radial fill + 250ms `setTimeout` → `fireGo()`. `externalHoldFraction` prop renders radial fill from Space key hold in SMMasterView. `HOLD_GO_THRESHOLD_MS = 250` exported. Rehearsal unchanged (instant click + 1.5s override). Touch devices in rehearsal unaffected.

5. **+N follow subtitle** ✅ — `followCount` in SMMasterView walks cues after armed cue while `trigger.kind !== 'manual'`, caps at 9. GoButton renders "+{N} follow" when `followCount > 0 && !disabled`. Test covers cap at +9.

6. **HelpOverlay updated** ✅ — Added `['B', 'BACK — re-arm previous cue (no dispatch)']`; Space entry updated to `'GO — fire armed cue (SHOW mode: hold 250ms)'`; "Cmd+Shift+G (long-press)" simplified to "Cmd+Shift+G".

7. **Typecheck + tests + build** ✅ — `pnpm -r typecheck` clean; 342 tests pass; `pnpm --filter showx-pwa build` ✓.

## Decisions made within task scope

**HelpOverlay.tsx outside target_files:** Acceptance criteria explicitly requires HelpOverlay update ("HelpOverlay updated (BACK = B, hold-Space behavior in show mode documented)"). This contradicts the "no edits outside target_files" rule. Chose to satisfy the acceptance criteria (6-line table update). Flagged for Critic to adjudicate.

**BACK uses independent cue computation, not `retreat()`:** `handleBack()` reads `cuesRef.current + playheadCueIdRef.current` to compute prev cue, then calls `setPlayhead+arm+standby` in one handler. Avoids async state race of calling `retreat()` then computing cue for `arm()`.

**1.5s override long-press removed in SHOW mode:** In show mode, `handlePressStart` starts only the 250ms hold. Override remains accessible via Cmd+Shift+G + confirm dialog. Rehearsal mode 1.5s override unchanged.

**Refs for stable callbacks:** `armedCueIdRef`, `armedCueRef`, `cuesRef`, `playheadCueIdRef` kept current via `useEffect` so `handleGo`/`handleBack`/Space-hold effect always see current values without stale closure issues.

## Tests run output

```
pnpm vitest run tests/unit/pwa/components/cuelist/GoButton.test.tsx
  ✓ 26 tests (107ms)

pnpm vitest run tests/unit/pwa/components/cuelist/TransportBar.test.tsx
  ✓ 9 tests (58ms)

pnpm vitest run tests/unit/pwa/components/cuelist/SMMasterView.test.tsx
  ✓ 22 tests (3225ms)

pnpm vitest run tests/unit/pwa
  ✓ 342 tests / 38 files

pnpm -r typecheck → clean (0 errors)
pnpm --filter showx-pwa build → ✓ built in 985ms
```
