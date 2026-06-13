---
id: "B004-004"
critic_started_at: "2026-06-13T15:11:00Z"
critic_completed_at: "2026-06-13T15:20:00Z"
verdict: "accepted"
review_round: 3
---

## Round 3 — re-review after changes_requested

Round 2 verdict was `changes_requested` with a single REQUIRED issue: guard `removeRow` against driving the Y.Doc into invalid `channels: []` state. Forge applied option (c) — both the defensive no-op AND hiding the × button when only one row remains.

## Acceptance criteria check (round 3 — delta only)

All round 2 ACs that previously passed remain intact. Re-verified the round 3 fix:

- [x] **Minimum-row guard in `removeRow`**
  → `pwa/src/components/cuelist/payloadEditors/DmxPayloadEditor.tsx:106-110`. Line 107: `if (payload.channels.length <= 1) return;` — defensive no-op. ✓
- [x] **× button hidden when only one row remains**
  → `pwa/src/components/cuelist/payloadEditors/DmxPayloadEditor.tsx:254`. Conditional `{!locked && payload.channels.length > 1 && (<button ...>×</button>)}`. ✓
- [x] **Required test added**
  → `tests/unit/pwa/components/cuelist/payloadEditors/DmxPayloadEditor.test.tsx:199-210`. Test "does not allow removing the last channel row" asserts the Remove button is absent when `channels.length === 1` AND Y.Doc still has 1 channel. Matches the test scaffold given in round 2 review. ✓

## Build / typecheck / tests (round 3 verification)

Independently re-run by Critic (not relying on Forge's self-report):

- `pnpm vitest run tests/unit/pwa/components/cuelist/payloadEditors/DmxPayloadEditor.test.tsx` → **10 tests passed**
- `pnpm vitest run` (full suite) → **137 test files, 1614 tests, 0 failed**
- `pnpm -r typecheck` → **clean across all 5 workspace packages** (src/shared, apps/marketing, src/modules/cuelist-core, pwa, src/main)
- `pnpm --filter showx-pwa build` → **clean** (vite v5.4.21, 260 modules, 431.39 kB bundle, no node:* leak)

## Code review notes

The fix is minimal, defensive, and follows the same "make the invalid state unreachable" pattern used in MSC editor's required-device guard. The two changes do not interact with any other AC and round 2's clean architecture (token-based styling, established editor pattern, locked propagation, channel/value bounds, writes through `updatePayload`) is preserved.

`rowErrors` indexing-by-position remains correct: when last reachable removal (index 1 of a 2-row list) happens, `setRowErrors` filter keeps index 0's errors aligned. Already covered by the existing "remove row" test at line 118.

The diff in round 3 is scope-clean — only the two target files mentioned in the done report were modified. No cascading edits.

## Verdict rationale

Round 2's single defect is fully addressed with both belt and suspenders (option c). Required test exists and passes. All round 2 ACs remain green. Build + typecheck + full test suite green under Critic's independent run.

**Verdict: `accepted`. Round → 3 (terminal).**
