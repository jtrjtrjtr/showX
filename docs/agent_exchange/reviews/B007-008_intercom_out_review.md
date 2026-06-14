---
id: "B007-008"
critic_started_at: "2026-06-14T05:00:00Z"
critic_completed_at: "2026-06-14T05:03:00Z"
verdict: "accepted"
review_round: 2
---

## Round 2 — verifying Round 1 changes_requested items

### Item 1 (required, round 1): "device list renders" + "persistence" tests missing.

**Resolved.** New file `tests/unit/pwa/components/caller/CallerSettings.test.tsx` exists with 4 tests.

- **Device list renders** → `CallerSettings.test.tsx:53-74` stubs `navigator.mediaDevices.enumerateDevices` with 2 audiooutput + 1 audioinput devices; renders `<CallerSettings>`; waits for the async refresh effect to populate options; asserts the `<select>` contains "System default" + "Built-in Speakers" + "USB Intercom" and explicitly does NOT contain "Microphone" (proving the `kind === 'audiooutput'` filter at `CallerSettings.tsx:29`). ✓
- **Selection writes to localStorage** → `CallerSettings.test.tsx:76-95` fires `change` event with `value='usb-1'`; asserts `localStorageMock.getItem(CALLER_SINK_ID_KEY) === 'usb-1'` AND `onDeviceChange` was called exactly once with `'usb-1'`. This validates both the persistence path at `CallerSettings.tsx:62` and the callback at `:66`. ✓
- **Fallback warning renders** (optional, included) → `CallerSettings.test.tsx:97-102` passes `deviceFallback={true}`; finds `[data-testid=caller-settings-fallback-warning]`; asserts text contains "Device unavailable". ✓
- **Permission hint renders** (optional, included) → `CallerSettings.test.tsx:104-112` stubs devices with empty labels (forces the `Output ...` heuristic at `CallerSettings.tsx:30,46`); asserts `[data-testid=caller-settings-permission-hint]` contains "microphone permission". ✓

`localStorageMock` is scoped via `beforeEach` (reset map + stub) + `afterEach` (`vi.unstubAllGlobals()`), so the suite is fully isolated and re-orderable. The `waitFor(() => select.options.length > 1)` pattern correctly synchronises with the async `enumerateDevices` resolution inside `useEffect`. No flakes expected.

### Item 2 (optional cleanup, round 1): dead assertion in `callerAudio.test.ts:388-390`.

**Resolved.** `tests/unit/pwa/callerAudio.test.ts:386-388` now reads:
```
expect(fallbackCalls).toHaveLength(1);
engine.destroy();
});
```
The dead `const audios: MockAudio[] = [];` + `expect(audios).toHaveLength(0)` triad is gone. The real assertion (`fallbackCalls`) is preserved.

## Acceptance criteria re-check (full sweep)

- [x] **AC 1 — setSinkId routing + picker UI + persistence** → `pwa/src/lib/callerAudio.ts:258-266` + `pwa/src/components/caller/CallerSettings.tsx:22-34, 60-67` + `pwa/src/components/caller/CallerPlayer.tsx:51-53,67-69`. Persistence now test-covered at `CallerSettings.test.tsx:76-95`.
- [x] **AC 2 — default fallback + device-disappears** → `callerAudio.ts:258-265` (empty `sinkId` short-circuit + setSinkId reject catch with fallback dispatch); `CallerSettings.tsx:123-134` (yellow ⚠ warning); test coverage at `callerAudio.test.ts:364-388` + new `CallerSettings.test.tsx:97-102`.
- [x] **AC 3 — permission handling, graceful degrade** → `CallerSettings.tsx:22-25, 31-33, 46-48, 135-146`; tested at `CallerSettings.test.tsx:104-112`.
- [x] **AC 4 — Unit tests** → all four enumerated scenarios now covered. Round 1's two-of-four gap is closed.
- [x] **AC 5 — typecheck/build/tests clean, no out-of-scope edits** → `pnpm -r typecheck` Done across all 5 workspaces; `pnpm vitest run tests/unit/pwa/components/caller/CallerSettings.test.tsx` → 4/4 passed in 45ms; `pnpm vitest run tests/unit/pwa/callerAudio.test.ts` → 28/28 passed in 10ms. Source files unchanged from round 1 (only test additions + dead-line removal).

## Code review notes

`CallerSettings.tsx` implementation is unchanged from round 1 — already sound per prior review. The new test file uses standard React Testing Library patterns (jsdom env, `render` / `screen.getByTestId` / `fireEvent.change` / `waitFor` for async effects) and follows the codebase conventions observed in other PWA test files. `Object.defineProperty(navigator, 'mediaDevices', …)` with `configurable: true` is the correct technique for stubbing a getter-backed Web API in jsdom — and the `cleanup()` in `afterEach` plus `vi.restoreAllMocks()` neutralise any cross-test leakage.

The permission-hint test (line 104-112) exercises the `noLabels` heuristic at `CallerSettings.tsx:46` — `list.every((d) => d.label.startsWith('Output '))` — which fires only when ALL devices map to the synthetic prefix. The test stubs both devices with empty labels, so both go through the `label || \`Output ${id.slice(0,8)}\`` fallback at `CallerSettings.tsx:30` and the hint correctly renders. Clean coverage.

## Verdict rationale

Round 1's only blocker — the two missing AC 4 sub-scenarios — has been addressed with a focused, well-isolated test file. The optional cleanup was also performed. No regressions, no scope creep, no edits outside the test directory. Round 2 of B007-008 is accepted.

Bundle ShowX-7 / F4 wave 5 status after this acceptance: B007-007 + B007-008 both accepted → B007-009 (architect E2E gate F4) unblocks per scope rationale.
