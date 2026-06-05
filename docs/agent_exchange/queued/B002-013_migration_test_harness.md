---
id: "B002-013"
title: "Migration test harness: BridgeX 0.3.x → ShowX upgrade flow E2E"
type: "test"
estimated_size_lines: 500
priority: "P0"
depends_on: ["B002-009", "B002-012"]
target_files:
  - "tests/migration/bridgex_to_showx.test.ts"
  - "tests/migration/fixtures/bridgex-0_3_install/**"
  - "tests/migration/helpers/install-simulator.ts"
  - "tests/migration/helpers/showx-boot-with-migration.ts"
  - "docs/migration/bridgex-to-showx.md"
  - "docs/migration/migration-checklist.md"
acceptance_criteria:
  - "`tests/migration/bridgex_to_showx.test.ts` runs end-to-end: (1) simulate BridgeX 0.3.x install with sample config + cached session file + sample event_bridge_outputs; (2) boot ShowX 0.5 with EventX Bridge module enabled; (3) verify automatic migration completes; (4) re-run same scenario from B002-010 parity test PT-001 against the migrated config; (5) assert parity"
  - "Install simulator creates a fake BridgeX userData directory at `tests/migration/fixtures/bridgex-0_3_install/<platform>/` with: `bridgex-config.json`, `bridgex-session.enc` (placeholder), and event_bridge_outputs cache file"
  - "ShowX boot helper uses real EventXBridgeModule (B002-002+) loaded against a real (test-mode) module loader from B001-010 OR a mock loader if module loader test affordances aren't ready"
  - "Migration result asserted: config migrated; ShowX persistedConfig contains BridgeX's last `oscHost`, `oscPort`, `lastEventId`; SecretStore migration done flag set"
  - "Post-migration parity test: re-run PT-001 (wordcloud single) using migrated configuration → byte-identical OSC packets emitted"
  - "Customer migration playbook drafted in `docs/migration/bridgex-to-showx.md`: prerequisites, install steps, expected migration behavior, troubleshooting, rollback path (keep BridgeX 0.3.x installed during 60-day window)"
  - "Migration checklist drafted in `docs/migration/migration-checklist.md`: customer-side runbook (re-login required, verify Sender counter advances, rehearsal-mode smoke test)"
  - "Test SKIPS automatically if running on a platform where BridgeX install simulation isn't supported (Windows-only paths) — document the skip"
  - "`pnpm test tests/migration` runs in <30s for the simulated scenario; takes longer if `--platform=mac` real install used"
  - "Docs cross-link to `bridgex_absorption.md` §10 Customer comms timeline"
---

## Context

ShowX 0.5 internal release ships only if a real BridgeX 0.3.x customer can upgrade smoothly. The migration test harness validates the WHOLE chain:
- BridgeX userData paths detected correctly
- Config import succeeds
- Re-login flow surfaces correctly
- Module loads with imported config
- Parity holds against pre-migration BridgeX behavior

The end deliverable for this task includes BOTH the automated test AND a written customer playbook. Margaret + Architect review the playbook before customer comms go out (per `bridgex_absorption.md` §10 — Q4 2026 migration roadmap announce).

## Implementation notes

### Install simulator

Creates a synthetic BridgeX 0.3.x install state under a temp directory:

```ts
// tests/migration/helpers/install-simulator.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface SimulatedBridgeXInstall {
  cleanupFn: () => Promise<void>;
  configPath: string;
  sessionPath: string;
}

export async function simulateBridgeX_0_3_install(opts: {
  config?: any;
  hasSession?: boolean;
  hasOutputsCache?: boolean;
}): Promise<SimulatedBridgeXInstall> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridgex-sim-'));
  // Mirror real BridgeX userData layout
  const userData = path.join(tmpDir, 'Library/Application Support/bridgex');
  await fs.mkdir(userData, { recursive: true });

  const configPath = path.join(userData, 'bridgex-config.json');
  await fs.writeFile(configPath, JSON.stringify(opts.config ?? {
    lastEventId: 'ad843c45-fe2e-4b65-9e89-b0fe21e5ed28',
    oscHost: '10.0.1.10',
    oscPort: 7000,
    listenerHost: '0.0.0.0',
    listenerPort: 7001,
    listenerEnabled: true,
  }, null, 2));

  const sessionPath = path.join(userData, 'bridgex-session.enc');
  if (opts.hasSession) {
    // Placeholder: real BridgeX session file is safeStorage-encrypted; we cannot decrypt cross-process,
    // so the test only verifies that the file is DETECTED (not decrypted).
    await fs.writeFile(sessionPath, 'opaque-encrypted-bytes-placeholder');
  }

  if (opts.hasOutputsCache) {
    await fs.writeFile(path.join(userData, 'event_bridge_outputs.cache.json'),
      JSON.stringify([{ id: 'cached-row-1' }]));
  }

  return {
    configPath,
    sessionPath,
    cleanupFn: async () => fs.rm(tmpDir, { recursive: true, force: true }),
  };
}
```

The migration code from B002-009 reads from standard platform paths. To make tests work, the install simulator should:
- Set up under a temp directory
- Use environment variable override (`SHOWX_TEST_BRIDGEX_PATH=<tmpDir>/Library/...`) so migration code probes the test path

OR migration code accepts a `candidatePaths()` override for testing (default = platform paths; tests inject mock paths). Forge picks the cleaner approach; document in done report.

### ShowX boot with migration helper

```ts
// tests/migration/helpers/showx-boot-with-migration.ts
import EventXBridge from '../../../src/modules/eventx-bridge/src/EventXBridge.js';
import { makeMockContext } from '../../parity/helpers/scenario-harness.js';

export async function bootShowxWithMigration(opts: {
  bridgexConfigPath: string;
  showxUserDataPath: string;
}): Promise<{ module: EventXBridge; ctx: any; migrationResult: any }> {
  // Inject SHOWX_TEST_BRIDGEX_PATH env so candidatePaths() finds our test install
  process.env.SHOWX_TEST_BRIDGEX_PATH = path.dirname(opts.bridgexConfigPath);

  const ctx = makeMockContext({
    slug: 'eventx-bridge',
    persistedStorePath: opts.showxUserDataPath,
  });

  const module = new EventXBridge();
  await module.init(ctx);
  // Migration runs inside init() per B002-009 wiring

  const migrationResult = ctx.log.calls.find((c: any) => c.event === 'bridgex migration probe')?.args[1];
  return { module, ctx, migrationResult };
}
```

### Main test

```ts
// tests/migration/bridgex_to_showx.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { simulateBridgeX_0_3_install } from './helpers/install-simulator.js';
import { bootShowxWithMigration } from './helpers/showx-boot-with-migration.js';
import { loadGolden, runShowxScenarioOnLoadedModule } from '../parity/helpers/scenario-harness.js';

describe('BridgeX 0.3.x → ShowX 0.5 migration', () => {
  let simulated: any;
  let showxUserData: string;

  beforeEach(async () => {
    simulated = await simulateBridgeX_0_3_install({
      config: {
        lastEventId: 'ad843c45-fe2e-4b65-9e89-b0fe21e5ed28',
        oscHost: '10.0.1.10',
        oscPort: 7000,
        listenerHost: '0.0.0.0',
        listenerPort: 7001,
        listenerEnabled: true,
      },
      hasSession: true,
      hasOutputsCache: true,
    });
    showxUserData = await fs.mkdtemp(path.join(os.tmpdir(), 'showx-test-'));
  });

  afterEach(async () => {
    await simulated.cleanupFn();
    await fs.rm(showxUserData, { recursive: true });
  });

  it('detects BridgeX install + imports config', async () => {
    const { module, ctx, migrationResult } = await bootShowxWithMigration({
      bridgexConfigPath: simulated.configPath,
      showxUserDataPath: showxUserData,
    });

    expect(migrationResult.status).toBe('migrated');
    expect(migrationResult.importedFields).toContain('lastEventId');
    expect(migrationResult.importedFields).toContain('oscHost');

    // ShowX config now reflects BridgeX values
    const config = await ctx.persisted.load(/* schema */);
    expect(config.lastEventId).toBe('ad843c45-fe2e-4b65-9e89-b0fe21e5ed28');
    expect(config.oscHost).toBe('10.0.1.10');
  });

  it('migration is idempotent on second start', async () => {
    await bootShowxWithMigration({ bridgexConfigPath: simulated.configPath, showxUserDataPath: showxUserData });
    const { migrationResult } = await bootShowxWithMigration({ bridgexConfigPath: simulated.configPath, showxUserDataPath: showxUserData });
    expect(migrationResult.status).toBe('skipped');
  });

  it('detects session file but does not decrypt (requires re-login)', async () => {
    const { migrationResult } = await bootShowxWithMigration({ bridgexConfigPath: simulated.configPath, showxUserDataPath: showxUserData });
    // Per B002-007 migrateFromBridgex behavior — file detected but not migrated
    expect(/* auth migration log */).toContain('requires-relogin');
  });

  it('PT-001 parity holds against migrated configuration', async () => {
    const { module, ctx } = await bootShowxWithMigration({ bridgexConfigPath: simulated.configPath, showxUserDataPath: showxUserData });
    // Now run PT-001 (wordcloud single) scenario against this module
    const golden = loadGolden('pt_001_wordcloud_single');
    const captured = await runShowxScenarioOnLoadedModule(module, ctx, {
      goldenSetup: golden.setup,
      injectedRows: golden.rows,
      durationMs: 1000,
    });
    const diff = diffPackets(golden.expectedOutbound, captured);
    expect(diff.equal, diff.report).toBe(true);
  });
});
```

### Customer playbook

```markdown
<!-- docs/migration/bridgex-to-showx.md -->
# BridgeX 0.3.x → ShowX 0.5 Migration Playbook

## Who this is for

Anyone running BridgeX 0.3.x at a venue. ShowX 0.5 is the successor product —
BridgeX brand retires; the same functionality lives as the "EventX Bridge"
module inside ShowX.

## Prerequisites

- macOS 12+ (Intel or Apple Silicon)
- BridgeX 0.3.x currently installed (DMG signed by XLAB, version 0.3.x)
- Valid EventX login credentials (Supabase email + password)
- 30 minutes for first install + verification

## Installation

1. Download ShowX 0.5 DMG from XLAB (link provided by Margaret).
2. Mount + drag ShowX.app to /Applications.
3. (Optional) Quit BridgeX 0.3.x. (You can keep it installed during the 60-day
   rollback window — both apps can co-exist; only run ONE at a time on the
   same OSC port.)
4. Launch ShowX. First-launch tasks:
   - Detect BridgeX 0.3.x install → import config (silent, instantaneous)
   - Detect BridgeX session file → prompt: "Log in to ShowX (BridgeX session
     cannot transfer to ShowX automatically)"
5. Click EventX Bridge tab in left sidebar.
6. Log in with your EventX credentials.
7. Select your most-recent event from the dropdown (auto-selected from imported
   `lastEventId`).
8. Click Start.

## Expected behavior

- ShowX takes ~10s to subscribe to Supabase Realtime + register OSC outputs.
- Activity log shows "Bridge: connected — N outputs ready".
- A test submission in EventX (e.g. wordcloud submit) fires the same OSC
  packet ShowX as BridgeX did.

## Rehearsal smoke test (recommended before first show)

1. Open the event in EventX as an audience member.
2. Submit a test response.
3. Verify your downstream tool (QLab / Eos / Disguise / MA3) receives the
   expected cue/packet.
4. If yes: ShowX migration successful. Proceed with rehearsal.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Module shows "Not logged in" | Auth not yet transferred | Log in via Login button in EventX Bridge panel |
| Module shows "Supabase connection error" | Network blocks Supabase | Check firewall: allow `wss://*.supabase.co` |
| Cues fire in BridgeX but not ShowX | BridgeX still running | Quit BridgeX 0.3.x; only one app can hold the OSC port |
| Cues fire differently in ShowX | Possible parity regression | Capture screen+logs; email support@xlab.cz with timestamps |
| Migration didn't import config | `bridgex-config.json` was customized in unusual location | Manually copy `oscHost` + `oscPort` + `lastEventId` into ShowX's EventX Bridge settings |

## Rollback

If ShowX fails for any reason during a show:
1. Quit ShowX.
2. Re-launch BridgeX 0.3.x. Config + session preserved (BridgeX userData not modified by ShowX).
3. Continue show on BridgeX.
4. Report the failure: `support@xlab.cz` with timestamps + log file (Help menu → "Open log folder").

BridgeX 0.3.x receives security patches through Q1 2027; EOL announced Q2 2027.

## What's different in ShowX

- **Multi-module shell:** ShowX hosts EventX Bridge alongside other modules
  (Cuelist Core, SHOW mode, etc — Pro+ features). Free tier matches BridgeX
  0.3.x functionality.
- **One Apple bundle (`cz.xlab.showx`):** New Gatekeeper entry. Both BridgeX
  and ShowX can co-exist; macOS sees them as separate apps.
- **Same downstream protocol:** OSC / MIDI / DMX / webhook packets are
  byte-identical to BridgeX 0.3.x — your QLab cues / Eos macros / MA3 sequences
  do NOT need changes.
- **No code change required from you.** The migration is mechanical config import.

## Support

- Email: `support@xlab.cz` (response: same-day during business hours, Margaret)
- Slack: XLAB customer channel (link provided in your contract)
- Bug reports: include OS version, ShowX version, log file, timestamp of issue
```

### Customer checklist

```markdown
<!-- docs/migration/migration-checklist.md -->
# ShowX 0.5 Migration Checklist (Customer Runbook)

## Before show day

- [ ] ShowX 0.5 DMG downloaded + installed
- [ ] EventX login verified in ShowX EventX Bridge panel
- [ ] Last event auto-imported (config migration successful)
- [ ] Test submission fires expected OSC/MIDI/DMX to downstream tool
- [ ] BridgeX 0.3.x kept installed for emergency rollback (do not delete)

## Show day

- [ ] ShowX launched; EventX Bridge tab shows "Connected"
- [ ] Sender counter advances during rehearsal
- [ ] Activity log shows expected packets
- [ ] All downstream tools receive cues correctly

## After show

- [ ] No errors in ShowX activity log
- [ ] Note any unexpected behavior — email `support@xlab.cz` post-show
```

## Test plan

Tests defined above. `pnpm test tests/migration` runs them all.

For real-machine validation (not in CI):
- Install BridgeX 0.3.x DMG on a clean Mac
- Configure with a real EventX event
- Install ShowX 0.5 DMG (when B002-015 ships)
- Manually run the playbook
- Verify all 4 checklist items pass

## Out of scope

- Real DMG signing + notarization (B002-014, B002-015).
- Customer comms (Architect + Margaret draft post-task).
- Multi-customer beta coordination (Architect + Margaret).
- Customer training videos / screencasts (Margaret).
- Rollback automation (manual per playbook).
- BridgeX 0.3.x EOL announce automation.

## Notes for Critic

- Verify install simulator creates files under temp dir, NOT real userData.
- Verify migration test cleans up temp dirs in afterEach (no leaked tmp).
- Verify test uses `runShowxScenarioOnLoadedModule` (new helper) that operates on already-init'd module — distinct from `runShowxScenario` which boots fresh.
- Verify the migrated PT-001 test ACTUALLY uses the migrated config (eventId, oscHost) and is NOT just running the standard PT-001 with goldens.
- Verify docs/migration/bridgex-to-showx.md is reviewed for clarity (target audience: non-technical FOH operator).
- Verify rollback path documented + tested (delete ShowX, launch BridgeX → still works).
- Verify the test SKIP for unsupported platforms (Linux/Windows) is graceful + logged.
- Verify `support@xlab.cz` email referenced in docs (matches XLAB people reference for Margaret).
