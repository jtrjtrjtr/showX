---
task_id: "B005-007"
title: "Show time OSC broadcast out"
reviewer: "critic"
verdict: "accepted"
round: 1
reviewed_at: "2026-06-13T19:24:00Z"
---

## Verdict: accepted

Clean implementation. All 5 acceptance criteria satisfied; tests pass; typecheck clean; no edits outside `target_files`.

## Acceptance criteria audit

### AC1 — Periodic OSC broadcast (address, args, rate, sendOn seam)
- `_tick()` calls `conn.send({ transport: 'osc', host, port, address, args: [hh, mm, ss, ff, tcStr, running] })` — showTimeOsc.ts:88-94
- Default address `/showx/time` — showTimeOsc.ts:48
- Args order matches spec: 4 ints + string + bool — verified in test `'OSC args: int HH, int MM, int SS, int FF, string TC, bool running'` showTimeOsc.test.ts:128-146
- Default rate 10 Hz — showTimeOsc.ts:6,44 (`MAX_RATE_HZ = 10`, `Math.min(rateHz ?? MAX_RATE_HZ, MAX_RATE_HZ)`)
- Uses `OscPool.claim().send()` (existing seam) — showTimeOsc.ts:52, 88. Bool is encoded as OSC true/false by `toOscArg` (oscClient.ts:25). ✅

### AC2 — Configurable target/enable-disable + default OFF + stopped-clock behavior
- `enable(cfg)` accepts host/port/address/rateHz — showTimeOsc.ts:41-59
- Default disabled — showTimeOsc.ts:30 (`enabled = false`); also covered by test `'default: disabled, pool not claimed'` showTimeOsc.test.ts:53-58
- Stopped-clock choice documented in class JSDoc (continues broadcasting with `running=false`) — showTimeOsc.ts:24-25; covered by test `'continues broadcasting with running=false after clock stops'` showTimeOsc.test.ts:158-174 ✅

### AC3 — Rate-limited and non-blocking; failures logged
- Rate hard-capped at 10 Hz — showTimeOsc.ts:44; covered by test `'rate is capped at 10Hz even if higher is requested'` showTimeOsc.test.ts:191-202
- Non-blocking dispatch via fire-and-forget `void this._tick()` — showTimeOsc.ts:56,58
- Send errors caught and logged, broadcaster stays enabled — showTimeOsc.ts:95-97; covered by test `'send error is logged but does not crash or disable the broadcaster'` showTimeOsc.test.ts:206-231 ✅

### AC4 — Unit tests with mock oscClient
- 15 tests, all passing (verified locally via `pnpm vitest run tests/unit/shared/output/showTimeOsc.test.ts` → 15/15)
- Covers: default disabled, claim host+port, immediate broadcast, disable stops, release-on-disable, idempotent disable, default address, configurable address, OSC arg shape, running=true/false semantics, stopped-clock continued broadcast, ~10Hz cadence, rate cap, error resilience, re-enable switches config ✅

### AC5 — Typecheck clean, no edits outside target_files
- `pnpm -r typecheck` → all 5 packages "Done", no errors
- Files added: `src/main/src/shared/output/showTimeOsc.ts` (new, target_files match) + `tests/unit/shared/output/showTimeOsc.test.ts` (covered by `tests/unit/**`)
- Clock.ts and oscClient.ts left untouched (Forge correctly judged no edits were needed) ✅

## Code-quality notes (informational, not blockers)

- Claim held for broadcaster lifetime (efficient vs. per-tick claim).
- `enable()` while already enabled cleanly resets via `this.disable()` first — good defensive pattern; covered by re-enable test.
- `getState()` read inside `_tick()` is synchronous and cheap; no risk of long blocking.
- Pre-existing `OscMessage` shape accepted (no new fields) — clean integration.

## Out-of-scope, but worth flagging for Architect

- Broadcaster is intentionally NOT wired into `Shell.ts` (matches MtcGenerator pattern). A future config-layer task is needed to expose enable/disable + host/port/address in ShellConfig and surface it in UI. Forge's done report calls this out correctly.

## Result

`accepted` — proceed to commit. Unlocks no downstream tasks in current scope (B005-008 already unblocked by B005-003).
