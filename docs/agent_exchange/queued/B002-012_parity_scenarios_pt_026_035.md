---
id: "B002-012"
title: "Parity test scenarios PT-026..035 (transforms colormap, connection lifecycle, health, latency, memory soak)"
type: "test"
estimated_size_lines: 700
priority: "P0"
depends_on: ["B002-011"]
target_files:
  - "tests/parity/scenarios/pt_026_transform_colormap.parity.test.ts"
  - "tests/parity/scenarios/pt_027_ws_reconnect_backoff.parity.test.ts"
  - "tests/parity/scenarios/pt_028_webhook_5xx_retry.parity.test.ts"
  - "tests/parity/scenarios/pt_029_webhook_4xx_no_retry.parity.test.ts"
  - "tests/parity/scenarios/pt_030_health_upsert.parity.test.ts"
  - "tests/parity/scenarios/pt_031_token_refresh_realtime_auth.parity.test.ts"
  - "tests/parity/scenarios/pt_032_health_flap_recovery.parity.test.ts"
  - "tests/parity/scenarios/pt_033_hot_reload_known_limitation.parity.test.ts"
  - "tests/parity/scenarios/pt_034_latency_budget.parity.test.ts"
  - "tests/parity/scenarios/pt_035_memory_soak.parity.test.ts"
  - "tests/parity/fixtures/golden/pt_026_through_035/**"
  - "tests/parity/helpers/latency-measurement.ts"
  - "tests/parity/helpers/memory-soak.ts"
acceptance_criteria:
  - "8 functional scenarios (PT-026..033) pass byte-equality / behavioral parity"
  - "PT-034 latency: p95 dispatch latency ≤ BridgeX 0.3.x baseline p95 + 5ms"
  - "PT-035 memory: RSS growth over 24h soak ≤ 10MB/h (or 50MB total cap if 24h impractical → run 4h with proportional 8MB cap)"
  - "PT-026 colormap: lookup `{red: [255,0,0]}` on value 'red' → output `{r:255, g:0, b:0}` → DMX RGB packet at mapped channel"
  - "PT-027 WS reconnect: simulated socket drop → reconnect attempts at +1s, +3s, +7s, +15s, +31s (cumulative; delays 1, 2, 4, 8, 16) per parity §6.1 #39"
  - "PT-028 webhook 5xx retry: webhook returns 500 thrice → 3 attempts at t=0, +1s, +3s; then `messages_failed++` counter increments (parity §6.1 #40)"
  - "PT-029 webhook 4xx no retry: webhook returns 400 → 1 attempt only; no retry; `messages_failed++`"
  - "PT-030 health upsert: 2s elapses → `bridge_health` upsert called with correct output_status map (parity §6.1 #42)"
  - "PT-031 token refresh: AuthManager fires `onTokenRefreshed` → `supabase.realtime.setAuth(newToken)` called; channels NOT re-subscribed (parity §6.1 #43)"
  - "PT-032 health flap: adapter health connected → reconnecting → connected → next `bridge_health` upsert reflects current state"
  - "PT-033 hot-reload known-limitation: disable an output mid-run; new emits STILL reach that adapter until restart (BridgeX 0.3.x behavior); test documents as expected limitation"
  - "PT-034 latency p95 baseline from BridgeX 0.3.x captured separately (Architect responsibility); test asserts `p95(ShowX) <= p95(BridgeX) + 5ms` with 1000 synthetic submissions"
  - "PT-035 memory soak: process.memoryUsage().rss sampled every 60s for 24h (configurable down to 4h via env `SHOWX_SOAK_HOURS`); leak rate computed via linear regression; pass if slope ≤ 10MB/h"
  - "Memory soak test SKIPPED in CI default; runs only with `SHOWX_PARITY_SOAK=1` env var; documented in done report as long-running"
  - "All tests use scenario-harness.ts from B002-010 + new helpers from this task"
---

## Context

Final batch of parity scenarios. PT-026..033 cover behavioral parity (transforms, connection lifecycle, health, auth). PT-034 + PT-035 are the PERFORMANCE gate — without these, ShowX 0.5 cannot ship to customers because:
- A 100ms p95 regression breaks musical timing in QLab cue triggers (audible).
- A 50MB/h leak rate exhausts FOH Mac RAM in 4-day runs.

These two are NOT optional; they ARE the "ShowX ready for production" signal.

PT-033 (hot-reload limitation) is documentation-only — verifies BridgeX 0.3.x's known limitation is preserved (Q33 design ruling: do not improve in 0.5; defer to 0.1 public).

## Implementation notes

### PT-026 Transform colormap

setup.json:
- 1 DMX output universe 0
- 1 mapping target_address `ch:5` with colormap transform `{ red: [255,0,0], blue: [0,0,255] }`

rows.jsonl:
- 1 submission carrying string 'red'

expected.jsonl:
- 1 DMX packet at channels [5,6,7] = [255,0,0]

### PT-027 WS reconnect backoff

setup.json:
- 1 WS output to mock-ws-server with controllable disconnect

rows.jsonl + harness:
- t=0: subscribe → SUBSCRIBED
- t=100: server forces disconnect → CHANNEL_ERROR
- (harness uses fake timers to verify scheduled reconnects)

expected.jsonl:
- Reconnect attempt logs at t=1100, 1100+2000=3100, 3100+4000=7100, 7100+8000=15100, 15100+16000=31100, capped at 30s after that

This test asserts via `vi.useFakeTimers()` + checking `mockWS.connectCalls` array timestamps.

### PT-028 Webhook 5xx retry

setup.json:
- 1 webhook output to mock URL returning 500
- 1 mapping

rows.jsonl:
- 1 submission

expected.jsonl:
- 3 webhook POST attempts at t=0, t=1000, t=3000
- HealthBus: `messages_failed` counter = 1 after 3rd failure
- Total retry delays = 1s + 2s = 3s before final failure (per BridgeX backoff sequence)

### PT-029 Webhook 4xx no retry

setup.json:
- 1 webhook returning 400

rows.jsonl:
- 1 submission

expected.jsonl:
- 1 webhook POST attempt only at t=0
- `messages_failed` = 1

### PT-030 Health upsert

setup.json:
- 1 OSC output + Supabase health table mock

harness:
- start runtime
- advance fake timer by 2000ms

expected:
- `supabase.from('bridge_health').upsert(...)` called with shape:
  ```json
  {
    "event_id": "...",
    "last_heartbeat_at": "<iso>",
    "daemon_version": "0.5.0",
    "output_status": {
      "<output_id>": { "health": "healthy", "protocol": "osc" }
    }
  }
  ```

### PT-031 Token refresh

setup.json:
- 1 active runtime + AuthManager mock

harness:
- start runtime
- fire `authManager.subscribers[0]('new-access-token-xyz')`

expected:
- `mockSupabase.realtime.setAuth('new-access-token-xyz')` called
- `mockSupabase.channel` NOT called again (channels NOT re-subscribed)
- All 4 postgres_changes subscriptions still active

### PT-032 Health flap

setup.json:
- 1 OSC output with controllable health state in mock dispatcher

harness:
- start → connected
- mockDispatcher.setHealth(outputId, 'reconnecting')
- advance 2s → bridge_health upsert with output_status[outputId].health = 'reconnecting'
- mockDispatcher.setHealth(outputId, 'connected')
- advance 2s → next upsert shows 'connected'

### PT-033 Hot-reload limitation

setup.json:
- 1 OSC output enabled=true, 1 mapping

harness:
- start runtime
- emit 1 submission → packet sent
- Now mutate the output row's enabled to false in mockSupabase (simulating Supabase Studio edit)
- emit another submission
- expected: packet STILL sent (hot-reload not supported in 0.5)

Test asserts: 2 packets total. Document expected limitation in log output.

### PT-034 Latency budget

Helper:
```ts
// tests/parity/helpers/latency-measurement.ts
export async function measureP95Latency(
  module: EventXBridge,
  injectFn: () => Promise<void>,
  samples: number,
): Promise<{ p50: number; p95: number; p99: number }> {
  const latencies: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = process.hrtime.bigint();
    await injectFn();
    // wait for emit captured
    await sleep(0);
    const end = process.hrtime.bigint();
    latencies.push(Number(end - start) / 1_000_000);
  }
  latencies.sort((a, b) => a - b);
  return {
    p50: latencies[Math.floor(samples * 0.5)],
    p95: latencies[Math.floor(samples * 0.95)],
    p99: latencies[Math.floor(samples * 0.99)],
  };
}
```

Scenario:
- 1000 wordcloud submissions injected
- Measure end-to-end latency from inject → mock OSC sink capture
- BridgeX 0.3.x baseline p95: 8ms (REPLACE with real measured value when Architect captures baseline per Open Q5)
- Pass: ShowX p95 ≤ 13ms (baseline + 5ms)

If baseline measurement not yet available (`baseline.json` absent), test SKIPS with warning. Architect responsibility to provide baseline.

### PT-035 Memory soak

Helper:
```ts
// tests/parity/helpers/memory-soak.ts
export async function runSoak(opts: {
  module: EventXBridge;
  injectIntervalMs: number;     // e.g. 100ms = 10/sec
  durationHours: number;        // e.g. 4 or 24
  sampleIntervalMs: number;     // e.g. 60_000 = 1min
}): Promise<{ slopeMbPerHour: number; samples: number[] }> {
  const samples: { t: number; rss: number }[] = [];
  const start = Date.now();
  const end = start + opts.durationHours * 3600_000;
  const injectInterval = setInterval(() => opts.module /* inject synthetic */, opts.injectIntervalMs);
  const sampleInterval = setInterval(() => {
    samples.push({ t: Date.now() - start, rss: process.memoryUsage().rss });
  }, opts.sampleIntervalMs);
  await new Promise(r => setTimeout(r, end - start));
  clearInterval(injectInterval); clearInterval(sampleInterval);
  // Linear regression on samples
  const slopeBytesPerMs = linearRegression(samples.map(s => [s.t, s.rss]));
  const slopeMbPerHour = (slopeBytesPerMs * 3600_000) / (1024 * 1024);
  return { slopeMbPerHour, samples: samples.map(s => s.rss) };
}
```

Scenario:
- 4h soak (default; 24h via env `SHOWX_SOAK_HOURS=24`)
- Inject 10 submissions/sec
- Assert: slopeMbPerHour ≤ 10

Test wraps in `it.skipIf(!process.env.SHOWX_PARITY_SOAK)`.

If 4h infeasible during CI, run locally before each ShowX 0.5 release candidate.

## Test plan

Pass/fail per scenario. PT-034 + PT-035 have specific numeric thresholds.

PT-034 latency baseline:
- If `tests/parity/fixtures/baseline_latency.json` exists → compare against it
- If absent → SKIP with warning + log expected next action (Architect captures baseline)

PT-035 memory soak:
- Skipped by default in CI
- Run manually via `SHOWX_PARITY_SOAK=1 pnpm test tests/parity/scenarios/pt_035*`
- Logs slope + sample count + verdict

## Out of scope

- Capturing BridgeX 0.3.x latency baseline (Architect — Open Q5 from absorption spec).
- Multi-platform soak (macOS only for 0.5; Linux/Windows deferred).
- Soak with 100+ subscribers (realistic single-venue load).
- WebSocket lifecycle parity for ws-out transport (PT-027 covers WS for ws output protocol).
- Migration test harness (B002-013).
- DMG signing (B002-014, B002-015).

## Notes for Critic

- Verify PT-027 reconnect timing matches sequence `[1, 2, 4, 8, 16]` seconds cumulative delay (not absolute timestamps from t=0).
- Verify PT-028 webhook attempts at t=0, +1s, +3s (BridgeX delay pattern, not +1s, +2s, +4s).
- Verify PT-031 channel NOT re-subscribed: assertion via `mockSupabase.channel.mock.calls.length === 1` after token refresh.
- Verify PT-034 percentile calculation uses correct index (Math.floor(samples * 0.95)).
- Verify PT-035 uses `process.memoryUsage().rss`, not heapUsed (RSS includes V8 + native + I/O buffers; truer RAM picture).
- Verify PT-035 skipping mechanism — should NOT pollute CI runtime budget.
- Verify PT-033 limitation is preserved (NOT improved); 0.5 ships with the same limitation as BridgeX 0.3.x.
- Document the baseline_latency.json status in done report (present? captured by whom? when?).
- If PT-034 p95 measurement fails: triage root cause (dispatcher overhead? handler change? Supabase mock latency?).
- If PT-035 fails (slope > 10MB/h): investigate handler subscription leaks, OutputDispatcher refcount leaks, fake-timer leaks.
