---
id: "B004-006"
title: "Webhook IN — HTTP endpoint → InputRegistrar"
status: done
round: 1
forge_ended_at: "2026-06-13T16:10:00Z"
---

## Summary

Implemented webhook-in inbound HTTP trigger path. POST requests to `/api/hook/:id` on the existing Express AssetServer are now fanned into `InputRegistrar` subscriptions, matching the OSC/MIDI dispatch pattern.

## Files changed

- **`src/main/src/shared/input/webhookIn.ts`** (NEW) — `WebhookInListener` class + exported types (`WebhookInFilter`, `WebhookInMessage`, `WebhookInKey`, `AssetServerLike`). Registers `POST /api/hook/:id` via `AssetServer.registerApiRoute`. Dispatches to per-hookId handler sets. Unknown hookId → 404. Undefined body → 400. Handler throws are logged; siblings still fire.

- **`src/main/src/shared/InputRegistrar.ts`** (MODIFIED) — Added `subscribeWebhook(filter, handler): Promise<Subscription>` to both the `InputRegistrar` interface and `InputRegistrarImpl`. Constructor gains optional `assets?: AssetServerLike` + `webhookFactory` params (defaults to `new WebhookInListener`). `shutdown()` stops the webhook listener. `listActiveListeners()` extended to `ListenerKey | WebhookInKey` and includes active webhook hookId entries. `subscriptions` Map type widened to `ListenerKey | WebhookInKey`.

- **`tests/unit/shared/input/webhookIn.test.ts`** (NEW) — 12 unit tests covering: route registration (start/stop/no-double-register), dispatch (200/404/400), concurrent hookId isolation, handler throw resilience, multiple handlers per hookId, addHandler/removeHandler lifecycle.

- **`tests/unit/shared/InputRegistrar.test.ts`** (MODIFIED) — Added `describe('InputRegistrarImpl — Webhook')` block (10 tests): throws without AssetServer, listener created on first call, shared listener for multiple hookIds, handler dispatch, unknown hookId isolation, unsubscribe lifecycle (last stops, first-of-two keeps), listActiveListeners entries, shutdown.

## Tests run

```
Tests  34 passed (34) — target files
Tests  1613 passed (1613) — full suite
```

## Architecture decisions

- **Single route, per-hookId dispatch**: One `POST /api/hook/:id` route handles all hookIds; routing is done inside the handler via a `Map<hookId, Set<handler>>`. Mirrors how OSC shares one UDP socket per port with per-subscription filtering.
- **AssetServerLike interface in webhookIn.ts**: Minimal interface (`registerApiRoute` only) rather than importing the real `AssetServer`. Enables clean unit testing via mock without coupling to the full AssetServer.
- **No change to AssetServer.ts**: The existing `registerApiRoute` method already supports parametric routes. No new method was needed.
- **`req.body === undefined` → 400**: Express's `json()` middleware leaves body undefined when Content-Type is absent or parsing fails. This guard catches both cases at the handler level, making it unit-testable without a full Express stack. The middleware also sends 400 for malformed JSON before reaching the handler.
- **Webhook listener lifecycle mirrors OSC**: Created lazily on first `subscribeWebhook`, stopped when last subscription unsubscribes (or on `shutdown()`). The route `Subscription` returned by `registerApiRoute` is called in `stop()`.

## Notes for Critic

- `AssetServer.ts` was NOT modified. The target_files listing it seems to have been precautionary; all webhook routing works through the existing `registerApiRoute`.
- `src/main/src/shared/input/types.ts` was NOT modified. `WebhookInKey`, `WebhookInFilter`, `WebhookInMessage` are defined in `webhookIn.ts` to avoid touching an out-of-target file.
- The `InputRegistrar` interface in `showx-shared` (`listen/unlisten`) is a separate module-facing API and was not changed. The webhook-in additions are to the internal `InputRegistrar` interface in `InputRegistrar.ts` only.
- Shell.ts still calls `new InputRegistrarImpl(this.logger)` without passing an AssetServer — this is intentional, Shell uses `InputRegistrarStub` for modules. The real AssetServer can be wired in for ShowX-4 when the Shell needs to use webhook-in internally.
