# BridgeX 0.3.x → ShowX EventX Bridge Module — Absorption Plan

> **Status:** Draft v1 (Architect audit, 2026-06-05 evening)
> **Date:** 2026-06-05
> **Binding decision:** `xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`
> **Companion docs:** `xlab-strategy/docs/showx_module_architecture.md` (module contract), `docs/specs/module_loader.md` (shell loader contract)
> **Source under audit:** `~/Daniel-local/bridgeX/` at commit on `main`, version `bridgex-app@0.3.23`, `@bridgex/core@0.3.x` (workspace), Apple-signed + notarized DMG line.
> **Implementation start:** post-Kongres (2026-06-18+); zero code in this session.

## 1. Goal

Three locked goals for the absorption:

1. **Preserve 100% functional parity with BridgeX 0.3.x** as shipped at EventX Kongres 2026-06-17. Every supported EventX activity routing (wordcloud, poll, quiz_mc, hundred_points, scales, multitap, qa/qa_highlight, sensor_race, show_control, control) must produce **byte-identical OSC packets** in ShowX with the EventX Bridge module on the same `event_bridge_outputs` + `event_bridge_mappings` config. Parity test suite in `tests/parity/` is the gate.
2. **Reduce code size** by extracting shared protocol infrastructure (OSC client pool, MIDI port handler, DMX Art-Net/sACN handler, OSC listener) into ShowX shell's `src/main/shared/OutputDispatcher` + `InputRegistrar`. Modules consume the dispatcher; they do not own sockets. Cuelist Core + Custom Router + EventX Bridge all share one dispatcher.
3. **Preserve the Apple Developer ID signing pipeline.** Same Apple account (Jindřich Trapl, Team ID JG4DXAPTHM), same notary credentials, same hardened-runtime entitlements. Only the bundle ID, product name, icon, and entry point name change. Zero re-enrollment.

Non-goal: rewriting BridgeX logic. The handlers (`bridgex/src/handlers/*.ts`) move **near-verbatim** into `showX/src/modules/eventx-bridge/handlers/`. Their behavior — including subtle quirks (silent state snapshot dedup, OSC leading-slash auto-fix, 30 Hz sensor stream gating, session-status `'live'` filter) — is what 0.3.x customers rely on. Parity test suite preserves the quirks.

## 2. Source inventory (BridgeX 0.3.x)

Counts: **`bridgex/src/` ≈ 6 240 LOC** (production, excl. tests), **`apps/bridgex-app/src/` ≈ 1 685 LOC** (Electron shell). Tests roughly equal production volume; not migrated 1:1 but ported per module.

### Top-level structure

```
bridgeX/
├── CLAUDE.md
├── README.md
├── package.json                ← root pnpm workspace
├── pnpm-workspace.yaml         ← packages: bridgex, packages/*, tools/*, apps/*
├── pnpm-lock.yaml
├── tsconfig.base.json
├── eslint.config.mjs
├── .prettierrc
├── mutual-smoke-report.json    ← integration contract artefact
├── smoke-report.json
├── docs/                       ← spec + agent_exchange
├── bridgex/                    ← @bridgex/core engine
├── apps/bridgex-app/           ← Electron desktop app (DMG)
├── packages/testerx-contract/  ← shared TS types BridgeX↔TesterX
├── tools/testerx/              ← dev simulator/monitor
├── profiles/                   ← legacy YAML venue profiles
├── scripts/                    ← build/smoke/runner scripts
├── launchagents/               ← Forge + Critic plists
└── inbox.archived-2026-05-23/
```

### `bridgex/` core engine — `@bridgex/core`

Public exports (`bridgex/src/index.ts`): `createBridgeX`, `EventRuntime`, `OSCAdapter`, `WSAdapter`, `OscReceiver`, `OutputDispatcher`, `SessionTracker`, `PeriodicStatePush`, plus every activity handler.

#### Top-level (`bridgex/src/`)
| File | LOC | Purpose |
|---|---:|---|
| `index.ts` | 21 | Public surface of `@bridgex/core` |
| `main.ts` | 369 | CLI entry + `BridgeXRuntimeImpl` (profile-driven path + event-driven path glue) |
| `event-runtime.ts` | 486 | **Heart of BridgeX 0.3.x.** Subscribes Supabase `postgres_changes` on `submissions`, `activity_sessions`, `show_control_triggers`, `aggregations`. Loads `event_bridge_outputs` + `event_bridge_mappings`. Enriches rows (production schema lacks `event_id` on submissions/aggregations). Routes to handlers. Owns adapter map. Owns `updateAccessToken` (JWT refresh forwarding). |
| `output-dispatcher.ts` | 52 | Two emit paths: `emit(channelId, value)` (looks up mappings) + `emitRaw(address, args)` (broadcasts to every OSC adapter, used by every handler for direct semantic OSC packets like `/eventx/<shortId>/wordcloud/add`). |
| `session-tracker.ts` | 76 | Persists live `activity_sessions` to `~/.bridgex/bridge-state.json` so submissions can be enriched with activity_type after restart. |
| `health-reporter.ts` | 65 | Upserts `bridge_health` table every 2s with adapter health snapshot. |
| `periodic-state-push.ts` | 38 | 2s timer fan-out for handler state snapshots (wordcloud, etc.). |
| `legacy-mode.ts` | 21 | No-op fallback when an event has no `event_bridge_outputs`. |

#### `adapters/` — output adapter contract for **Supabase-driven outputs**
| File | LOC | Purpose |
|---|---:|---|
| `types.ts` | 103 | `OutputAdapter` interface, `EventBridgeOutput`/`EventBridgeMapping` row shapes, `ChannelTransform` (scale/threshold/rate_limit/pick_index/colormap), `ChannelValue` union, protocol/health enums. |
| `adapter-factory.ts` | 25 | Switch over `row.protocol` → adapter constructor. |
| `osc-adapter.ts` | 111 | UDP `dgram` socket + `osc` lib `writePacket`. Auto-prepends `/`. Dry-run mode. |
| `dmx-adapter.ts` | 155 | `dmx-ts` Art-Net driver. Universe heartbeat 1Hz idle. `ch:N` / `ch:N-M` address syntax. |
| `midi-adapter.ts` | 134 | `@julusian/midi` Output. `cc:N` / `note:N` / `pc:N` address. Note-off after 100ms. |
| `webhook-adapter.ts` | 106 | `fetch` with HMAC SHA-256 X-EventX-Signature. 3 retries on 5xx, no retry on 4xx. |
| `ws-adapter.ts` | 116 | `ws` client with backoff [1, 2, 4, 8, 16, 30]s. |
| `transform.ts` | 61 | `applyTransform(value, mapping.transform)` — scale, threshold, pick_index, colormap, rate_limit (passthrough). |
| `metrics.ts` | 9 | `{ messages_sent, messages_failed, last_emit_at }` per adapter. |
| `utils.ts` | 3 | `clamp(v, min, max)`. |

#### `handlers/` — per-activity row → OSC translation
| File | LOC | Purpose |
|---|---:|---|
| `types.ts` | 64 | `SubmissionRow`, `ActivitySessionRow`, `ShowControlTriggerRow`, `QaHighlightRow`, `ModerationRow`, `AggregationRow`. |
| `wordcloud.ts` | 112 | Word map + emit `wordcloud/add`, `wordcloud/remove`, `wordcloud/state` (deduped). Top-50 words via `top_words` channel. |
| `poll.ts` | 69 | Vote tally + leader, share-per-option channels. |
| `quiz_mc.ts` | 81 | Correct/incorrect emit; per-choice tallies. |
| `hundred_points.ts` | 67 | Per-option points; running totals. |
| `scales.ts` | 60 | Likert aggregation; mean per scale. |
| `multitap.ts` | 56 | Rate-counter per target; team scoping. |
| `qa-highlight.ts` | 78 | QA submission emit + highlight toggle. |
| `sensor-stream.ts` | 98 | **30 Hz fixed-rate sensor packet emitter** for `sensor_race`. Only spins up if event has a sensor_race activity (480 packets/s overwhelm otherwise). |
| `show-control.ts` | 46 | Trigger row → raw OSC dispatch. Team scoping appends `/team/<short_uuid>`. |
| `control.ts` | 48 | `activity_sessions` start/end lifecycle emit. |
| `moderation.ts` | 45 | Remove-action handling, used by wordcloud. |

#### `aggregation/` — profile-driven legacy path (universal aggregation engine)
| File | LOC | Purpose |
|---|---:|---|
| `channel.ts` | 87 | `CollectiveChannel` — latest-per-participant + prune stale + smoothing + tick `snapshot()`. |
| `strategies.ts` | 59 | mean / median / trimmedMean / sumNormalized / sumSaturating / differential. |
| `leaky.ts` | 42 | Leaky decay aggregation. |
| `tick-loop.ts` | 80 | Fixed-rate output tick (30/60 Hz). |
| `index.ts` | 16 | Re-export. |

#### `calibration/` — per-device static + per-user runtime
| File | LOC | Purpose |
|---|---:|---|
| `device.ts` | 57 | Static device calibration model. |
| `runtime.ts` | 57 | Per-user runtime zero. |
| `index.ts` | 4 | Re-export. |

#### `channels/`
| File | LOC | Purpose |
|---|---:|---|
| `types.ts` | 42 | `OutputChannel`, `ChannelType` (scalar/rgb/index/event_stream/text_list/text_collection), `AggregationSemantic`, `validateChannel`. |
| `registry.ts` | 31 | `ChannelRegistry` — per-session channel map. |
| `index.ts` | 3 | Re-export. |

#### `inputs/` — legacy ingestion paths
| File | LOC | Purpose |
|---|---:|---|
| `cloud.ts` | 136 | Supabase Realtime broadcast `<prefix>-ingress` channel subscriber for TesterX-shaped messages (pre-event_bridge_outputs era). |
| `sensor-raw.ts` | 98 | Raw per-participant sensor sample ingestion. |
| `ingestion-pipeline.ts` | 99 | Routes inject messages to channels. |
| `local-inject.ts` | 174 | Dev-only WS server on :7900 for TesterX. |
| `index.ts` | 6 | Re-export. |

#### `mapping/` — legacy profile resolver
| File | LOC | Purpose |
|---|---:|---|
| `profile.ts` | 334 | YAML profile parser + validator + type×target matrix. |
| `resolver.ts` | 308 | Resolves channel → target rules from profile, runs modulation. |
| `modulation.ts` | 132 | none / ema / spring / leaky / curve / step. |
| `matrix-fallback.ts` | 102 | Type×target compatibility fallback. |
| `types.ts` | 46 | Shared mapping types. |

#### `outputs/` — legacy profile-driven outputs (NOT the same as `adapters/`)
| File | LOC | Purpose |
|---|---:|---|
| `osc.ts` | 95 | Profile-driven OSC sender. |
| `dmx.ts` | 128 | Profile-driven DMX sender. |
| `midi.ts` | 146 | Profile-driven MIDI sender. |
| `html-renderer.ts` | 134 | Supabase Realtime "renderer broadcast" target — pushes UI state via Realtime broadcast. |
| `file.ts` | 92 | JSON file sink. |
| `tap.ts` | 137 | Dev-only WS server on :7901 mirroring all outbound packets to TesterX. |
| `text-modes.ts` | 99 | Text collection / list routing (mode-1/2/3 per spec). |
| `dmx-transforms.ts` | 15 | linear_to_dmx / rgb_to_dmx helpers. |
| `midi-transforms.ts` | 7 | MIDI value scaling. |
| `registry.ts` | 77 | `AdapterRegistry` — profile-side adapter pool with refcounted start/stop. |
| `types.ts` | 21 | Profile output types. |
| `index.ts` | 13 | Re-export. |

#### `listener/` — incoming OSC
| File | LOC | Purpose |
|---|---:|---|
| `osc-receiver.ts` | 123 | `node-osc` UDP server. Used by Electron Listener panel. |
| `index.ts` | 2 | Re-export. |

#### `dev/` — TesterX hooks, gated by `--dev`
| File | LOC | Purpose |
|---|---:|---|
| `built-in-plugins.ts` | 72 | Built-in TesterX preset list. |
| `presets-loader.ts` | 100 | Loads `dev/presets.json`. |
| `protocol.ts` | 79 | `ControlMessage` validation, hello/pong/error replies, `HeartbeatMonitor`. |
| `session-factory.ts` | 86 | Creates sim sessions from presets. |
| `index.ts` | 16 | Re-export. |

#### `cli/`, `coalesce/`, `patterns/`, `runtime/`
| Group | Files | LOC | Purpose |
|---|---|---:|---|
| `cli/args.ts` | 1 | 112 | `parseArgs` + `HELP_TEXT` for legacy CLI. |
| `coalesce/window.ts` | 1 | 89 | Sliding window coalescer for event_stream channels. |
| `patterns/generators.ts` | 1 | 184 | Test patterns (sine/sweep/rotate-color/reaction-storm/poll-sim). |
| `runtime/options.ts` | 1 | 40 | `BridgeXOptions` shape, `consoleLogger`. |

#### `bin/`
- `bin/bridgex.ts` — CLI shebang, calls `main(process.argv.slice(2), process.env)`.

### `apps/bridgex-app/` — Electron 32 desktop app

| File | LOC | Purpose |
|---|---:|---|
| `electron-builder.yml` | 75 | DMG build config — `appId: cz.xlab.bridgex`, signing identity `Jindrich Trapl (JG4DXAPTHM)`, notarize: true, hardened runtime. |
| `electron.vite.config.ts` | 70 | Bundles main+preload+renderer; bakes Supabase URL + anon key via Vite `define`. |
| `assets/entitlements.mac.plist` | 37 | Hardened runtime entitlements (JIT, unsigned-mem, lib-validation, network client+server, audio+midi reserved). |
| `package.json` | 41 | Electron 32, React 18, `@bridgex/core` workspace dep, native: `@julusian/midi`, `bufferutil`, `utf-8-validate`. |
| `.env.production` | — | Build-time secrets (Supabase URL, anon key, Apple ID, app password, team ID). |
| `src/main/index.ts` | 150 | Electron `app.whenReady` — creates BrowserWindow, AuthManager, RuntimeManager, registers IPC, tray. Injects `ws` as global WebSocket (Electron 32 / Node 20 has none). |
| `src/main/runtime-manager.ts` | 181 | Owns `EventRuntime` + `OscReceiver` instances. Forwards auth token refresh to live runtime. Emits `bridge:message-sent/received`, `runtime:status-change`. |
| `src/main/auth-manager.ts` | 162 | Supabase auth with `safeStorage`-encrypted refresh-token persistence at `userData/bridgex-session.enc`. Scheduled refresh 60s before expiry. Notifies subscribers (RuntimeManager). |
| `src/main/config-store.ts` | 48 | Loads/saves `userData/bridgex-config.json` (lastEventId, oscHost, oscPort, listenerHost, listenerPort, listenerEnabled). |
| `src/main/auth-ipc.ts` | 27 | `auth:login`, `auth:logout`, `auth:get-session`, `auth:get-token`, `shell:open-external`. |
| `src/main/ipc.ts` | 22 | `app:getVersion`, `config:load`, `config:save`, runtime IPC delegation. |
| `src/main/logger.ts` | 3 | Pino logger wrapper. |
| `src/preload/index.ts` | 97 | `contextBridge.exposeInMainWorld('bridgex', { ... })`. Hand-typed IPC surface. |
| `src/renderer/App.tsx` | 160 | Main shell: header + EventPanel + SenderPanel + ListenerPanel + ActivityLog. Auth gate. |
| `src/renderer/panels/EventPanel.tsx` | 142 | Lists Supabase events, Start/Stop runtime, OSC default target advanced block. |
| `src/renderer/panels/SenderPanel.tsx` | 48 | Sender stats — counter, last sent packet display. |
| `src/renderer/panels/ListenerPanel.tsx` | 82 | OSC listener bind config + receive stats. |
| `src/renderer/panels/ActivityLog.tsx` | 74 | Combined sent/received scrolling log. |
| `src/renderer/panels/LoginPanel.tsx` | 69 | Email/password Supabase login form. |
| `src/renderer/main.tsx` | 10 | React mount. |
| `src/renderer/index.html` | — | Vite entry HTML. |
| `src/renderer/state/config.ts` | 25 | `useConfig` hook with debounced auto-save. |
| `src/renderer/hooks/useIpc.ts` | 22 | `useRuntimeStatusChange`, `useMessageSent`, etc. — IPC subscription hooks. |
| `src/renderer/styles.css` | — | App styling (XLAB-flavoured dark UI). |
| `src/shared/ipc-types.ts` | 109 | `IPC_CHANNELS` constants + every payload type. |
| `tsconfig.json` / `tsconfig.web.json` / `tsconfig.node.json` | — | TS configs per target. |
| `vitest.config.ts` | — | Test runner. |

### `packages/testerx-contract/`

| File | LOC | Purpose |
|---|---:|---|
| `src/index.ts` | 89 | `ControlMessage`, `InjectMessage`, `TapMessage`, `SessionInfo`, `PresetInfo`, `ChannelInfo`, `PROTOCOL_VERSION`. |
| `src/guards.ts` | 89 | Type guards (`isSensorSample`, `isSubmission`, …). |
| `package.json`, `tsconfig.json` | — | Workspace metadata. |

### `tools/testerx/`

Independent dev simulator. **Not part of BridgeX runtime.** Used to inject synthetic events without TesterX-the-agent-built standalone tool.

| Group | Files | Notes |
|---|---|---|
| `bin/testerx.ts` | 1 | CLI shebang |
| `src/cli.ts`, `src/contract.ts`, `src/main.tsx` | 3 | Dual-mode (CLI + UI) entry |
| `src/sim/{crowds,discrete,engine}.ts` | 3 | Simulation engine |
| `src/monitor/{channels,sparkline,tap-client,index}.ts` | 4 | Tap monitor UI |
| `src/ui/{App,ChannelRow,MonitorPanel,RawLog,SimPanel,TopBar}.tsx + App.css` | 7 | React UI |
| `scenarios/*.json` | 3 | Preset crowd scenarios |
| `vite.config.ts`, `tsconfig.json`, `index.html`, `package.json` | — | Build config |

### `profiles/`

| File | Purpose |
|---|---|
| `profile-1-notch-only.yaml` | Default 4fin Kongres profile (all channels → OSC :7000). |
| `profile-2-notch-plus-dmx.yaml` | Notch + DMX universe split. |
| `profile-3-headless-mock.yaml` | Mock/CI profile. |
| `README.md` | Profile authoring guide. |

### `docs/`

Canonical specs:
- `SPEC.md`, `EVENTX_CONTRACT.md`, `PROFILES.md`, `DEPLOYMENT.md`, `HARDWARE_COMPAT.md`, `TROUBLESHOOTING.md`, `USER_GUIDE.md`
- `files/EventX-BridgeX-spec.md`, `files/EventX-BridgeX-test-hooks-instrukce.md`, `files/EventX-engine-channel-declarations-instrukce.md`, `files/TesterX-spec.md`
- `files.zip` (archived bundle)

Agent exchange:
- `agent_exchange/WORKFLOW.md`, `STARTING_PROMPTS.md`, `state.json`, `claude_runner_scope.json`, `dashboard_catalog.json`, `TASK_DASHBOARD.md`, `task_dashboard.html`
- `queued/` — 60+ bundle specs (B001 → B035)
- `done/` — 60+ done reports
- `reviews/` — Critic verdicts
- `decisions/` — 9 ratification notes (2026-05-23 → 2026-05-24)
- `logs/` — Forge/Critic runner output

### `scripts/`

| File | Purpose | Migration target |
|---|---|---|
| `build-mac.sh` | DMG sign+notarize pipeline. | `showX/scripts/build-mac.sh` (adapted, new bundle ID) |
| `forge_runner_service.sh` | Forge LaunchAgent entry. | `showX/scripts/forge_runner_service.sh` (already present) |
| `critic_runner_service.sh` | Critic LaunchAgent entry. | `showX/scripts/critic_runner_service.sh` (already present) |
| `_run_with_timeout.py` | Timeout wrapper. | `showX/scripts/_run_with_timeout.py` (already present) |
| `agent_exchange_estimate_split.py` | Bundle estimation. | Retire — superseded by ShowX state.json. |
| `agent_exchange_refresh_dashboard.py` | Dashboard HTML render. | Retire — superseded by ShowX dashboard. |
| `cross-project-smoke.mjs` | EventX↔BridgeX cross-project smoke. | Migrate to `integration/` repo; rename `cross-project-smoke-showx.mjs`. |
| `mutual-smoke-contract.mjs` | Engine channel-catalog contract check. | Migrate to EventX side (engine publishes catalog); ShowX module reads. |
| `parity-check.mjs` | **Existing parity helper** — keep + expand into ShowX `tests/parity/`. |

### `launchagents/`

| File | Migration |
|---|---|
| `com.xlab.bridgex-forge-runner.plist` | Continues running for BridgeX 0.3.x bugfix-only. ShowX has its own `com.xlab.showx-forge-runner.plist` (already installed 2026-06-05 night). Parallel ≈6 months; BridgeX agent retires when last BridgeX 0.3.x customer migrated (Q2 2027). |
| `com.xlab.bridgex-critic-runner.plist` | Same as above. |

### Root config files

| File | Migration |
|---|---|
| `package.json` (root) | Adapted to ShowX (already bootstrapped). |
| `pnpm-workspace.yaml` | Adapted: `packages: ['pwa', 'src/modules/*', 'src/main', 'tests/parity']`. |
| `tsconfig.base.json` | Carries over with minor changes. |
| `eslint.config.mjs` | Carries over verbatim. |
| `.prettierrc` | Carries over verbatim. |
| `.gitignore` | Merge into ShowX `.gitignore`. |
| `mutual-smoke-report.json`, `smoke-report.json` | Build artefacts — do not migrate. |

## 3. Classification matrix

Categories:
- **M** = Module-internal: moves into `showX/src/modules/eventx-bridge/`
- **S** = Shared infrastructure: moves into `showX/src/main/shared/`
- **R** = Replaced by ShowX shell (shell provides equivalent surface)
- **X** = Retired (no longer needed in ShowX)
- **K** = Kept in `bridgeX/` (frozen, bugfix-only until EOL)

### `bridgex/src/` core engine

| Path | LOC | Category | Target in showX/ |
|---|---:|---|---|
| `index.ts` | 21 | M | `showX/src/modules/eventx-bridge/index.ts` (rewritten as Module entry) |
| `main.ts` | 369 | X | Retired — ShowX shell handles lifecycle; the profile-driven CLI path is gone, the event-driven path is folded into the module's `start()`. |
| `event-runtime.ts` | 486 | M | `showX/src/modules/eventx-bridge/EventRuntime.ts` (verbatim; remove `OscReceiver` reference — moves to shell `InputRegistrar`; adapter creation goes through `context.dispatcher`). |
| `output-dispatcher.ts` | 52 | M | `showX/src/modules/eventx-bridge/HandlerDispatcher.ts` (renamed, thin shim that calls `context.dispatcher.emitOsc()` + handles mapping-lookup `emit(channelId, value)`). Most logic moves to shell `OutputDispatcher`. |
| `session-tracker.ts` | 76 | M | `showX/src/modules/eventx-bridge/SessionTracker.ts` (verbatim; state file path injected via context). |
| `health-reporter.ts` | 65 | M | `showX/src/modules/eventx-bridge/HealthReporter.ts` (verbatim; reports to `context.healthBus` as well as Supabase). |
| `periodic-state-push.ts` | 38 | M | `showX/src/modules/eventx-bridge/PeriodicStatePush.ts` (verbatim). |
| `legacy-mode.ts` | 21 | X | Retired — legacy YAML-profile fallback not supported in ShowX module. |

### `bridgex/src/adapters/`

| Path | LOC | Category | Target |
|---|---:|---|---|
| `types.ts` | 103 | S + M | **Split:** `OutputAdapter`/`Protocol`/`HealthState`/`OSCConfig`/`DMXConfig`/… → `showX/src/main/shared/output-dispatcher/types.ts`. `EventBridgeOutput`/`EventBridgeMapping`/`ChannelTransform` → `showX/src/modules/eventx-bridge/types.ts`. |
| `adapter-factory.ts` | 25 | S | `showX/src/main/shared/output-dispatcher/factory.ts` (extended to support transport registration from any module). |
| `osc-adapter.ts` | 111 | S | `showX/src/main/shared/output-dispatcher/osc.ts` (refcounted by `host:port`; multiple modules share one socket per destination). |
| `dmx-adapter.ts` | 155 | S | `showX/src/main/shared/output-dispatcher/dmx.ts` (refcounted per universe; supports `sacn` config now via spec, currently Art-Net only). |
| `midi-adapter.ts` | 134 | S | `showX/src/main/shared/output-dispatcher/midi.ts` (refcounted by port name; OS-level port contention resolved at dispatcher). |
| `webhook-adapter.ts` | 106 | S | `showX/src/main/shared/output-dispatcher/webhook.ts` (pure-function, no shared resource — still in shell for protocol consistency). |
| `ws-adapter.ts` | 116 | S | `showX/src/main/shared/output-dispatcher/ws.ts` (refcounted by URL). |
| `transform.ts` | 61 | M | `showX/src/modules/eventx-bridge/transform.ts` (semantic to EventX rule format — stays in module). |
| `metrics.ts` | 9 | S | `showX/src/main/shared/output-dispatcher/metrics.ts`. |
| `utils.ts` | 3 | S | `showX/src/main/shared/output-dispatcher/utils.ts` (`clamp`). |

### `bridgex/src/handlers/` (all EventX-specific)

| Path | LOC | Category | Target |
|---|---:|---|---|
| `types.ts` | 64 | M | `showX/src/modules/eventx-bridge/handlers/types.ts` |
| `wordcloud.ts` | 112 | M | `…/handlers/wordcloud.ts` |
| `poll.ts` | 69 | M | `…/handlers/poll.ts` |
| `quiz_mc.ts` | 81 | M | `…/handlers/quiz_mc.ts` |
| `hundred_points.ts` | 67 | M | `…/handlers/hundred_points.ts` |
| `scales.ts` | 60 | M | `…/handlers/scales.ts` |
| `multitap.ts` | 56 | M | `…/handlers/multitap.ts` |
| `qa-highlight.ts` | 78 | M | `…/handlers/qa-highlight.ts` |
| `sensor-stream.ts` | 98 | M | `…/handlers/sensor-stream.ts` |
| `show-control.ts` | 46 | M | `…/handlers/show-control.ts` |
| `control.ts` | 48 | M | `…/handlers/control.ts` |
| `moderation.ts` | 45 | M | `…/handlers/moderation.ts` |

### `bridgex/src/aggregation/`, `calibration/`, `channels/`, `mapping/`, `outputs/`, `coalesce/`, `patterns/`, `cli/`, `dev/`

These all back the **legacy profile-driven pipeline**, which BridgeX 0.3.x customers do not use in production (event-driven path is the only shipped path). The legacy YAML profile system, TesterX, dev mode hooks, and CLI test patterns are out of scope for the ShowX module. Status:

| Subdir | LOC | Category | Notes |
|---|---:|---|---|
| `aggregation/` | 284 | X | Universal aggregation engine — EventX engine takes ownership in 2026-H2 (engine declares aggregated channel snapshots; bridge no longer aggregates). |
| `calibration/` | 118 | X | Per-device calibration moves to EventX engine. |
| `channels/` | 76 | X | `OutputChannel` model retired — `event_bridge_mappings` is the only channel system in ShowX. |
| `mapping/` | 922 | X | YAML profile system retired. |
| `outputs/` (profile-side) | 853 | X (mostly), S (`html-renderer.ts`) | `html-renderer.ts` is the Supabase Realtime broadcaster — **moves to shared as `showX/src/main/shared/output-dispatcher/supabase-broadcast.ts`** if EventX engine still uses it; otherwise retired. To confirm during step 4. |
| `outputs/registry.ts` | 77 | X | Adapter pool — superseded by shell `OutputDispatcher`. |
| `outputs/tap.ts` | 137 | X | Dev WS server :7901 — retired with TesterX. |
| `outputs/text-modes.ts` | 99 | X | Profile-side text routing — replaced by per-handler emit. |
| `outputs/dmx-transforms.ts`, `midi-transforms.ts` | 22 | X | Profile-side helpers — retired. |
| `outputs/file.ts` | 92 | X | JSON file sink — retired. |
| `coalesce/window.ts` | 89 | X | Event-stream coalescer — retired with profile system. |
| `patterns/generators.ts` | 184 | X | CLI test patterns — retired (Custom Router module gets its own test affordance). |
| `cli/args.ts` | 112 | X | CLI retired. ShowX is GUI-only. |
| `dev/*` | 353 | X | TesterX hooks — retired with TesterX. |
| `runtime/options.ts` | 40 | M (Logger only) | `Logger` interface + `consoleLogger` → `showX/src/main/shared/logger.ts`. `BridgeXOptions` retired. |

### `bridgex/src/listener/` & `bridgex/src/inputs/`

| Path | LOC | Category | Target |
|---|---:|---|---|
| `listener/osc-receiver.ts` | 123 | S | `showX/src/main/shared/input-registrar/osc.ts` — generalized as InputRegistrar OSC handle; multiplexes to subscribing modules (EventX Bridge module subscribes optionally; Custom Router module subscribes). |
| `listener/index.ts` | 2 | S | Re-export. |
| `inputs/cloud.ts` | 136 | X | Pre-`event_bridge_outputs` Realtime broadcast ingestion — retired (EventX moved to postgres_changes). |
| `inputs/sensor-raw.ts` | 98 | X | Retired with legacy profile path. |
| `inputs/ingestion-pipeline.ts` | 99 | X | Retired. |
| `inputs/local-inject.ts` | 174 | X | Dev WS :7900 — retired with TesterX. |
| `inputs/index.ts` | 6 | X | Retired. |

### `apps/bridgex-app/`

| Path | LOC | Category | Target |
|---|---:|---|---|
| `electron-builder.yml` | 75 | R + S | Rewritten as `showX/build/electron-builder.yml` with `appId: cz.xlab.showx`, productName `ShowX`. **Signing identity + notary settings carry over verbatim.** |
| `electron.vite.config.ts` | 70 | R | Rewritten for ShowX shell structure; Supabase URL/key baking moves to Cloud Sync module (opt-in). |
| `assets/entitlements.mac.plist` | 37 | R | Carries over to `showX/build/entitlements.mac.plist` with same keys (potentially adds `com.apple.security.device.midi` and `com.apple.security.device.audio-input` since other modules now use them). |
| `assets/BridgeX.iconset/`, `icon.icns`, `tray-placeholder.png` | — | X | Replaced with ShowX brand assets. |
| `.env.production` | — | R | Carries over conceptually as `showX/build/.env.production` — same Apple ID, app password, team ID; Supabase URL/key only set when Cloud Sync module is built in. |
| `src/main/index.ts` | 150 | R | Replaced by `showX/src/main/index.ts` (shell). Concepts preserved: ws WebSocket global injection, tray, IPC registration, before-quit cleanup. |
| `src/main/runtime-manager.ts` | 181 | M (`EventRuntime` wiring) + R (UI events) | EventX Bridge module owns `EventRuntime` instantiation. Counter/status emit becomes `context.healthBus.emit()` consumed by shell. |
| `src/main/auth-manager.ts` | 162 | R | Auth conceptually moves to **Cloud Sync module** (Pro+ tier). EventX Bridge in ShowX Free tier may still need user login when an EventX cloud account is required — to be decided in step 3 review. For ShowX 0.5 internal release, simplest path: EventX Bridge module ships with its own auth panel (port from BridgeX 0.3.x); Cloud Sync module owns Supabase auth more broadly later. |
| `src/main/config-store.ts` | 48 | R | Per-module persisted config via shell `PersistedStore` API. |
| `src/main/auth-ipc.ts` | 27 | R | IPC handled by EventX Bridge module via shell `context.registerIpc(...)`. |
| `src/main/ipc.ts` | 22 | R | Shell-owned IPC registration. |
| `src/main/logger.ts` | 3 | R | Shell `Logger` service. |
| `src/preload/index.ts` | 97 | R | Shell preload exposes generic `showx` global with module-namespaced IPC. |
| `src/renderer/App.tsx` | 160 | R | Replaced by ShowX shell shell UI (left sidebar + tab bar). |
| `src/renderer/panels/EventPanel.tsx` | 142 | M | Moves into EventX Bridge module as `ui/EventXBridgePanel.tsx`. |
| `src/renderer/panels/SenderPanel.tsx` | 48 | M | Folded into module panel as the "Outgoing" section. |
| `src/renderer/panels/ListenerPanel.tsx` | 82 | M | Folded into module panel as the "Incoming" section (or moves to Custom Router module). |
| `src/renderer/panels/ActivityLog.tsx` | 74 | R | Shell-provided `LogPanel` component; module emits log entries via `context.logger`. |
| `src/renderer/panels/LoginPanel.tsx` | 69 | M | Folded into module panel as the auth section (until Cloud Sync module absorbs auth). |
| `src/renderer/state/config.ts` | 25 | R | Per-module config persists via `context.persistedStore`. |
| `src/renderer/hooks/useIpc.ts` | 22 | R | Shell IPC hooks. |
| `src/renderer/styles.css`, `index.html`, `main.tsx` | — | R | Shell-owned. |
| `src/shared/ipc-types.ts` | 109 | R + M | Generic IPC types → shell. EventX-specific (`SupabaseEvent`, `RuntimeStartArgs`) → module. |
| `tsconfig.*.json`, `vitest.config.ts` | — | R | Shell-owned. |

### `packages/testerx-contract/`, `tools/testerx/`

| Path | Category | Notes |
|---|---|---|
| `packages/testerx-contract/` | K | Frozen with BridgeX 0.3.x. No ShowX consumer — TesterX itself doesn't migrate. |
| `tools/testerx/` | K | Frozen. Independent dev tool. |

### `profiles/`

| Path | Category | Notes |
|---|---|---|
| `profile-1-notch-only.yaml`, `profile-2-notch-plus-dmx.yaml`, `profile-3-headless-mock.yaml` | X | Legacy YAML profile system retired. |
| `README.md` | X | Retired. |

### `docs/`

| Path | Category | Notes |
|---|---|---|
| `SPEC.md`, `EVENTX_CONTRACT.md`, `PROFILES.md`, `HARDWARE_COMPAT.md`, `TROUBLESHOOTING.md`, `DEPLOYMENT.md`, `USER_GUIDE.md` | M (reference) | Copy to `showX/docs/modules/eventx-bridge/` as historical reference. `EVENTX_CONTRACT.md` stays canonical for the module's channel-catalog contract with EventX engine. |
| `files/EventX-BridgeX-spec.md`, `files/EventX-engine-channel-declarations-instrukce.md` | M (reference) | Copy to `showX/docs/modules/eventx-bridge/reference/`. |
| `files/TesterX-spec.md`, `files/EventX-BridgeX-test-hooks-instrukce.md` | K | Frozen with TesterX. |
| `agent_exchange/` | K | Frozen historical record. ShowX has its own `docs/agent_exchange/`. |

### Root config

| File | Category | Notes |
|---|---|---|
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `.gitignore` | R | ShowX repo has its own (already bootstrapped); patterns + lint rules carry forward. |

## 4. Shared infrastructure extraction

The Single OutputDispatcher Rule (locked per module_architecture spec §"Shared infrastructure"): one shared dispatcher instance per ShowX shell, refcounted per destination. Multiple modules can emit to the same host:port / MIDI port / DMX universe without OS-level contention.

### `showX/src/main/shared/output-dispatcher/`

Extracted from BridgeX 0.3.x adapter implementations. The Module facing API is **transport-agnostic**:

```
context.dispatcher.send({ transport: 'osc', host, port, address, args })
context.dispatcher.send({ transport: 'midi', portName, channel, msg: 'cc'|'note'|'pc', value })
context.dispatcher.send({ transport: 'dmx', universe, address: 'ch:N', value })
context.dispatcher.send({ transport: 'webhook', url, method, body, secret })
context.dispatcher.send({ transport: 'ws', url, body })
```

Internally, the dispatcher:
- Maintains a refcounted pool of OSC sockets keyed by `host:port`
- Maintains MIDI Output handles keyed by `portName` (first-claim wins; later modules get queued or rejected with clear error)
- Maintains DMX `dmx-ts` universes keyed by `universe` (Art-Net) or `universe+host` (sACN)
- Owns the 1Hz DMX heartbeat
- Forwards `metrics` (per-destination message count + last_emit_at) to shell `healthBus`
- Owns the OSC leading-`/` auto-fix (preserves BridgeX 0.3.x quirk #1)

**Files extracted** (~600 LOC verbatim → ~650 LOC after refcount wrapping):
```
output-dispatcher/
├── index.ts              ← public API (Module-facing send())
├── pool.ts               ← refcount manager (NEW)
├── osc.ts                ← from bridgex/src/adapters/osc-adapter.ts
├── midi.ts               ← from adapters/midi-adapter.ts
├── dmx.ts                ← from adapters/dmx-adapter.ts
├── webhook.ts            ← from adapters/webhook-adapter.ts
├── ws.ts                 ← from adapters/ws-adapter.ts
├── factory.ts            ← from adapters/adapter-factory.ts (extended)
├── types.ts              ← OutputAdapter, Protocol, HealthState, *Config
├── metrics.ts            ← per-destination AdapterMetrics
└── utils.ts              ← clamp
```

### `showX/src/main/shared/input-registrar/`

Multiplexes inbound streams. Multiple modules can subscribe to the same OSC bind port; dispatcher refcounts the underlying socket.

```
input-registrar/
├── index.ts              ← public API
├── osc.ts                ← from bridgex/src/listener/osc-receiver.ts (refactored)
├── midi.ts               ← NEW (MIDI input port handle for Custom Router)
└── webhook.ts            ← NEW (incoming HTTP for webhook-trigger module)
```

### `showX/src/main/shared/` — other services

| Service | Origin | Purpose |
|---|---|---|
| `logger.ts` | `bridgex/src/runtime/options.ts` | `Logger` interface + `consoleLogger`. Module gets a prefixed instance via `context.logger`. |
| `persisted-store.ts` | new (concept from `apps/bridgex-app/src/main/config-store.ts`) | Per-module JSON blob persistence + Zod schema validation. Path-sandboxed per module. |
| `secret-store.ts` | new (concept from `auth-manager.ts` `safeStorage`) | OS keychain-backed encrypted strings. Shared for EventX Bridge auth + Cloud Sync auth. |
| `health-bus.ts` | new (BridgeX scattered emits) | Module health/event bus. Status indicator + sender counter + last error consume from here. |
| `mdns.ts` | new (BridgeX didn't have) | `bonjour-service` mDNS advertise/discover for `_showx._tcp.local`. |
| `pairing-store.ts` | new (BridgeX didn't have) | PWA station pairing tokens + device list. |
| `sync-broker.ts` | new (BridgeX didn't have) | Embedded `y-websocket` for Cuelist Core / future modules. **Not used by EventX Bridge module.** |
| `asset-server.ts` | new (BridgeX didn't have) | Express static for PWA + show media. |

### Things that stay inside the module

- **`@supabase/supabase-js` client** — only EventX Bridge module uses it for now. Cloud Sync module will get its own. Shared dependency in `package.json` but not a shared service.
- **`event_bridge_outputs` + `event_bridge_mappings` config schemas** — semantic to EventX; module-private.
- **Activity handlers** — wordcloud / poll / quiz_mc / etc. — semantic to EventX; module-private.
- **`/eventx/<shortId>/...` OSC address conventions** — semantic to EventX; module-private.

## 5. EventX Bridge module structure (target)

```
showX/src/modules/eventx-bridge/
├── package.json                ← name: @showx/module-eventx-bridge
├── tsconfig.json
├── README.md                   ← module overview + migration-from-BridgeX notes
├── index.ts                    ← Module entry: exports default Module class + manifest
├── manifest.ts                 ← ModuleManifest { slug: 'eventx_bridge', tier: 'free',
│                                                  requires: { transports: ['osc-out', 'midi-out', 'dmx-out', 'webhook-out', 'ws-out'] } }
├── EventXBridgeModule.ts       ← Main class implementing Module interface (init/start/stop/teardown)
├── EventRuntime.ts             ← port of bridgex/src/event-runtime.ts (verbatim semantics)
├── HandlerDispatcher.ts        ← port of bridgex/src/output-dispatcher.ts (wraps context.dispatcher)
├── SessionTracker.ts           ← port of bridgex/src/session-tracker.ts
├── HealthReporter.ts           ← port of bridgex/src/health-reporter.ts
├── PeriodicStatePush.ts        ← port of bridgex/src/periodic-state-push.ts
├── transform.ts                ← port of bridgex/src/adapters/transform.ts
├── types.ts                    ← EventBridgeOutput, EventBridgeMapping, ChannelTransform, ChannelValue (EventX semantic)
├── config/
│   ├── schema.ts               ← Zod schema for persisted config (lastEventId, oscHost, etc.)
│   └── migrate.ts              ← BridgeX 0.3.x bridgex-config.json → ShowX persistedConfig
├── auth/
│   ├── AuthManager.ts          ← port of apps/bridgex-app/src/main/auth-manager.ts (until Cloud Sync absorbs)
│   └── auth-ipc.ts             ← namespaced IPC: 'eventx_bridge:auth:login' etc.
├── handlers/
│   ├── types.ts
│   ├── wordcloud.ts
│   ├── poll.ts
│   ├── quiz_mc.ts
│   ├── hundred_points.ts
│   ├── scales.ts
│   ├── multitap.ts
│   ├── qa-highlight.ts
│   ├── sensor-stream.ts
│   ├── show-control.ts
│   ├── control.ts
│   └── moderation.ts
├── ui/
│   ├── EventXBridgePanel.tsx   ← root UI panel mounted in ShowX tab
│   ├── EventPicker.tsx         ← from EventPanel.tsx
│   ├── LoginSection.tsx        ← from LoginPanel.tsx
│   ├── SenderStats.tsx         ← from SenderPanel.tsx
│   ├── ListenerSection.tsx     ← from ListenerPanel.tsx
│   └── ActivityLog.tsx         ← from renderer/panels/ActivityLog.tsx (or replaced by shell LogPanel)
└── tests/
    ├── unit/                   ← ported from bridgex/src/__tests__ + handlers/*.test.ts
    │   ├── event-runtime.test.ts
    │   ├── handler-*.test.ts
    │   └── transform.test.ts
    └── integration/            ← module-loaded-in-shell tests
        └── module-lifecycle.test.ts
```

**Estimated module size:** ≈ 2 400 LOC production (events-runtime + handlers + transform + ui + auth) + ≈ 1 600 LOC tests.

## 6. Parity contract

The parity contract defines behaviors that **must remain bit-identical** between BridgeX 0.3.x standalone and ShowX with EventX Bridge module enabled, given the same `event_bridge_outputs` + `event_bridge_mappings` rows + same Supabase event state.

### 6.1 Functional behaviors that MUST remain identical

**Lifecycle**
1. `start(eventId)` loads `event_bridge_outputs` filter `event_id=eq.<eventId>` + `enabled=true`.
2. `start(eventId)` loads `event_bridge_mappings` filter `event_id=eq.<eventId>` + `enabled=true`.
3. `start(eventId)` fetches `events.short_id` for OSC address prefixes.
4. `start(eventId)` calls `loadEventTopology` — caches activity_id → activity_type and adds existing `'live'` sessions to SessionTracker.
5. `stop()` removes Realtime channel, stops `sensor_race` 30 Hz emitter, disconnects every adapter, clears mappings.

**Realtime subscriptions** (per `event-runtime.ts:298-335`)
6. Channel `bridgex-activity-<eventId>` subscribes to:
   - `postgres_changes INSERT submissions` (no filter — enriched locally)
   - `postgres_changes * activity_sessions` (no filter — enriched locally)
   - `postgres_changes INSERT show_control_triggers WHERE event_id=eq.<eventId>`
   - `postgres_changes * aggregations` (no filter — enriched locally)
7. Status log line on every channel state change: `[event-runtime] activity channel: <status>`.

**Row enrichment** (production schema doesn't denormalize `event_id` onto submissions/aggregations)
8. `enrichSubmissionRow` looks up sessionId in SessionTracker; drops row if no live session match.
9. `enrichActivitySessionRow` looks up activity_id in `activityTypes` map; drops row if no match.
10. `enrichAggregationRow` looks up sessionId in SessionTracker; drops row if no live session match.

**Session status filter**
11. ONLY `'live'` status added to SessionTracker on `loadEventTopology` (not `'active'`, not `'paused'`).

**Routing matrix** (per `event-runtime.ts:437-470`)
12. `submissions` → handlers per `activity_type`:
    - `wordcloud` → `WordcloudHandler.handleSubmission`
    - `poll` → `PollHandler.handleSubmission`
    - `quiz_mc` → `QuizMcHandler.handleSubmission`
    - `hundred_points` → `HundredPointsHandler.handleSubmission`
    - `scales` → `ScalesHandler.handleSubmission`
    - `multitap` → `MultitapHandler.handleSubmission`
    - `qa` OR `qa_highlight` → `QaHighlightHandler.handleSubmission`
    - default → warn `[event-runtime] unhandled submission type: <type>`
13. `activity_sessions` → `ControlHandler.handleSession` always; on `status='live'` add session; on `status='ended'` remove + reset handler if no live sessions remain.
14. `show_control_triggers` → `ShowControlHandler.handleTrigger`.
15. `aggregations` → `SensorStreamHandler.handleAggregation`.

**OSC packet shapes** (per handler implementation)
16. Wordcloud submission → `/eventx/<shortId>/wordcloud/add` with `[word, count]`.
17. Wordcloud moderation remove → `/eventx/<shortId>/wordcloud/remove` with `[word]`.
18. Wordcloud snapshot (2s push) → `/eventx/<shortId>/wordcloud/state` with `[JSON-stringified words]`. **Dedup vs last-emitted snapshot.** **Skip if zero words.**
19. Wordcloud channel emits: `top_words` (limit 50), `word_count`, `unique_speakers`.
20. Show-control trigger → `<osc_address>` raw + `show_control.cue` channel = 1. Team-scoped: appends `/team/<team_id.slice(0,4)>`.
21. Sensor-stream → 30 Hz fixed-rate emit on `aggregations.data` per `SensorStreamHandler.start30Hz()`. **Only spins up if event has a `sensor_race` activity.**

**OSC leading-slash auto-fix** (per `osc-adapter.ts:64-66`)
22. Any `target_address` not starting with `/` is prepended with `/` before packet write.

**OSC value conversion** (per `osc-adapter.ts:103-111`)
23. number → `[Number(v)]`
24. string → `[v]`
25. array → `[v.map((x) => typeof x === 'string' ? x : Number(x))]`
26. `{r,g,b}` → `[r, g, b]`

**MIDI address parsing** (per `midi-adapter.ts:93-109`)
27. `cc:N` → `[0xB0|ch, N, clamp(v, 0, 127)]`.
28. `note:N` → `[0x90|ch, N, v]` then 100ms later `[0x80|ch, N, 0]`.
29. `pc:N` → `[0xC0|ch, N]`.

**DMX address parsing** (per `dmx-adapter.ts:105-125`)
30. `ch:N` → single channel update.
31. `ch:N-M` → range update.
32. `{r,g,b}` value at `ch:N` → channels [N, N+1, N+2].
33. Idle 1 Hz heartbeat on channel 1 = 0.

**Transform pipeline** (per `transform.ts`)
34. `scale` (linear interpolation, integer-typed values only).
35. `threshold` (above/below/crosses → 0 or 1).
36. `pick_index` (array-only).
37. `colormap` (string-keyed lookup → `{r,g,b}`).
38. `rate_limit` (passthrough — never blocks; legacy field).

**Connection lifecycle**
39. WS reconnect backoff: [1, 2, 4, 8, 16, 30] seconds capped at 30s.
40. Webhook retry: max 3 attempts; 4xx no retry; 5xx retry; retry delays [1, 2, 4] seconds.
41. DMX heartbeat: 1 Hz channel 1 = 0 idle pulse.

**Health reporting** (per `health-reporter.ts`)
42. `bridge_health` upsert every 2 seconds with `{ event_id, last_heartbeat_at, daemon_version, output_status: { <output_id>: { health, protocol } } }`.

**Auth refresh propagation** (per `runtime-manager.ts:43-54`, `event-runtime.ts:259-263`)
43. AuthManager `onTokenRefreshed` → `EventRuntime.updateAccessToken(newToken)` → `supabase.realtime.setAuth(token)`. Supabase client NOT recreated. Realtime channels preserved.

**Session persistence**
44. SessionTracker persists `~/.bridgex/bridge-state.json` (in ShowX: per-module persistedStore slot) on every add/remove. Loaded on `start()` so submission enrichment survives restart.

**Periodic state push gating**
45. Wordcloud state pusher only registers IF event contains a `wordcloud` activity.
46. 30 Hz sensor stream only starts IF event contains a `sensor_race` activity.

**Counter semantics**
47. Sent counter resets to 0 on every Start Runtime (not accumulated across runtime restarts/event switches).

### 6.2 Parity test cases

A working `tests/parity/` suite runs ShowX with EventX Bridge module loaded against a **golden BridgeX 0.3.x** binary running the same `event_bridge_outputs` config, both pointed at a mock Supabase + mock OSC sink. Differences in raw OSC packet bytes fail the test.

| Test ID | Description | Input | Expected |
|---|---|---|---|
| PT-001 | Wordcloud submission single → OSC packet | 1 submission `{word:"hello"}` | `/eventx/<shortId>/wordcloud/add` packet, args `["hello", 1]`, same byte sequence in both BridgeX and ShowX OSC sinks |
| PT-002 | Wordcloud duplicate count | 2 submissions same word | Counter increments; second packet args `["hello", 2]` |
| PT-003 | Wordcloud state snapshot dedup | Same word state across 3 ticks | Only ONE `/wordcloud/state` packet emitted |
| PT-004 | Wordcloud empty event | No submissions, 5s wait | ZERO `/wordcloud/state` packets emitted |
| PT-005 | Poll vote tally | 4 votes across 3 options | Per-option share emitted; `poll.leader` correct |
| PT-006 | Quiz MC correct/incorrect | 3 submissions, mixed | Per-choice tallies match BridgeX |
| PT-007 | Hundred points distribution | 5 submissions across 4 options | Running totals match |
| PT-008 | Scales mean | 10 submissions on scale 0-100 | Per-scale mean matches |
| PT-009 | Multitap rate | 20 events in 1s | Per-target rate-counter matches |
| PT-010 | QA highlight toggle | Submit + toggle + re-toggle | Highlight state events match |
| PT-011 | Sensor stream 30 Hz | sensor_race event live | 30±1 packets/sec for 5s |
| PT-012 | Sensor stream skip when no sensor_race | No sensor_race activity | ZERO `/sensor/*` packets in 10s |
| PT-013 | Show-control trigger broadcast | Trigger with `osc_address=/lx/go` | Raw `/lx/go` packet + `show_control.cue=1` |
| PT-014 | Show-control team scope | Trigger with `team_id=ABCD1234…` | Address becomes `/lx/go/team/ABCD` |
| PT-015 | Session `'live'` → enrichment | Insert activity_session status=live | Subsequent submission enrichment succeeds |
| PT-016 | Session `'paused'` → no enrichment | Insert activity_session status=paused | Subsequent submission DROPPED (BridgeX 0.3.x quirk) |
| PT-017 | Session `'ended'` → handler reset | End session, wait 3s | No more state pushes from that handler |
| PT-018 | OSC address leading-slash autofix | mapping target `eventx/test` | Packet emitted with address `/eventx/test` |
| PT-019 | MIDI cc:64 with value 200 | Mapping cc:64, value 200 | Single message `[0xB0|ch, 64, 127]` (clamp + integer) |
| PT-020 | MIDI note:60 timing | Mapping note:60, value 100 | Note-on at t=0, Note-off at t=100±10ms |
| PT-021 | DMX ch:5 RGB | Mapping ch:5, value `{r:255,g:128,b:0}` | DMX channels 5=255, 6=128, 7=0 |
| PT-022 | DMX heartbeat | Idle 5 seconds | 5 packets channel 1 = 0 |
| PT-023 | Transform scale | from [0,1] to [0,255], value 0.5 | Output 127.5 |
| PT-024 | Transform threshold above | threshold 0.5, value 0.6 | Output 1 |
| PT-025 | Transform pick_index | index 2, array `[10,20,30,40]` | Output 30 |
| PT-026 | Transform colormap | lookup `{red:[255,0,0]}`, value "red" | Output `{r:255,g:0,b:0}` |
| PT-027 | WS reconnect backoff | Inject socket drop | Reconnect attempts at +1s, +3s, +7s, +15s, +31s |
| PT-028 | Webhook 5xx retry | Webhook returns 500 thrice | 3 attempts at 0/+1s/+3s, then `messages_failed++` |
| PT-029 | Webhook 4xx no retry | Webhook returns 400 | 1 attempt, no retry, `messages_failed++` |
| PT-030 | Health upsert | After 2s | `bridge_health` upserted with output_status map |
| PT-031 | Token refresh → realtime auth | Inject `onTokenRefreshed` | `supabase.realtime.setAuth(newToken)` called; realtime channels still subscribed |
| PT-032 | Health flap recovery | Adapter health: connected → reconnecting → connected | Next `bridge_health` upsert reflects state |
| PT-033 | event_bridge_outputs hot-reload | Disable output mid-run | New emits don't reach disabled adapter (this is NOT currently supported — record as known-limitation, both behave the same) |
| PT-034 | Latency budget | Inject 1000 submissions | p95 dispatch latency ≤ BridgeX 0.3.x p95 + 5ms |
| PT-035 | Memory growth | 24h soak | RSS growth ≤ 10MB/h |

**Parity test code volume estimate: ≈ 1 500 – 2 000 LOC** (incl. mock Supabase, mock OSC/MIDI/DMX sinks, byte-diff helpers, golden BridgeX 0.3.x harness).

## 7. Migration sequence

### Step 1 — Repo prep (DONE 2026-06-05 night)

- ShowX repo bootstrap: `CLAUDE.md`, `docs/agent_exchange/`, `pwa/`, `src/`, `tests/`, LaunchAgents installed.
- ShowX Forge + Critic LaunchAgents running every 4 min.
- Scaffold module dir: `showX/src/modules/eventx-bridge/` empty (create in Step 3).
- Scaffold shell dir: `showX/src/main/shared/` empty (populate in Step 2).

### Step 2 — Shared services extraction (target Jul–Aug 2026, Forge bandwidth ≈ 1 week)

Forge tasks (ordered):
- T2.1 Extract `OutputDispatcher` interface + refcounted pool skeleton.
- T2.2 Port `osc.ts` from BridgeX adapters; preserve leading-`/` autofix.
- T2.3 Port `midi.ts`; refcount by port name.
- T2.4 Port `dmx.ts`; refcount by universe; preserve heartbeat.
- T2.5 Port `webhook.ts` + `ws.ts` (no shared resource but uniform API).
- T2.6 Port `osc-receiver.ts` → `input-registrar/osc.ts` with multiplexing.
- T2.7 Port adapter unit tests (≈ 1 000 LOC) preserving every BridgeX behavior assertion.
- T2.8 Define `ModuleContext` interface; first sketch + types only.

Critic acceptance: refactor preserves every adapter test from BridgeX 0.3.x; no behavioral diff.

### Step 3 — EventX Bridge module skeleton (target end-Aug 2026, ≈ 3-5 days)

Forge tasks:
- T3.1 Module class implementing `Module` interface from `module_loader.md`.
- T3.2 Module manifest with `slug='eventx_bridge'`, `tier='free'`.
- T3.3 Persisted config Zod schema (lastEventId, oscHost, oscPort, listenerHost, listenerPort).
- T3.4 BridgeX 0.3.x `bridgex-config.json` import path (`config/migrate.ts`).
- T3.5 Auth manager port (intermediate location — module-local until Cloud Sync absorbs).
- T3.6 Module loads in shell, panel renders "Not yet wired".

Critic acceptance: module loads + unloads cleanly via shell module loader; persistedConfig roundtrips.

### Step 4 — Engine port (target Sep–Oct 2026, Forge ≈ 1-2 weeks)

Forge tasks:
- T4.1 Port `event-runtime.ts` → `EventRuntime.ts`. Replace `createAdapter` calls with `context.dispatcher.send`. Adapter map becomes "subscription handles" returned by dispatcher.
- T4.2 Port `output-dispatcher.ts` → `HandlerDispatcher.ts`. `emitRaw` becomes a thin wrapper around `context.dispatcher.send({transport: 'osc', address, args})` for every registered OSC adapter.
- T4.3 Port `session-tracker.ts` → `SessionTracker.ts`. State path uses `context.persistedStore.path('session-tracker.json')`.
- T4.4 Port `health-reporter.ts` → `HealthReporter.ts`. Also emit to `context.healthBus.publish('eventx_bridge.health', status)`.
- T4.5 Port `periodic-state-push.ts` → verbatim.
- T4.6 Port every handler (`wordcloud.ts` … `moderation.ts`) — verbatim, change imports.
- T4.7 Port `transform.ts` → verbatim.
- T4.8 Wire `start(eventId)` lifecycle: load outputs + mappings + topology → register dispatcher subscriptions → subscribe Realtime → start health reporter + periodic state push.
- T4.9 Wire `stop()` lifecycle inversely.
- T4.10 Port all handler unit tests + event-runtime tests + main tests (~1 200 LOC).

Critic acceptance: every BridgeX 0.3.x handler test passes against ShowX module test runner; no behavioral diff.

### Step 5 — UI port (target Oct–Nov 2026, ≈ 3-5 days)

Forge tasks:
- T5.1 Port `EventPanel.tsx` → `ui/EventPicker.tsx`. Replace `window.bridgex.*` with `window.showx.modules.eventx_bridge.*`.
- T5.2 Port `LoginPanel.tsx` → `ui/LoginSection.tsx`.
- T5.3 Port `SenderPanel.tsx` + `ListenerPanel.tsx` → `ui/SenderStats.tsx` + `ui/ListenerSection.tsx`.
- T5.4 Wrap in `EventXBridgePanel.tsx` root mounted via shell's `context.registerUi(panel)`.
- T5.5 Adopt ShowX shell design tokens (replace BridgeX dark CSS with shell tokens).
- T5.6 Wire ActivityLog to shell-provided `LogPanel` component.

Critic acceptance: UI panel renders all BridgeX 0.3.x functionality with no functional regression.

### Step 6 — Parity validation (target Nov 2026, Critic + Architect ≈ 1 week)

Tasks:
- T6.1 Build `tests/parity/` harness: mock Supabase, mock OSC/MIDI/DMX sinks, byte-diff comparator.
- T6.2 Capture **golden BridgeX 0.3.x recordings** — run BridgeX 0.3.x against 4fin Kongres mocked event with full activity set; record every outbound OSC/MIDI/DMX packet to a `golden.jsonl`.
- T6.3 Run ShowX EventX Bridge module against same mocked event; compare to golden.
- T6.4 Iterate on every diff until 100% byte-parity on PT-001 … PT-035.
- T6.5 Run latency + memory soak (PT-034, PT-035).

Architect acceptance: 100% parity on test suite; latency ≤ baseline + 5ms; memory ≤ baseline + 10 MB.

### Step 7 — Customer migration test (target Nov-Dec 2026, Architect ≈ 2 weeks)

Tasks:
- T7.1 Pick one cooperative BridgeX 0.3.x customer (small venue, single event next month).
- T7.2 Provision ShowX 0.5 internal beta DMG, signed + notarized.
- T7.3 Run their next event with ShowX EventX Bridge module side-by-side with BridgeX 0.3.x.
- T7.4 Capture every diff; resolve.
- T7.5 Draft migration playbook: "Install ShowX, enable EventX Bridge module, import bridgex-config.json, restart, verify Sender Sent counter advances on rehearsal".
- T7.6 Customer comms draft: 3-month-out announce email, 1-month-out reminder, EOL day.

Architect acceptance: customer signed off; migration playbook reviewed by Jindřich + Margaret.

### Step 8 — ShowX 0.5 internal ship (target end-Dec 2026)

Tasks:
- T8.1 Signed + notarized DMG with `appId: cz.xlab.showx`.
- T8.2 Internal release notes: "EventX Bridge module shipped; parity with BridgeX 0.3.x validated".
- T8.3 First 3 BridgeX customers offered ShowX 0.5 beta access (opt-in).
- T8.4 BridgeX 0.3.x customer migration emails go out for ShowX 0.1 public Q1 2027.

## 8. Apple signing rebrand

**Bundle ID change:**
- Old: `cz.xlab.bridgex` (per `apps/bridgex-app/electron-builder.yml:1`)
- New: `cz.xlab.showx`

**Product name change:**
- Old: `BridgeX`
- New: `ShowX`

**Info.plist updates** (electron-builder generates from `electron-builder.yml`):
- `CFBundleIdentifier`: `cz.xlab.showx`
- `CFBundleName`: `ShowX`
- `CFBundleDisplayName`: `ShowX`
- `CFBundleExecutable`: regenerated by electron-builder from productName
- `LSApplicationCategoryType`: `public.app-category.utilities` (carry over)

**Apple Developer ID certificate: UNCHANGED.**
- Same XLAB account, same Team ID **JG4DXAPTHM**
- Same Developer ID Application cert in login keychain ("Developer ID Application: Jindrich Trapl (JG4DXAPTHM)")
- Same identity hash 47792CD21D3B5AD157B3D61A983E1F26A8958641
- No re-enrollment, no new cert issuance, no Apple paperwork

**Notary credentials: UNCHANGED.**
- Same `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` env vars (loaded from `showX/build/.env.production`)
- Notary submission still goes to Apple notary EU evening queue

**Hardened-runtime entitlements:**
- Same as BridgeX 0.3.x: `allow-jit`, `allow-unsigned-executable-memory`, `allow-dyld-environment-variables`, `disable-library-validation`, `network.client`, `network.server`.
- **Add now (BridgeX reserved them for future, ShowX uses them):**
  - `com.apple.security.device.midi` (Custom Router module + EventX Bridge MIDI)
  - `com.apple.security.device.audio-input` (LTC master clock module future-proof)

**Distribution pipeline:**
- `scripts/build-mac.sh` from BridgeX adapts to ShowX. Renames in the script:
  - `BRIDGEX_BUILD_SKIP_NOTARIZE` → `SHOWX_BUILD_SKIP_NOTARIZE`
  - `cz.xlab.bridgex` bundle ID grep checks → `cz.xlab.showx`
  - Supabase URL grep verification (`tkkhwbmsqmmbzoeszwlk` check) → only run when Cloud Sync module is enabled in build
  - `pnpm --filter @bridgex/core build` → not needed (no separate @bridgex/core; modules are part of root workspace)
  - Workspace symlink trick (`apps/bridgex-app/node_modules/@bridgex/core`) → not needed
- `electron-builder.yml` carries forward with bundle ID + product name swap.
- DMG title format `${productName} ${version}` becomes `ShowX 0.5.0`.

**Icon assets:**
- New `assets/ShowX.iconset/` + `icon.icns` + `tray-placeholder.png`. XLAB brand asset job (Margaret + Jindřich brief).

**Compatibility:**
- BridgeX 0.3.x bundle ID `cz.xlab.bridgex` stays valid for the frozen line. ShowX `cz.xlab.showx` is a new app from macOS Gatekeeper's POV — installed alongside BridgeX 0.3.x for the 60-day rollback period.

## 9. Forge/Critic LaunchAgent transition

- `com.xlab.bridgex-forge-runner` + `com.xlab.bridgex-critic-runner` continue for BridgeX 0.3.x bugfix-only. Every 4 min, scope = empty unless emergency.
- `com.xlab.showx-forge-runner` + `com.xlab.showx-critic-runner` already installed (2026-06-05 night per autonomous bundle). Drive ShowX bundle work.
- **Parallel for ≈ 6 months** (Q3 2026 – Q1 2027). Both check-in routinely. Architect supervises both via hub-level CLAUDE.md.
- BridgeX agents retire when **last BridgeX 0.3.x customer migrated to ShowX**. Target Q2 2027 per migration roadmap.
- Plist files: BridgeX plists stay in `~/Library/LaunchAgents/` until retirement; archived to `~/Daniel-local/archive/bridgex_2026-launchagents/` then.

## 10. Customer comms timeline

| Date | Action | Owner |
|---|---|---|
| 2026-06-17 | EventX Kongres ships BridgeX 0.3.x final standalone DMG | Jindřich + Architect |
| 2026-06-18 | BridgeX 0.3.x frozen state announced internally | Architect |
| 2026-10 | Migration roadmap announce to all ~30 BridgeX customers | Margaret (draft by Architect) |
| 2026-12 | ShowX 0.5 internal beta — 3 BridgeX customers opt-in test | Architect |
| 2027-Q1 | ShowX 0.1 public, broad migration begins; BridgeX customers receive upgrade email + 1-page guide | Margaret + Architect |
| 2027-Q2 | BridgeX 0.3.x EOL announced (3 months ahead) | Margaret |
| 2027-Q3 | Last BridgeX customers migrated; `bridgex-jt.netlify.app` redirects to `showx.xlab.cz/migrate`; bridgeX repo archived | Architect |

## 11. Risks

1. **Subtle BridgeX 0.3.x behavior not in parity tests.** E.g. silent OSC packet ordering depending on adapter init order, or undocumented MIDI channel-0 assumption. *Mitigation:* parity test golden recording captures ACTUAL bytes from BridgeX 0.3.x running 4fin Kongres scenario; PT-034 + PT-035 catch perf/memory regressions; Architect direct involvement in source migration (rescue-mode authority).
2. **Custom BridgeX builds.** Unlikely (we control the binary). *Mitigation:* customer interviews during 2026-Q3 confirm everyone uses shipped DMG.
3. **Hidden coupling.** E.g. `event-runtime` calling adapter `disconnect()` ordering that ShowX shell loses if disconnect goes through dispatcher refcount. *Mitigation:* preserve ordering in module's `stop()` lifecycle hook; Critic reviews shutdown sequences.
4. **Performance regression from module overhead.** Refcount + dispatcher API adds 1 hop per packet. *Mitigation:* PT-034 latency budget +5ms p95; if breached, inline dispatcher fast-path.
5. **Auth manager scope creep.** EventX Bridge module currently includes auth, Cloud Sync module wants auth too, both touch SecretStore. *Mitigation:* SecretStore is shell-provided; module-owned AuthManager classes both read/write the same SecretStore slot via namespaced keys.
6. **Bundle-ID collision on customer machines.** New ShowX install + existing BridgeX install both run → mDNS conflict, both try to listen on same OSC port. *Mitigation:* ShowX shell detects BridgeX 0.3.x install on first launch, warns user + offers "auto-stop BridgeX while ShowX runs" option.
7. **Notary submission delays.** Apple EU evening queue can stall up to 2 hours. *Mitigation:* `BRIDGEX_BUILD_SKIP_NOTARIZE` equivalent kept in ShowX build script for fast local iteration.

## 12. Open questions

1. **`html-renderer` output adapter** — does EventX engine still rely on this Supabase Realtime broadcast path? If yes → moves to `showX/src/main/shared/output-dispatcher/supabase-broadcast.ts`. If no → retired. *Owner:* Architect cross-check with EventX repo during T4.1.
2. **AuthManager location** — module-local now, Cloud Sync absorption later, OR Cloud Sync from day one? Currently spec'd as module-local until Cloud Sync ships in ShowX 0.3 (Q3 2027). Risk: 9 months of duplicate auth UX. *Owner:* Architect decision pre-Step 3.
3. **BridgeX 0.3.x SessionTracker state file migration** — ShowX persistedStore path is module-private; first launch of ShowX should auto-import `~/.bridgex/bridge-state.json` content. *Owner:* Forge T3.4.
4. **`event_bridge_mappings` hot-reload** — not supported in BridgeX 0.3.x (requires runtime restart). Should ShowX add hot-reload as a "module upgrade", or maintain parity (no hot-reload)? *Default:* maintain parity in 0.5; revisit for 0.1 public.
5. **PT-034 latency baseline** — needs measurement before Step 6 can pass. *Owner:* Architect to capture BridgeX 0.3.x p95 baseline during 4fin Kongres rehearsal.
6. **TesterX support** — frozen with BridgeX 0.3.x. Does ShowX need a TesterX equivalent for development? *Decision deferred:* Custom Router module gets its own packet-injection affordance later (Q2 2027 scope).
7. **mDNS namespace** — `_showx._tcp.local`. Does it collide with anything? *Owner:* Architect probe pre-Step 2.
8. **Channel-catalog contract** — EventX engine publishes `channel-catalog.json` (per `feedback_aggregation_vs_parameters_split.md`). ShowX module needs to consume this for UI validation hints. *Owner:* T4.1 + Integration repo update.

## References

- Binding decision: `xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`
- Module contract: `xlab-strategy/docs/showx_module_architecture.md`
- Shell loader contract: `showX/docs/specs/module_loader.md`
- Source under audit: `~/Daniel-local/bridgeX/` (full repo)
- Key BridgeX source files referenced:
  - `bridgex/src/event-runtime.ts` (parity heart)
  - `bridgex/src/output-dispatcher.ts` (dispatch indirection)
  - `bridgex/src/adapters/{osc,midi,dmx,ws,webhook}-adapter.ts` (shared infra source)
  - `bridgex/src/handlers/*.ts` (EventX-semantic, module-private)
  - `apps/bridgex-app/electron-builder.yml` (signing config to rebrand)
  - `apps/bridgex-app/assets/entitlements.mac.plist` (hardened-runtime entitlements)
  - `apps/bridgex-app/src/main/{runtime-manager,auth-manager}.ts` (Electron-side wiring)
- BridgeX 0.3.x version reference: `apps/bridgex-app/package.json` line 3, `"version": "0.3.23"`.
