# 14 — Stream Deck (Companion) integration

A submitter-ready Bitfocus Companion community module that talks to ShowX over the [GO event side-channel](08-go-event-channel.md).

Lives at `external/companion-module-showx/` — outside the cuelist-core module workspace because it's a separate Node package per Companion module registry conventions.

## Wire format

The module is a thin proxy:

```
Stream Deck button press
  → Companion action
  → SideChannelClient (Companion-side WS)
  → FOH ShowX (GO event channel)
  → cue dispatch
```

URL: `ws://<foh-ip>:5300/events/<show_id>?token=<pairing-token>`.

Token comes from a one-time pairing flow (Companion module's "instance config" UI gets it from `/pair?role=companion` on the FOH).

## Module structure

`external/companion-module-showx/`:

```
companion/manifest.json     module registry manifest (id, author, license, runtime)
package.json                Node package (deps: @companion-module/base, ws)
src/index.ts                ShowXInstance extends InstanceBase<ShowXConfig>
src/connection.ts           WS connection + exponential backoff
src/actions.ts              7 actions
src/feedbacks.ts            4 feedbacks (button color states)
src/variables.ts            6 variables (text fields)
src/presets.ts              6 presets (drop-in button templates)
README.md                   install + config
HELP.md                     in-Companion help text
```

## Actions

1. **GO** — sends `go.request` with `{ cue_id: current_armed_cue }`
2. **GO override** — sends `go.request` with `override: true`
3. **Standby Next** — sends `arm.request` advancing playhead
4. **Stop** — sends `stop.request` (FOH-side handler 0.2)
5. **Pause** — sends `pause.request` (FOH-side handler 0.2)
6. **Resume** — sends `resume.request` (FOH-side handler 0.2)
7. **Goto cue** — sends `goto.request` with `{ cue_id }`

Each action returns immediately. Result comes back as `go.dispatched` or `go.rejected` envelope → updates feedbacks/variables.

## Feedbacks (button color)

- **Connected** → green
- **Disconnected** → red
- **SHOW mode** → red (visual warning)
- **Cue armed** → yellow

Feedback evaluator runs on every state update — Companion handles the throttling.

## Variables

Companion variables are text fields that other buttons can reference:

- `$(showx:connected)` — `connected` / `disconnected`
- `$(showx:current_cue_label)` — playhead's cue label
- `$(showx:armed_cue_label)` — what's standby
- `$(showx:last_fired_label)` — last go.dispatched
- `$(showx:mode)` — REHEARSAL / SHOW
- `$(showx:stations_online)` — count of paired stations alive

Variables are pushed via `instance.setVariableValues()` when state changes.

## Presets

Drop-in button templates users can drag onto a button page:

1. **GO** — large red GO button with "GO" text + cue label variable
2. **Standby Next** — yellow "STANDBY" button
3. **Cue Label Display** — text display showing current cue
4. **Mode Indicator** — visual REHEARSAL/SHOW with appropriate color feedback
5. **Stations Counter** — `$(showx:stations_online)` text
6. **Connection Status** — green/red dot with `$(showx:connected)` text

## Configuration

Companion instance config UI:

- **FOH IP** (text) — required
- **FOH Port** (number, default 5300)
- **Show ID** (text) — must match an active `.showx` opened on FOH
- **Pairing token** (password) — from `/pair?role=companion`

## Submission path

Per Bitfocus Companion community module process:

1. Module lives at `bitfocusas/companion-module-showx` (separate GitHub repo)
2. Pull request to `bitfocus-module-registry/modules` to add to Companion module list
3. Companion auto-pulls module on user install

For 0.1 the module ships in-tree — users hand-import via Companion's `Import module` flow.

**Architect-led submission** (per spec note B003-021): Jindřich files the PR personally; community module submitter list is curated.

## Tests

- `tests/unit/external/companion/connection.test.ts` (15 tests) — URL parsing, backoff, event handler dispatch
- `tests/unit/external/companion/actions.test.ts` (8 tests) — each action builds correct envelope

Total 23 tests; lives in separate workspace so no impact on cuelist-core typecheck baseline.

## Open issues (Critic non-blocking, B003-021)

- FOH-side handlers for `stop.request` / `pause.request` / `resume.request` / `goto.request` (currently the module sends these but FOH ignores them — actions silently no-op). Add in 0.2.
- `heartbeat` emission from FOH for connection health feedback (currently the module assumes connected if WS open; better to ping-pong every 5s).
- Server-side rate limiting per token (companion buttons can be configured to repeat rapidly).
