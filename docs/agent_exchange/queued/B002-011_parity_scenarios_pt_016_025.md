---
id: "B002-011"
title: "Parity test scenarios PT-016..025 (error paths, reconnect, auth refresh, transforms)"
type: "test"
estimated_size_lines: 800
priority: "P0"
depends_on: ["B002-010"]
target_files:
  - "tests/parity/scenarios/pt_016_session_paused_no_enrich.parity.test.ts"
  - "tests/parity/scenarios/pt_017_session_ended_reset.parity.test.ts"
  - "tests/parity/scenarios/pt_018_osc_leading_slash_autofix.parity.test.ts"
  - "tests/parity/scenarios/pt_019_midi_cc_clamp.parity.test.ts"
  - "tests/parity/scenarios/pt_020_midi_note_timing.parity.test.ts"
  - "tests/parity/scenarios/pt_021_dmx_ch_rgb.parity.test.ts"
  - "tests/parity/scenarios/pt_022_dmx_heartbeat.parity.test.ts"
  - "tests/parity/scenarios/pt_023_transform_scale.parity.test.ts"
  - "tests/parity/scenarios/pt_024_transform_threshold.parity.test.ts"
  - "tests/parity/scenarios/pt_025_transform_pick_index.parity.test.ts"
  - "tests/parity/fixtures/golden/pt_016_through_025/**"
acceptance_criteria:
  - "All 10 scenarios pass byte-equality (or order-insensitive per Q25 ruling)"
  - "PT-016: session status='paused' → subsequent submission DROPPED (BridgeX quirk per parity §6.1 #8) — captured as: 1 paused session row inserted; 1 submission for that session; expected 0 outbound packets"
  - "PT-017: session status='ended' → handler reset (no more periodic state pushes from that handler); verified by waiting 3s after end + asserting no `wordcloud/state` packets"
  - "PT-018: mapping `target_address: 'eventx/test'` (no leading slash) → packet emitted with address `/eventx/test` (autofix prepends `/` per parity §6.1 #22)"
  - "PT-019: MIDI mapping cc:64 with value 200 → bytes `[0xB0|ch, 64, 127]` (clamp + integer; parity §6.1 #27)"
  - "PT-020: MIDI mapping note:60 with value 100 → note-on at t=0 with `[0x90|ch, 60, 100]`; note-off at t=100±10ms with `[0x80|ch, 60, 0]` (parity §6.1 #28)"
  - "PT-021: DMX mapping ch:5 with value `{r:255,g:128,b:0}` → DMX universe channels 5=255, 6=128, 7=0 (parity §6.1 #32)"
  - "PT-022: DMX heartbeat — 5 seconds idle → 5 packets channel 1 = 0 (1Hz heartbeat per parity §6.1 #33, #41)"
  - "PT-023: Transform scale [0,1] → [0,255] on value 0.5 → output 127.5 (parity §6.1 #34)"
  - "PT-024: Transform threshold 0.5 above on value 0.6 → output 1 (parity §6.1 #35)"
  - "PT-025: Transform pick_index 2 on array `[10,20,30,40]` → output 30 (parity §6.1 #36)"
  - "Each test uses scenario-harness.ts from B002-010"
  - "Failed parity diffs produce detailed byte-level diagnostics"
  - "`pnpm parity:errors` (new alias) runs PT-016..025 in <60s total"
---

## Context

Continuation of parity coverage from B002-010. This task focuses on:
- BridgeX 0.3.x quirky behaviors (session status filter, OSC autofix)
- Protocol-specific byte building (MIDI clamp, DMX RGB)
- Transform pipeline (scale / threshold / pick_index)
- Idle behaviors (DMX heartbeat)

These scenarios test the **shared OutputDispatcher** path more than handler logic — most of the parity-critical byte-level behavior lives in B002-004 (AdapterRegistry build* helpers + shell dispatcher pool from B001-007). If a scenario fails, the fault is most often in:
1. AdapterRegistry build* helpers (cc:N parsing, ch:N parsing)
2. Shared dispatcher OSC autofix (B001-007 OutputDispatcher osc.ts)
3. DMX heartbeat scheduling (B001-007 dmx.ts)

Each scenario isolates one quirk so when it fails the cause is obvious.

## Implementation notes

### PT-016 Session paused dropped

Use enrichment quirk from parity §6.1 #8, #11.

setup.json:
- 1 activity (wordcloud)
- 1 output (OSC mock)
- 1 mapping

rows.jsonl:
- t=0: activity_session INSERT, status='paused', activity_id=X
- t=100: submission INSERT for activity_id=X

expected.jsonl:
- empty (submission dropped because session not 'live')

Note: this is a known BridgeX 0.3.x behavior — paused sessions don't accept submissions. Some operators may consider this a bug, but parity = preserve.

### PT-017 Session ended handler reset

setup.json:
- 1 wordcloud activity with state push enabled

rows.jsonl:
- t=0: activity_session INSERT, status='live'
- t=100: submission `{word: 'foo'}`
- t=500: activity_session UPDATE, status='ended'
- t=3500: (wait 3s after ending)

expected.jsonl:
- t≈100: wordcloud/add packet
- t≈500: handler resets (no further state pushes)
- NO packets between t=500 and t=3500

### PT-018 OSC leading slash autofix

setup.json:
- 1 output OSC; 1 mapping with `target_address: 'eventx/test'` (NO leading slash)
- 1 mapping channel_id matching emit

rows.jsonl:
- 1 submission triggering the channel

expected.jsonl:
- 1 OSC packet with address `/eventx/test` (autofix applied)

This tests the autofix layer (per parity §6.1 #22). The autofix lives in either:
- AdapterRegistry.buildOscMessage (module-side)
- Shared OutputDispatcher osc.ts (shell-side, per B001-007)

Forge: verify which layer owns it; document in done report. If split (e.g. shell handles for shell-emitted, AdapterRegistry handles for module-emitted), document.

### PT-019 MIDI cc clamp

setup.json:
- 1 MIDI output, channel 0
- 1 mapping `target_address: 'cc:64'`, transform that produces value 200

rows.jsonl:
- 1 submission with raw value 200 (pre-transform)
- transform passes through (or produce 200 directly via scale)

expected.jsonl:
- 1 MIDI packet `[0xB0, 64, 127]` (200 clamped to 127)

### PT-020 MIDI note timing

setup.json:
- MIDI output, channel 0
- Mapping `target_address: 'note:60'`, value 100

rows.jsonl:
- 1 submission triggering note

expected.jsonl:
- t=0: `[0x90, 60, 100]` (note-on)
- t=100ms±10ms: `[0x80, 60, 0]` (note-off)

Timing tolerance ±10ms accounts for setTimeout drift. Test uses real timers + measures wall-clock.

### PT-021 DMX RGB

setup.json:
- DMX Art-Net output, universe 0
- Mapping `target_address: 'ch:5'` with colormap transform

rows.jsonl:
- 1 submission producing `{r:255,g:128,b:0}` (orange)

expected.jsonl:
- 1 DMX packet, universe 0, channels [5, 6, 7] = [255, 128, 0]

DMX heartbeat may interleave — ignore channel 1=0 packets in dedicated heartbeat scenarios (PT-022).

### PT-022 DMX heartbeat

setup.json:
- DMX output, no mappings (idle)

rows.jsonl:
- empty (5s idle)

expected.jsonl:
- 5 packets, universe 0, channel 1 = 0 (one per second)

If the test runs slightly long (5.2s) → 5-6 packets acceptable (tolerance ±1).

### PT-023 / PT-024 / PT-025 Transform tests

These are unit-level transforms wrapped in a scenario shell:

PT-023: scale `from: [0,1]`, `to: [0, 255]`, input 0.5 → output 127.5 (linear interp).

PT-024: threshold `threshold: 0.5`, `direction: 'above'`, input 0.6 → output 1.

PT-025: pick_index `index: 2`, input `[10, 20, 30, 40]` → output 30.

Each scenario wires the transform via mapping config + 1 submission. Expected output is the OSC packet with the transformed value.

## Test plan

The tests ARE the deliverable. Pass/fail count reported in done report.

Goldens captured per B002-010 process (Architect provides; if missing → BLOCK).

Order-insensitivity considerations: PT-022 heartbeat may interleave with any other emit. Use a bucketed comparator that groups by destination + dedupes timing.

## Out of scope

- PT-026..035 (B002-012).
- WS / webhook reconnect scenarios (deferred or rolled into B002-012).
- Real network sockets (mocked throughout).
- Performance budgets (B002-012).

## Notes for Critic

- Verify PT-016 expected.jsonl is empty (a non-empty expected = quirk not preserved).
- Verify PT-017 wait 3s after end actually advances timers; using fake timers requires `vi.advanceTimersByTimeAsync(3500)`.
- Verify PT-019 byte clamping: value 200 → 127 (NOT 200 & 0x7F = 72; the actual quirk is `Math.max(0, Math.min(127, Math.round(v)))`).
- Verify PT-020 timing uses REAL timers (note-off scheduling fidelity matters).
- Verify PT-022 heartbeat respects shared OutputDispatcher's heartbeat scheduler from B001-007.
- Verify PT-021 DMX RGB writes consecutive 3 channels starting at the address channel.
- Verify transforms produce floats not ints (PT-023: 127.5 not 128) — BridgeX 0.3.x doesn't pre-round; receivers handle conversion.
