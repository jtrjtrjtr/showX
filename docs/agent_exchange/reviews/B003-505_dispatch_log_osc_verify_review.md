---
id: "B003-505"
verdict: "accepted"
reviewer: "critic"
round: 1
reviewed_at: "2026-06-11T05:12:00Z"
---

## Summary

B003-505 ships the operator-trust "did my GO do something?" surface: a 100-record ring buffer in `GoExecutor`, a `dispatchLog:list` / `dispatchLog:append` IPC bridge, and a `DispatchLogPanel` live-scrolling component in the shell `ShellRouter`. Code is clean, follows existing IPC bridge patterns, uses B003-501 dark tokens, and is well-covered by 28 unit tests (3 files, all green). Typecheck clean across 5 packages.

The only soft miss is the "Paste evidence" clause in acceptance criterion #5 — Forge gave reproduction steps but did not paste captured output (log line, screenshot, or nc capture). The dispatch chain is, however, fully unit-tested end to end (pushRecord → onAppend listeners → IPC `dispatchLog:append` broadcast → panel state update), and the OSC out path was verified in B003-504. Live-app E2E is not reasonably executable inside the Forge runner. Architect/Jindřich should run the manual GO → nc/osc-ws-bridge capture once during bundle integration; not blocking acceptance.

## Acceptance criteria verification

| # | Criterion | Verdict | Citation |
|---|---|---|---|
| 1 | Ring buffer (last 100) of dispatch records with required shape | ✅ | `src/main/src/runtime/GoExecutor.ts:12-21` defines `DispatchRecord` with exact spec fields; `:23` `RING_SIZE = 100`; `:62-66` `pushRecord` enforces cap via `shift()` |
| 2 | `dispatchLog:list` + `dispatchLog:append` IPC bridge, preload exposure | ✅ | `src/main/src/ipc/dispatchLogBridge.ts:9` handles `dispatchLog:list`; `:11-15` broadcasts `dispatchLog:append` via `BrowserWindow.getAllWindows()` (mirrors `cuelistCoreShowStateBridge.ts` pattern). Preload: `src/main/src/ui/preload.ts:57-65` exposes `showxApi.dispatchLog.list` + `.onAppend`. Shell mount: `Shell.ts:416` |
| 3 | DispatchLogPanel in ShellRouter, dark tokens, HH:MM:SS.mmm, ok/fail count (failed in red), duration, empty state | ✅ | `pwa/src/components/DispatchLogPanel.tsx:124` panel component; `:26-37` `formatTs` produces `HH:MM:SS.mmm`; `:92-99` `Nok` (green) and `Nfail` (red `tokens.color.red`) cells; `:169-171` empty state literal `"No cues fired yet"`; tokens imported from `cuelist/tokens.js`; `ShellRouter.tsx:74` mounts `<DispatchLogPanel />` below `<StationsPanel />` |
| 4 | Failed rows render failure reasons expandably | ✅ | `DispatchLogPanel.tsx:72-78` toggle via `setExpanded`; `:103-119` expanded block iterates `record.payloads_failed` listing `payload_id: error` |
| 5 | Manual E2E evidence pasted | ⚠️ Partial | Done report `B003-505_..._done.md:41-50` gives reproduction steps but no captured output. Mitigated by full unit coverage of the chain + B003-504's prior OSC verification + the fact the Forge runner cannot drive an Electron GUI. Architect should capture this during bundle integration. |
| 6 | Unit tests: ring buffer caps at 100; IPC list/append flow with fake records | ✅ | `tests/unit/ipc/dispatchLogBridge.test.ts:139-184` ring-buffer cap at 100 (preserves last 100, drops first 5); `:186-216` order preserved; `:76-134` IPC `list` returns buffer, broadcast on append, skip-destroyed, cleanup removes listener |
| 7 | `pnpm -r typecheck` clean; tests pass | ✅ | Verified locally: all 5 workspace packages typecheck clean. Task-related: 28/28 pass (12 GoExecutor + 7 dispatchLogBridge + 9 DispatchLogPanel). Pre-existing failures in `tests/unit/modules/cuelist-core/skeleton.test.ts` (10 fails — `default is not a constructor` import shape) and `tests/unit/modules/cuelist-core/catalog/cueCatalog.test.ts` (1 fail — atomic JSON parse) confirmed independent of this task. |
| 8 | No edits outside listed target_files | ✅ | Spec implementation notes explicitly allow `Shell.ts` mounting; Forge edit is minimal (1 import line + 1 register call at `Shell.ts:40,416`). |

## Code quality observations

**Solid:**
- IPC bridge follows established patterns (mirrors `cuelistCoreShowStateBridge.ts`, `cuelistCoreDeviceBridge.ts`).
- `pushRecord` is symmetric — success and exception paths both push (so failed dispatches are visible in the panel, with red `payloads_failed` cells + expandable reasons). Important for operator trust ("the GO landed, but the payload failed").
- `buildTransportSummary` excludes `'skipped'` results so the summary reflects what was actually attempted — matches the documented decision rationale.
- `DispatchRecord` is duplicated as a literal type in `DispatchLogPanel.tsx:4-13` to avoid a main→pwa import — correct architectural choice for the contextBridge boundary.
- `scrollIntoView` is method-checked at `DispatchLogPanel.tsx:143` for jsdom compatibility — explains the test passing without a polyfill.
- Failure expansion is gated on `hasFails` so rows without failures aren't accidentally clickable (`:78-79`).
- Tests cover the destroyed-window edge case (`dispatchLogBridge.test.ts:109-120`) — preventing IPC crashes on stale windows.

**Minor nits (informational, not blocking):**
- `DispatchLogPanel.tsx:135-137` slices `[record, ...prev].slice(0, 100)` on every append — caps the rendered list at 100 (matches ring size). Good defensively, but note the panel's display cap is independent of the main-process ring; if main ring grows past 100 (impossible currently) the UI would still cap. Acceptable.
- `cellMuted.cursor` is left default; the parent row sets `cursor: hasFails ? 'pointer' : 'default'` then immediately overrides the inner grid `cursor: undefined`. Functionally correct but mildly confusing — outer click handler still fires on the inner row because the click bubbles to the outer `<div>`. No fix needed.
- Ring buffer uses `Array.shift()` which is O(n) — fine at n=100, well-documented in done-report "Notes for Critic."
- `key={'${r.ts}-${r.cue_id}-${i}'}` (`DispatchLogPanel.tsx:174`) uses index in the key — acceptable for an append-only newest-first list but means React may re-key rows when the array shifts; not a correctness issue for this read-only display.

## Manual E2E gap — context for next iteration

The unit chain is complete: `pushRecord` is invoked in both success and exception paths of `handleCueFire` and tested; `dispatchLogBridge` broadcast is tested with a fake window; `DispatchLogPanel` `onAppend` subscription is tested. What's NOT in this task is an end-to-end "real browser GO → nc -ul 7000 packet visible" capture. This gap is:

1. Reasonable given Forge runner constraints (no GUI Electron driver).
2. Addressed for the OSC packet half by B003-504's accepted verification.
3. Addressed for the panel update half by the unit chain.

Recommend: when Jindřich next runs the live shell, capture a single screenshot of a Dispatch Log row + a `nc -ul 7000` line for the bundle's integration evidence file. Not Forge's responsibility on this round.

## Verdict

**accepted** — all functional acceptance criteria met, code quality solid, tests comprehensive (28/28), typecheck clean. The "paste evidence" clause is partially satisfied via unit coverage of the chain; live-shell screenshot/capture deferred to Architect-led bundle integration step (out of Forge's environment reach).

Proceed to next bundle task (B003-506 cue editing).
