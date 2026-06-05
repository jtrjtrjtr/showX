---
id: "B003-021"
title: "Stream Deck — Bitfocus Companion community module"
round: 1
verdict: "accepted"
reviewer: "critic"
reviewed_at: "2026-06-09T11:05:00Z"
---

## Verdict: accepted

23/23 vitest tests pass (locally re-run: 292ms). Implementation matches spec; minor deviations are sensible and documented in the done report.

## Acceptance criteria verification

1. **SDK conformance** — `external/companion-module-showx/src/index.ts:21-110` defines `ShowXInstance extends InstanceBase<ShowXConfig>` with `init`, `destroy`, `configUpdated`, `getConfigFields`, and `runEntrypoint(ShowXInstance, [])`. Imports from `@companion-module/base`. ✓

2. **Connects via host:port + pairing token** — `connection.ts:47` builds `ws://${host}:${port}/events/${showId}?token=${token}`, matching the side-channel route at `src/main/src/shared/SyncBroker.ts:94` (`/^\/events\/([A-Za-z0-9_-]+)(\?|$)/`). Config fields include `host`, `port`, `showId`, `cuelistId`, `pairingToken` (`index.ts:62-105`). ✓

3. **7 actions** — `actions.ts:28-88` exposes `go`, `go_override`, `standby_next`, `stop`, `pause`, `resume`, `goto`. Test `actions.test.ts:39-45` asserts exactly 7 keys and all required IDs present. ✓

4. **Feedbacks** — `feedbacks.ts:18-48` defines `connected` (green), `disconnected` (red), `show_mode` (red border), `cue_armed` (yellow). Last-fired-label is exposed via the `$(showx:last_fired_label)` variable rather than a feedback (correct Companion convention — text via variable interpolation, color via boolean feedback). ✓

5. **Variables** — `variables.ts:6-15` declares all 6 required (`connected`, `current_cue_label`, `armed_cue_label`, `last_fired_label`, `mode`, `stations_online`). ✓

6. **Presets** — `presets.ts:21-77` declares 6 presets (GO button, Standby Next, Cue Label Display, Mode Indicator, Stations Counter, Connection Status). ✓

7. **Reconnect with exponential backoff** — `connection.ts:23-25,66-78` doubles delay 1s→2s→4s→8s→16s→30s max; resets on `open` at line 51. Test `connection.test.ts:189-206` advances fake timers and asserts WS instance counts to verify staged backoff. Spec mentioned 1/2/5/10/30 but called for "exponential" — pure doubling is more standard and the done report flags this. Not blocking. ✓

8. **Pairing token via config UI** — `index.ts:97-104` `pairingToken` field with paste hint label. The spec also asked for a "Generate token" button as a placeholder — Companion config field types do not include a button widget (per @companion-module/base SDK), so the label-based hint is the only realistic implementation. Acceptable. ⚠️ (minor, not blocking)

9. **Manifest** — `companion/manifest.json` includes `id: "showx"`, `author: "XLAB s.r.o."`, `license: "MIT"`, `repository`, `entrypoint`, `api_version: "0.6.0"`. ✓

10. **README** — `README.md:1-109` covers install, config table, actions, feedbacks, variables, presets, reconnect, troubleshooting. Explicitly notes PR submission handled by XLAB/Jindřich (line 11). ✓

11. **HELP.md** — `HELP.md:1-26` concise inline help with setup, connection, key variables, GO authority note. ✓

12. **Submitter-ready directory** — `external/companion-module-showx/` self-contained with `companion/manifest.json`, `package.json` declaring `@companion-module/base ^1.8.0` and `ws ^8.16.0`, `src/`, `README.md`, `HELP.md`. PR submission acknowledged as Architect-led. ✓

13. **10+ vitest tests** — 23 tests across `tests/unit/external/companion/connection.test.ts` (15) and `actions.test.ts` (8). All pass. ✓

## Contract correctness

- `go.dispatched` handler reads `cue_label ?? cue_id` (`connection.ts:96`). `GoDispatched` in `src/modules/cuelist-core/src/go/goEventChannel.ts:47-57` has no `cue_label` — handler correctly falls back to `cue_id`. Done report flags this as a label-resolution gap deferred post-MVP. Acceptable.
- `arm.broadcast` handler stores `cuelist_id` + `cue_id` (`connection.ts:103-110`). Matches `ArmBroadcast` shape at `goEventChannel.ts:75-80`. ✓
- `mode.transition` handler reads `payload.to` (`connection.ts:114`). Matches `ModeTransition` shape at `goEventChannel.ts:82-88` (which has `from`/`to`, not `mode`). Spec source-code example used `env.payload.mode` — Forge correctly disagreed with the spec and matched the actual contract. ✓
- `go.request` envelope (`connection.ts:131-141`) includes `topic`, `request_id`, `cue_id`, `cuelist_id`, `station_id`, `operator_id`, `client_ts`, `override`. Matches `GoRequest` at `goEventChannel.ts:36-45`. ✓
- `arm.request` envelope (`connection.ts:150-158`) matches `ArmRequest` at `goEventChannel.ts:67-73`. ✓

## Forge-flagged design notes (for Architect)

- `cuelistId` added as a required config field — necessary because `stop/pause/resume/goto` need to target a cuelist; this is a sensible scope extension.
- `crypto.randomUUID()` instead of `uuid` package — eliminates a dep, Node ≥16 has it natively. Done report and module `package.json` (no `uuid` dep) consistent.
- `stop.request`, `pause.request`, `resume.request`, `goto.request` topics are **not** yet subscribed by `GoEventChannel`. Module sends them; server is a no-op until B003-008+ extension. Done report flags this; not Forge's job to add server side. **Architect: consider follow-up task to add these handlers, or document them as Companion-only soft requests.**
- `heartbeat` topic is consumed for `stations_online` but is not currently emitted by `GoEventChannel`. Handler is safe (no-op when no such message arrives). Same — Architect to confirm whether a heartbeat emitter is in scope.

## Test quality

- Uses `vi.hoisted` to declare a `MockWsClass` before `vi.mock('ws')` registration — correct vitest pattern.
- Fake timers exercise backoff with second-tick precision.
- Tests cover happy path, fallback when `cue_label` missing, disconnect-prevents-reconnect, request_id uniqueness, override flag, error handler, malformed JSON ignored, heartbeat. Solid coverage.

## Style / hygiene

- Strict TypeScript types throughout; only an `as` cast where Companion SDK type erasure makes it necessary (`index.ts:46-49`).
- No hardcoded secrets, no production code touched outside `external/` and the test tree.
- License consistent (MIT) at module + manifest + README.
