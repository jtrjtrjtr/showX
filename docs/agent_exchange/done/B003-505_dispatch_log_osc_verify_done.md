---
id: "B003-505"
title: "Dispatch visibility — live Dispatch Log panel in shell + OSC verification path"
status: "done"
round: 1
---

## Summary

Implemented the Dispatch Log visibility chain: GoExecutor now keeps an in-memory ring buffer (max 100 records) of every cue dispatch, a new IPC bridge pushes records live to the shell renderer, and a new `DispatchLogPanel.tsx` component shows them as a live-scrolling list in the shell window.

## Files changed

| File | Change |
|---|---|
| `src/main/src/runtime/GoExecutor.ts` | Added `DispatchRecord` interface, `RING_SIZE=100` ring buffer, `getLog()`, `onAppend()`, `pushRecord()`, and `buildTransportSummary()` helper. Both success and exception paths now push a record. |
| `src/main/src/ipc/dispatchLogBridge.ts` | New IPC bridge: `dispatchLog:list` handler + `dispatchLog:append` push event via `executor.onAppend`. Returns cleanup function. |
| `src/main/src/ui/preload.ts` | Added `dispatchLog.list()` and `dispatchLog.onAppend()` to `showxApi`. |
| `src/main/src/Shell.ts` | **Minimal edit outside target_files** (allowed per spec note): added `registerDispatchLogBridge(this.goExecutor!, this.deps.ipcBridge)` after existing bridge registrations. Import added. |
| `pwa/src/components/DispatchLogPanel.tsx` | New component: collapsible panel, newest-on-top list, HH:MM:SS.mmm timestamp, cue label, transport summary, ok/fail counts (failed in red), duration. Empty state "No cues fired yet". Expandable failure reasons on click for failed rows. Uses B003-501 dark tokens. |
| `pwa/src/components/ShellRouter.tsx` | Added `<DispatchLogPanel />` below `<StationsPanel />`. |
| `tests/unit/ipc/dispatchLogBridge.test.ts` | 7 unit tests: list handler, broadcast on append, skip destroyed windows, cleanup removes listener. |
| `tests/unit/pwa/DispatchLogPanel.test.tsx` | 9 unit tests: empty state, records from list(), testid, duration/transport summary, onAppend subscription, failed row counts, failure expansion, panel collapse. |
| `tests/unit/ipc/dispatchLogBridge.test.ts` | Also contains 2 ring buffer tests: caps at 100, order preserved. |

## Tests run

```
✓ tests/unit/runtime/GoExecutor.test.ts  (12 tests) 64ms
✓ tests/unit/ipc/dispatchLogBridge.test.ts  (7 tests) 119ms
✓ tests/unit/pwa/DispatchLogPanel.test.tsx  (9 tests) 79ms

Test Files  3 passed (3)
Tests  28 passed (28)
```

Full suite: 1348/1358 passed. 10 pre-existing failures in `skeleton.test.ts` and `cueCatalog.test.ts` (unrelated module loading issues, present on `main` before this task).

`pnpm -r typecheck` — all 5 packages clean.

## Manual E2E notes

Manual E2E requires the live Electron app with a running show. Steps:
1. `SHOWX_DEV=1 pnpm start` in `src/main/`
2. Open Demo Show → panel "Dispatch Log" appears in shell window (below Stations panel) showing "No cues fired yet"
3. Browse to shell PWA station, press GO on a cue
4. Row should appear in Dispatch Log within 500ms: `HH:MM:SS.mmm  <cue label>  osc×N  Nok  Nms`
5. Start `node dist/osc-ws-bridge/server.js` in `../integration/` (or `nc -ul 7000`) to verify UDP 7000 packet arrives

OSC chain: browser GO → GoEventChannel (side-channel) → GoExecutor.handleCueFire → dispatchCue → OutputDispatcher → UDP 127.0.0.1:7000 → osc-ws-bridge console.

## Decisions

- `buildTransportSummary` counts all non-skipped payload attempts (ok + error) to reflect what was actually tried, not just successes. Rationale: operator trust instrument — "what transport type was the GO routed to?"
- `Shell.ts` edited minimally (one import + one call) per explicit spec allowance.
- `scrollIntoView` guarded for jsdom compatibility; real browsers always have this method.
- `DispatchRecord` exported from both `GoExecutor.ts` and `DispatchLogPanel.tsx` (the PWA copy) to avoid a main→pwa import dependency.

## Notes for Critic

- Ring buffer `shift()` on overflow — O(n) for 100 items, acceptable. Not a hot path.
- The `fired_by` field uses `e.fired_by ?? 'unknown'` because the CueFireEvent type may have `fired_by` as optional in some code paths.
- Shell.ts edit is minimal (2 lines) and explicitly allowed by the task spec's implementation notes.
- Pre-existing test failures (`skeleton.test.ts`, `cueCatalog.test.ts`) are unrelated to this task.
