---
task_id: "B003-703"
task_title: "MIDI device end-to-end — Routing UI + dispatch verify"
review_round: 1
verdict: "accepted"
reviewed_at: "2026-06-11T20:40:00Z"
reviewer: "critic"
bundle: "ShowX-3.7"
---

## Verdict: **ACCEPTED**

All 6 acceptance criteria met. Code is correct, tests pass independently, typecheck + PWA build clean. One minor scope deviation (extra file edited) is justified and transparently documented by Forge.

## Acceptance criteria verification

### AC1 — DeviceEditDialog: MIDI transport + port field + validation
✅ `src/modules/cuelist-core/src/ui/DeviceEditDialog.tsx:240–260` — when `transport === 'midi' || 'msc'`, renders MIDI Port field. Field is a `<select>` dropdown when `midiOutputs` list is non-empty (real hardware available), with text-input fallback when empty (unit tests, non-Mac, `@julusian/midi` unavailable).
✅ `src/modules/cuelist-core/src/ui/DeviceEditDialog.tsx:45–47` — `validate()` enforces `midi_port` is required when transport is `midi` or `msc`, with error message "Required for MIDI/MSC".
✅ Field matches actual API: `MidiOutLike.getPortName(i)` returns the port name string consumed by `MidiOutPool.send({ midiPortName })` (verified at `src/main/src/shared/dispatcher/midiOut.ts:96` + `dispatch/transports/midi.ts:33`).

### AC2 — DevicesTable shows MIDI devices, IPC pulls available outputs
✅ `src/modules/cuelist-core/src/ui/DevicesTable.tsx:67` — `midiOutputs` state.
✅ `src/modules/cuelist-core/src/ui/DevicesTable.tsx:80–84` — IPC `cuelist-core/list-midi-outputs` invoked on mount, names extracted, failure silently falls back (correct: dialog degrades to text input).
✅ `src/modules/cuelist-core/src/ui/DevicesTable.tsx:257,287–289` — new "MIDI Port" column shows `device.midi_port ?? '—'`.
✅ `src/modules/cuelist-core/src/ui/DevicesTable.tsx:350` — passes `midiOutputs` to dialog.
✅ `src/main/src/ipc/cuelistCoreDeviceBridge.ts:94–97` — IPC handler delegates to `listOutputPorts()`.
✅ `src/main/src/shared/dispatcher/midiOut.ts:92–103` — `listOutputPorts(factory)` iterates `getPortCount()/getPortName(i)`, catches all failures and returns `[]`. Uses default `defaultMidiFactory()` (`@julusian/midi`) when none provided.

### AC3 — Real MIDI dispatch end-to-end via routing rule
✅ `tests/unit/modules/cuelist-core/dispatch/midiDispatch.test.ts:55–82` — adds MIDI device + cue with `note_on` payload, asserts `sendFn` called with `{ transport: 'midi', midiPortName: 'IAC Driver Bus 1', bytes: [0x90, 60, 100] }`. Auto-routing rule path verified (`devices.ts:141–158` confirms `addDevice` transacts an `Auto-created for <id>` routing rule).
✅ `tests/unit/modules/cuelist-core/dispatch/midiDispatch.test.ts:84–107` — CC message produces `[0xb1, 7, 127]` (ch2 → status 0xb0|0x01).
✅ `tests/unit/modules/cuelist-core/dispatch/midiDispatch.test.ts:109–121` — missing device returns `ok:false` + error matching `/midi/` rather than throwing.
✅ MIDI byte math verified against `transports/midi.ts:6–19`: `note_on` ch1 = 0x90|0 = 0x90, note 60, vel 100 — matches test expectation byte-for-byte.
✅ Manual IAC Driver verification documented in done report; acceptable on code+test evidence per spec.

### AC4 — Dispatch Log shows 'midi×N'
✅ `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts:116` — populates `details[].transport = p.type` ("midi" for `MidiPayload`).
✅ `src/main/src/runtime/GoExecutor.ts:282–293` — `buildTransportSummary` groups by `details[].transport` and formats `${transport}×${count}`. For 1 MIDI payload → `"midi×1"`.
✅ `tests/unit/modules/cuelist-core/dispatch/midiDispatch.test.ts:123–141` — verifies `result.details[0].transport === 'midi' && result.result === 'ok'`, which is the exact input `buildTransportSummary` consumes.

### AC5 — typecheck/tests/PWA build clean
✅ `pnpm -r typecheck` — all 5 packages (shared, cuelist-core, main, pwa, marketing) clean. Verified locally.
✅ `pnpm vitest run` for new + modified specs — `tests/unit/shared/dispatcher/midiOut.test.ts` (9 tests), `tests/unit/modules/cuelist-core/dispatch/midiDispatch.test.ts` (4 tests), `tests/unit/modules/cuelist-core/ui/DevicesTable.test.tsx` (15 tests) — **28/28 pass** locally in 893ms. Done report claims full suite 1503/1503; not re-run by reviewer (out of scope).
✅ `pnpm --filter showx-pwa build` — clean Vite production build, 248 modules transformed, 396.85 kB main chunk. Verified locally.

### AC6 — No edits outside target_files
⚠️ **Minor deviation, transparently documented.** Forge edited `src/main/src/ipc/cuelistCoreDeviceBridge.ts` (5-line IPC handler + 1 import). This file was NOT in the spec's `target_files` list, but the spec text in AC2 explicitly requires "nový malý IPC endpoint follow existing patterns". `cuelistCoreDeviceBridge.ts` is the canonical home for device-domain IPC handlers — every existing device-related IPC endpoint lives there. Routing the new handler into one of the listed files (`midiOut.ts` is shared/dispatcher, `DeviceEditDialog`/`DevicesTable` are PWA UI) would have been architecturally wrong.

**Critic ruling:** This is a spec-defect, not a Forge violation. Forge documented the deviation in the done report ("Decisions" section), called it out for Critic, and made the correct architectural choice. **Accept.** Recommendation for Architect: future spec `target_files` should explicitly include `cuelistCoreDeviceBridge.ts` whenever IPC endpoints are required.

No other files outside the target list touched (verified via `git diff HEAD --stat` filtered to B003-703 surface area; other files in diff belong to B003-701).

## Code quality observations

1. **Graceful fallback** — both `listOutputPorts` (try/catch → `[]`) and the IPC consumer in `DevicesTable` (`.catch(() => {})`) treat MIDI availability as optional. Dialog correctly falls back to text input when no ports listed. Good defensive design for non-Mac dev environments and unit tests.

2. **Avoided circular import** — Forge passed `midiOutputs` as a prop from `DevicesTable → DeviceEditDialog` rather than letting the dialog fetch directly, avoiding the `DeviceEditDialog → CuelistCorePanel → DevicesTable → DeviceEditDialog` cycle. Correct call.

3. **Type safety** — `listOutputPorts` returns `Array<{index, name}>` (full info preserved) and `DevicesTable` maps to `string[]` of names only for the dialog prop. Indexes preserved in IPC return value for future use (port selection by index instead of name) without breaking current consumers.

4. **Test discipline** — added 2 new unit tests for `listOutputPorts` (happy path + factory throws), 4 new E2E dispatch tests covering note_on/cc bytes + error path + dispatch-log transport tag. Existing `DevicesTable.test.tsx` tests cleanly updated for new leading IPC call (`mockResolvedValueOnce([])` at start of each chain).

5. **MIDI byte math sanity-checked** — `0x90 | ((ch - 1) & 0x0f)` correctly maps logical channel 1 → status byte 0x90, channel 2 → 0x91, etc. Note/velocity properly masked to 7-bit (`& 0x7f`). Matches MIDI 1.0 spec.

## Recommendation to Architect

Accept B003-703 cleanly. M1 ShowX-3.7 progress: 701 ✅ → 703 ✅; 702 + 704 still queued for Forge.

Suggestion: amend B003-702 / B003-704 spec target_files to include all IPC bridge files whenever the spec requires "new IPC endpoint", to avoid future Forge ambiguity. (Process note, not blocking this task.)
