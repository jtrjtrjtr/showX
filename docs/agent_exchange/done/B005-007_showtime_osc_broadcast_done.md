---
id: "B005-007"
title: "Show time OSC broadcast out"
status: "done"
owner: "forge"
round: 1
started_at: "2026-06-13T20:15:00Z"
ended_at: "2026-06-13T20:30:00Z"
type: "implementation"
estimated_size_lines: 260
priority: "P1"
bundle: "ShowX-5"
depends_on: ["B005-001"]
target_files:
  - "src/main/src/shared/output/showTimeOsc.ts"
  - "src/main/src/shared/dispatcher/oscClient.ts"
  - "src/main/src/shared/Clock.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "Optional periodic OSC broadcast of the show time from the MasterClock. Sends an OSC message (configurable address, default e.g. /showx/time, args: HH,MM,SS,FF ints + a string 'HH:MM:SS:FF' + running bool) at a configurable rate (default ~10Hz, capped). Via existing oscClient.sendOn (seam map oscClient.ts)."
  - "Configurable target device/route (reuse routing/device pattern) + enable/disable; default OFF. When clock stopped, either stop sending or send running=false (documented choice)."
  - "Rate-limited and non-blocking; failures logged, never crash the clock."
  - "Unit tests (mock oscClient): running clock emits OSC time at configured rate with correct args; disable stops; address configurable."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Kobbi mail: show time / timecode 'se může pouštět případně nějaký další externí zařízení' — broadcasting the show clock over OSC lets external systems (countdown displays, automation, other apps) follow ShowX. Per design §C.

## Implementation notes

- Reuse oscClient pooled send. Don't reinvent OSC encoding.
- Keep cadence capped (≤10Hz) — this is for external displays, not frame-accurate sync (that's MTC/LTC).

## Test plan

- Clock running → OSC /showx/time emitted ~10Hz with TC args.
- Disable → no send.

## Out of scope

- MTC/LTC (separate). Inbound OSC time (chase is MTC).

---

## Done report

### Files changed

- `src/main/src/shared/output/showTimeOsc.ts` — new `ShowTimeOscBroadcaster` class (~95 lines)
- `tests/unit/shared/output/showTimeOsc.test.ts` — 15 unit tests

No changes required to `Clock.ts` or `oscClient.ts`; existing APIs were sufficient.

### Design decisions

**Stopped-clock behavior (documented choice):** Continues broadcasting with `running: false` so external countdown/display devices see the frozen position and know playback has halted. Described in class JSDoc.

**Claim held open:** `OscPool.claim(host, port)` called once at `enable()`, held for broadcaster lifetime, released on `disable()`. More efficient than claim+release per tick.

**Rate cap:** `Math.min(rateHz ?? 10, 10)` — callers requesting >10 Hz are silently capped to 10 Hz (100 ms interval).

**Non-blocking:** tick is `void this._tick()` (fire-and-forget); send errors are caught, logged via Logger, never thrown.

**Immediate first broadcast:** `void this._tick()` fires at `enable()` so displays update without waiting one full interval.

### OSC message format

- **Address:** configurable, default `/showx/time`
- **Args:** `[HH: int, MM: int, SS: int, FF: int, 'HH:MM:SS[:;]FF': string, running: bool]`
- **Transport:** UDP via existing `OscPool`

### Tests run

```
Tests  1826 passed (1826)  ← 15 new + 1811 existing, all green
pnpm -r typecheck          ← clean (all 5 packages)
```

### Notes for Critic

- `ShowTimeOscBroadcaster` is intentionally NOT wired into `Shell.ts` (outside target_files). Shell wiring belongs in a config-layer task when Architect adds time-layer config to ShellConfig (mirror of MtcGenerator wiring).
- `args[5]` is a boolean — `toOscArg()` in oscClient.ts encodes it as OSC true/false type correctly.
- Test seam: OscPool injected as constructor dep; tests create a mock pool via `vi.fn()`, same pattern as MtcGenerator tests.
