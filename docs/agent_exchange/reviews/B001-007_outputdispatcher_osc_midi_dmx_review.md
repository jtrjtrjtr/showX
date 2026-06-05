---
id: "B001-007"
slug: "outputdispatcher_osc_midi_dmx"
critic_started_at: "2026-06-05T16:00:00Z"
critic_completed_at: "2026-06-05T16:15:00Z"
verdict: "accepted"
review_round: 1
---

# B001-007 — OutputDispatcher review

## Acceptance criteria check

- [x] **`send(msg)` dispatches to correct sub-adapter; returns `DispatchResult` (ok, transport, latencyMs)** → `src/main/src/shared/OutputDispatcher.ts:120-151` (switch on `msg.transport`). Latency reported via `performance.now()` in each pool's send path (e.g. oscClient.ts:57-72, midiOut.ts:69-76).
- [x] **`claim(destination)` returns `ClaimToken` OR `ClaimConflict`** → `OutputDispatcher.ts:59-111`. MIDI/DMX return ClaimConflict on second claim; OSC always grants (refcounted).
- [x] **OSC: shared, refcounted; same host:port = same socket; last release closes** → `oscClient.ts:42-55` (refcount++), `:75-83` (refcount=0 → socket.close + map.delete). Verified `tests/unit/shared/dispatcher/oscClient.test.ts:57-77`.
- [x] **MIDI: exclusive per portName; second claim → ClaimConflict with ownerSlug** → `midiOut.ts:55-58`. Verified `tests/unit/shared/dispatcher/midiOut.test.ts:31-41`.
- [x] **DMX: exclusive per (protocol, universe); second claim → ClaimConflict** → `dmxOut.ts:103-108` (key = `${protocol}:${universe}`). Verified `tests/unit/shared/dispatcher/dmxOut.test.ts:35-42` + `:56-64` (artnet:1 and sacn:1 are separate keys).
- [x] **OscClient uses `osc-min` + `dgram.createSocket('udp4')`** → `oscClient.ts:1, 12, 16-18, 60`.
- [x] **MidiOut uses `@julusian/midi` Output; substring port match; throws if not found** → `midiOut.ts:19-26` (lazy require), `:28-33` (substring `includes`), `:62` (throw). Verified `midiOut.test.ts:43-47`.
- [x] **DmxOut: Art-Net via `dmxnet`, sACN via `e131`; universe + channel array** → `dmxOut.ts:38-93` (defaultDmxFactories), both adapters consume `(universe, data, opts)`.
- [x] **MscOut composes SysEx per spec §6; routes through MidiOut** → `mscOut.ts:8-19` (`F0 7F dev 02 cf cmd ... F7`), `:28-40` (claims MidiOutPool, sends, releases per call).
- [x] **WebhookOut stub returns `ok:false, error:'not_implemented'`** → `webhookOut.ts:8-11`. Verified `OutputDispatcher.test.ts:168-175`.
- [x] **`poolStatus()` reports OSC connections + MIDI port owners + DMX universe owners** → `OutputDispatcher.ts:153-159`. Verified `OutputDispatcher.test.ts:177-184`.
- [x] **≥18 vitest cases; sub-adapters mocked via DI** → 34 cases total (7+7+7+13). No real network/MIDI: OSC uses mock `OscSocketFactory`, MIDI uses mock `MidiFactory`, DMX uses mock `DmxFactories`.
- [x] **`pnpm --filter showx-main typecheck` passes** → executed locally, clean exit.
- [x] **`pnpm vitest run tests/unit/shared/OutputDispatcher tests/unit/shared/dispatcher` passes 100%** → 34/34 passed in 309ms.

## Architectural checks (per spec "Notes for Critic")

1. **Pool singletons across facade (#1 priority)** ✓
   `OutputDispatcher.ts:48-57`: pools are sourced from `opts.{oscPool,midiPool,dmxPool}` when provided; only fall back to `new` when caller omits. Test `OutputDispatcher.test.ts:122-135` verifies two dispatchers (`mod-a`, `mod-b`) sharing one `MidiOutPool` correctly arbitrate exclusivity — proves the shell-boot pattern works.

2. **MSC 7-bit masking** ✓
   `mscOut.ts:12-16`: deviceId, commandFormat, command, and each data byte all `& 0x7F`. Test `OutputDispatcher.test.ts:81-89` covers 0x80→0x00, 0xFF→0x7F, 0x81→0x01, data 0x80→0x00. Start/end bytes 0xF0/0xF7 preserved (not masked).

3. **OSC arg type mapping** ✓
   `oscClient.ts:20-28`: integer/float/string/bool/Buffer mapped. `Number.isInteger(1.0) === true` correctly classifies 1.0 as integer (acceptable per spec note).

4. **Exclusivity contract** ✓
   MIDI/DMX exclusive (test coverage above). OSC shared verified at `OutputDispatcher.test.ts:195-204` — two claims for same host:port both succeed with refcount=2.

5. **WebhookOut returns `not_implemented`** ✓
   No real HTTP send. Spec contract respected.

6. **`randomUUID` availability** ✓
   `OutputDispatcher.ts:1`: imported from `node:crypto`. Project targets ES2022 / Node 20 (Electron 28+).

## Code review notes

- **Spec bug correctly fixed by Forge.** Spec line 472 had `release: () => handle.release` (missing call parens). Implementation `OutputDispatcher.ts:67, 81, 96` correctly uses `release: () => handle.release()`. Done report decision #4 was honest about this.
- **Async `claim`/`release`.** Spec showed sync, but the `OutputDispatcher` interface (`src/shared/src/types/services.ts:147-148`) declares them async. Forge correctly aligned to the interface. Decision #2 disclosed.
- **`createRequire` for CJS deps.** `osc-min`, `@julusian/midi`, `dmxnet`, `e131` all consumed via `createRequire(import.meta.url)` (oscClient.ts:6, midiOut.ts:5, dmxOut.ts:5). Avoids ESM/CJS interop pain. Native modules still need `pnpm rebuild @julusian/midi` for Electron — noted in done report.
- **Refcount-safe captured entry.** `oscClient.ts:50` captures `entry` into `capturedEntry` before returning the handle, avoiding a stale closure if the map entry is later mutated. Good.
- **MidiOutPool `claim` ordering.** `findPortIndex` is called BEFORE the map entry is recorded (`midiOut.ts:60-64`), so a throw on missing port does not leave a phantom owner. Correct.
- **DmxPool key collision handling.** `dmxOut.ts:135-137` correctly slices key by `indexOf(':')` (not lastIndexOf) so a protocol like `artnet` survives. Universe is parsed as Number.
- **`dmxnet` version drift.** Spec asked `^0.9.7`; actual `^0.9.0` in `src/main/package.json:26`. Decision #1 disclosed. No public API drift observable in adapter code. Acceptable for unit tests (factory injected). Architect should note this for B001-013 parity tests.
- **MSC payload returns `transport: 'msc'`.** `mscOut.ts:36`: explicitly overrides MidiOut's `transport: 'midi'` result with `transport: 'msc'`. Test `OutputDispatcher.test.ts:142` confirms.
- **`DispatchResult.transport` for DMX preserves variant.** `dmxOut.ts:124, 127` returns `msg.transport` (dmx-artnet OR dmx-sacn) rather than collapsing to a generic "dmx". Good — matches spec contract.

## Test quality notes

- Mock factories are clean and reusable (`makeMockOscPool`, `makeMockMidiOut`, `makeMockDmxAdapter`).
- DI is consistent across all four pools — no real network/MIDI/UDP touched.
- Cross-dispatcher exclusivity test (`OutputDispatcher.test.ts:122-135`) is the strongest test in the suite: it proves the singleton-pool architecture works under realistic multi-module conditions.
- 34/34 green; total runtime 309ms.

## Verdict rationale

**Accepted.** All 14 acceptance criteria verified with file:line citations. All 6 Critic checks from spec "Notes for Critic" pass. The implementation correctly fixes a minor spec bug (release closure parens), correctly aligns to the async `OutputDispatcher` interface, and correctly disclosed a minor dependency version drift (`dmxnet@^0.9.0` vs spec's `^0.9.7`). Test coverage is robust (34 cases vs 18 required) and architecturally meaningful — the multi-dispatcher exclusivity test in particular validates the shell-boot pool-sharing contract that downstream tasks (B001-011 shell, B001-010 module loader) will rely on.

No changes requested. Forge is clear to take next queued task.
