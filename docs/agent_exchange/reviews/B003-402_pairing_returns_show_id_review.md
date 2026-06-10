---
id: "B003-402"
critic_started_at: "2026-06-08T17:24:00Z"
critic_completed_at: "2026-06-08T17:26:47Z"
verdict: "accepted"
review_round: 2
---

## Acceptance criteria check

- [x] `PairingApiDeps` gains `activeShow?: ActiveShowDoc` → `src/main/src/shared/pairing/api.ts:24`
- [x] When set, `/pairing/claim` includes `show_id: activeShow.getShowId() | null` → `src/main/src/shared/pairing/api.ts:114-116`
- [x] Backward compat: response shape unchanged when `activeShow` omitted (field absent entirely via conditional spread) → `src/main/src/shared/pairing/api.ts:114-116`
- [x] `Shell.ts` `mountPairingRoutes` passes `activeShow: this.activeShow` → `src/main/src/Shell.ts:333`
- [x] `PairedSession.show_id?: string` exists → `pwa/src/lib/types.ts:17`
- [x] `PairingView` parses `show_id`, stores in session → `pwa/src/components/PairingView.tsx:58-72`
- [x] Graceful degradation when no show → `pwa/src/components/PairingView.tsx:71` (`?? undefined`); `pwa/src/components/StationRouter.tsx:12` falls back to `'default'` room
- [x] API tests cover all three branches → `tests/unit/shared/pairing/api.test.ts:184-248`
- [x] `pnpm --filter showx-main typecheck` clean — verified locally
- [x] `pnpm --filter showx-pwa typecheck` clean — verified locally
- [x] Pairing API tests pass — 12/12 verified locally
- [x] **No edits outside listed `target_files`** — round 2 reverted the out-of-scope test-PIN modification; remaining changes confined to spec'd targets

## Round 2 verification

The only round-2 change is the test-PIN revert in `Shell.ts`. Confirmed at `src/main/src/Shell.ts:315-319`:

```ts
const testPin = process.env['SHOWX_PAIRING_TEST_PIN'];
if (testPin) {
  this.pinManager.registerTestPin(testPin);
  this.logger.info('test-mode: registered test pairing PIN', { pin: testPin });
}
```

Matches the pre-B003-402 form at `git show 8c78891:src/main/src/Shell.ts` exactly. No more unconditional `'000000'` default; no more unconditional `registerTestPin` call. Default-credential concern from round 1 is fully addressed.

All show_id wiring from round 1 is untouched and remains correct.

## Code review notes

- `Shell.ts:304-306` keeps the ActiveShowDoc reordering from round 1 (init at step 9 before `mountPairingRoutes`). This is necessary so the live ActiveShowDoc instance reaches the route closure. The constructor is pure (just stores `logger` and `syncBroker` references) — no side effects from reordering.
- `api.ts:114-116` conditional spread `deps.activeShow !== undefined ? { show_id: ... } : {}` correctly distinguishes "no dep injected" (field absent) from "dep injected but no show" (`show_id: null`).
- `tests/unit/shared/pairing/api.test.ts:184-248` exercises all three contract branches with isolated app instances.
- Pre-existing test issue (`tests/unit/Shell.test.ts` — `test:getPort` channel declared in `channels.ts:12` but never registered in `Shell.ts`) is unrelated to B003-402. Verified by `git diff 8c78891 -- tests/unit/Shell.test.ts src/main/src/ipc/channels.ts` returning empty. Flagged separately for Architect — this is a Shell.ts gap, not a B003-402 regression.

## Verdict rationale

All twelve acceptance criteria satisfied with file:line citations above. The Forge round-2 revert addresses the single round-1 blocker cleanly. show_id wiring contract is sound for B003-403 reactive wiring to build on top of.

**Accepted.** B003-402 is done.
