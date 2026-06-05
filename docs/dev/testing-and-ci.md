# Testing and CI

ShowX uses three test layers + one custom harness. All are designed to run from a fresh `pnpm install` without special setup beyond what `getting-started.md` covers.

| Layer | Tool | Where | Runs |
|---|---|---|---|
| **Unit** | Vitest | `tests/unit/` + co-located `*.test.ts` next to source | every CI run, every pre-commit |
| **Integration** | Vitest with a real test shell | `tests/integration/` | every CI run |
| **E2E** | Playwright | `tests/e2e/` | every CI run; manually before release |
| **Parity** | custom harness wrapping Vitest | `tests/parity/` | every CI run; gate for EventX Bridge module ship |

## 1. Vitest unit tests

Unit tests live either:

- **Next to source**: `src/main/shared/output-dispatcher/pool.ts` ↔ `src/main/shared/output-dispatcher/pool.test.ts`. Preferred for tight-loop development.
- **Under `tests/unit/`**: mirror of `src/` structure. Used for cross-package tests or when the test needs heavy setup that pollutes the source tree.

### Naming conventions

- Files: `*.test.ts` (NOT `*.spec.ts` — keep one convention).
- Suite: `describe('<ClassOrFunctionName>', () => {...})`.
- Cases: `it('<expected behaviour>', () => {...})` — start with a verb in present tense.

```typescript
// src/main/shared/output-dispatcher/pool.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Pool } from './pool.js';

describe('Pool', () => {
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool();
  });

  it('refcounts shared destinations', () => {
    const a = pool.claim({ kind: 'osc-out', address: '10.0.1.10', port: 8000 }, 'module-a');
    const b = pool.claim({ kind: 'osc-out', address: '10.0.1.10', port: 8000 }, 'module-b');
    expect(pool.status().active_destinations[0].refcount).toBe(2);
    pool.release(a);
    expect(pool.status().active_destinations[0].refcount).toBe(1);
    pool.release(b);
    expect(pool.status().active_destinations).toHaveLength(0);
  });
});
```

### Common vitest config tweaks

```typescript
// vitest.config.ts (per package)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',          // 'jsdom' for tests touching DOM (rare in main)
    globals: false,               // prefer explicit imports
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts'],
    },
  },
});
```

For PWA tests use `environment: 'jsdom'` and `setupFiles: ['./tests/setup-fake-indexeddb.ts']`:

```typescript
// pwa/tests/setup-fake-indexeddb.ts
import 'fake-indexeddb/auto';   // shim global indexedDB
```

`fake-indexeddb` is already in root devDependencies.

## 2. Mocking ModuleContext

The most common unit test pattern is testing a module class in isolation. The `makeMockContext` helper (lives in `tests/helpers/mock_context.ts`, written in ShowX-1 Foundation bundle B001-002 / B001-010 area) gives every module a fake shell.

```typescript
// tests/helpers/mock_context.ts — shape (Forge writes the implementation)
import type { ModuleContext, ConfigSchemaDescriptor, TransportMessage } from '@showx/types';

export interface MockContext extends ModuleContext {
  // mock capture surfaces
  readonly output: MockOutputDispatcher;
  readonly events: MockEventBus;
  readonly health: MockHealthBus;
  readonly persisted: MockPersistedStore;
  readonly secrets: MockSecretStore;
}

export interface MockOutputDispatcher {
  readonly sentMessages: TransportMessage[];
  send(msg: TransportMessage): Promise<{ ok: true; bytes: number; latency_ms: number }>;
  // ...
}

export interface MakeMockContextOptions {
  slug: string;
  tier?: 'free' | 'pro';
  shellVersion?: string;
  persistedReturn?: unknown;
  secrets?: Record<string, string>;
  withRealYjs?: boolean;
}

export function makeMockContext(opts: MakeMockContextOptions): MockContext;
```

Usage in a module test:

```typescript
import { makeMockContext } from '../../../tests/helpers/mock_context.js';

const ctx = makeMockContext({ slug: 'hello-world' });
const mod = new HelloWorldModule();
await mod.init(ctx);
await mod.start();

ctx.events.publish({ type: 'cue-fire', cue_id: 'q1', cue_label: 'Q 1' } as never);

expect(ctx.output.sentMessages).toHaveLength(1);
expect(ctx.output.sentMessages[0].payload.address).toBe('/hello/fired');
```

## 3. Integration tests — `bootTestShell`

For tests that exercise the real loader + multiple modules in one process, use `bootTestShell` (lives in `tests/helpers/boot_test_shell.ts`).

```typescript
import { bootTestShell, type TestShell } from '../helpers/boot_test_shell.js';

describe('eventx-bridge ↔ cuelist-core', () => {
  let shell: TestShell;

  beforeEach(async () => {
    shell = await bootTestShell({
      enabledModules: ['eventx-bridge', 'cuelist-core'],
      // in-memory persisted store
      // OSC-loopback dispatcher
      // no real Electron — just the shell services
    });
    await shell.waitForReady();
  });

  afterEach(async () => {
    await shell.shutdown();
  });

  it('routes cue-fire through dispatcher to OSC loopback', async () => {
    // simulate a GO press
    shell.sideChannel.simulateMessage({
      topic: 'go.request', request_id: 'r1', cue_id: 'q1',
      cuelist_id: 'cl_main', station_id: 'sm', operator_id: 'op_sm',
      client_ts: new Date().toISOString(), override: false,
    });
    await shell.waitForOscOut('/eos/cue/1/47/fire');
  });
});
```

`bootTestShell` boots a real loader against an in-memory PersistedStore + an OSC-loopback OutputDispatcher. Used for end-to-end module behaviours without the full Electron renderer.

## 4. Playwright E2E

E2E lives in `tests/e2e/`. The goal is to validate the PWA-station ↔ shell chain on a real WebSocket:

- Boot a real ShowX shell (`scripts/serve-test-shell.mjs` or equivalent) on a known port.
- Drive a headless browser PWA via Playwright.
- Assert: PWA receives Yjs sync, SM can fire a cue, side-channel topics broadcast.

```typescript
// tests/e2e/sm-fire-go.spec.ts
import { test, expect } from '@playwright/test';

test('SM fires GO, all stations see go.dispatched', async ({ browser }) => {
  const sm = await browser.newContext();
  const lx = await browser.newContext();

  const smPage = await sm.newPage();
  const lxPage = await lx.newPage();

  await smPage.goto('http://localhost:5300/?as=sm');
  await lxPage.goto('http://localhost:5300/?as=lx_op');

  await smPage.click('[data-testid="go-button"]');

  await expect(lxPage.locator('[data-testid="cue-q1"]')).toHaveClass(/fired/);
});
```

Run with:

```bash
pnpm test:e2e                      # all E2E
pnpm test:e2e --ui                 # interactive
pnpm exec playwright install       # first-time install browsers
```

The Playwright config lives at root `playwright.config.ts` (or inside `tests/e2e/`). It auto-starts the test shell via `webServer:` directive.

## 5. Parity test harness — the EventX Bridge gate

This is the most ShowX-specific test layer. It exists because the EventX Bridge module absorbs BridgeX 0.3.x verbatim and the hard ship gate is **byte-identical OSC packets** under identical config.

### 5.1 What it does

For each parity scenario (PT-001 through PT-035):

1. Load a golden recording captured from BridgeX 0.3.x running the same scenario (e.g. wordcloud submission flood, poll vote tally, sensor-race 30 Hz stream).
2. Run ShowX with the EventX Bridge module enabled against the same `event_bridge_outputs` + `event_bridge_mappings` config.
3. Inject the same input events.
4. Capture every outbound OSC / MIDI / DMX packet.
5. Assert: byte-identical packet sequence, OR within tolerance for `latency_ms` (p95 budget: BridgeX 0.3.x baseline + 5 ms).

### 5.2 Where files live

```
tests/parity/
├── harness/
│   ├── loader.ts                  ← loads ShowX shell + EventX Bridge module
│   ├── golden_reader.ts           ← reads recorded BridgeX 0.3.x captures
│   ├── packet_diff.ts             ← byte diff + tolerance rules
│   └── latency_budget.ts          ← p95 budget enforcement
├── scenarios/
│   ├── PT-001_wordcloud_basic.test.ts
│   ├── PT-002_poll_tally.test.ts
│   ├── ...
│   └── PT-035_sensor_race_memory_soak.test.ts
└── golden/
    ├── PT-001/
    │   ├── config.json            ← event_bridge_outputs + event_bridge_mappings
    │   ├── input_events.jsonl     ← Supabase row events as captured
    │   └── expected_packets.jsonl ← byte-by-byte OSC output
    └── ...
```

### 5.3 A parity scenario

```typescript
// tests/parity/scenarios/PT-001_wordcloud_basic.test.ts
import { describe, it, expect } from 'vitest';
import { runParityScenario } from '../harness/loader.js';

describe('PT-001 — wordcloud basic dispatch', () => {
  it('matches BridgeX 0.3.x golden', async () => {
    const result = await runParityScenario('PT-001', {
      latencyToleranceMs: 5,
      requireByteIdentical: true,
    });
    expect(result.packets_diffs).toEqual([]);
    expect(result.p95_latency_diff_ms).toBeLessThanOrEqual(5);
  });
});
```

### 5.4 Adding a new parity scenario

When you migrate a BridgeX 0.3.x behaviour and want to lock it down:

1. **Capture** the BridgeX 0.3.x reference. Run BridgeX 0.3.x DMG with the scenario config, use `tools/testerx` to inject events, capture packets via the tap WS server on `:7901`. Save to `tests/parity/golden/PT-XXX/expected_packets.jsonl`.
2. **Save the input events.** The same testerx capture provides `input_events.jsonl`.
3. **Save the config.** `event_bridge_outputs` + `event_bridge_mappings` rows as JSON.
4. **Write the test** — a 5-line file following the `runParityScenario` pattern above.
5. **Add to `state.json`** under a `B002-XXX` parity test task if the migration needs Critic review.
6. **Run** `pnpm test:parity tests/parity/scenarios/PT-XXX_*.test.ts` and watch it pass.

### 5.5 What's locked in by parity

| Behaviour group | Locked by | Note |
|---|---|---|
| OSC byte layout (header, args, padding) | PT-001..010 | type-tag mapping must be identical |
| OSC leading-`/` auto-fix quirk | PT-001 | BridgeX 0.3.x quietly fixed missing leading slash; preserved |
| Wordcloud state-snapshot dedup | PT-003 | wordcloud handler dedupes state snapshots; preserved |
| 30 Hz sensor stream gating | PT-018 | sensor_race emits at fixed 30 Hz; preserved |
| Session-status `'live'` filter | PT-006 | only `'live'` sessions go to SessionTracker; preserved |
| Reconnect backoff curve | PT-022..025 | `[1, 2, 4, 8, 16, 30]` s — same |
| Latency p95 vs baseline | PT-034 | +5 ms budget enforced |
| Memory soak | PT-035 | RSS growth under 1 MB / hour at idle |

When migrating a behaviour you BELIEVE shouldn't change — write the test FIRST, fail it deliberately, fix the module, watch it pass. That's the safety net.

## 6. GitHub Actions CI workflow

```yaml
# .github/workflows/ci.yml (sketch — Forge writes the real one in B001-013)
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: macos-14    # Apple Silicon for native modules
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 8.15.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm test:parity
      - run: pnpm exec playwright install --with-deps
      - run: pnpm test:e2e
```

Notes:

- **macOS runner** because native MIDI / Keychain modules need macOS bindings.
- **Frozen lockfile** to ensure deterministic deps.
- Typecheck and lint run before tests — fast feedback, cheap gate.
- Parity tests need golden files in `tests/parity/golden/` — these are checked into git (gzipped if large).

A separate workflow `release.yml` handles signing + notarizing DMG (out of scope here; see `docs/specs/bridgex_absorption.md` §8).

## 7. Test patterns reference

### Mock OSC out + assert exact bytes

```typescript
import { encodeOsc } from 'osc-min';

const expected = encodeOsc({ address: '/eos/cue/1/47/fire', args: [] });
expect(ctx.output.sentMessages[0].rawBytes).toEqual(expected);
```

### Fake clock for time-based assertions

```typescript
import { describe, it, vi, expect } from 'vitest';

it('autosaves after 30s of pending changes', async () => {
  vi.useFakeTimers();
  // mutate doc
  vi.advanceTimersByTime(30_000);
  expect(fakeFs.writes).toContain(/show\.json/);
  vi.useRealTimers();
});
```

### Yjs in-memory document

```typescript
import * as Y from 'yjs';

const doc = new Y.Doc();
const cuelists = doc.getArray<Y.Map<unknown>>('cuelists');
// ... mutate, observe
expect(cuelists.length).toBe(1);
```

No broker needed for unit tests — Yjs is fully usable in-memory.

### IndexedDB shim (PWA tests)

```typescript
import 'fake-indexeddb/auto';   // before any indexedDB access

const db = await openShowxDb();
await db.put('tokens', { show_id: 'x', token: 'tok' });
```

### Test the side-channel server without a real socket

```typescript
import { SideChannelServer } from '../../src/main/shared/side-channel.js';

const sc = new SideChannelServer();
const client = sc.simulateClient({ token: 'tok' });
client.send({ topic: 'go.request', cue_id: 'q1', /* ... */ });
expect(client.received).toContainEqual(
  expect.objectContaining({ topic: 'go.dispatched', cue_id: 'q1' })
);
```

The `simulateClient` factory bypasses real WebSocket — directly drives the server's onMessage handler. Faster + deterministic.

## 8. Running tests locally

```bash
pnpm test                      # unit + integration via Vitest
pnpm test:watch                # watch mode
pnpm test --filter showx-main  # one workspace
pnpm test -t "Pool"            # one test by name pattern

pnpm test:e2e                  # Playwright E2E
pnpm test:e2e --ui             # interactive mode
pnpm test:e2e --headed         # see the browser

pnpm test:parity               # parity gate (BridgeX 0.3.x byte-identical)
pnpm test:parity tests/parity/scenarios/PT-001_*.test.ts
```

### Faster iteration

`pnpm test:watch` plus VS Code Vitest extension gives instant gutter feedback. For E2E iteration:

```bash
pnpm test:e2e --ui --workers 1
```

Single worker + UI mode = easier to debug. For parity: tests share golden file fixtures, so set `VITEST_MAX_THREADS=1` if you see flakes from concurrent access.

## 9. Common pitfalls

### "Cannot find module ../../tests/helpers/mock_context"

The helper is written in ShowX-1 Foundation bundle. Until B001-002 / B001-010 land, the file may not exist. Write a minimal local mock in your test file.

### Tests pass locally, fail in CI on `@julusian/midi`

Native module rebuild for macOS-arm64. In CI, set `NPM_CONFIG_TARGET_ARCH=arm64` for `actions/setup-node@v4`.

### Parity test fails on a "trivial" change

This is the harness doing its job. BridgeX 0.3.x customers depend on the exact bytes. Two paths:

1. Revert the change.
2. If the change is genuinely required, update the golden file — but ONLY with explicit Architect approval via a decision note. Bypassing parity silently is a release-blocker.

### Playwright timeout in CI

Default Playwright timeout = 30 s. ShowX boot can take 5–8 s, which can leave little budget. Set `expect.timeout` to 10 s in the test or `use.actionTimeout` in playwright config.

## 10. Further reading

- `docs/specs/module_loader.md` §12 — official test patterns including `bootTestShell` + parity harness
- `docs/specs/bridgex_absorption.md` §6 — parity contract behaviours (scenario list)
- `docs/dev/module-sdk.md` §8 — module unit test pattern (mock ModuleContext)
- `docs/dev/agent-exchange-workflow.md` — how Critic uses tests to gate acceptance
