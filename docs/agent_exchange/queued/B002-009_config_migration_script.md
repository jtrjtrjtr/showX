---
id: "B002-009"
title: "Config migration script: BridgeX 0.3.x → ShowX persistedConfig"
type: "implementation"
estimated_size_lines: 400
priority: "P1"
depends_on: ["B002-006"]
target_files:
  - "src/modules/eventx-bridge/src/migrations/from_bridgex_0_3.ts"
  - "src/modules/eventx-bridge/src/migrations/index.ts"
  - "src/modules/eventx-bridge/src/migrations/types.ts"
  - "src/modules/eventx-bridge/src/EventXBridge.ts"
  - "src/modules/eventx-bridge/tests/unit/migrations/from_bridgex_0_3.test.ts"
  - "src/modules/eventx-bridge/tests/fixtures/bridgex-0_3_sample-config.json"
acceptance_criteria:
  - "`migrateFromBridgeX_0_3(ctx)` detects BridgeX 0.3.x installation by checking standard userData paths: macOS `~/Library/Application Support/bridgex/bridgex-config.json`, Linux `~/.config/bridgex/bridgex-config.json`, Windows `%APPDATA%/bridgex/bridgex-config.json`"
  - "When detected, reads the JSON file; maps fields 1:1 to ShowX EventXBridgeConfig schema: `lastEventId` → `lastEventId`, `oscHost` → `oscHost`, `oscPort` → `oscPort`, `listenerHost` → `listenerHost`, `listenerPort` → `listenerPort`, `listenerEnabled` → `listenerEnabled`"
  - "Migration writes to `ctx.persisted.save(migrated)`; subsequent module starts use the migrated config"
  - "Migration is idempotent: if ShowX persisted config already has non-default values, migration logs `'skipped — ShowX config already present'` and does NOT overwrite"
  - "Migration logs the diff between BridgeX config and migrated config at INFO level (which fields imported, which defaulted)"
  - "Rollback path tested: if migration write fails, original ShowX defaults preserved; partial writes do not leave the module in an inconsistent state"
  - "Migration also handles `event_bridge_outputs` and `event_bridge_mappings` if present in BridgeX local cache (some BridgeX builds cached Supabase queries to disk); IF cached, log and skip — cloud is source of truth, no need to migrate"
  - "Migration result type: `{ status: 'migrated' | 'skipped' | 'no-source' | 'error', importedFields: string[], detail: string }` returned for telemetry + done report"
  - "Called from `EventXBridgeModule.init()` ONCE per install (gate via a SecretStore flag `migration.from-bridgex-0_3.completed = true`)"
  - "Tests use golden fixture `bridgex-0_3_sample-config.json` (real BridgeX 0.3.x shape): covers happy path, skip-when-existing, no-source, malformed-source"
  - "`pnpm --filter @showx/module-eventx-bridge typecheck` passes"
  - "`pnpm --filter @showx/module-eventx-bridge test src/modules/eventx-bridge/tests/unit/migrations` passes ≥6 tests"
---

## Context

BridgeX 0.3.x persists its config to `bridgex-config.json` in Electron userData (`apps/bridgex-app/src/main/config-store.ts`). ShowX uses a different location (per-module under shell's PersistedStore from B001-004): `<showxUserData>/modules/eventx-bridge.json`.

For BridgeX 0.3.x customers installing ShowX 0.5, the migration script auto-imports their last-used config so they don't have to re-enter host/port/eventId — UX win + reduces "rage-quit because I have to reconfigure" risk during migration window.

Supabase URL/anonKey are NOT migrated — they're build-time constants baked into the binary (BridgeX) and will be similarly baked into ShowX 0.5. Auth refresh token migration is handled separately in B002-007 (and is a "re-login required" path, not auto-migrated, due to cross-process keychain isolation).

## Implementation notes

### Detection of BridgeX install

```ts
// src/modules/eventx-bridge/src/migrations/from_bridgex_0_3.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { ModuleContext } from 'showx-shared';
import type { EventXBridgeConfig } from '../config/schema.js';
import { configSchema } from '../config/schema.js';

const MIGRATION_DONE_KEY = 'migration.from-bridgex-0_3.completed';

const bridgexConfigSchema = z.object({
  lastEventId: z.string().nullable().optional(),
  oscHost: z.string().optional(),
  oscPort: z.number().optional(),
  listenerHost: z.string().optional(),
  listenerPort: z.number().optional(),
  listenerEnabled: z.boolean().optional(),
}).passthrough();

function candidatePaths(): string[] {
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return [path.join(home, 'Library/Application Support/bridgex/bridgex-config.json')];
    case 'win32':
      return [path.join(process.env.APPDATA ?? '', 'bridgex/bridgex-config.json')];
    case 'linux':
      return [path.join(home, '.config/bridgex/bridgex-config.json')];
    default:
      return [];
  }
}

export type MigrationResult =
  | { status: 'migrated'; importedFields: string[]; detail: string }
  | { status: 'skipped'; reason: string }
  | { status: 'no-source'; detail: string }
  | { status: 'error'; detail: string };

export async function migrateFromBridgeX_0_3(ctx: ModuleContext): Promise<MigrationResult> {
  const alreadyDone = await ctx.secrets.get(MIGRATION_DONE_KEY);
  if (alreadyDone === 'true') {
    return { status: 'skipped', reason: 'migration-already-completed' };
  }

  let sourcePath: string | null = null;
  for (const p of candidatePaths()) {
    try {
      await fs.access(p);
      sourcePath = p;
      break;
    } catch { /* not present */ }
  }
  if (!sourcePath) {
    await ctx.secrets.set(MIGRATION_DONE_KEY, 'true');  // don't probe again
    return { status: 'no-source', detail: 'no BridgeX 0.3.x install detected' };
  }

  try {
    const raw = await fs.readFile(sourcePath, 'utf8');
    const parsed = JSON.parse(raw);
    const validated = bridgexConfigSchema.parse(parsed);

    // Load current ShowX config
    const current = await ctx.persisted.load(configSchema);

    // If current differs from defaults, skip migration to avoid overwriting user customizations
    const currentNonDefault = isNonDefault(current);
    if (currentNonDefault) {
      ctx.log.info('skipping bridgex migration — ShowX config already customized', {
        sourcePath, currentLastEventId: current.lastEventId,
      });
      await ctx.secrets.set(MIGRATION_DONE_KEY, 'true');
      return { status: 'skipped', reason: 'showx-config-already-customized' };
    }

    const migrated: EventXBridgeConfig = {
      ...configSchema.defaults,
      lastEventId: validated.lastEventId ?? null,
      oscHost: validated.oscHost ?? configSchema.defaults.oscHost,
      oscPort: validated.oscPort ?? configSchema.defaults.oscPort,
      listenerHost: validated.listenerHost ?? configSchema.defaults.listenerHost,
      listenerPort: validated.listenerPort ?? configSchema.defaults.listenerPort,
      listenerEnabled: validated.listenerEnabled ?? configSchema.defaults.listenerEnabled,
    };

    const imported = Object.keys(validated).filter((k) =>
      (validated as any)[k] !== undefined && (validated as any)[k] !== null
    );

    await ctx.persisted.save(migrated);
    await ctx.secrets.set(MIGRATION_DONE_KEY, 'true');

    ctx.log.info('migrated bridgex 0.3.x config', {
      sourcePath, imported, migrated,
    });

    return {
      status: 'migrated',
      importedFields: imported,
      detail: `imported ${imported.length} fields from ${sourcePath}`,
    };
  } catch (err) {
    ctx.log.error('bridgex migration failed', { err: String(err), sourcePath });
    // Do NOT set MIGRATION_DONE_KEY — allow retry next start
    return { status: 'error', detail: String(err) };
  }
}

function isNonDefault(cfg: EventXBridgeConfig): boolean {
  return (
    cfg.lastEventId !== null ||
    cfg.oscHost !== configSchema.defaults.oscHost ||
    cfg.oscPort !== configSchema.defaults.oscPort ||
    cfg.listenerHost !== configSchema.defaults.listenerHost ||
    cfg.listenerPort !== configSchema.defaults.listenerPort ||
    cfg.listenerEnabled !== configSchema.defaults.listenerEnabled
  );
}
```

### Cached event_bridge_outputs

Some BridgeX 0.3.x builds optionally cached `event_bridge_outputs` to disk for offline-tolerant startup. ShowX 0.5 does NOT support offline-tolerant startup (Supabase mandatory for module operation per B002-005 architecture). Detection-only path:

```ts
// In migrateFromBridgeX_0_3 — after primary config migration succeeds:
const outputsCachePath = path.join(path.dirname(sourcePath), 'event_bridge_outputs.cache.json');
try {
  await fs.access(outputsCachePath);
  ctx.log.info('detected bridgex cached outputs — ignoring (Supabase is source of truth)', {
    outputsCachePath,
  });
} catch { /* not present, ok */ }
```

### EventXBridge integration

```ts
// EventXBridge.ts init() — add at end:
const migrationResult = await migrateFromBridgeX_0_3(ctx);
ctx.log.info('bridgex migration probe', migrationResult);
// Reload config if migration ran
if (migrationResult.status === 'migrated') {
  this.config = await ctx.persisted.load(configSchema);
}
```

### Sample BridgeX fixture

`tests/fixtures/bridgex-0_3_sample-config.json`:

```json
{
  "lastEventId": "ad843c45-fe2e-4b65-9e89-b0fe21e5ed28",
  "oscHost": "10.0.1.10",
  "oscPort": 7000,
  "listenerHost": "0.0.0.0",
  "listenerPort": 7001,
  "listenerEnabled": true
}
```

Mirrors real BridgeX 0.3.x `bridgex-config.json` shape — verify against `apps/bridgex-app/src/main/config-store.ts` `ConfigStore.load()` saved shape.

### Rollback safety

If `ctx.persisted.save(migrated)` throws (disk full, permissions, etc.), the migration leaves ShowX defaults intact (PersistedStore returns defaults on read failure per B001-004 contract). The function returns `status: 'error'` and does NOT set the done flag, so next module restart will retry.

If migration partially succeeds (rare — only `persisted.save` then `secrets.set` are sequential writes), `secrets.set` failure leaves the persistedStore in migrated state but the done flag false. Next start will detect ShowX config is non-default → skip. Correct behavior (don't re-import).

## Test plan

### `tests/unit/migrations/from_bridgex_0_3.test.ts` (≥7 tests)

Use a mock fs and mock ModuleContext.

1. No BridgeX file present → `{ status: 'no-source' }`; MIGRATION_DONE_KEY set to true (don't probe again).
2. BridgeX file present + first run → fields imported → `ctx.persisted.save` called once with migrated config → `{ status: 'migrated', importedFields: [...] }`.
3. BridgeX file present + ShowX config already customized → `{ status: 'skipped', reason: 'showx-config-already-customized' }`.
4. MIGRATION_DONE_KEY already set → `{ status: 'skipped', reason: 'migration-already-completed' }`; no fs reads.
5. Malformed BridgeX JSON → `{ status: 'error' }`; MIGRATION_DONE_KEY NOT set (allow retry).
6. BridgeX with missing fields (e.g. no `listenerEnabled`) → migration succeeds with defaults filled in for missing.
7. Imported `lastEventId` is non-null; `oscPort` value 9000 imports correctly.
8. Cached outputs file present → log message + still migrates main config.

## Out of scope

- Customer migration UX flow with prompts / progress bars (B002-013 migration test harness will smoke-test the full E2E; this task is silent backend migration).
- Auth token migration (B002-007 — re-login required path).
- Migrating BridgeX runtime state (`bridge-state.json` SessionTracker) — handled in B002-003 SessionTracker port, with note in done report that first launch may have stale session state until next Supabase sync.
- Cross-platform path edge cases (XDG_CONFIG_HOME override on Linux, MAS sandbox path on macOS) — covered by candidate paths array; if customer reports issue, follow-up.
- Multi-version migration (BridgeX 0.2.x → ShowX) — out of support; only 0.3.x covered.

## Notes for Critic

- Verify migration is idempotent: run twice on a fresh setup, second run should be `skipped: 'migration-already-completed'`.
- Verify `MIGRATION_DONE_KEY` is set BEFORE the migration succeeds in error cases (no — for error, we want retry; verify error path does NOT set the flag).
- Verify candidatePaths() handles platform = 'darwin', 'win32', 'linux' correctly; unknown platform returns empty array (no crash).
- Verify imported config validates via configSchema's zodSchema (no orphan fields, no malformed values).
- Verify `isNonDefault` correctly returns false when current = defaults exactly.
- Verify rollback: simulate `ctx.persisted.save` throwing; assert migration returns 'error' and SecretStore done flag NOT set.
- Test fixture file shape matches real BridgeX `config-store.ts` saved JSON (read BridgeX source to confirm field names).
- No `process.env` reads inside migration code (uses `os.homedir()` and platform check only).
