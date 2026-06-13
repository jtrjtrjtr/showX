---
task_id: "B005-008"
verdict: accepted
reviewer: critic
round: 1
reviewed_at: "2026-06-13T19:42:00Z"
---

## Verdict: accepted

All 7 acceptance criteria met. Build clean, typecheck clean, 16/16 new unit tests pass; total suite 1842/1842 per Forge report (sampled CountdownView.test.tsx independently — green). Edits confined to declared `target_files`.

## Acceptance criteria — file:line verification

1. **`'countdown'` added to role enum + selectable in PairingView + no cue authority** — ✅
   - Enum updated `pwa/src/lib/types.ts:16` → `role?: 'sm' | 'operator' | 'countdown' | 'companion' | 'observer'`.
   - PairingView state widened `pwa/src/components/PairingView.tsx:46` (`useState<'sm' | 'operator' | 'countdown'>`); `<option value="countdown">Countdown display</option>` at `:249`; `onChange` cast widened at `:243`.
   - `owned_departments = []` enforced at `pwa/src/components/PairingView.tsx:94` (`role === 'countdown' ? [] : ownedDepts`). No GO / no edit affordances rendered (verified below).

2. **CountdownView: full-screen, GIANT digits — show time + countdown + current/next labels + dark high contrast** — ✅
   - 100vw × 100vh container `pwa/src/components/cuelist/CountdownView.tsx:132-143`, dark `tokens.color.bg`.
   - TimecodeDisplay reused via `TimecodeDisplayView clock={clock} size={72}` at `:147` (B005-003 component).
   - Countdown digits at fontSize 120 (`:84`) / idle placeholder at 96 (`:50`).
   - Standing cue label at fontSize 36 teal (`:220-225`); "then:" next-cue at 20 ink_secondary (`:230-240`); "Last" at 28 ink (`:191-196`).
   - All colour tokens (`bg/ink/ink_secondary/ink_disabled/teal/yellow/red`) and font tokens exist in `pwa/src/components/cuelist/tokens.ts:10-16`.

3. **StationRouter routes `role === 'countdown'` → CountdownView** — ✅
   - Import `pwa/src/components/StationRouter.tsx:11`. Routing branch at `:192-194` between `sm` and `operator` (spec called for seam at 185-202; matches the routing block).

4. **Subscribes to clock/playhead/awareness for current+next cue + countdown; no cue-control affordances** — ✅
   - `useClock()` `CountdownView.tsx:103` (B005-002).
   - `useCuelist(cuelistId)` `:104` → `cues` for resolving labels.
   - `usePlayhead(cuelistId)` `:105` → `playheadCueId`, `armedCueId`.
   - `useGoChannel(cuelistId)` `:106` → `preWait` (per-cue pre-wait countdown timestamp) + `lastDispatched`.
   - Standing cue = `armedCueId ?? playheadCueId` `:109`; next cue = neighbour in `cues` `:118-121`; pre-wait remaining = `preWait.waiting_until − now` ticked via RAF `:32-42`. No GO/edit/arm controls rendered (verified by unit test `has NO GO button` + `has NO edit controls`).

5. **Responsive kiosk layout** — ✅
   - Fixed-size large layout (100vw/100vh, padding 48×64, fixed font sizes 72/96/120/28/36) intended for 1080p/4K kiosk per spec; renders in any browser (no fixed pixel widths blocking smaller viewports — flex+space-between scales gracefully).

6. **Unit tests: routing, render, no-GO, pre-wait, cue labels, next-cue** — ✅
   - `tests/unit/pwa/CountdownView.test.tsx` — 16 tests covering: container `:165-168`, timecode `:170-175`, idle countdown `:177-181`, next-cue + last-fired blocks `:183-187`, no-GO `:189-193`, no-edit `:195-199`, pre-wait active `:201-210`, standing cue label `:212-219`, last-fired label `:221-227`, "then:" block `:229-238`, "then" suppressed at end of list `:240-245`, StationRouter routes countdown `:272-278`, no-GO via router `:280-288`, timecode via router `:290-296`, operator stays operator `:298-305`, sm stays sm `:307-314`.
   - Critic re-ran: 16 passed (797 ms total) — verified `Tests 16 passed (16)`.

7. **Build clean, typecheck clean, tests pass, no edits outside target_files** — ✅
   - `pnpm --filter showx-pwa build` → `built in 963ms`, dist 443.18 kB / gzip 127.84 kB, **no `node:*` warnings**.
   - `pnpm -r typecheck` → all 5 projects (`apps/marketing`, `src/shared`, `src/modules/cuelist-core`, `pwa`, `src/main`) Done with no errors.
   - `git diff --stat HEAD --` shows only PairingView (+5/-3), StationRouter (+6/-1), types.ts (+1/-1); plus new CountdownView.tsx + CountdownView.test.tsx. All inside `target_files`.

## Minor observations (non-blocking)

- `buildConnectOpts` `StationRouter.tsx:70` collapses the nested ternary `session.role === 'sm' ? 'sm' : session.role === 'countdown' ? 'operator' : 'operator'` → both non-sm branches resolve to `'operator'`. Functionally correct; explicit-by-intent. Could be simplified to `session.role === 'sm' ? 'sm' : 'operator'` in a future cleanup, but kept as-is signals "countdown is intentionally mapped to operator awareness". No behavioural concern.
- Tests don't assert the numeric countdown value (RAF stubbed), only presence of the pre-wait block. Acceptable per spec ("renders") and aligned with the design decision to keep RAF idle when no pre-wait active.
- No regression: prior tests across the suite untouched (target_files boundary respected).

## Conclusion

Implementation matches the spec's UX intent (giant clock + dominant countdown + current/next labels + no controls), code quality is consistent with existing cuelist views, tests are tight and meaningful, and the build/typecheck/test gates are all green. Verdict: **accepted**.
