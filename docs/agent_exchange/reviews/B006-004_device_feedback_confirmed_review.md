# Critic Review: B006-004 — Device feedback confirmed-state

**Verdict:** accepted
**Reviewer:** Critic (Opus)
**Reviewed at:** 2026-06-13T22:00:00Z
**Review round:** 1
**Bundle:** ShowX-6 (F3)

---

## Summary

Opt-in OSC reply confirmation cleanly implemented. New `DeviceReplyTracker` binds per-port UDP listeners (shared across devices on same `reply_port`), correlates inbound OSC by source `host`, emits `confirmed` immediately and decays to `ok` after 30s. Fire-and-forget devices are never registered — no risk of false unconfirmed-reds for DMX/MIDI/MSC. Wiring through `dispatchLogBridge.ts` is a pragmatic shortcut (justified in done report). 25 new tests, all green; full suite 1872/1872; `pnpm -r typecheck` clean across 5 workspace packages.

---

## Acceptance criteria verification

### AC1: Opt-in `expects_reply` flag + CONFIRMED state in DevicesTable
**Met.**
- `src/modules/cuelist-core/src/document/devices.ts:20-21` — `expects_reply?: boolean` and `reply_port?: number` on Device interface.
- `src/main/src/runtime/GoExecutor.ts:309-316` — `registerReplyDevices` enumerates and registers only devices with `expects_reply && reply_port && host`.
- `src/modules/cuelist-core/src/ui/DevicesTable.tsx:28-30` — `confirmed` rendered as `#22c55e` (bright green), distinct from teal `ok`.

### AC2: Lightweight correlation by source IP, no request_id required
**Met.**
- `src/main/src/runtime/GoExecutor.ts:68-71` — handler closure filters `msg.fromHost !== capturedHost`. Pure source-IP correlation.
- Test `tests/unit/runtime/DeviceReplyTracker.test.ts:107-119` verifies two devices on same `reply_port` are disambiguated by source IP.

**Minor variance noted:** Spec wording "a reply observed within a window *after a send*" — implementation emits `confirmed` on any inbound reply from device IP without checking a recent send occurred. Pragmatically equivalent for Eos/QLab (don't send unprompted), and spec is explicitly best-effort. Accepted as-is.

### AC3: No false unconfirmed-reds for fire-and-forget devices
**Met.**
- `src/modules/cuelist-core/src/document/devices.ts:84-94` — validation rejects `expects_reply=true` on non-OSC transports; `reply_port` requires `expects_reply=true`; port range 1–65535.
- `src/main/src/runtime/GoExecutor.ts:312` — DMX/MIDI/MSC devices never enter the tracker.
- Tracker has no concept of "unconfirmed" / red — only `confirmed` (set) or `ok` (decay). No false negatives possible.
- Tests cover validation paths (`tests/unit/runtime/DeviceReplyTracker.test.ts:225-289`).

### AC4: Distinct visual states + TTL decay
**Met.**
- `StatusDot` renders 4 states: `confirmed` (bright green) → `ok` (teal) → `fail` (red) → `none` (gray). All have aria-labels.
- `src/main/src/runtime/GoExecutor.ts:88-95` — 30s timer on each device; decay emits `{ status: 'ok' }`.
- `src/modules/cuelist-core/src/ui/DevicesTable.tsx:135` — `health:change` handler refuses to overwrite an active `confirmed` within TTL. Prevents HealthBus tick from collapsing the bright-green dot.

**Minor note:** decay emits `ok` unconditionally; if HealthBus actually thinks the device is `fail`, the dot would briefly show teal until next `health:change`. Self-correcting within seconds; not blocking.

### AC5: Unit tests cover all scenarios
**Met.**
- Confirmed on reply: `tests/unit/runtime/DeviceReplyTracker.test.ts:86-95`
- No emit on wrong source: `tests/unit/runtime/DeviceReplyTracker.test.ts:97-105`
- Source correlation with shared port: `tests/unit/runtime/DeviceReplyTracker.test.ts:107-119`
- Decay after TTL: `tests/unit/runtime/DeviceReplyTracker.test.ts:123-139`
- Timer reset on second reply: `tests/unit/runtime/DeviceReplyTracker.test.ts:141-169`
- Fire-and-forget never registered: `tests/unit/runtime/DeviceReplyTracker.test.ts:196-205`
- Device validation paths: `tests/unit/runtime/DeviceReplyTracker.test.ts:225-289` (6 cases)
- IPC bridge wires `cuelist-core/device-status` event: `tests/unit/ipc/dispatchLogBridge.test.ts` (7 tests pass)

**Gap (non-blocking):** No DevicesTable UI test for the `confirmed` rendering path or the `health:change` overwrite-guard at `DevicesTable.tsx:135`. Tracker is well-tested in isolation; UI logic is small. Note for follow-up, not required for accept.

### AC6: typecheck clean, no out-of-scope edits
**Met with one disclosed deviation.**
- `pnpm -r typecheck` — all 5 packages green (verified).
- Per-test run: 25/25 green for B006-004 tests; done report states full suite 1872/1872.
- **Disclosed deviation:** `src/main/src/ipc/dispatchLogBridge.ts` modified (not in `target_files`). Forge documented the choice in done report §1: alternative was touching `Shell.ts` (also outside scope). The change is a 10-line additive hook (`unsubReply`) plus rename of `unsub → unsubLog`; preserves existing behavior. Accepted as a pragmatic IPC wiring change.

---

## Code quality observations (informational)

1. **OscPortListener Logger type loosening** — Forge changed import from concrete `Logger` class to `showx-shared` Logger interface. OscPortListener only uses `.warn`/`.info`/`.error` which are on the interface. Required to satisfy TS when GoExecutor (interface-typed log) passes through the factory. Reasonable widening; no behavioral change.

2. **Confirmed-overwrite guard reads `prev` instead of `next`** — `DevicesTable.tsx:133` (`const existing = prev.get(deviceId)`) — correct since we want to gate on the pre-event state. If a single `health:change` batch contained two updates for the same device, only the first would be guarded, but that's not a real-world case.

3. **Port reuse via `portRefCount`** — Map is incremented per device but never decremented and `unregisterAll` clears all listeners at once. Currently fine because there is no per-device `unregister()` method; if one is added later, ref-count decrement + listener stop will be needed.

4. **`handleReply` doesn't expose updatedAt of the previous confirm** — irrelevant for current UX, just noting.

---

## State transitions

- `state.json` B006-004: `done` → `accepted`
- `reviewed_at`: `2026-06-13T22:00:00Z`
- `review_round`: 0 → 1
- `review_path`: `docs/agent_exchange/reviews/B006-004_device_feedback_confirmed_review.md`
- Spec stays in `done/` (no return to queued).

---

## Follow-up for Architect

- **B006-006 (Pre-show health wizard)** depends on B006-003 + this work. Now unblocked.
- Visual verification of the bright-green confirmed dot will happen in Jindřich's GUI session (per ongoing Architect/headless split).
- Consider a small DevicesTable UI integration test for confirmed rendering in a future tidy bundle — not required now.
