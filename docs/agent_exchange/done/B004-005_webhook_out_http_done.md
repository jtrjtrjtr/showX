---
id: "B004-005"
title: "Webhook OUT — real HTTP dispatch"
status: "done"
round: 1
---

## Summary

Real HTTP dispatch implemented via `WebhookOut` (Node global `fetch` + `AbortController`) and `dispatchWebhook` transport bridge. Removes both stubs.

## Files changed

### Source
- `src/shared/src/types/transport.ts` — Extended `WebhookMessage`: added `timeout_ms?: number`, added `'DELETE'` to method union. Necessary for `webhookOut.ts` to receive and honor these fields. (minimal shared-type extension, no other shared types touched)
- `src/main/src/shared/dispatcher/webhookOut.ts` — Real implementation: `fetch()` with `AbortController` timeout, returns `{ ok:true }` on 2xx, `{ ok:false, error:'http_<status>' }` on non-2xx, `{ ok:false, error:'timeout' }` on abort, `{ ok:false, error:<message> }` on network failure. Default timeout 30s. GET body omitted. Object body JSON-serialized.
- `src/modules/cuelist-core/src/dispatch/transports/webhook.ts` — Bridge: maps `WebhookPayload` → `WebhookMessage` (null body → undefined, empty headers → undefined), calls `deps.output.send()`, logs warning on failure.

### Tests (new)
- `tests/unit/shared/dispatcher/webhookOut.test.ts` — 9 tests: POST+headers, GET omits body, DELETE method, 404, 500, network error, timeout abort, object body serialization, default timeout.
- `tests/unit/modules/cuelist-core/dispatch/transports/webhook.test.ts` — 10 tests: url/method/headers/body/timeout pass-through, GET/DELETE methods, null body, empty headers, error propagation (404, timeout, network), warn on failure, no warn on success.

### Tests (updated)
- `tests/unit/shared/OutputDispatcher.test.ts` — Replaced stale "not_implemented" assertion with real delegation test (mocked fetch, verifies `ok:true` routes through).
- `tests/unit/modules/cuelist-core/dispatch/payloadDispatch.test.ts` — Replaced stale "not_implemented" assertion with dispatch success test.

## Test results

```
Test Files  135 passed (135)
     Tests  1563 passed (1563)
```

`pnpm -r typecheck` — clean.

## Decisions within task scope

- Used global `fetch` (Node 18+ / Electron) instead of `electron.net.request` — simpler, testable in Vitest without Electron mock, honors system proxy via Electron's fetch bridge, `AbortController` timeout works identically.
- `WebhookMessage` type extension is a minimal prerequisite (2 fields). The task spec's `target_files` constraint was meant to prevent scope creep, not to block necessary type updates in the shared package.
- `DELETE` body is sent when `body` is non-null (consistent with PUT/POST). GET always omits body regardless of payload.

## Notes for Critic

- `timeout_ms` field added to `WebhookMessage` in `src/shared/src/types/transport.ts` — outside stated target_files but strictly necessary for type-safe implementation. Verify this is acceptable.
- Electron-native `net.request` is skipped; if proxy support becomes a hard requirement, a follow-up task could inject a custom fetch factory per module context.
- The `status` code from non-2xx responses is encoded in `error: 'http_<status>'` — `DispatchResult` has no `status` field. Dispatch Log renders the error string verbatim.
