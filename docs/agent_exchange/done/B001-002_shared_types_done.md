---
id: "B001-002"
status: "done"
owner: "forge"
attempt: 1
started_at: "2026-06-05T05:00:00Z"
completed_at: "2026-06-05T05:45:00Z"
files_changed:
  - "src/shared/src/index.ts"
  - "src/shared/src/types/module.ts"
  - "src/shared/src/types/context.ts"
  - "src/shared/src/types/services.ts"
  - "src/shared/src/types/transport.ts"
  - "src/shared/src/types/payload.ts"
  - "src/shared/src/types/cue.ts"
  - "src/shared/src/types/show.ts"
  - "src/shared/src/types/events.ts"
  - "src/shared/package.json"
  - "src/shared/tsconfig.json"
  - "tests/unit/types/types.test.ts"
  - "vitest.config.ts"
tests_run:
  - command: "pnpm --filter showx-shared typecheck"
    result: "UNVERIFIED — see notes"
  - command: "pnpm vitest run tests/unit/types"
    result: "UNVERIFIED — see notes"
---

## What was done

### Type files created

All 8 type modules created in `src/shared/src/types/`:

**`module.ts`** — `Module`, `ModuleManifest`, `ModuleState`, `ModuleTier`, `ModuleRequirements`, `ConfigSchemaDescriptor`, `MenuItemSpec`, `ReactComponentModule`, `TransportRequirement`, `OSPermission`, `ZodSchema` (local structural stand-in — see below).

**`context.ts`** — `ModuleContext` with all 13 service fields + `state()` + `abortSignal`.

**`services.ts`** — All 11 service interfaces: `Logger`, `EventBus`, `HealthBus`, `PersistedStore`, `SecretStore`, `AssetServer`, `MdnsService`, `SyncBroker`, `OutputDispatcher`, `InputRegistrar`, `PairingStore`, `ModuleUIRegistrar`. Supporting types: `HealthStatus`, `HealthSnapshot`, `Subscription`, `YDocHandle`, `AwarenessHandler`, `SideChannelMessage`, `MdnsPeer`, `PairingClaims`, `PairingToken`, `PairedDevice`, `AssetReq`, `AssetResp`, `ApiHandler`.

**`transport.ts`** — `Transport` union, `TransportMessage` discriminated union (6 variants: osc, midi, msc, dmx-artnet, dmx-sacn, webhook), `TransportDestination`, `ClaimToken`, `ClaimConflict`, `DispatchResult`, `PoolStatus`, `InputSpec`, `InputHandler`, `InboundEvent`.

**`payload.ts`** — `Payload` discriminated union (5 variants: osc, midi, msc, dmx, webhook).

**`cue.ts`** — `Cue`, `CueCatalog`.

**`show.ts`** — `Show`, `ShowMode`.

**`events.ts`** — `ShowxEvent` discriminated union (5 variants: cue-fired, cue-catalog-updated, module-state-changed, health-changed, pairing-changed).

### Barrel index

`src/shared/src/index.ts` re-exports `export *` from all 8 type modules.

### tsconfig update

`src/shared/tsconfig.json` updated with `composite: true` and `declaration: true` per spec.

### package.json update

`src/shared/package.json` updated with `exports` field, `./types/*` sub-path exports, and `peerDependencies.zod: ^3.22.0` (zod not installed, peer dependency declared so consumers bring their own).

### Test file

`tests/unit/types/types.test.ts` — 37+ `expectTypeOf` calls covering:
- ModuleManifest shape, ModuleState union exhaustiveness, Module lifecycle methods
- TransportMessage narrowing (osc/midi variants), Transport union closure
- Payload narrowing (osc variant), OscPayload shape
- ShowxEvent narrowing (cue-fired variant), CueFiredEvent shape
- Logger level methods, EventBus publish parameter typing
- OutputDispatcher.send return type
- ModuleContext service fields + abortSignal

### vitest.config.ts update (deviation from target_files)

Added a `resolve.alias` for `'showx-shared'` → `src/shared/src/index.ts`. Required because:
1. The test spec requires `import type { ... } from 'showx-shared'`
2. `pnpm install` could not be run in this subprocess (permission-gated), so pnpm workspace linking wasn't performed
3. Without the alias, vitest cannot resolve `'showx-shared'` module
4. The alias approach is equivalent to workspace linking and will be superseded once `pnpm install` runs

## Decisions made within task scope

### ZodSchema local structural type (deviation from spec)

Spec says `import type { ZodSchema } from 'zod'`. Zod is not installed (pnpm install was not runnable). Instead, defined a local `ZodSchema<T>` interface that is structurally compatible with zod v3's ZodSchema — same `_type: T`, `parse(data: unknown): T`, `safeParse` shape. When zod is installed by a subsequent `pnpm install`, consumers' real `ZodSchema` from zod will satisfy this structural type. No type unsafety introduced.

### No circular-import re-exports in barrel

The spec's module.ts code sample includes `export type { ModuleContext }` re-exported from context.ts. If this re-export is kept AND `index.ts` wildcard-exports both module.ts AND context.ts, TypeScript reports a duplicate export error. Decision: remove the re-export from module.ts (the type is still usable within module.ts via the `import type`). Same applies to services.ts's re-export of `ModuleState`. Both types are available via the barrel from their canonical source files.

### OutputDispatcher.claim/release remain async

Per Q30 ruling (2026-06-05): `claim(dest): Promise<ClaimToken | ClaimConflict>` and `release(token): Promise<void>` — async signatures in the interface match the B001-002_shared_types spec body exactly.

## Tests: unverified due to permission constraints

Forge subprocess was unable to run `pnpm install` or `node`/`pnpm` commands (permission-gated in this session mode). The code is written to the specification and reviewed manually for:

- Import/export graph: all types used, no unused locals
- Discriminated union completeness: all Transport/Payload/ShowxEvent variants present
- Circular type imports: all import-type only, TypeScript handles these correctly
- Barrel conflicts: removed duplicate re-exports to prevent "already exported" errors
- `.js` extensions on all relative imports (required for NodeNext moduleResolution in tsconfig)

**Critic must verify**: Run `pnpm install` (if not already done) then `pnpm --filter showx-shared typecheck` and `pnpm vitest run tests/unit/types` before accepting. If either fails, mark `changes_requested` with the specific error.

## Notes for Critic

1. **ZodSchema structural type**: `src/shared/src/types/module.ts` exports a local `ZodSchema<T>` interface instead of importing from 'zod'. This is structurally compatible with real zod v3 ZodSchema. Critic: verify this doesn't conflict with downstream zod imports once zod is installed. If conflict arises, the fix is simple: replace the local definition with `import type { ZodSchema } from 'zod'` after `pnpm install`.

2. **Circular imports**: module.ts → services.ts → events.ts → module.ts chain. All `import type`. TypeScript handles these. Check by running tsc — if it complains, it will be a clear error message.

3. **No duplicate exports**: Removed `export type { ModuleContext }` from module.ts and `export type { ModuleState }` from services.ts to prevent barrel conflict errors. Both types are still exported via the barrel from their source files.

4. **vitest.config.ts change**: Deviates from target_files. Justified by need to resolve `'showx-shared'` in tests without pnpm workspace linking. Should be transparent once pnpm install runs (pnpm linking would supersede the alias).

5. **Test count**: Test file has 37+ `expectTypeOf` calls across 6 describe blocks, satisfying ≥10 requirement.

6. **ModuleState in exactly one file**: `ModuleState` is defined in `module.ts` only, used in `events.ts` (imported from `./module.js`) and in `context.ts` (imported from `./module.js` via the `ModuleState` field in `ModuleContext`). Not duplicated. ✓

7. **Subscription returned by all subscribe methods**: Confirmed. EventBus, HealthBus, PersistedStore, AssetServer, MdnsService, SyncBroker, InputRegistrar, ModuleUIRegistrar — all return `Subscription` from subscribe/register/listen methods. ✓
