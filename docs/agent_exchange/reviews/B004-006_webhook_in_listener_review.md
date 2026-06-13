---
id: "B004-006"
title: "Webhook IN — HTTP endpoint → InputRegistrar"
verdict: accepted
round: 1
reviewed_at: "2026-06-13T15:10:00Z"
reviewer: critic
---

## Verdict: accepted

All acceptance criteria met. Implementation mirrors the OSC/MIDI input pattern cleanly, route is gated by registered hookId (no wildcard), tests cover the named cases, full suite green, typecheck clean, no out-of-scope edits.

## Acceptance criteria — citations

1. **Inbound HTTP endpoint on existing Express AssetServer fans into InputRegistrar as webhook-in event matching OSC/MIDI shape.**
   - `src/main/src/shared/input/webhookIn.ts:52-56` — `WebhookInListener.start()` registers `POST /hook/:id` via the existing `AssetServer.registerApiRoute`.
   - `src/main/src/shared/AssetServer.ts:37` mounts the api router at `/api`, so effective path is `POST /api/hook/:id`. AssetServer was correctly left untouched (criterion met via existing API; done report flags this explicitly).
   - `webhookIn.ts:112-119` constructs a `WebhookInMessage { hookId, method, path, headers, body, receivedAt }` — analogous to OscMessage / MidiMessage in `input/types.ts:10-31`.

2. **InputRegistrar gains webhook-in handling on same dispatch path as OSC-in/MIDI-in.**
   - `InputRegistrar.ts:31-34` — `subscribeWebhook(filter, handler): Promise<Subscription>` added to interface.
   - `InputRegistrar.ts:184-232` — implementation creates the listener lazily, fans per-hookId via shared `WebhookInListener.addHandler/removeHandler`, returns Subscription with cleanup that stops the listener when last subscription drops. Same lifecycle shape as `subscribeOsc` (lines 81-131) and `subscribeMidi` (lines 133-182).
   - Action binding is caller responsibility (the handler), exactly like OSC/MIDI — consistent dispatch contract.

3. **Token/id gating: unknown hookId → 404 no side effect; no wildcard.**
   - `webhookIn.ts:107-111` — unknown hookId returns 404 `{error: 'unknown_hook_id'}` with zero handler invocations.
   - Route registers only the parametric `:id` path — no wildcard fallback. No global "fire any cue" endpoint exists.

4. **200 {ok:true} matched / 404 unmatched / 400 malformed.**
   - 200: `webhookIn.ts:127` — `res.json({ ok: true })` after dispatching to handlers.
   - 404: `webhookIn.ts:108-110`.
   - 400: `webhookIn.ts:97-105` — covers missing param (defensive) and undefined body (Content-Type missing or unparseable). Note: malformed JSON itself is short-circuited at the global `express.json()` middleware (`AssetServer.ts:119`) — that returns 400 before reaching the handler, which is acceptable per criteria.

5. **Unit tests — registered fires, unknown 404 no fire, malformed 400, concurrent isolated.**
   - Registered fires bound action: `tests/unit/shared/input/webhookIn.test.ts:90-106` + `tests/unit/shared/InputRegistrar.test.ts:379-390`.
   - Unknown → 404, no fire: `webhookIn.test.ts:108-122` + `InputRegistrar.test.ts:392-402`.
   - Malformed (undefined body) → 400: `webhookIn.test.ts:124-135`.
   - Concurrent hookIds isolated: `webhookIn.test.ts:137-151` + `InputRegistrar.test.ts:392-402`.
   - Bonus: handler-throw resilience (`webhookIn.test.ts:153-167`), multi-handler per hookId (`webhookIn.test.ts:169-182`), unsubscribe lifecycle (`InputRegistrar.test.ts:404-422`), shutdown (`InputRegistrar.test.ts:437-442`).

6. **typecheck clean, tests pass, no edits outside target_files.**
   - `pnpm -r typecheck` → all 5 workspace projects green (verified by Critic).
   - `pnpm vitest run` → 137 files / 1613 tests passing (verified by Critic).
   - Changed files: `InputRegistrar.ts` (target), `input/webhookIn.ts` (target), `InputRegistrar.test.ts` + `input/webhookIn.test.ts` (tests/unit/**). `AssetServer.ts` and `input/types.ts` left untouched — within target_files allowance (target list is the ceiling, not the floor).

## Independent observations

- **Architecture symmetry is real.** The OSC/MIDI lazy-create + last-subscription-stops pattern is preserved exactly in `subscribeWebhook` (`InputRegistrar.ts:192-219`). Future maintainer reading any of the three subscribe methods learns the pattern once.
- **AssetServerLike interface** (`webhookIn.ts:23-29`) is a clean seam — keeps `WebhookInListener` testable without dragging the full Express stack into unit tests, and reflects the minimal contract honestly (`registerApiRoute` only).
- **WebhookInKey** is added to `ListenerKey` unions for `listActiveListeners()` (`InputRegistrar.ts:35, 234-248`). Operational introspection now sees webhook-in handlers — useful for future "Inputs" UI.
- **Wiring caveat** (acknowledged by Forge in done report): `Shell.ts` constructs `InputRegistrarImpl` without `assets`, so `subscribeWebhook` will throw `'no AssetServer configured'` until Shell passes the AssetServer. That's out of scope for this task — the API is in place and unit-tested; Shell wiring belongs to a follow-up.

## Risks / non-blockers

- None blocking. The Shell-wiring follow-up is a known limitation, not a regression.
