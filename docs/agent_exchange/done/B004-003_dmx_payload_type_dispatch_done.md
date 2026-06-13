---
id: "B004-003"
title: "DMX payload type + dispatch to Art-Net/sACN drivers"
status: "done"
owner: "forge"
started_at: "2026-06-13T10:00:00Z"
ended_at: "2026-06-13T11:00:00Z"
review_round: 1
---

## Summary

Added the `dmx` payload type end-to-end: shared type definition → Yjs document validation → dispatch transport → existing `DmxPool`/`OutputDispatcher` drivers. A cue with a `dmx` payload now resolves routing, builds a 512-slot channel array, and calls `deps.output.send({ transport: 'dmx-artnet' | 'dmx-sacn', universe, data, ... })` via the same bridge OSC/MIDI use.

## Files changed

| File | Change |
|---|---|
| `src/shared/src/types/payload.ts` | Added `DmxChannel`, `DmxPayload`, `'dmx'` to `PayloadType` and `Payload` union |
| `src/modules/cuelist-core/src/document/payload.ts` | Added `case 'dmx'` validation in `validatePayload` (universe ≥ 0, channels 1–512, values 0–255, non-empty, ≤512 entries) |
| `src/modules/cuelist-core/src/dispatch/transports/dmx.ts` | **New file** — `dispatchDmx` + `buildDmxData` + `resolveDmxProtocol` |
| `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts` | Added `case 'dmx': return dispatchDmx(payload, routing, deps)` |
| `tests/unit/modules/cuelist-core/dispatch/transports/dmx.test.ts` | **New file** — 18 tests (buildDmxData, validation matrix, dispatch, no-route, sacn protocol, error propagation) |

### Cascading exhaustive-switch fixes (outside declared target_files but required for `typecheck`)

| File | Change |
|---|---|
| `src/modules/cuelist-core/src/catalog/summarize.ts` | Added `case 'dmx'` |
| `pwa/src/components/cuelist/payloadSummaries.ts` | Added `case 'dmx'` |
| `pwa/src/components/cuelist/PayloadList.tsx` | Added `case 'dmx'` with default factory payload |

## Tests run

```
18 new tests: tests/unit/modules/cuelist-core/dispatch/transports/dmx.test.ts — 18 passed
Full suite: 751 passed (54 test files) — 0 regressions
pnpm -r typecheck: clean
```

## Design decisions

### Protocol resolution
`DmxTransport` (from `resolveRouting.ts`) only carries `universe`. To resolve artnet vs sACN without modifying the routing module (outside target_files), `dispatchDmx` calls `resolveDmxProtocol` which reads the routing rules and device map directly from `deps.doc` to find `dmx_protocol` on the target device. Defaults to `'artnet'` when not set (most common deployment).

When `dmx_protocol === 'sacn'` the message is `{ transport: 'dmx-sacn', universe, data }`. When `'artnet'` (default): `{ transport: 'dmx-artnet', universe, data, host: '255.255.255.255' }` (broadcast; artnet target IP can be refined once `DmxTransport` exposes `host`).

### No-route path
Returns `{ ok: false, error: 'no_route' }` (not a throw) so the Dispatch Log entry shows the failure, consistent with all other transports.

### `buildDmxData` exported
Exported for testability — builds a 512-element flat array from sparse `{channel, value}` pairs (channel 1-based → index 0-based).

## Notes for Critic

- `summarize.ts`, `payloadSummaries.ts`, and `PayloadList.tsx` are outside declared `target_files` but were required cascading changes — `Payload` is a discriminated union with exhaustive switches in these files. All three changes are minimal one-liners.
- `dmxOut.ts` required no changes; it already handles `dmx-artnet` / `dmx-sacn` messages correctly.
- The `Device` type in `devices.ts` doesn't have `dmx_protocol` field yet — the resolution falls back to artnet. Adding this field to the routing UI is deferred to B004-004 or a follow-up.
- `RulePayloadType` in `routing.ts` doesn't include `'dmx'` — this affects only payload-type-based routing rules (less common for DMX, which is usually device-id matched). Not blocking.
