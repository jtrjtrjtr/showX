---
id: "B003-021"
title: "Stream Deck — Bitfocus Companion community module"
status: "done"
round: 1
---

## Summary

Companion community module implemented as a self-contained, submitter-ready directory at `external/companion-module-showx/`. All 13 acceptance criteria met. 23 vitest tests pass.

## Files changed

### New files

| File | Lines | Description |
|---|---|---|
| `external/companion-module-showx/companion/manifest.json` | 14 | Companion module manifest (id, author, license, runtime) |
| `external/companion-module-showx/package.json` | 28 | Module package.json (depends on @companion-module/base, ws) |
| `external/companion-module-showx/src/index.ts` | 83 | ShowXInstance class — Companion lifecycle (init/destroy/configUpdated/getConfigFields) |
| `external/companion-module-showx/src/connection.ts` | 168 | ShowXConnection — WS management, event handling, reconnect, send methods |
| `external/companion-module-showx/src/actions.ts` | 90 | 7 action definitions (GO, GO override, standby next, stop, pause, resume, goto) |
| `external/companion-module-showx/src/feedbacks.ts` | 55 | 4 feedback definitions (connected, disconnected, show_mode, cue_armed) |
| `external/companion-module-showx/src/variables.ts` | 16 | 6 variable definitions (connected, current_cue_label, armed_cue_label, last_fired_label, mode, stations_online) |
| `external/companion-module-showx/src/presets.ts` | 85 | 6 button presets (GO, Standby Next, Cue Label, Mode Indicator, Stations Counter, Connection Status) |
| `external/companion-module-showx/README.md` | 92 | Install, configuration, actions, feedbacks, variables, presets, troubleshooting |
| `external/companion-module-showx/HELP.md` | 28 | Short Companion-compatible inline help |
| `tests/unit/external/companion/connection.test.ts` | 186 | 15 vitest tests — connection lifecycle, events, reconnect, send methods |
| `tests/unit/external/companion/actions.test.ts` | 82 | 8 vitest tests — action count, callbacks, options |

## Test run output

```
✓ tests/unit/external/companion/actions.test.ts  (8 tests) 4ms
✓ tests/unit/external/companion/connection.test.ts  (15 tests) 8ms

Test Files  2 passed (2)
Tests  23 passed (23)
Duration  334ms
```

Full suite: 3 pre-existing failures (Shell.test.ts IPC channel mismatch, pwa/App.test.tsx pairing timeout, cueCatalog.test.ts ENOTEMPTY). None related to this task.

## Decisions made within task scope

### `crypto.randomUUID()` instead of `uuid` package

The task spec showed `import { v4 as uuidv4 } from 'uuid'` but `uuid` is not in the ShowX workspace `node_modules`. Used `crypto.randomUUID()` (Node.js built-in, available ≥16) instead. The external `package.json` does not list `uuid` as a dependency. This is a strict improvement — one fewer dep.

### `cuelistId` added as a config field

The task spec's `ShowXConfig` didn't include `cuelistId`, but actions (stop, pause, resume, goto) require it. Added as a required config field. This is necessary — there's no way to target a specific cuelist without it.

### `cue_label` not in `GoDispatched` — falls back to `cue_id`

`GoDispatched` (B003-008) has no `cue_label` field. `go.dispatched` handler uses `cue_label ?? cue_id` as the spec shows; in practice always falls back to `cue_id`. Labels would require either a catalog lookup or adding `cue_label` to `GoDispatched` — deferred post-MVP.

### `armed_cue_label` populated from `arm.broadcast.cue_id`

`ArmBroadcast` has `cue_id` + `standby_note` but no `cue_label`. Module stores `cue_id` as `armed_cue_label`. Same label-resolution gap as above — acceptable for MVP.

### Tests placed in `tests/unit/external/companion/`

The root `vitest.config.ts` includes `tests/unit/**/*.test.ts`. The companion module has its own `package.json` for Companion publishing but tests run in the ShowX workspace context (no `@companion-module/base` installed, no separate vitest config needed).

### stop/pause/resume/goto messages use non-spec topics

`stop.request`, `pause.request`, `resume.request`, `goto.request` are not in `goEventChannel.ts`. They're best-effort sends; the ShowX side needs to subscribe to these topics to act on them. Flagged in README as a future server-side addition.

## Notes for Critic

- Verify manifest.json fields match Companion community module index requirements (id, name, author, license, entrypoint, api_version).
- Verify `reconnect` uses exponential backoff (doubling from 1s, max 30s) — `Math.min(delay * 2, 30000)`.
- Verify `disconnect()` sets `stopped = true` preventing reconnect loop — test #6 covers this.
- Verify pairing token is entered via Companion config field only — no hardcoded secrets.
- Verify README mentions that PR submission is handled by XLAB/Jindřich (not Forge).
- Note: `@companion-module/base` is listed in the module's `package.json` but is NOT installed in the ShowX workspace — `index.ts` imports from it but is not directly tested (Companion handles compilation at install time). Tests cover `connection.ts` and `actions.ts` which don't import from `@companion-module/base`.
- Note: 3 pre-existing test failures in full suite; none from this task.
