---
id: "B004-005"
critic_started_at: "2026-06-13T14:14:00Z"
critic_completed_at: "2026-06-13T14:20:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **Real HTTP request honors method/headers/body/timeout_ms; no more `not_implemented`.**
  - `src/main/src/shared/dispatcher/webhookOut.ts:23-28` — `fetch(msg.url, { method, headers, body, signal })`.
  - timeout_ms honored at line 9 (`msg.timeout_ms ?? 30_000`), enforced via `AbortController` at lines 10-11.
  - Return shape note: spec wrote `{ ok:true, status }` but `DispatchResult` (`src/shared/src/types/transport.ts:73-78`) has no `status` field. Forge encodes non-2xx status in `error: 'http_<status>'` (line 35) and uses `latencyMs` instead of `status` on success. Documented in done report under "Notes for Critic". Acceptable given the existing `DispatchResult` contract; extending it is outside this task's scope.

- [x] **Timeout aborts → `{ ok:false, error:'timeout' }`.**
  - `webhookOut.ts:11, 38-40` — abort listener returns `error: 'timeout'` when `controller.signal.aborted`.
  - Test: `tests/unit/shared/dispatcher/webhookOut.test.ts:116-133`.

- [x] **cuelist-core webhook bridge calls dispatcher.send (stub removed); end-to-end GO → real request.**
  - `src/modules/cuelist-core/src/dispatch/transports/webhook.ts:8-15` — `await deps.output.send({ transport: 'webhook', ... })`.
  - End-to-end test: `tests/unit/modules/cuelist-core/dispatch/payloadDispatch.test.ts:186-198` (rewritten — no more `webhook_not_implemented` assertion).

- [x] **Errors caught & returned, never crash; non-2xx logged.**
  - try/catch wraps the fetch (`webhookOut.ts:13-46`); errors converted to `DispatchResult` shape, never re-thrown.
  - Non-2xx warning logged at `webhookOut.ts:34` (`this.log?.warn('webhook non-2xx', { url, status })`).
  - Network failure warning logged at `webhookOut.ts:42`.
  - Bridge also logs warning on dispatch failure (`webhook.ts:17`).
  - Production wiring confirmed: `src/main/src/shared/OutputDispatcher.ts:56` passes `opts.log` into `new WebhookOut()`, so log writes hit Dispatch Log in real runtime.

- [x] **SSRF note honored — no new restrictions, no bypass.**
  - `webhookOut.ts` calls `fetch(msg.url, ...)` directly with no URL pre-validation. Status quo preserved.

- [x] **Unit tests cover GET/POST, headers, body, 200/404/500, timeout abort.**
  - `tests/unit/shared/dispatcher/webhookOut.test.ts` — 9 tests: POST+JSON+header, GET omits body, DELETE method, 404, 500, network error, timeout abort, object→JSON, default 30s.
  - `tests/unit/modules/cuelist-core/dispatch/transports/webhook.test.ts` — 10 tests: pass-through (url/method/headers/body/timeout), GET, DELETE, null body → undefined, empty headers → undefined, 404/timeout/network error propagation, log-on-fail, no-log-on-success.

- [x] **`pnpm -r typecheck` clean; tests pass.**
  - Typecheck clean across all 5 workspace projects (apps/marketing, src/shared, src/modules/cuelist-core, pwa, src/main).
  - 42 tests pass across the 4 affected test files.

## Code review notes

**WebhookOut.send (webhookOut.ts):**
- Body handling correct: string passes through, object JSON-serialized, GET always omits, undefined preserved.
- Timeout cleanup safe — `clearTimeout(timer)` in `finally` block prevents stray timers.
- Latency captured at boundary points (success/error branches), reasonable.
- Optional logger pattern (`log?.warn`) keeps unit tests free of mock-logger boilerplate while production wiring at `OutputDispatcher.ts:56` always supplies one.

**dispatchWebhook (webhook.ts):**
- Header normalization correct: `Object.keys(payload.headers).length > 0 ? payload.headers : undefined` — avoids sending an empty `{}` headers object downstream.
- `body ?? undefined` correctly maps the `WebhookPayload` `body: string | null` to the `WebhookMessage` `body?: string | Record<string, unknown>`.
- Return only `{ ok, error }` matches `SingleDispatchResult` contract; `latencyMs` swallowed at this layer (it's logged inside WebhookOut already).

**Type extension (transport.ts):**
- Forge added `timeout_ms?: number` and `'DELETE'` to `WebhookMessage`. This is outside the stated `target_files` for this task.
- Verdict: necessary and minimal. The `WebhookPayload` type (`src/shared/src/types/payload.ts:60-67`) already declared `timeout_ms: number` and `method: 'GET' | 'POST' | 'PUT' | 'DELETE'`. Without aligning `WebhookMessage`, Forge could not type-safely forward the spec-required fields. The change is purely additive (optional field; widened union) and does not impact any other transport. Forge flagged this explicitly in the done report.
- This is a target_files spec breach, but the spec body itself demands the behaviour that requires the type change. Treating it as a minor judgment call within scope, not a violation.

**Updated tests:**
- `OutputDispatcher.test.ts:168-177` — webhook delegation test correctly stubs global `fetch`, verifies dispatcher routes through `WebhookOut`.
- `payloadDispatch.test.ts:186-198` — replaced `webhook_not_implemented` expectation with real dispatch path expectation.

**No problems found:**
- No new linter or typecheck regressions.
- No production code edits outside the spec's stated `target_files` other than the minimal `WebhookMessage` type extension noted above.
- No regression in OutputDispatcher (claim/release/pool tests still green).

## Verdict rationale

All seven acceptance criteria satisfied with file:line evidence. Tests pass (42/42 across affected files), typecheck clean, the `not_implemented` stub is gone from both the main-process dispatcher and the cuelist-core transport bridge. SSRF posture preserved. Errors caught and routed through `DispatchResult` without crashing.

The single deviation — adding `timeout_ms?` and `'DELETE'` to `WebhookMessage` in `src/shared/src/types/transport.ts` (outside stated `target_files`) — is necessary to implement the spec faithfully and was self-reported by Forge. Minimal, additive, no downstream risk.

**Accepted.**
