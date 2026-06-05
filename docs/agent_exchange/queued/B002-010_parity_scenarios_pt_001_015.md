---
id: "B002-010"
title: "Parity test scenarios PT-001..015 (basic dispatch coverage)"
type: "test"
estimated_size_lines: 800
priority: "P0"
depends_on: ["B002-004", "B002-006"]
target_files:
  - "tests/parity/scenarios/pt_001_wordcloud_single.parity.test.ts"
  - "tests/parity/scenarios/pt_002_wordcloud_duplicate.parity.test.ts"
  - "tests/parity/scenarios/pt_003_wordcloud_dedup.parity.test.ts"
  - "tests/parity/scenarios/pt_004_wordcloud_empty.parity.test.ts"
  - "tests/parity/scenarios/pt_005_poll_tally.parity.test.ts"
  - "tests/parity/scenarios/pt_006_quiz_mc.parity.test.ts"
  - "tests/parity/scenarios/pt_007_hundred_points.parity.test.ts"
  - "tests/parity/scenarios/pt_008_scales_mean.parity.test.ts"
  - "tests/parity/scenarios/pt_009_multitap_rate.parity.test.ts"
  - "tests/parity/scenarios/pt_010_qa_highlight.parity.test.ts"
  - "tests/parity/scenarios/pt_011_sensor_stream_30hz.parity.test.ts"
  - "tests/parity/scenarios/pt_012_sensor_stream_skip.parity.test.ts"
  - "tests/parity/scenarios/pt_013_show_control_trigger.parity.test.ts"
  - "tests/parity/scenarios/pt_014_show_control_team.parity.test.ts"
  - "tests/parity/scenarios/pt_015_session_live_enrich.parity.test.ts"
  - "tests/parity/fixtures/golden/pt_001_through_015/*.golden.jsonl"
  - "tests/parity/helpers/scenario-harness.ts"
acceptance_criteria:
  - "Each PT-NNN scenario test file follows the standard structure from `tests/parity/` harness (B001-013): load golden BridgeX 0.3.x recording → boot ShowX EventX Bridge module against same mocked Supabase event → compare outbound OSC/MIDI/DMX packet bytes"
  - "Golden recordings stored as JSONL under `tests/parity/fixtures/golden/pt_001_through_015/` — each line a `{ ts, transport, destination, address, args (bytes for MIDI/DMX) }` envelope captured from BridgeX 0.3.x running same scenario"
  - "All 15 scenarios pass byte-equality (or order-insensitive per Q25 if Architect rules so during execution)"
  - "Scenario PT-001: Wordcloud single submission `{ word: 'hello' }` → single OSC packet to `/eventx/<shortId>/wordcloud/add` with args `['hello', 1]`; byte-identical between BridgeX and ShowX"
  - "Scenario PT-002: Two submissions same word → second packet has count 2 (counter increment behavior)"
  - "Scenario PT-003: Wordcloud state snapshot dedup: 3 periodic state push ticks with no submission changes → ONLY ONE `/wordcloud/state` packet emitted (parity §6.1 #18)"
  - "Scenario PT-004: Empty event (no submissions for 5s) → ZERO `/wordcloud/state` packets (parity §6.1 #18 skip-if-zero quirk)"
  - "Scenario PT-005: Poll 4 votes / 3 options → per-option share emit + `poll.leader` channel correct"
  - "Scenario PT-006: Quiz MC 3 submissions mixed correct/incorrect → per-choice tallies + per-submission correct/incorrect emits"
  - "Scenario PT-007: Hundred points 5 submissions / 4 options → running totals per option emit"
  - "Scenario PT-008: Scales 10 submissions on Likert 0-100 → per-scale mean emit"
  - "Scenario PT-009: Multitap 20 events in 1s → per-target rate-counter; team scoping applied"
  - "Scenario PT-010: QA highlight submit + toggle + re-toggle → highlight state events match"
  - "Scenario PT-011: sensor_race event live → 30±1 packets/sec emitted for 5s (parity §6.1 #21)"
  - "Scenario PT-012: NO sensor_race activity → ZERO `/sensor/*` packets in 10s (parity §6.1 #45-46)"
  - "Scenario PT-013: show_control_trigger osc_address=`/lx/go` → raw `/lx/go` packet + `show_control.cue=1` channel emit"
  - "Scenario PT-014: Trigger with team_id=ABCD1234... → packet address becomes `/lx/go/team/ABCD` (slice first 4 chars per parity §6.1 #20)"
  - "Scenario PT-015: activity_session status=live → enrichment of subsequent submission succeeds"
  - "Each test runs in <5s of wallclock (excluding 5s/10s scenarios PT-004 and PT-012 which use fake timers)"
  - "Failed parity diffs produce informative error output: byte-level diff with offset + adjacent context (use harness from B001-013)"
  - "`pnpm parity:basic` (new script alias) runs PT-001..015 in <60s total"
---

## Context

ShowX 0.5 ships only if EventX Bridge module produces byte-identical packets to BridgeX 0.3.x on the same `event_bridge_outputs` + `event_bridge_mappings` rows + same Supabase event state. This is the **hard gate** for customer migration — if a customer's QLab cue fires differently in ShowX, the migration fails.

The parity test harness lives at `tests/parity/` (built in B001-013). It provides:
- Golden recording loader (JSONL → in-memory event stream)
- Mock Supabase Realtime (injects events at controlled timing)
- Mock OSC/MIDI/DMX sinks (capture outbound bytes)
- Byte-diff comparator (optionally order-insensitive per Q25 ruling)

This task covers PT-001 through PT-015 — basic activity handler dispatch coverage per `bridgex_absorption.md` §6.2.

B002-011 covers error paths + reconnect + auth refresh (PT-016..025).
B002-012 covers latency budget + memory soak (PT-026..035).

## Implementation notes

### Golden recording capture process

Forge needs golden recordings from a real BridgeX 0.3.x run. Two paths:

1. **Pre-existing recordings**: check `~/Daniel-local/bridgeX/tests/parity/fixtures/golden/` if Architect captured them during Step 6 of migration sequence (`bridgex_absorption.md` §7 Step 6 — golden recording capture). If present, copy into `tests/parity/fixtures/golden/pt_001_through_015/`.

2. **Fresh capture**: if no goldens exist, write a `scripts/capture-bridgex-golden.ts` helper that:
   - Boots BridgeX 0.3.x with a test profile (or `cz.xlab.bridgex` DMG running in dev mode)
   - Injects synthetic Supabase events via TesterX or direct DB insert
   - Captures outbound packets via tcpdump / pcap / or BridgeX's `outputs/tap.ts` WS server on :7901
   - Writes JSONL with envelope `{ ts, transport, destination, address, args }`

For ShowX-2 task: prefer path 1. If goldens are missing, document blocker in done report and escalate to Architect for capture session.

### Test scenario template

```ts
// tests/parity/scenarios/pt_001_wordcloud_single.parity.test.ts
import { describe, it, expect } from 'vitest';
import { loadGolden, runShowxScenario, diffPackets } from '../helpers/scenario-harness.js';

describe('PT-001: Wordcloud single submission → byte-equal OSC', () => {
  it('produces byte-identical OSC packet to BridgeX 0.3.x', async () => {
    const golden = loadGolden('pt_001_wordcloud_single');
    const captured = await runShowxScenario({
      goldenSetup: golden.setup,   // event_bridge_outputs + mappings + event topology
      injectedRows: golden.rows,   // submissions/sessions/triggers/aggregations injection sequence
      durationMs: 1000,            // wait this long to capture all emits
    });
    const diff = diffPackets(golden.expectedOutbound, captured);
    expect(diff.equal, diff.report).toBe(true);
  });
});
```

### scenario-harness.ts (verify exists from B001-013; extend if needed)

```ts
// tests/parity/helpers/scenario-harness.ts
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import EventXBridge from '../../../src/modules/eventx-bridge/src/EventXBridge.js';
import { manifest } from '../../../src/modules/eventx-bridge/src/manifest.js';
import { makeMockContext, makeMockSupabase, makeMockOutputDispatcher } from './mock_factory.js';

export interface GoldenScenario {
  id: string;
  setup: {
    eventId: string;
    shortId: string;
    activities: Array<{ id: string; activity_type: string; status: 'live' | 'paused' | 'ended' }>;
    outputs: any[];        // EventBridgeOutput[]
    mappings: any[];       // EventBridgeMapping[]
  };
  rows: Array<{ ts: number; table: 'submissions' | 'activity_sessions' | 'show_control_triggers' | 'aggregations'; eventType: string; row: any }>;
  expectedOutbound: PacketEnvelope[];
}

export interface PacketEnvelope {
  ts: number;        // relative to scenario start
  transport: 'osc' | 'midi' | 'dmx-artnet' | 'dmx-sacn' | 'webhook' | 'ws';
  destination: any;
  address?: string;
  args?: any[];
  bytes?: number[];  // for MIDI/DMX
}

export function loadGolden(scenarioId: string): GoldenScenario {
  const dir = path.join(__dirname, '..', 'fixtures', 'golden', 'pt_001_through_015', scenarioId);
  const setup = JSON.parse(readFileSync(path.join(dir, 'setup.json'), 'utf8'));
  const rows = readJsonl(path.join(dir, 'rows.jsonl'));
  const expectedOutbound = readJsonl(path.join(dir, 'expected.jsonl'));
  return { id: scenarioId, setup, rows, expectedOutbound };
}

export async function runShowxScenario(scenario: { goldenSetup: any; injectedRows: any[]; durationMs: number }) {
  const captured: PacketEnvelope[] = [];
  const mockOutput = makeMockOutputDispatcher((envelope) => captured.push(envelope));
  const mockSupabase = makeMockSupabase(scenario.goldenSetup);
  const ctx = makeMockContext({
    slug: 'eventx-bridge',
    output: mockOutput,
    supabaseClient: mockSupabase,
  });

  const module = new EventXBridge();
  await module.init(ctx);
  await module.start();

  // Inject rows at scheduled timestamps
  for (const row of scenario.injectedRows) {
    await sleepUntil(row.ts);
    mockSupabase.simulateRow(row.table, row.eventType, row.row);
  }
  await sleep(scenario.durationMs);

  await module.stop();
  await module.teardown();
  return captured;
}

export function diffPackets(expected: PacketEnvelope[], actual: PacketEnvelope[]): { equal: boolean; report: string } {
  // Order-sensitive byte diff by default
  // Falls back to order-insensitive bucketed compare if env SHOWX_PARITY_ORDER_INSENSITIVE=1
  // (per Q25 — Architect rules during execution)
  const orderInsensitive = process.env.SHOWX_PARITY_ORDER_INSENSITIVE === '1';
  // ...
}
```

If B001-013 didn't fully implement these helpers, Forge extends them. Coordinate with B001-013 done report — document any extensions in this task's done report.

### Per-scenario file structure

Each scenario gets a directory under `tests/parity/fixtures/golden/pt_001_through_015/<scenario_id>/`:

```
pt_001_wordcloud_single/
├── setup.json         # outputs + mappings + activities + eventId + shortId
├── rows.jsonl         # injection sequence
└── expected.jsonl     # expected outbound packets from BridgeX 0.3.x
```

### Specific scenarios — implementation notes

**PT-001 Wordcloud single**
- setup.json: 1 activity_type=wordcloud, 1 output (OSC to mock), 1 mapping for `wordcloud.add` channel
- rows.jsonl: 1 submission `{ activity_id, content: { word: 'hello' } }` at t=10
- expected.jsonl: 1 OSC packet `/eventx/abcd/wordcloud/add` with args `['hello', 1]` at t≈10

**PT-003 Wordcloud dedup**
- setup.json: 1 wordcloud activity + periodic state push enabled
- rows.jsonl: 1 submission at t=0; 3 ticks at t=2000, 4000, 6000 (periodic push)
- expected.jsonl: 1 `wordcloud/add` at t=0; ONE `wordcloud/state` at t=2000; NO state packets at t=4000, 6000 (dedup)

**PT-004 Wordcloud empty**
- setup.json: 1 wordcloud activity
- rows.jsonl: empty (no submissions in 5s)
- expected.jsonl: ZERO packets (skip-if-zero-words quirk)

**PT-011 sensor_race 30Hz**
- setup.json: 1 sensor_race activity + aggregation aggregator
- rows.jsonl: aggregation row inserted with continuous data
- expected.jsonl: 150 packets in 5s (30/sec ± 1)
- Test asserts: count between 145 and 155 packets

**PT-012 sensor_race skip**
- setup.json: no sensor_race activity (only wordcloud)
- rows.jsonl: aggregation row inserted
- expected.jsonl: 0 sensor_* packets in 10s

**PT-014 Team scoping**
- setup.json: 1 show-control output mapped to `/lx/go`
- rows.jsonl: 1 show_control_trigger with `team_id=ABCD1234-5678-9012-3456-789012345678`
- expected.jsonl: address `/lx/go/team/ABCD` (slice first 4)

### Fake timer integration

Use Vitest fake timers for time-sensitive scenarios:

```ts
import { vi } from 'vitest';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// In runShowxScenario for durationMs:
await vi.advanceTimersByTimeAsync(scenario.durationMs);
```

Real timers only for PT-011 30Hz scenario (since count of 150 packets in 5s wallclock is the assertion).

### Diff output format

When byte-diff fails, the harness emits a detailed report:

```
PT-001: 1 packet diff
  expected[0]: { transport: 'osc', address: '/eventx/abcd/wordcloud/add', args: ['hello', 1] }
  actual[0]:   { transport: 'osc', address: '/eventx/abcd/wordcloud/add', args: ['hello', 0] }
  diff at args[1]: expected 1, actual 0
```

For MIDI/DMX, emit byte-level diff:

```
PT-019 MIDI clamp: bytes mismatch
  expected: [0xB0, 0x40, 0x7F]  // cc:64 value 127 (clamped from 200)
  actual:   [0xB0, 0x40, 0xC8]  // not clamped — value 200 → 0xC8
  offset 2: differ
```

## Test plan

The tests ARE the deliverable. Forge runs them and reports pass/fail count.

Acceptance: 15/15 scenarios pass.

If any fail:
1. Document failing scenario IDs in done report.
2. Identify root cause (handler quirk preserved? config mapping? dispatcher byte building?).
3. Propose fix (if scoped within ShowX-2 patches) or escalate (if BridgeX 0.3.x behavior misunderstood).

If goldens missing (no captured BridgeX recordings): mark as BLOCKED in done report; Architect must capture goldens before re-attempt.

## Out of scope

- PT-016 through PT-035 (B002-011, B002-012).
- Real customer-config validation (deferred to B002-013 migration harness).
- Performance budgets (PT-034 — B002-012).
- Memory soak (PT-035 — B002-012).
- Capturing the goldens themselves (Architect responsibility per migration plan Step 6).
- Cross-platform (macOS-only for parity recording; Linux/Windows captured separately if needed).

## Notes for Critic

- Verify each scenario has all 3 fixture files (setup.json, rows.jsonl, expected.jsonl).
- Verify fake-timer vs real-timer choice per scenario: PT-011 must use REAL timers (30Hz count assertion); PT-003, PT-004 OK to use fake timers.
- Verify diff output is informative (not just `expected != actual` boolean).
- Verify scenarios use the actual EventXBridge module (B002-002 onwards), not a mock module.
- Verify Q25 ruling honored: byte-diff default; order-insensitive only with env flag set.
- Verify PT-014 team_id slice is exactly first 4 chars (parity §6.1 #20 says `team_id.slice(0,4)`).
- Verify PT-011 30Hz tolerance is ±1 packet (not ±5 — quirk preservation matters).
- Verify scenarios fail loudly when expected diff exists — no silent skip behavior.
- If goldens missing, BLOCK acceptance until Architect provides them.
