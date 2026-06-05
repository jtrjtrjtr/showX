---
id: "B001-007"
slug: "outputdispatcher_osc_midi_dmx"
status: "done"
round: 1
forge_ended_at: "2026-06-05T15:00:00Z"
---

# B001-007 Done Report — OutputDispatcher infrastructure

## Summary

Implemented the full OutputDispatcher shared output bus (OSC + MIDI + DMX + MSC + webhook stub) per spec. All acceptance criteria met.

## Files changed

**New:**
- `src/main/src/shared/dispatcher/oscClient.ts` — OscPool: shared/refcounted UDP socket pool per host:port
- `src/main/src/shared/dispatcher/midiOut.ts` — MidiOutPool: exclusive-per-portName MIDI output pool
- `src/main/src/shared/dispatcher/dmxOut.ts` — DmxPool: exclusive-per-(protocol,universe) DMX pool (Art-Net + sACN)
- `src/main/src/shared/dispatcher/mscOut.ts` — MscOut: MIDI Show Control SysEx composer + router through MidiOutPool
- `src/main/src/shared/dispatcher/webhookOut.ts` — WebhookOut: stub (not_implemented, deferred to B003-*)
- `src/main/src/shared/dispatcher/index.ts` — barrel export
- `src/main/src/shared/OutputDispatcher.ts` — facade: owns pools, routes by transport, async claim/release
- `tests/unit/shared/dispatcher/oscClient.test.ts` — 7 cases
- `tests/unit/shared/dispatcher/midiOut.test.ts` — 7 cases
- `tests/unit/shared/dispatcher/dmxOut.test.ts` — 7 cases
- `tests/unit/shared/OutputDispatcher.test.ts` — 13 cases (2 encodeMsc + 11 dispatcher)

**Modified:**
- `src/main/package.json` — added `osc-min@^1.1.2`, `@julusian/midi@^3.5.0`, `dmxnet@^0.9.0` (spec had 0.9.7; latest is 0.9.0), `e131@^1.1.2`, `@types/node@^20.11.0`
- `src/main/src/shared/index.ts` — exports OutputDispatcher, OutputDispatcherOptions, dispatcher sub-adapters

## Test results

```
Tests  34 passed (34)
  ✓ tests/unit/shared/dispatcher/midiOut.test.ts  (7 tests)
  ✓ tests/unit/shared/dispatcher/dmxOut.test.ts  (7 tests)
  ✓ tests/unit/shared/dispatcher/oscClient.test.ts  (7 tests)
  ✓ tests/unit/shared/OutputDispatcher.test.ts  (13 tests)
```

`pnpm --filter showx-main typecheck` → clean (no errors).

## Decisions made within task scope

1. **`dmxnet` version**: spec requested `^0.9.7` but latest is `0.9.0`. Used `^0.9.0`. No API differences visible.

2. **`claim()`/`release()` are async**: The `OutputDispatcher` interface in `showx-shared/services.ts` declares both as `Promise<...>`. Spec code showed them as sync. Made them `async` to satisfy the interface. Internal pool operations remain sync, wrapped in Promise.resolve.

3. **`osc-min` import via `createRequire`**: `osc-min` is CJS-only with no TypeScript types. Used `createRequire(import.meta.url)` inside a lazy getter to avoid ESM/CJS interop issues and keep the module type-safe.

4. **Exclusive port test uses two dispatcher instances**: Spec test description said "MIDI already owned by another slug → ok:false". The realistic scenario is two separate `OutputDispatcher` instances sharing the same `MidiOutPool`. Tested with two dispatcher instances (`mod-a`, `mod-b`) sharing a single pool.

5. **DMX data length**: dispatcher passes `data` array as-is to adapter. No padding or truncation. Adapters are responsible for their own channel mapping. Documented via "out of scope" notes in spec.

## Notes for Critic

- **Pool singleton pattern** (Critic #1 priority): `OscPool`, `MidiOutPool`, `DmxPool` are constructed once in `OutputDispatcher` constructor if not provided via `opts`. For multi-module use (shell boot scenario at B001-011), the CALLER must pass pre-built pools via `opts`. The dispatcher does NOT instantiate its own pools if opts are provided — no re-instantiation per facade.

- **MSC 7-bit masking**: `encodeMsc` applies `& 0x7F` to deviceId, commandFormat, command, and each data byte. Verified in test: `0x80 → 0x00`, `0xFF → 0x7F`, `0x81 → 0x01`.

- **OSC exclusivity**: OSC destinations are NOT exclusive. `OscPool.claim()` returns refcounted handles; same host:port from multiple modules shares one UDP socket. Confirmed in test: two claims for same host:port both succeed, refcount = 2.

- **WebhookOut stub**: returns `{ ok: false, error: 'not_implemented' }`. No real HTTP send. Correct per spec.

- **Native module rebuild**: `pnpm rebuild @julusian/midi` needed before running shell in Electron (native addon). Tests work without rebuild because factory injection means the native module is never required in test context.

- **`randomUUID` for ClaimToken.id**: Node 20+ / Electron 28+ — confirmed available in the project (target ES2022, Node 20 in package.json).
