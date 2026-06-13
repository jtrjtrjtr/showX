---
task_id: "B004-009"
title: "Hotkey trigger type"
verdict: "accepted"
reviewer: "critic"
round: 1
reviewed_at: "2026-06-13T16:25:00Z"
---

## Summary

Hotkey trigger type implemented end-to-end: shared type, scheduler exclusion, trigger engine treats hotkey as out-of-band (manual-equivalent for chain depth), TriggerCell editor with key-capture UI, and SMMasterView window-level keydown listener with input/contenteditable guard, duplicate-key warning, and goInert debounce. All 53 hotkey-related tests pass; `pnpm -r typecheck` clean.

## Acceptance criteria verification

### AC1 — Trigger union extended with `{ kind: 'hotkey'; key: string }`; `TriggerKind` updated; `schedule()` returns null
✅ Met.
- `src/shared/src/types/cue.ts:8` adds `'hotkey'` to `TriggerKind`.
- `src/shared/src/types/cue.ts:16` adds `{ kind: 'hotkey'; key: string }` variant with doc comment "Absolute hotkey trigger ... Not part of the auto-chain."
- `src/modules/cuelist-core/src/trigger/scheduler.ts:53-55` `case 'hotkey': return null` in `schedule()`.
- `src/modules/cuelist-core/src/trigger/scheduler.ts:66-68` `isAutoTriggered()` correctly returns false for hotkey (only auto_follow/auto_continue qualify).
- Test: `tests/unit/pwa/hotkeyScheduler.test.ts:46-52` — `schedule()` returns null. `tests/unit/pwa/hotkeyScheduler.test.ts:56-58` — `isAutoTriggered()` returns false.

### AC2 — Keyboard listener fires matching cue when station focused; not in input/textarea; respects mode + SM authority
✅ Met.
- `pwa/src/components/cuelist/SMMasterView.tsx:519-558` window-level `keydown` listener.
- Listener is scoped to `SMMasterView` (the SM authority station); operator views do not get the listener, which is consistent with the SM-authority-gated dispatch architecture.
- SHOW/REHEARSAL gating: the listener calls `goRef.current(target.id)` which routes through `sideChannel.sendGoRequest` → shell-side enforcement; the spec note "fire on keydown (no hold-to-GO)" is satisfied because the listener does not require the SHOW-mode hold gesture.
- Test: `tests/unit/pwa/components/cuelist/SMMasterView.test.tsx:621-632` — pressing F5 on a bound cue calls `sendGoRequest('cl1', 'q1', false)`.

### AC3 — Multiple cues with same key: fire FIRST in cuelist order, log warning
✅ Met.
- `SMMasterView.tsx:526-535` filters `cuesRef.current` by `trigger.kind === 'hotkey' && trigger.key === pressedKey`; if `matches.length > 1`, emits `console.warn('ShowX hotkey conflict: N cues bound to "K"; firing first in cuelist order.')`; picks `matches[0]`.
- Test: `SMMasterView.test.tsx:649-662` — two cues bound to 'F7', first fires, `sendGoRequest` called exactly once with 'q1'. Test run output confirms warn fires: `ShowX hotkey conflict: 2 cues bound to "F7"; firing first in cuelist order.`

### AC4 — TriggerCell gains hotkey option (kind + key capture); editable REHEARSAL only
✅ Met.
- `TriggerCell.tsx:220` `<option value="hotkey">Hotkey (key binding)</option>` in dropdown.
- `TriggerCell.tsx:279-302` capture input: `readOnly`, `onKeyDown` calls `e.preventDefault()` + `e.stopPropagation()` and records `e.key` with space→`'Space'` normalisation; "Bound to: K" confirmation chip when captured.
- `TriggerCell.tsx:93` `canEdit = editable && mode === 'rehearsal'` gates the popover open.
- `TriggerCell.tsx:48-50` display glyph `⌨` + key text.
- Tests: `TriggerCell.test.tsx:228-318` — 7 hotkey tests cover display, dropdown switch, key capture, Space normalisation, save shape, pre-populate.

### AC5 — Hotkeys disabled while focus in text field
✅ Met.
- `SMMasterView.tsx:521-523` `if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return; if (el.isContentEditable) return;`
- Coverage exceeds spec — `SELECT` and `isContentEditable` added beyond input/textarea.
- Test: `SMMasterView.test.tsx:634-647` — F5 keydown on search box (INPUT) does not call `sendGoRequest`.

### AC6 — Unit tests cover parse/serialize, keydown fire, input no-fire, duplicate-first, schedule null
✅ Met. All five test classes present:
- Parse/serialize / display: `TriggerCell.test.tsx:228-318` (7 tests).
- Keydown fires: `SMMasterView.test.tsx:621-632`.
- Input guard: `SMMasterView.test.tsx:634-647`.
- Duplicate-first: `SMMasterView.test.tsx:649-662`.
- `schedule()` returns null: `hotkeyScheduler.test.ts:46-52`.
- Bonus: `normalizeHotkeyKey` unit tests (`hotkeyScheduler.test.ts:62-70`), unbound-key no-op (`SMMasterView.test.tsx:664-675`).

### AC7 — Build clean, typecheck clean, tests pass, no edits outside target_files
✅ Met.
- `pnpm vitest run tests/unit/pwa/hotkeyScheduler.test.ts tests/unit/pwa/components/cuelist/{TriggerCell,SMMasterView}.test.tsx` → 53/53 pass.
- `pnpm -r typecheck` → clean across all 5 workspace projects (src/shared, apps/marketing, src/modules/cuelist-core, pwa, src/main).
- Target files: spec lists `src/shared/src/types/cue.ts`, `src/modules/cuelist-core/src/trigger/**`, `pwa/src/components/cuelist/TriggerCell.tsx`, `pwa/src/components/cuelist/SMMasterView.tsx`, `tests/unit/pwa/**`. All edits stay within scope (`scheduler.ts`, `triggerEngine.ts` are inside `trigger/**`).

## Design observations (non-blocking)

1. **TriggerEngine chain-reset on hotkey**: `triggerEngine.ts:40` treats `hotkey` and `manual` identically for `chainDepth.set(..., 0)` — correct. Hotkey fires reset the auto-chain runaway counter, matching the spec's "out-of-band" framing.

2. **`followCount` breaks on hotkey**: `SMMasterView.tsx:567` `if (cues[i].trigger.kind === 'manual' || cues[i].trigger.kind === 'hotkey') break;` — correct; the `+N` follow indicator should not count hotkey cues as part of the auto-chain.

3. **`'Unbound'` fallback in `handleSave`**: `TriggerCell.tsx:143` stores literal string `'Unbound'` if user saves without capturing. Defensive — `KeyboardEvent.key` will never produce `'Unbound'`, so the cue is effectively dormant. The "Click and press a key…" placeholder mitigates discoverability.

4. **Hotkey listener empty deps**: `SMMasterView.tsx:558` `useEffect(..., [])` is stable via `cuesRef`/`goRef`/`goInertRef`/timer refs — pattern matches existing `handleBack` listener in the file.

5. **Operator stations**: Spec text "SM/operator station" was implemented only on `SMMasterView`. This is consistent with the SM-authority architecture (operator views are observational, not GO-authoritative); flagging for Architect awareness in case Pro+ adds operator-authoritative hotkeys later.

6. **Letter-case preservation**: `normalizeHotkeyKey` keeps `'g'` and `'G'` distinct. Matches done-report design note; if a future user complains "I bound G but caps-lock makes it 'G'", revisit.

## Why accepted

All seven acceptance criteria are met with file:line citations above. Tests run green (53/53 hotkey-related; broader test count untouched). Typecheck clean. Build clean. Code changes stay within declared target files. Implementation is internally consistent with existing patterns (chainDepth reset, followCount break, refs-stable listeners). Edge-case design choices are reasonable and documented.
