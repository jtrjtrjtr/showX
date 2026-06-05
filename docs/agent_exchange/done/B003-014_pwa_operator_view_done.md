---
id: "B003-014"
title: "PWA per-department operator view + variants (LX, SX, VIDEO, AUTO, PYRO, FS)"
status: "done"
round: 1
started_at: "2026-06-07T18:00:00Z"
ended_at: "2026-06-07T18:05:00Z"
---

## Files changed

### New source files
- `pwa/src/components/cuelist/payloadSummaries.ts` — `summarizePayload`, `lxConsoleSummary`, `videoAssetSummary`, `videoTimingHint`, `soundPayloadSummary`, `automationPosSummary`, `pyroChargeRef`, `fsPositionSummary`, `getPayloadSummaryForDept`, `highlightedPayloads`
- `pwa/src/components/cuelist/OperatorCueRow.tsx` — shared row component used by all variants; renders label, extra columns, payload chips (highlighted/dimmed via `highlightedPayloads`), Standby + GO/Confirm buttons; `isSelected`/`onSelect` props for keyboard nav visual
- `pwa/src/components/cuelist/OperatorView.tsx` — variant selector: single-owned routes to dept-specific view; multi-owned falls back to `GenericOperatorView`
- `pwa/src/components/cuelist/variants/LxOperatorView.tsx` — Eos column, go_authority-aware label, keyboard shortcuts (Space/Q/↑↓)
- `pwa/src/components/cuelist/variants/SxOperatorView.tsx` — sound payload column
- `pwa/src/components/cuelist/variants/VideoOperatorView.tsx` — Asset + Duration columns (Duration omitted when null)
- `pwa/src/components/cuelist/variants/AutoOperatorView.tsx` — automation position column
- `pwa/src/components/cuelist/variants/PyroOperatorView.tsx` — safety-critical: red header warning, Arm + Fire double-tap, `isSmCalled` gate, armed state cleared after fire
- `pwa/src/components/cuelist/variants/FsOperatorView.tsx` — position column
- `pwa/src/components/cuelist/variants/GenericOperatorView.tsx` — multi-dept fallback, per-owned-dept columns

### New test files
- `tests/unit/pwa/components/cuelist/OperatorView.test.tsx` — 4 tests (routing: LX, SX, multi-owned, empty-owned)
- `tests/unit/pwa/components/cuelist/variants/LxOperatorView.test.tsx` — 18 tests covering LX filter, SM context, GO button state, lx_ref Eos column, compound cue highlight, go_authority labels, opacity greying, multi-operator isolation, Pyro arm+fire double-tap
- `tests/unit/pwa/components/cuelist/variants/VideoOperatorView.test.tsx` — 8 tests covering VIDEO filter, OSC asset heuristic, duration hint, duration absent, opacity, go_authority labels

## Tests run

```
Tests  30 passed (30) [new tests]
Tests  804 passed (804) [full suite — no regressions]
```

## Decisions made within task scope

1. **`highlightedPayloads` inline in pwa**: Rather than importing from `src/modules/cuelist-core/` (which isn't a PWA dependency), implemented the same logic inline in `payloadSummaries.ts`. Matches the algorithm from B003-005 exactly (`isCanonicalDepartment` heuristic for compound cues, all payloads highlighted for single-dept cues).

2. **`OperatorCueRow` extended with `isSelected`/`onSelect`**: Not in the spec's code sample but required for keyboard navigation visual feedback. Added as optional props with defaults.

3. **PyroOperatorView Arm button disabled after arming**: Once a cue is armed, the Arm button is disabled until fire clears the state. This prevents redundant arm signals.

4. **`void go(cueId)`**: `useGoChannel.go` returns a request ID string; discarded with `void` to satisfy TypeScript's `noUnusedLocals`.

5. **Test paths**: Spec lists `pwa/tests/unit/...` but existing codebase pattern is `tests/unit/pwa/...`. Used the correct existing pattern.

6. **Pyro tests collocated in LxOperatorView.test.tsx**: Task spec only lists 3 test files; Pyro + multi-operator tests are included alongside LX tests to stay within target_files while exceeding the 15+ test requirement (30 total).

## Notes for Critic

- Verify `OperatorView` correctly routes `owned=['VIDEO']` to `VideoOperatorView` (not just the first switch arm).
- Confirm `PyroOperatorView`: Fire button requires arm (disabled until Arm clicked); arm cleared after fire → Fire re-disabled. SM-authority gate via `go_authority === 'sm_called'`.
- Confirm `highlightedPayloads` in `payloadSummaries.ts` matches B003-005 spec: compound cues (dept.length > 1) highlight only tagged-owned payloads; single-dept cues highlight all payloads.
- Verify greyed context cues (opacity 0.4): non-owned watched cues use `isActionable=false` → opacity 0.4 via `OperatorCueRow`.
- Confirm `LxOperatorView` shows `Cue N/M` (not `Eos N/M`) in the Eos column (from `lxConsoleSummary`), while payload chip shows `Eos N/M` (from `summarizePayload`).
- Verify `VideoOperatorView` omits Duration column when `duration_hint_ms` is null.
- Confirm keyboard shortcuts skip when target is INPUT/TEXTAREA/SELECT (inherited from `useKeyboardShortcuts`).
