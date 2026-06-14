---
id: "B007-008"
title: "Intercom out — audio device selection"
status: "done"
owner: "forge"
started_at: "2026-06-14T11:00:00Z"
ended_at: "2026-06-14T11:15:00Z"
review_round: 2
---

## Round 2 — addressing Critic review (round 1)

### Critic items addressed

**Item 1 (required): "device list renders" and "persistence" tests missing.**

Added `tests/unit/pwa/components/caller/CallerSettings.test.tsx` (new file, 4 tests):

1. **Device list renders** — stubs `navigator.mediaDevices.enumerateDevices` with 2 `audiooutput` + 1 `audioinput` device; renders `<CallerSettings>`; waits for async effect; asserts `<select>` contains "System default", "Built-in Speakers", "USB Intercom" and does NOT contain "Microphone" (filtered out by kind).

2. **Selection writes to localStorage** — loads 2 audiooutput devices; simulates `change` event with `value='usb-1'`; asserts `localStorageMock.getItem(CALLER_SINK_ID_KEY) === 'usb-1'` and `onDeviceChange` called once with `'usb-1'`.

3. **Fallback warning renders** — passes `deviceFallback={true}`; asserts `[data-testid=caller-settings-fallback-warning]` contains "Device unavailable".

4. **Permission hint renders** — stubs devices with empty labels (maps to `Output ...`); asserts `[data-testid=caller-settings-permission-hint]` contains "microphone permission".

Note: jsdom's built-in `localStorage` is not available in this Vitest environment (warning `--localstorage-file` provided without valid path). Test uses a manual `localStorageMock` object stubbed via `vi.stubGlobal('localStorage', ...)` in `beforeEach`/`vi.unstubAllGlobals()` in `afterEach`. The component's try-catch around `localStorage.setItem` is still exercised (no exception because our mock is a real object).

**Item 2 (optional cleanup): dead assertion in `callerAudio.test.ts:388-390`.**

Removed the 3 dead lines:
```
// Engine continues playing on default (play should still be called after fallback)
const audios: MockAudio[] = [];
engine.destroy();
expect(audios).toHaveLength(0); // from this engine instance
```
Replaced with just `engine.destroy()`. The real assertion (`expect(fallbackCalls).toHaveLength(1)`) remains.

## Files changed

- `tests/unit/pwa/components/caller/CallerSettings.test.tsx` — **NEW**: 4 tests covering device list render, selection persistence, fallback warning, permission hint
- `tests/unit/pwa/callerAudio.test.ts` — removed dead 3-line block (lines 387-390 round 1); `engine.destroy()` call kept

No production source files changed. All implementation from round 1 is correct per Critic review.

## Tests run

```
Test Files  167 passed (167)
     Tests  2133 passed (2133)
  Duration  13.62s
```

Round 1 total was 2129. Round 2: +4 (CallerSettings.test.tsx). Net +4.

## Notes for Critic

- All 4 AC scenarios from Critic's "What Forge must change" are covered (device list renders, persistence — required; fallback warning, permission hint — optional but included).
- `localStorageMock` is scoped to each test via `beforeEach`/`afterEach` reset — tests are fully isolated.
- The `waitFor(() => select.options.length > 1)` pattern correctly waits for the async `enumerateDevices` resolution before asserting or interacting.
- `pnpm -r typecheck` passes (all 5 workspaces). Full 2133-test suite green.
