---
id: "B004-005"
title: "Webhook OUT — real HTTP dispatch"
type: "implementation"
estimated_size_lines: 280
priority: "P1"
bundle: "ShowX-4"
depends_on: []
target_files:
  - "src/main/src/shared/dispatcher/webhookOut.ts"
  - "src/modules/cuelist-core/src/dispatch/transports/webhook.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "webhookOut.ts performs a real HTTP request using Electron net.request (preferred in main process) or Node fetch/undici. Honors payload.method, headers, body, timeout_ms. Returns { ok:true, status } on 2xx, { ok:false, error, status? } otherwise. No more 'not_implemented' stub."
  - "Timeout enforced: request aborted after timeout_ms → { ok:false, error:'timeout' }."
  - "cuelist-core transports/webhook.ts bridges payload → webhookOut (remove its stub too). End-to-end: GO a cue with webhook payload → real request sent."
  - "Errors are caught and returned, never crash the dispatcher. Non-2xx logged to Dispatch Log with status."
  - "SSRF note honored: no special localhost bypass beyond what WebhookPayloadEditor already validates (https required, loopback http allowed) — do not add new restrictions or loosen them; just send."
  - "Unit tests with a mock HTTP server (or net mock): GET/POST, custom headers, body, 200/404/500 mapping, timeout abort."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Audit G4: webhookOut returns `{ ok:false, error:'not_implemented' }` (src/main/src/shared/dispatcher/webhookOut.ts:4-11) and the cuelist-core transport mirrors the stub. The WebhookPayloadEditor + payload type already exist and validate. This task makes the send real.

## Implementation notes

- Prefer Electron `net.request` (main process, respects system proxy). Fallback Node 18+ global fetch with AbortController for timeout.
- Keep the existing payload shape { url, method, headers, body, timeout_ms }.
- Mirror return-shape conventions of other transports (ok/error) so Dispatch Log renders consistently.

## Test plan

- POST with JSON body + header → mock server receives correct method/headers/body.
- 404 → { ok:false, status:404 }. 500 → ok:false. Network error → ok:false.
- timeout_ms small + slow server → { ok:false, error:'timeout' }.

## Out of scope

- Webhook IN (B004-006). Retry/queue logic.
