# Done Report: B006-004 — Device feedback confirmed-state

**Status:** done  
**Forge session:** 2026-06-13 → 2026-06-14  
**Depends on:** B006-003 (accepted)

---

## Summary

Implemented opt-in per-device OSC reply confirmation. Devices with `expects_reply: true` + `reply_port` show a bright-green **confirmed** dot in DevicesTable when an OSC packet arrives from their `host` IP, decaying back to teal **ok** after 30s of silence. DMX/MIDI/fire-and-forget devices are never registered and never show unconfirmed state.

---

## Files changed

### New files
- `tests/unit/runtime/DeviceReplyTracker.test.ts` — 18 tests (registration, port reuse, IP correlation, multi-device, TTL decay, timer reset, unregister, onStatus unsub, Device model validation)
- `docs/agent_exchange/in_progress/B006-004_device_feedback_confirmed.md` — task spec copy

### Modified files
- `src/modules/cuelist-core/src/document/devices.ts`
  - Added `expects_reply?: boolean` and `reply_port?: number` to `Device` interface
  - Added validation: `expects_reply` OSC-only; `reply_port` requires `expects_reply=true`; `reply_port` range 1–65535

- `src/main/src/shared/input/oscListener.ts`
  - Changed Logger import from concrete `../Logger.js` to `showx-shared` interface (OscPortListener only uses `warn`/`info`)

- `src/main/src/runtime/GoExecutor.ts`
  - Exported `DeviceReplyUpdate` interface and `DeviceReplyTracker` class
  - `DeviceReplyTracker`: binds `OscPortListener` per UDP port (shared across devices on same port), correlates by `fromHost`, emits `confirmed` then decays to `ok` after `CONFIRMED_TTL_MS = 30_000`
  - `GoExecutor.replyTracker`: instantiated on `attach()`, registered for all `expects_reply` devices, torn down on `detach()`
  - `GoExecutor.onReplyStatus(cb)`: hook for IPC bridge

- `src/main/src/ipc/dispatchLogBridge.ts`
  - Added `executor.onReplyStatus(...)` subscription broadcasting `cuelist-core/device-status` IPC event to all renderer windows

- `src/modules/cuelist-core/src/ui/DevicesTable.tsx`
  - Added `'confirmed'` to `DeviceStatus` union
  - `CONFIRMED_TTL_MS = 30_000` alongside existing `STATUS_TTL_MS = 60_000`
  - `StatusDot`: confirmed → `#22c55e` (bright green), distinct from teal ok
  - `health:change` handler: skips overwriting an active `confirmed` status within TTL

- `tests/unit/ipc/dispatchLogBridge.test.ts`
  - Added `onReplyStatus` vi.fn() + `_fireReply` helper to `makeFakeExecutor()`

---

## Tests run

```
Test Files  147 passed (147)
Tests       1872 passed (1872)
Duration    12.08s
```

`pnpm -r typecheck` clean — all 5 workspace packages.

---

## Decisions / notes for Critic

1. **IPC wiring via `dispatchLogBridge.ts`** — GoExecutor is constructed in Shell.ts which is outside target_files. Rather than touch Shell.ts, wired through `dispatchLogBridge.ts` which already receives GoExecutor and is already registered at Shell boot. 4-line addition, zero Shell.ts changes.

2. **Port reuse** — `DeviceReplyTracker` holds one `OscPortListener` per UDP port. Multiple devices sharing the same `reply_port` each get their own `addHandler` closure that filters by `fromHost`. No double-bind risk.

3. **Logger interface** — `OscPortListener` now accepts the `showx-shared` Logger interface rather than the concrete class. OscPortListener only calls `.warn`/`.info` which are on the interface. This is a minor correctness fix that happened to be required to satisfy TypeScript when passing GoExecutor's interface-typed logger into the factory.

4. **Fire-and-forget safety** — `DeviceReplyTracker.register()` is only called for devices where `expects_reply === true && reply_port && host` (in `registerReplyDevices`). DMX/MIDI/MSC devices are never registered. The `expects_reply` validation in `validateDevice()` also rejects `expects_reply: true` on non-OSC transports at write time.

5. **Confirmed overwrite guard** — DevicesTable's `health:change` handler (from B006-003) now checks if an existing `confirmed` status is within TTL before overwriting with a HealthBus `ok`/`fail` event. Without this guard, a subsequent HealthBus tick would immediately collapse the bright-green dot back to teal.
