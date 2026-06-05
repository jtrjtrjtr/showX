---
id: "B001-010"
critic_started_at: "2026-06-06T09:02:00Z"
critic_completed_at: "2026-06-06T09:05:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **ModuleLoader scans src/modules/*/manifest.json + src/modules/*/index.ts at startup** → `src/main/src/moduleLoader/discovery.ts:16-63` walks `modulesRoot`, reads each subdirectory, requires `manifest.json`, prefers `index.ts` then falls back to `index.js`. Hidden dirs and regular files skipped (`discovery.ts:27-28`). Wired in `ModuleLoader.discoverAndPrepare()` at `src/main/src/ModuleLoader.ts:26`.
- [x] **Manifest validated via Zod schema; invalid manifest → quarantined + HealthBus error, others unaffected** → Schema at `src/main/src/moduleLoader/types.ts:8-20`. `ModuleLoader.ts:49-61` runs `safeParse`, on failure emits `health.report('module.<slug>', 'error', 'manifest_invalid: ...')` and `continue`s. Verified by `tests/unit/moduleLoader.test.ts:253-309` ("invalid manifest is quarantined, sibling modules still load") — passes.
- [x] **Module loaded only if tier requirement satisfied** → `ModuleLoader.ts:65-68` skips `tier: 'pro'` on `installedTier: 'free'`. Verified by `tests/unit/moduleLoader.test.ts:205-238`.
- [x] **Module loaded only if user config has not disabled it** → `ModuleLoader.ts:70-73` checks `userConfig.disabledSlugs`. Caller-passed flag rather than direct PersistedStore read; Forge documented this in done report gap #3 with TODO for B001-011. Acceptable boundary — the criterion is "user config has not disabled" which is satisfied. Verified by `tests/unit/moduleLoader.test.ts:240-251`.
- [x] **Lifecycle order: discovery → validate → init (parallel where no deps) → start (ordered by depends_on) → stop (reverse) → teardown (reverse)** → `LifecycleOrchestrator` in `src/main/src/moduleLoader/lifecycle.ts:29-78`. Kahn-style topo sort at `lifecycle.ts:144-211` produces dep layers; init/start iterate forward, stop/teardown iterate reverse with intra-layer reverse (`lifecycle.ts:64,71`). Verified by `tests/unit/moduleLoader/lifecycle.test.ts:112-153` and `tests/unit/moduleLoader.test.ts:332-355`.
- [x] **Module crash during init/start/stop/teardown is caught; HealthBus event emitted; others continue** → each hook wrapped in try/catch (`lifecycle.ts:80-132`). `init_failed`/`start_failed` emit `health.report` (`lifecycle.ts:89,103`). Stop/teardown errors logged at WARN per spec §3.6 (`lifecycle.ts:115-117, 127-129`). `Promise.allSettled` used at each layer (`lifecycle.ts:43,59,66,76`) — first reject does NOT cancel siblings. Verified by `tests/unit/moduleLoader.test.ts:123-147` (crash isolation) and `lifecycle.test.ts:155-183` (stop/teardown errors).
- [x] **ModuleContext built per-module via contextFactory using shared services** → `src/main/src/moduleLoader/contextFactory.ts:68-100`. Per-module `PersistedStore` and `SecretStore` instantiated with slug. Logger gets `.child(slug)`. AbortSignal wired. Verified by `tests/unit/moduleLoader.test.ts:149-203` ("ModuleContext shape is correct").
- [x] **stub-module fixture loads; init/start/stop/teardown sequence asserted** → `tests/fixtures/stub-module/` + `tests/unit/moduleLoader.test.ts:87-121` ("happy path"). Sequence asserted via `__calls` indices.
- [x] **crashing-module fixture loads but crashes during init; isolation verified** → `tests/fixtures/crashing-module/` + `tests/unit/moduleLoader.test.ts:123-147`. Crasher → `init_failed`, stub → `inited`, HealthBus snapshot has `module.crasher` error.
- [x] **Vitest tests pass: happy path + tier gate + disabled flag + manifest invalid + dep ordering + crash isolation + double-load idempotency** → 23/23 pass (lifecycle 8, discovery 7, moduleLoader integration 8). Idempotency: `lifecycle.test.ts:99-108` ("second call to initAll is a no-op").

## Test run verification

```
pnpm vitest run tests/unit/moduleLoader.test.ts tests/unit/moduleLoader/discovery.test.ts tests/unit/moduleLoader/lifecycle.test.ts

Test Files  3 passed (3)
     Tests  23 passed (23)
   Duration  370ms
```

TypeScript: `pnpm --filter showx-main typecheck` — clean.

## Code review notes

**Topological sort (`lifecycle.ts:144-211`)** — Kahn-style implementation is correct. Maintains `inDegree: Map<slug, count>` of unmet active deps, `dependents: Map<slug, slug[]>` for back-edges. Pre-pass propagates quarantine to modules whose deps are already bad (`lifecycle.ts:147-161`) — handles missing deps + manifest_invalid + already-quarantined dep modules. Cycle detection at `lifecycle.ts:192-198` quarantines all members when a layer becomes empty with modules still remaining. Verified by `lifecycle.test.ts:83-97` (cycle test).

**Cascade ordering** — `initAll()` checks dep state per-layer (`lifecycle.ts:33-42`); cleaner than reading from inDegree because it picks up the failed/quarantined sibling state from a previous layer iteration. Same pattern in `startAll()` (`lifecycle.ts:48-58`) — dep state from prior layer is `started` by the time current layer iterates. Sound.

**Crash isolation** — every transition that fails has a sibling `health.report`. Searched: `state = 'init_failed'` → line 87 → health emit on 89. `state = 'start_failed'` → line 101 → health emit on 103. Stop/teardown errors skip health.report intentionally (spec §3.6 says WARN-level log only).

**`Promise.allSettled` used throughout** — confirmed in 4 places: init layer (line 43), start layer (line 59), stop layer (line 66), teardown layer (line 76). No `Promise.all` anywhere in the orchestrator.

**Stop/teardown ordering** — reverses layers AND modules within layers (`lifecycle.ts:64,71`). Last-started is first-stopped. Verified by `lifecycle.test.ts:112-153` (`stopOrder` = `['stop:c', 'stop:b', 'stop:a']`).

**Manifest slug regex** — `^[a-z][a-z0-9-]{1,39}$` at `types.ts:10` matches spec §2.3. Verified rejected for `'Bad-Module'` in invalid-manifest test (`moduleLoader.test.ts:281-308`).

**Architectural deviations from spec** (all documented in done report, all sound):
1. `SharedServices.layout: PathLayout` + per-module store instantiation inside `buildContext` instead of `shared.persisted.namespace(slug)`. Equivalent isolation outcome; cleaner because `PersistedStore`/`SecretStore` are already slug-bound at construction. Gap #1 in done report.
2. `requires` field made optional in Zod schema (spec §2.1 marks it required). Fixtures don't include `requires`. Tolerable for a foundation task — full requirements gating arrives with real modules in ShowX-2+.
3. `depends_on` at top level of Zod schema rather than nested in `requires`. The fixtures + the topo orchestrator both use top-level. Deviation from full TS `ModuleManifest` shape. Acceptable for B001-010 scope; flagged-as-gap for B001-011 wiring.
4. `min_shell_version` not enforced. Gap #2 in done report.
5. Cross-reference validation of `depends_on` slugs not in schema; handled at runtime via topo-quarantine instead. Gap #1 in done report.

**Logger import fix in PersistedStore.ts / SecretStore.ts** — Forge changed concrete `Logger` import to `showx-shared` interface. Required for `SharedServices.logger: Logger` (interface) to satisfy the constructors. Structurally compatible — Logger class still implements interface. All 201 pre-existing tests pass. Acceptable scope expansion.

**Teardown on init_failed / start_failed** (`lifecycle.ts:73-75`) — calls teardown on partially-initialized modules. Spec §3.6 says start-failed → teardown for cleanup. Init-failed teardown is broader but harmless (each hook is try/catch wrapped). Quarantined modules correctly excluded.

**Fixtures use module-level `__calls`** — Forge correctly uses `vi.resetModules()` in `beforeEach` (`moduleLoader.test.ts:83-85`). Module-level state is allowed in test fixtures per spec §8 constraint scope (constraint is on production modules).

## Verdict rationale

All 10 acceptance criteria met with file:line citations and passing tests. 23/23 unit tests pass, typecheck clean, zero regression in 201 pre-existing tests. Topological sort + cascade quarantine + Promise.allSettled isolation correctly implemented per spec. Forge transparently documented 5 spec-deviation gaps, each justified and either out-of-scope (min_shell_version) or addressed via runtime mechanism (depends_on cross-ref via topo-quarantine). Architectural decision around per-module store factory via PathLayout is sound and improves isolation.

**Accepted.**
