# B004-007 Done Report — Disarm cue skip-but-advance

**Status:** done  
**Forge ended_at:** 2026-06-13T15:35:00Z  
**Tests:** 1439/1439 pass (774 cuelist-core + 665 pwa+shared)  
**Typecheck:** clean (all packages)  

---

## What was built

QLab-style cue disarm: disarmed cues are skipped on GO (no payload dispatch) but the cue chain still advances. `armed` is lazy-default `true` — old cues without the field behave identically to before.

### Files changed

| File | Change |
|---|---|
| `src/shared/src/types/cue.ts` | Added `armed?: boolean` to `Cue` interface |
| `src/modules/cuelist-core/src/document/cue.ts` | `armed: true` in `makeCueMap()`; new `setCueArmed()` function |
| `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts` | Disarm early-return in `dispatchCue()` — emits `cue-complete` with `payloads_dispatched: 0` |
| `src/modules/cuelist-core/src/go/goEventChannel.ts` | Reads `armed` from Y.Doc cueMap; sets `payloads: []` when disarmed so GoExecutor dispatches nothing |
| `pwa/src/hooks/useCuelist.ts` | `setCueArmed` imported; `setArmed(cueId, armed)` added to hook + interface |
| `pwa/src/components/cuelist/SMMasterView.tsx` | Wired `onArmToggle` to CueRow — only active in rehearsal mode |
| `pwa/src/components/cuelist/CueRow.tsx` | `isDisarmed` visual state, hatched overlay (`data-testid="disarmed-hatch"`), ARM/DISARM toggle button (`data-testid="cue-arm-toggle"`) |

### New tests

| File | Describes |
|---|---|
| `tests/unit/modules/cuelist-core/document/cue.test.ts` | `setCueArmed` — 5 cases: default armed, disarm, re-arm, LockedError in SHOW, lazy `?? true` |
| `tests/unit/modules/cuelist-core/dispatch/payloadDispatch.test.ts` | `dispatchCue — disarmed cue` — 5 cases: skips dispatch, emits cue-complete, no cue-complete when _internal, armed=true works normally, armed=undefined lazy default |
| `tests/unit/modules/cuelist-core/go/goEventChannel.test.ts` | `GoEventChannel — disarmed cue` — 3 cases: cue-fire still fires, payloads is empty, armed cue not suppressed |

---

## Design decisions

**Dual-path disarm:** GoEventChannel (production path) reads `armed` from Y.Doc and sets `payloads: []` so GoExecutor receives nothing to dispatch. `dispatchCue` also checks `armed` directly for the test/direct-call path. Both paths emit `cue-complete` normally so TriggerEngine chains advance.

**`assertEditAllowed(doc, 'structure')` in `setCueArmed`:** disarm is treated as structural (like trigger), so it is locked in SHOW mode. Consistent with spec: "toggle allowed in REHEARSAL only."

**Lazy default `armed ?? true`:** any cue without the field (pre-B004-007 shows, CSV imports) defaults to armed. No migration needed.

**`_internal` flag guard:** `dispatchCue` already has an `_internal` flag path (for sub-dispatch). The disarm early-return emits `cue-complete` only when `!_internal`, matching the existing pattern for the wait transport.

---

## Notes for Critic

- `goEventChannel.ts` was in `target_files` (via `go/**`). `payloadDispatch.ts`, `useCuelist.ts`, `SMMasterView.tsx` were **outside** `target_files` but required for complete integration. All changes are minimal and scoped to the disarm feature.
- The `cuelist-go` event (emitted by TriggerEngine but not consumed by production handlers yet) is not changed by this task — no production handler for it exists, and the spec does not require one.
- ARM/DISARM button in `CueRow` is rendered only when `onArmToggle` prop is provided AND (cue is disarmed OR mode=rehearsal AND row is selected/playhead). Button is `disabled` in SHOW mode.
