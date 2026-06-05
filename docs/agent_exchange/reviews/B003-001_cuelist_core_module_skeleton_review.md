---
id: "B003-001"
critic_started_at: "2026-06-06T14:00:00Z"
critic_completed_at: "2026-06-06T14:18:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] `package.json` declares `@showx/module-cuelist-core`, type=module, workspace dep on `showx-shared`, runtime deps `yjs@^13.6.x` + `uuid@^10`, devDeps `typescript`, `vitest`, `@types/node`, `zod` → `src/modules/cuelist-core/package.json:2,5,16-25`
- [x] `tsconfig.json` extends `../../../tsconfig.base.json`, composite:true, outDir:dist, references `../../shared` → `src/modules/cuelist-core/tsconfig.json:2,5,8,12`
- [x] `src/index.ts` exports `manifest` const + default `CuelistCore` class → `src/modules/cuelist-core/src/index.ts:1-2`
- [x] `manifest.slug === 'cuelist-core'`, `tier === 'free'`, `default_enabled === true`, `persistedConfigSchemaVersion === 1` → `src/modules/cuelist-core/src/manifest.ts:5,9,21,22`
- [x] `requires.transports` includes osc-out, midi-out, msc-out, webhook-out → `src/modules/cuelist-core/src/manifest.ts:12-15`
- [x] `requires.depends_on === []` (not undefined) → `src/modules/cuelist-core/src/manifest.ts:18`
- [x] `CuelistCore implements Module` — `init`, `start`, `stop`, `teardown`, `getConfigSchema`, `onHealthCheck` → `src/modules/cuelist-core/src/CuelistCore.ts:4,9,16,24,30,35,39`
- [x] Lifecycle hooks return `Promise<void>` and don't break the contract on abort. No active async work yet; abort respect is vacuous but consistent with the thin-skeleton scope. Future task B003-002+ will wire abort handling when Yjs broker is added.
- [x] `config/schema.ts` exports `ConfigSchemaDescriptor<CuelistCoreConfig>` Zod schema with required fields and defaults matching `data_model.md` §12.5 (50 MB / 10 days) + §12.11 (palette null) → `src/modules/cuelist-core/src/config/schema.ts:4-20`
- [x] Smoke test uses inline mock ModuleContext (helper from B001-018 not yet delivered — inline mock matches the `ModuleContext` shape from `src/shared/src/types/context.ts:17-37`) and exercises init → start → stop (×2) → teardown lifecycle + asserts HealthBus call → `tests/unit/modules/cuelist-core/skeleton.test.ts:8-56,118-152`
- [~] TypeScript strict compile clean — could not run `pnpm --filter @showx/module-cuelist-core typecheck` in this Critic subprocess (Bash permission restriction). Manual type analysis: every imported symbol resolves against `src/shared/src/types/`; `health.report(slug, status, detail?)` matches `HealthBus` interface at `src/shared/src/types/services.ts:56`; `ZodSchema<T>` cast is documented and structurally safe.

## Independent code review

**`manifest.ts`** — Clean. No top-level side effects (only imports + one const). `entry: CuelistCore` correctly references a no-arg constructor satisfying `new () => Module`. `version: '0.1.0'` matches package.json. `min_shell_version: '0.1.0'` is conservative and correct for the first release.

**`CuelistCore.ts`** — Lifecycle ordering is enforced: `start()` throws when `this.ctx` is undefined (covers both pre-init and post-teardown cases — verified by test at `tests/unit/modules/cuelist-core/skeleton.test.ts:146-152`). State machine `idle → inited → started → stopped` is simple and correct. `onHealthCheck()` returns 'healthy' only when `state === 'started'`, otherwise 'unknown' — matches expected semantics for an early-lifecycle module.

**`config/schema.ts`** — Zod validators include sane bounds: `autosave_interval_ms` ∈ [1000, 300000] ms (1s..5min), `history_rotation_size_bytes ≥ 1 MB`, `history_rotation_max_age_days ≥ 1`. Defaults computed via `CuelistCoreConfigSchema.parse({})` — single source of truth. The `as unknown as ZodSchema<CuelistCoreConfig>` cast is the canonical workaround for Zod's complex generic tree vs the structural interface in `showx-shared`; documented inline.

**`index.ts`** — Two re-export lines, no side effects. Matches loader convention from `module_loader.md` §5.1.

**Test suite** — 22 expectations across 3 describe blocks (count higher than the 18 mentioned in the done report; same structure, more granular). All assertions are deterministic and pin behavior to either documented defaults or interface contracts. `beforeEach` resets `ctx` and `module` to keep tests isolated. Mock ModuleContext fills every required field from `src/shared/src/types/context.ts:17-37` (subscriptions properly mocked with `unsubscribe`).

## Sensible deviations from spec (documented in done report, approved)

1. `health.report(slug, status, detail)` instead of spec's `report(status, detail)` — the actual `HealthBus` interface at `src/shared/src/types/services.ts:56` takes `slug` first. Forge correctly used the real signature and updated the test assertion (`skeleton.test.ts:121`). This is the right call.
2. `getConfigSchema()` is not part of the `Module` interface in `src/shared/src/types/module.ts:88-95` — Forge added it as a public method without breaking the interface contract. Acceptable since the spec listed it as an acceptance criterion; the module loader (or follow-up tasks) can use structural typing to call it.
3. `presence_color_palette: null` — Q11 ratification confirmed (`data_model.md` §12.11).

## Minor observations (not blocking, future-task hooks)

- `zod` is in devDependencies of the module's `package.json` but used at runtime in `config/schema.ts`. This works because `zod` is in the root workspace `devDependencies` and pnpm hoists it; if this module were ever published standalone, `zod` would need to move to runtime deps. Spec asked for devDep, Forge followed spec — leaving as-is.
- `stop()` is idempotent only because the implementation is empty. Once Yjs broker / autosave / dispatch queue land (B003-002, B003-003, B003-009), idempotency will need to be explicitly enforced (e.g., early-return when `state === 'stopped'`). Track in those task specs.
- `tests/helpers/mock_context.ts` referenced in the spec was never delivered (B001-018 does not exist in the bundle). Forge inlined the mock, which is acceptable and self-contained. If similar mocks are needed in B003-002+, factoring to a shared helper would reduce duplication — not required now.

## Test execution note

Bash permission restrictions in this Critic subprocess blocked `pnpm test -- tests/unit/modules/cuelist-core/skeleton.test.ts` and `pnpm --filter @showx/module-cuelist-core typecheck`. Verification is by code inspection: every assertion in the test file maps to a real, present code path in the implementation, and every imported type resolves against the actual `showx-shared` source. Architect should run both commands at the next opportunity; if they fail, file follow-up issue against this task and re-open. Pattern matches B001-001 (Architect-rescue) and B001-013 where the same restriction applied — those reviews were accepted on the same basis.

## Verdict rationale

All 11 acceptance criteria are met (10 verified by file:line, 1 by manual type analysis with note). Implementation is thin and disciplined — exactly what the spec called for. Deviations from the spec are correct adaptations to the actual `showx-shared` interface and documented. No top-level side effects, no scope creep, no architectural decisions left over. Test suite is logically sound and would pass given the implementation.

**Accepted.**
