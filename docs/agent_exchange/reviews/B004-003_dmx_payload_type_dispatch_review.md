---
id: "B004-003"
critic_started_at: "2026-06-13T13:55:00Z"
critic_completed_at: "2026-06-13T14:05:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **New `dmx` payload type in canonical Payload union** — `src/shared/src/types/payload.ts:5` adds `'dmx'` to `PayloadType`; `DmxChannel` + `DmxPayload` defined at `:48-58`; union extended at `:80-88`. Shape matches spec: `{ type:'dmx', tag, note, device_id, universe:number, channels: Array<{channel,value}> }`. No mirror at `src/types/payload.ts` (does not exist), so no sync needed.

- [x] **validatePayload covers dmx** — `src/modules/cuelist-core/src/document/payload.ts:89-112`. Universe ≥ 0 (line 92-94), non-empty channels (96-98), ≤512 entries (99-101), per-entry channel 1-512 (104-106), value 0-255 (107-109). Inline `ValidationError` on each violation.

- [x] **New transport `dispatch/transports/dmx.ts` resolves device → routing → main dispatcher** — Uses the existing `resolveDeviceTransport` (line 49) and the same `RoutingEntry` map OSC/MIDI use; dispatches via `deps.output.send(...)` (line 60-64) which routes through `OutputDispatcher` → `DmxPool` → existing `dmxOut.ts` adapters. Protocol (artnet|sacn) read from device routing config via `resolveDmxProtocol` (line 25-42), NOT the payload. ✓

- [x] **payloadDispatch routes dmx** — `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts:178-179` adds `case 'dmx': return dispatchDmx(payload, routing, deps)`. End-to-end verified by tests (see below).

- [x] **No-route path returns `{ ok:false, error:'no_route' }`** — `dmx.ts:51`. Goes through normal Dispatch Log path (same shape as other transports). Test: `dmx.test.ts:154-159`.

- [x] **Unit tests** — `tests/unit/modules/cuelist-core/dispatch/transports/dmx.test.ts`, 18 tests:
  - `buildDmxData`: zeros fill (47-52), correct index placement (54-61), multi-channel (63-69)
  - `validatePayload` matrix: valid (75-77), universe<0 (79-82), empty (84-87), >512 entries (89-93), channel 0/513 (95-103), value 256/negative (105-113), boundary 512/255 (115-117)
  - `dispatchDmx`: artnet send + universe (123-136), channel positions (138-152), no-route (154-159), wrong-kind transport (161-169), sACN protocol via `dmx_protocol` device field (171-215), send-error propagation (217-223)
  - All 18 tests pass: `pnpm vitest run tests/unit/modules/cuelist-core/dispatch/transports/dmx.test.ts` → 18 passed.

- [x] **`pnpm -r typecheck` clean** — verified: 5 of 5 workspaces compile cleanly.

- [~] **No edits outside target_files** — 3 cascading exhaustive-switch additions (`catalog/summarize.ts`, `pwa/components/cuelist/payloadSummaries.ts`, `pwa/components/cuelist/PayloadList.tsx`) were required for `Payload` discriminated-union exhaustiveness. Forge correctly disclosed in done report. Each change is a one-line `case 'dmx'`. Accepted as necessary cascading scope; not a violation.

- [x] **Full test suite** — `pnpm vitest run` → 133 files, 1544/1544 passing (an unrelated catalog test flakes on tmp file IO under parallel load; re-run clean — not introduced by this task).

## Code review notes

**`dispatch/transports/dmx.ts`**
- Cleanly mirrors `osc.ts`/`msc.ts` pattern: resolve transport, fall back to no_route, build message, call `deps.output.send`.
- `buildDmxData` correctly maps 1-based channels to 0-based index (line 15: `data[channel - 1] = value`). Sparse channels left at 0.
- `resolveDmxProtocol` walks routing rules to find target device's `dmx_protocol`, then direct device lookup, defaulting to `'artnet'`. This is conservative and safe — sACN only triggers when explicitly tagged on the device map.
- `host: '255.255.255.255'` for Art-Net = broadcast. The current `dmxnet` factory in `dmxOut.ts` hardcodes broadcast IP anyway, so the `host` field is currently informational. Acceptable until DMX device editor (B004-004) exposes target IP.

**`document/payload.ts`**
- Validation block (line 89-112) is consistent with neighbouring cases. Uses `payload as Partial<DmxPayload>` cast pattern.
- `makePayloadMap` (existing code) iterates `Object.entries(payload)` so `device_id`, `universe`, `channels` automatically land in the Y.Map — no separate factory needed.

**Test rigor**
- The sACN test (line 171-215) cheats by `doc.transact(() => deviceMap.set('dmx_protocol', 'sacn'))` because `Device` type/`addDevice` don't yet recognise `dmx_protocol`. Acceptable: the test exercises the resolver path; the device-schema gap is a documented follow-up.
- Validation matrix covers all boundary cases stated in the spec.
- No-route + wrong-transport-kind both tested.

**Out-of-scope edits**
- `catalog/summarize.ts`, `payloadSummaries.ts`, `PayloadList.tsx`: each is a one-line `case 'dmx'` to keep exhaustive switches compiling. All disclosed in done report; all minimal.

**Documented follow-ups (not blocking)**
- `Device` type in `devices.ts` has no `dmx_protocol` field → `validateDevice` rejects it, so in practice the resolver always returns `'artnet'` until B004-004 (DMX editor UI) or a separate device-schema task adds the field.
- `RulePayloadType` in `routing.ts:7` doesn't include `'dmx'` → can't write payload-type-based routing rules for DMX, only device_id-based. Forge flagged this. Not blocking — DMX is typically device-id matched.

## Verdict rationale

All seven core acceptance criteria are satisfied with file:line citations above. The transport path mirrors the established OSC/MIDI/MSC pattern, validation is comprehensive, and tests cover the full state space (validation matrix, multi-channel, no-route, wrong-kind, sACN protocol selection, send-error propagation). Typecheck is clean across all 5 workspaces and full suite passes 1544/1544 on clean run.

The three out-of-target_files exhaustive-switch additions are mechanically necessary, correctly disclosed, and minimal. The two documented follow-ups (Device.dmx_protocol field, RulePayloadType.dmx) are real gaps but explicitly out of scope for B004-003 — the spec ratifies that protocol comes from device config (artnet default is the most common deployment) and DMX device editor UI is B004-004.

**Verdict: accepted.**
