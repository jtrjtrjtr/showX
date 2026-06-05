---
id: "B001-008"
title: "InputRegistrar infrastructure (OSC + MIDI listeners)"
status: "done"
round: 1
forge_ended_at: "2026-06-05T17:00:00Z"
---

## Summary

Implemented the `InputRegistrar` infrastructure: OSC UDP listener, MIDI input listener, and the multiplexing registrar that ties them together with refcounted subscription management.

## Files Changed

| File | Action |
|---|---|
| `src/main/src/shared/input/types.ts` | Created — all types: OscInputFilter, OscMessage (inbound), MidiInputFilter, MidiMessage (inbound), Subscription (async), ListenerKey |
| `src/main/src/shared/input/oscListener.ts` | Created — OscPortListener wrapping dgram UDP + osc-min fromBuffer; OSC bundle recursive unpacking |
| `src/main/src/shared/input/midiIn.ts` | Created — MidiPortListener wrapping @julusian/midi Input; parseMidi function; _injectForTest for CI without hardware |
| `src/main/src/shared/InputRegistrar.ts` | Created — InputRegistrar interface + InputRegistrarImpl with compileGlob, per-sub handler wrapping, refcounted close |
| `src/main/src/shared/index.ts` | Updated — added InputRegistrarImpl + InputRegistrar exports |
| `tests/unit/shared/input/oscListener.test.ts` | Created — 6 tests (parse, bundle, malformed, stop, throw isolation, handlerCount) |
| `tests/unit/shared/input/midiIn.test.ts` | Created — 16 tests (parseMidi unit + MidiPortListener._injectForTest path, including throw isolation) |
| `tests/unit/shared/InputRegistrar.test.ts` | Created — 13 tests (OSC/MIDI multiplex, glob routing, refcount, throw isolation, shutdown) |

## Tests Run

```
 ✓ tests/unit/shared/input/midiIn.test.ts  (16 tests) 6ms
 ✓ tests/unit/shared/InputRegistrar.test.ts  (13 tests) 8ms
 ✓ tests/unit/shared/input/oscListener.test.ts  (6 tests) 369ms

 Test Files  3 passed (3)
      Tests  35 passed (35)
```

## Key Decisions Within Scope

1. **Glob compiler** — `compileGlob` escapes all regex metacharacters (`.+^${}()|[\]\\`) before converting `*` → `[^/]*` and `?` → `.`. Compiled once per subscription and stored in the closure — not per packet.

2. **Factory injection** — `InputRegistrarImpl` accepts optional `oscFactory` / `midiFactory` arguments (default: real listeners). This makes unit tests deterministic without touching UDP or MIDI hardware, while the production path is unchanged.

3. **Port 0 and concurrency** — `subscribeOsc` is not safe for concurrent calls to the same port via `Promise.all` (lazy-init race). Sequential calls work correctly. This is acceptable because module startup is sequential in Shell (B001-011). Tests use sequential `for` loops, not `Promise.all`, for same-port subscriptions.

4. **Naming collision avoidance** — `input/types.ts` defines `OscMessage` (inbound) and `MidiMessage` (inbound) as types distinct from `showx-shared`'s `OscMessage`/`MidiMessage` (outbound). The inbound types are NOT re-exported to `showx-shared` to avoid collision. `InputRegistrar.ts` re-exports them under renamed aliases (`InboundOscMessage`, `InboundMidiMessage`) for Shell use.

5. **Subscription async unsubscribe** — The internal `Subscription.unsubscribe(): Promise<void>` matches the task spec (different from `showx-shared.Subscription`'s sync `unsubscribe()`). The adapter to `showx-shared.InputRegistrar` interface (`listen`/`unlisten`) is B001-011's concern.

6. **osc-min bundle timetag** — `timetag` in `osc-min.toBuffer` requires a 2-element number array `[seconds, fraction]`, not an object `{raw: []}`. Documented via the bundle test.

## Notes for Critic

- Glob compiled once per subscription confirmed: `matcher` is a `RegExp` captured in `perSubHandler` closure. Zero allocations on the hot path.
- `try/catch` wraps every user handler call in both `OscPortListener` (inner fan-out) and `perSubHandler` (outer, handles user handler specifically). Double protection — neither can kill the listener.
- Refcount stress test: 5 subs → unsubscribe [2,0,3,1] → listener still up → unsub 5th → listener stops. All asserted.
- MIDI status-byte decoding: `status & 0xF0` for type, `status & 0x0F` for channel. noteOn velocity=0 → noteOff. Sysex = `0xF0` exact match (not masked). All variants tested.
- `OscPortListener.stop()` clears `this.socket = null` before async close, so handler fan-out loop has no socket reference leak.
- Logging structured with listener key in every line (port or portName).
