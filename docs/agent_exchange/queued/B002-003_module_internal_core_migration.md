---
id: "B002-003"
title: "Module-internal core migration (Bridge engine, event-runtime, handlers, transform)"
type: "implementation"
estimated_size_lines: 1500
priority: "P0"
depends_on: ["B002-002"]
target_files:
  - "src/modules/eventx-bridge/src/EventRuntime.ts"
  - "src/modules/eventx-bridge/src/HandlerDispatcher.ts"
  - "src/modules/eventx-bridge/src/SessionTracker.ts"
  - "src/modules/eventx-bridge/src/HealthReporter.ts"
  - "src/modules/eventx-bridge/src/PeriodicStatePush.ts"
  - "src/modules/eventx-bridge/src/transform.ts"
  - "src/modules/eventx-bridge/src/types.ts"
  - "src/modules/eventx-bridge/src/handlers/types.ts"
  - "src/modules/eventx-bridge/src/handlers/wordcloud.ts"
  - "src/modules/eventx-bridge/src/handlers/poll.ts"
  - "src/modules/eventx-bridge/src/handlers/quiz_mc.ts"
  - "src/modules/eventx-bridge/src/handlers/hundred_points.ts"
  - "src/modules/eventx-bridge/src/handlers/scales.ts"
  - "src/modules/eventx-bridge/src/handlers/multitap.ts"
  - "src/modules/eventx-bridge/src/handlers/qa-highlight.ts"
  - "src/modules/eventx-bridge/src/handlers/sensor-stream.ts"
  - "src/modules/eventx-bridge/src/handlers/show-control.ts"
  - "src/modules/eventx-bridge/src/handlers/control.ts"
  - "src/modules/eventx-bridge/src/handlers/moderation.ts"
  - "src/modules/eventx-bridge/tests/unit/handlers/*.test.ts"
  - "src/modules/eventx-bridge/tests/unit/event-runtime.test.ts"
  - "src/modules/eventx-bridge/tests/unit/transform.test.ts"
  - "src/modules/eventx-bridge/src/legacy/**"   # mostly DELETED at end of task
acceptance_criteria:
  - "Every Category-M file from `docs/specs/bridgex_absorption.md` §3 Classification Matrix has been moved out of `src/legacy/` into its target module-internal location with import paths fixed"
  - "All imports use either `showx-shared` (for shared types) or relative paths to module-internal files; NO imports remain from `src/legacy/` in module-public code"
  - "All retired (Category X) files under `src/legacy/` are DELETED (aggregation/, calibration/, channels/, mapping/, outputs/ except `html-renderer.ts` pending Q22 ruling, coalesce/, patterns/, cli/, dev/, inputs/cloud.ts, inputs/sensor-raw.ts, inputs/ingestion-pipeline.ts, inputs/local-inject.ts, legacy-mode.ts, main.ts)"
  - "`legacy-mode.ts` retired (out per spec §3)"
  - "Adapter files (`adapters/osc-adapter.ts`, `midi-adapter.ts`, `dmx-adapter.ts`, `webhook-adapter.ts`, `ws-adapter.ts`, `adapter-factory.ts`, `metrics.ts`, `utils.ts`, `adapters/types.ts` shared portion) remain temporarily in `legacy/adapters/` — they move to shared OutputDispatcher in B002-004; this task does NOT delete them yet"
  - "Per-handler unit tests ported from `bridgex/src/handlers/__tests__/*` (or wherever they live) — at least 80% of original BridgeX 0.3.x handler tests pass against the refactored core (capture pass/fail count in done report)"
  - "No direct `process.env` reads in any module file — all environment-sensitive config goes through `ctx.persisted` or `ctx.secrets`"
  - "No direct `console.log` / `console.error` — all logging through `ctx.log` (Logger interface)"
  - "`src/types.ts` exports `EventBridgeOutput`, `EventBridgeMapping`, `ChannelTransform`, `ChannelValue`, `SubmissionRow`, `ActivitySessionRow`, `ShowControlTriggerRow`, `AggregationRow`, `QaHighlightRow`, `ModerationRow` (EventX-semantic types, module-private)"
  - "`EventRuntime.ts` is a near-verbatim port of `bridgex/src/event-runtime.ts` with: (a) shared types from showx-shared substituted; (b) `OscReceiver` reference replaced with `ctx.input.listen(...)` from InputRegistrar; (c) adapter creation deferred to B002-004 (use stubs or document TODOs); (d) Supabase client creation deferred to B002-005 (use injected client interface)"
  - "All quirks documented in `bridgex_absorption.md` §6.1 are preserved: silent state snapshot dedup, OSC leading-`/` autofix (TEMPORARILY in legacy/adapters until B002-004), 30 Hz sensor stream gating, `'live'` session-status filter"
  - "`pnpm --filter @showx/module-eventx-bridge typecheck` passes (zero errors)"
  - "`pnpm --filter @showx/module-eventx-bridge test` runs ≥40 tests; ≥80% pass rate (handler tests + event-runtime + transform); failing tests documented with cause in done report"
---

## Context

This is the heaviest migration task in ShowX-2 — the BridgeX 0.3.x event-driven core (the "heart of BridgeX 0.3.x" per absorption spec) moves from `legacy/` into the module's public surface. Every handler (`wordcloud.ts` … `moderation.ts`), the `EventRuntime`, `SessionTracker`, `HealthReporter`, `PeriodicStatePush`, and `transform.ts` re-path. Tests port forward. Retired files delete.

Adapters (`osc-adapter.ts`, `midi-adapter.ts`, `dmx-adapter.ts`, `webhook-adapter.ts`, `ws-adapter.ts`) STAY in `legacy/adapters/` for now — they move into the shared OutputDispatcher in **B002-004**. This task ports the *consumers* of those adapters (handlers, EventRuntime) but leaves adapter instantiation untouched until B002-004.

Supabase subscriber wiring and rule engine are also deferred (B002-005, B002-006). This task focuses on **structural migration** — directory layout, imports, type substitutions, test port — without changing behavior.

## Implementation notes

### Order of operations

1. Read `~/Daniel-local/bridgeX/bridgex/src/event-runtime.ts` end-to-end. Identify every external dependency.
2. Read each handler file under `legacy/handlers/*.ts`. Note imports.
3. Read `legacy/adapters/transform.ts`. Note input + output signatures (this gets moved to module root as `transform.ts`).
4. Move files per the Classification Matrix:

| From `legacy/` | To module-internal | Action |
|---|---|---|
| `event-runtime.ts` | `EventRuntime.ts` (root) | Move + re-path imports |
| `output-dispatcher.ts` | `HandlerDispatcher.ts` (root) | Move + rename + thin wrapper around `ctx.output.send` (full wrapping in B002-004) |
| `session-tracker.ts` | `SessionTracker.ts` (root) | Move + use `ctx.persisted` for state path |
| `health-reporter.ts` | `HealthReporter.ts` (root) | Move + emit to `ctx.health` as well as Supabase |
| `periodic-state-push.ts` | `PeriodicStatePush.ts` (root) | Verbatim move |
| `adapters/transform.ts` | `transform.ts` (root) | Move (semantic to EventX rule format — module-private) |
| `handlers/*.ts` (12 files) | `handlers/` (root) | Move + re-path |
| `runtime/options.ts` (Logger only) | DELETE; use `ctx.log` directly | Logger interface is the shell's; module uses `ctx.log` from ModuleContext |
| `index.ts` (legacy public surface) | DELETE | Module entry is `manifest.ts` + EventXBridge class (B002-002) |
| `main.ts` (CLI entry) | DELETE | Shell handles lifecycle (no standalone CLI in ShowX module) |
| `legacy-mode.ts` | DELETE | Profile fallback retired per spec |

5. Delete retired Category X subdirs:
   - `legacy/aggregation/` (entire — universal aggregation moves to EventX engine)
   - `legacy/calibration/` (entire)
   - `legacy/channels/` (entire)
   - `legacy/cli/` (entire)
   - `legacy/coalesce/` (entire)
   - `legacy/dev/` (entire — TesterX hooks retired)
   - `legacy/inputs/cloud.ts`, `sensor-raw.ts`, `ingestion-pipeline.ts`, `local-inject.ts`, `index.ts` (all five)
   - `legacy/mapping/` (entire — YAML profiles retired)
   - `legacy/outputs/` EXCEPT `html-renderer.ts` (keep pending Q22 ruling; document in done report)
   - `legacy/patterns/` (entire)
   - `legacy/runtime/` (only `options.ts` exists; delete; absorb Logger references into ctx.log)

6. Keep TEMPORARILY in `legacy/`:
   - `legacy/adapters/*` — moves to shared in B002-004
   - `legacy/listener/*` — moves to shared in B002-004 (or eventually B001-008 if not done)
   - `legacy/outputs/html-renderer.ts` — pending Q22 ruling (Architect cross-check with EventX repo)

### Import remapping pattern

For every file that moves:

- `import { X } from './adapters/types'` (legacy) → `import { X } from './types.js'` (module-internal) or `import type { X } from 'showx-shared'` (if shared type)
- `import { OSCAdapter } from './adapters/osc-adapter'` → keep as `import { OSCAdapter } from './legacy/adapters/osc-adapter.js'` TEMPORARILY (full removal in B002-004)
- `import { Logger } from './runtime/options'` → use `Logger` type from `showx-shared` (B001-002 declared it); inject via `ctx.log`
- `import type { ZodSchema } from 'zod'` → no change (ZodSchema is a runtime type from zod; keep)

### EventRuntime.ts — specific re-paths

The bulk of work is in this file (486 LOC). Key changes:

1. Constructor signature change:
   ```ts
   // OLD (legacy):
   class EventRuntime {
     constructor(opts: { supabaseUrl, supabaseAnonKey, logger, ... }) {}
   }
   // NEW (module-internal):
   class EventRuntime {
     constructor(private ctx: ModuleContext, private deps: {
       supabaseClient: SupabaseClient;  // injected — B002-005 wires real client
       dispatcher: HandlerDispatcher;
       sessionTracker: SessionTracker;
       healthReporter: HealthReporter;
       periodicPush: PeriodicStatePush;
     }) {}
   }
   ```
2. Replace `this.logger.info(...)` → `this.ctx.log.info(...)`.
3. Replace `supabase.realtime.setAuth(token)` calls — keep as-is; auth manager (B002-007) provides the token via `updateAccessToken` method.
4. Replace `new OSCAdapter(...)` / `new MIDIAdapter(...)` calls with stubs that throw "B002-004 wires this":
   ```ts
   private createAdapter(row: EventBridgeOutput): OutputAdapter {
     throw new Error('createAdapter — wired in B002-004 (shared OutputDispatcher integration)');
   }
   ```
   This preserves the call sites + signatures but defers the actual adapter logic. Tests for adapter integration ALSO defer to B002-004.

### HandlerDispatcher.ts — thin shim

`bridgex/src/output-dispatcher.ts` (52 LOC) becomes `HandlerDispatcher.ts`. For now keep both methods:

```ts
class HandlerDispatcher {
  constructor(private ctx: ModuleContext, private adapterMap: Map<string, OutputAdapter>) {}

  emit(channelId: string, value: ChannelValue): void {
    // lookup mapping, find target adapter, call adapter.send
    // B002-004 will replace adapter.send with ctx.output.send
  }

  emitRaw(address: string, args: unknown[]): void {
    // broadcast to every OSC adapter
    // B002-004 will replace with ctx.output.send({transport: 'osc', address, args})
  }
}
```

### SessionTracker.ts state path

Original BridgeX persists `~/.bridgex/bridge-state.json`. Now path is module-private via PersistedStore:

```ts
// OLD:
const STATE_PATH = path.join(os.homedir(), '.bridgex', 'bridge-state.json');
// NEW: state path computed by PersistedStore — pass via constructor
class SessionTracker {
  constructor(private ctx: ModuleContext) {}
  async load(): Promise<void> {
    const blob = await this.ctx.persisted.load(sessionStateSchema);  // separate schema for session state
    // ...
  }
}
```

Note: persistedStore is bound to the module slug; SessionTracker uses a sub-key. If PersistedStore doesn't support sub-keys, use a separate small schema descriptor with `schemaVersion: 1` for session state (it's a different blob than the main config). Document if Forge needs to add a sub-key API to B001-004's PersistedStore (file as follow-up note).

### HealthReporter.ts double-emit

Per absorption spec §6.1 #42, health upserts to Supabase `bridge_health` every 2s. ALSO emit to `ctx.health.report(slug, status, detail)` so the shell HealthBus + UI status badge reflect the same state:

```ts
async tick() {
  const status = this.snapshot();
  // Supabase upsert (B002-005 wires real client)
  await this.supabase.from('bridge_health').upsert({ ... });
  // ShowX shell health
  this.ctx.health.report(this.ctx.slug, status.overall, status.detail);
}
```

### Test port

Original BridgeX tests live at `bridgex/src/__tests__/` and possibly co-located `*.test.ts` files. Locate them in `legacy/__tests__/` and `legacy/**/*.test.ts`. Port forward to `tests/unit/`:

- `tests/unit/event-runtime.test.ts` ← from `legacy/__tests__/event-runtime.test.ts` if exists, else write new based on assertions in `bridgex/src/__tests__/`
- `tests/unit/handlers/wordcloud.test.ts` ← from `legacy/handlers/wordcloud.test.ts` if co-located, else from `legacy/__tests__/wordcloud.test.ts`
- (repeat per handler)
- `tests/unit/transform.test.ts` ← from `legacy/adapters/transform.test.ts` or equivalent

Forge: when porting a test, change imports from `'../event-runtime'` to `'../../src/EventRuntime.js'` and inject the mock ModuleContext. Replace any `new EventRuntime({ supabaseUrl, ... })` constructor calls with the new signature (`new EventRuntime(mockCtx, { supabaseClient: mockSupabase, dispatcher: mockDispatcher, ... })`).

For tests that depend on adapter behavior (e.g. OSC packet bytes asserted), MARK as `.skip` with a `// TODO B002-004` comment — they'll re-enable when adapters wire to shared dispatcher.

### Quirks to preserve

Per absorption spec §6.1 (lines 567-660). The following behaviors MUST survive the port (verify via tests):

- #8-10 Row enrichment drops rows when sessionId not in SessionTracker.
- #11 Only `'live'` sessions added to SessionTracker.
- #12-15 Routing matrix exact.
- #16-21 OSC packet shapes per handler (verified by handler tests).
- #18 Wordcloud state snapshot dedup.
- #4 Wordcloud skip if zero words.
- #45-46 Periodic state push gating per activity type presence.
- #44 SessionTracker persists on every add/remove.
- #47 Sent counter resets to 0 on every Start Runtime.

Each quirk should have at least one passing test in the ported suite. If a quirk's test doesn't survive the port (e.g. because adapter mocks aren't ready), document in done report.

### Open question note

Per Q22 (open questions doc): `outputs/html-renderer.ts` Supabase Realtime broadcast fate is pending cross-check with EventX repo. Forge keeps the file in `legacy/outputs/html-renderer.ts` for now; Architect rules before B002-005 picks up. Document in done report which behavior was preserved (currently: not migrated, but not deleted).

## Test plan

### Per-handler tests (≥12 test files, ≥40 tests total)

For each handler:
- Happy path submission → expected emit pattern
- Edge cases per BridgeX 0.3.x test suite
- Mock dispatcher records emits; assert byte patterns where possible (full OSC byte assertions defer to B002-010 parity tests)

### EventRuntime test (`tests/unit/event-runtime.test.ts`, ≥10 tests)

1. `start(eventId)` loads outputs + mappings + topology → mock Supabase returns config → assert dispatcher.subscribe called.
2. `enrichSubmissionRow` drops row when sessionId not in SessionTracker.
3. `'live'` status added to SessionTracker; `'paused'` NOT added; `'ended'` removes.
4. Routing matrix: wordcloud submission → WordcloudHandler called.
5. `show_control_triggers` → ShowControlHandler called.
6. `aggregations` → SensorStreamHandler called.
7. Auth token refresh → `supabase.realtime.setAuth` invoked; client NOT recreated.
8. `stop()` removes Realtime channel, calls SessionTracker `clear`, calls dispatcher `tearDown`.
9. Periodic state push gating: wordcloud pusher only registers if event has wordcloud activity.
10. Sensor stream 30Hz only starts if sensor_race activity present.

### Transform test (`tests/unit/transform.test.ts`, ≥6 tests)

Verbatim port from BridgeX `transform.test.ts` (or `adapters/transform.test.ts`). Cover scale / threshold / pick_index / colormap / rate_limit (passthrough).

### Test pass rate target

≥80% pass rate of ported tests. Tests that fail due to deferred adapter wiring (B002-004) are marked `.skip` with TODO comments and counted SEPARATELY from failures.

## Out of scope

- Adapter migration to shared OutputDispatcher (B002-004).
- Supabase client wiring (B002-005 — use injected mock).
- Rule engine + event_bridge_outputs Zod schema (B002-006).
- Auth manager port (B002-007).
- UI panel migration (B002-008).
- Config migration script (B002-009).
- `legacy/outputs/html-renderer.ts` final fate (pending Q22).
- Removing `legacy/adapters/` (B002-004).
- Removing `legacy/listener/` (defer if it overlaps with B001-008 input-registrar shared).

## Notes for Critic

- Run `grep -rn "from '.*/legacy/" src/modules/eventx-bridge/src/ --include="*.ts" | grep -v "/legacy/adapters/" | grep -v "/legacy/listener/" | grep -v "/legacy/outputs/html-renderer"` — should return zero hits (only legitimate adapter + listener + html-renderer references allowed).
- Run `grep -rn "process\.env" src/modules/eventx-bridge/src/ --include="*.ts" | grep -v legacy` — should return zero hits.
- Run `grep -rn "console\." src/modules/eventx-bridge/src/ --include="*.ts" | grep -v legacy | grep -v test` — should return zero hits.
- Verify deleted directories don't exist: `ls src/modules/eventx-bridge/src/legacy/aggregation/` should fail.
- Verify quirk tests pass: wordcloud dedup test, sensor_race 30Hz gating test, `'live'` filter test.
- Check that EventRuntime constructor signature changed (takes ctx + deps); does NOT take raw supabaseUrl/Key strings.
- Check HealthReporter emits BOTH to Supabase upsert AND `ctx.health.report`.
- Document deferred Q22 ruling status in review.
