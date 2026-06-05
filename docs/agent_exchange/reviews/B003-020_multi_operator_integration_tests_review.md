---
task_id: "B003-020"
title: "Multi-operator collab integration tests — review"
verdict: "accepted"
reviewer: "critic"
round: 1
reviewed_at: "2026-06-09T11:25:00Z"
---

## Verdict: accepted (with documented runtime-validation deferral)

This is an architect-rescue done report after Forge 2× timeout. The spec
explicitly allowed deferred runtime validation if shell test harness was
missing ("If shell test harness is missing or limited, document gaps +
propose ShowX-1 follow-up"). The done report does this comprehensively.
Code artifacts match all 14 acceptance criteria structurally; data-testid
selectors are present in the actual PWA components; helpers and fixtures
are well-typed.

Known runtime gaps (NOT blocking acceptance per spec clause) are enumerated
under "Gaps for ShowX-1.1 follow-up" below.

## Acceptance criteria verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Playwright spec spawns shell + 2 PWA contexts, both pair | ✅ structure | `tests/e2e/multiop.spec.ts:21-44` beforeAll boots shell then pairs both pages via `pairStation` |
| 2 | End-to-end label-edit → see-update → payload-edit → fire-GO chain | ✅ structure | tests 2 (`:67`), 3 (`:80`), 4 (`:94`) |
| 3 | Awareness/presence indicators | ✅ structure | test 5 `:108` checks `presence-dot-SM` on lxPage |
| 4 | Compound cue scenario with correct highlight | ✅ structure | test 6 `:117-132` asserts `font-weight: bold` on `payload-LX` |
| 5 | Conflict resolution: concurrent edits converge | ✅ structure | test 7 `:136-163` Promise.all blur + 2s wait + `expect(smLabel).toBe(lxLabel)` |
| 6 | GO authority sm_called: LX reject + SM accept | ✅ structure | test 8 `:167-184` `go-rejected-toast` then SM `calling-text` GO |
| 7 | REHEARSAL → SHOW lock indicators on both | ✅ structure | test 9 `:188-203` |
| 8 | GO event idempotency: same request_id → 1 fire | ✅ structure | test 10 `:207-227` asserts `debugFireCount === 1` |
| 9 | Replay window: stale client_ts rejected with `historic_replay` | ✅ structure | test 11 `:231-242` `expect(String(result)).toMatch(/historic_replay/)` |
| 10 | Reconnect test: kill+restore WSS, state catches up | ✅ structure | test 12 `:246-264` debugCloseSideChannel → fire → debugReconnectSideChannel → `cue-history-marker` |
| 11 | `bootTestShell` helper with full BootResult | ✅ delivered | `tests/e2e/helpers/bootTestShell.ts:7-72` — typed `BootOpts`, `BootResult` (shell/shellWindow/pkgPath/port/baseUrl/cleanup), tmp dir + fixture copy + env injection + Electron launch |
| 12 | `pairStation` helper | ✅ delivered | `tests/e2e/helpers/pairStation.ts:16-40` typed `PairOpts`/`PairResult`, walks pin/name/role/depts/submit/paired-success |
| 13 | Fixtures: 5 cues per spec layout | ✅ delivered | `tests/e2e/fixtures/multiop-show/show.json`, `cuelists/cl_main.json` — 5 cues: Q1 LX (`:9-36`), Q2 SM (`:37-53`), Q3 LX+SX compound (`:54-89`), Q4 SX (`:90-116`), Q5 LX (`:117-143`). Matches spec exactly |
| 14 | Playwright config 2-min timeout, retry-once, video-on-failure | ✅ delivered | `playwright.config.ts:5-13` timeout 120_000, retries 1, video retain-on-failure, screenshot only-on-failure, workers:1 |
| 15 | 12+ test cases | ✅ exactly 12 | numbered test blocks 1-12 in `multiop.spec.ts` |

## data-testid selector cross-reference (B003-013/014/015/016 components)

Spec note required: "Verify data-testid selectors exist in the actual components".
Cross-checked via `grep -r data-testid pwa/src/`:

| Selector used in test | Component | Verified |
|---|---|---|
| `cue-row` + `data-cue-type` | `CueRow.tsx:32-33` | ✅ |
| `cue-label` | `CueRow.tsx` | ✅ |
| `cue-label-input` | `CueMetaFields.tsx` | ✅ |
| `cue-fire-animation` | `CueRow.tsx` | ✅ |
| `payload-summary` | `CueRow.tsx` | ✅ |
| `lx-cue-number-input` | `LxRefPayloadEditor.tsx` | ✅ |
| `calling-text` | `CallingText.tsx` | ✅ |
| `mode-badge`, `go-rejected-toast`, `cue-history-marker` | `SMMasterView.tsx` | ✅ |
| `payload-{tag}` (e.g. `payload-LX`) | `PayloadList.tsx` (`data-testid={p.tag ? \`payload-${p.tag}\`...}`) | ✅ |
| `presence-dot-{dept}` | `OperatorPresenceIndicators.tsx` | ✅ |
| `show-lock-banner` | `CueEditor.tsx` | ✅ |
| `pin-input` / `device-name-input` / `role-select` / `dept-chip-*` / `submit-pairing` / `paired-success` / `station-id` | `PairingView.tsx` | ✅ |

All 18 selectors referenced by the spec exist in real components. No
phantom selectors.

## Fixture shape verification

`fixtures/multiop-show/show.json` round-trip check vs. `data_model.md`:

- ✅ `$schema`, `format_version`, `schema_version`, `show_id` (UUIDv7-shaped)
- ✅ `meta.departments` includes all 8 dept enum values
- ✅ `cuelist_index` references `cuelists/cl_main.json`
- ✅ `cl_main.json`: `default_trigger`, `go_authority='sm_called'` (required to drive test 8), `sm_offline_policy.kind='freeze'`, `playhead`
- ✅ 5 cues with required fields (label/description/department/standby_note/trigger/payloads/notes/created_at/created_by/modified_at/modified_by)
- ✅ Q3 compound has both `tag:"LX"` and `tag:"SX"` payloads — drives test 6 highlight assertion
- ✅ Cue IDs in `fixtures.ts` constants match those in cl_main.json (Q1_LX `..0020`, Q3_COMPOUND `..0022`, etc.)

## Helper typing

`tsc` strict types verified by reading source:
- `bootTestShell.ts`: typed `BootOpts`, `BootResult`, returns Promise; uses `_electron`, `mkdtemp`/`cp`/`rm` correctly; cleanup is idempotent (`.catch(() => {})`).
- `pairStation.ts`: typed `PairOpts`/`PairResult`, narrow `role: 'sm' | 'operator'`.
- `openTwoPwaSessions.ts`: typed orchestration; not used by `multiop.spec.ts` (test inlines the same logic) — acceptable as a reusable helper for future specs.
- `fixtures.ts`: typed `CUE_IDS`/`PAYLOAD_IDS` as `const`; `SM_TOTAL_CUES=5`, `LX_VISIBLE_CUES=3` (Q1 LX + Q3 compound + Q5 LX).

## Gaps for ShowX-1.1 follow-up (NOT blocking acceptance per spec clause)

The done report itself enumerates these. Critic confirms them as REAL and
correctly scoped to a follow-up bundle:

1. **`@playwright/test` dependency missing.** Tests import `@playwright/test` and `playwright.config.ts` uses `defineConfig` from it, but only `playwright` (browser lib) is in `package.json` / pnpm-lock. Verified via `ls node_modules/@playwright` (no such dir). Without this dep, `pnpm test:e2e` cannot even compile. Trivial fix in follow-up: `pnpm add -D @playwright/test`.
2. **`SHOWX_TEST_MODE` env var unwired.** Only `SHOWX_PAIRING_TEST_PIN` is consumed (`src/main/src/Shell.ts:294`). `SHOWX_AUTOLOAD_SHOW` and `SHOWX_TEST_MODE` are not.
3. **`window.debug*` API missing.** Tests 10, 11, 12 call `window.debugSendGoRequest`, `debugFireCount`, `debugSendGoRequestWithTs`, `debugCloseSideChannel`, `debugReconnectSideChannel`. Zero matches in `src/` or `pwa/`. Follow-up needs to gate these behind `SHOWX_TEST_MODE` and expose them.
4. **Electron `dist/main/index.js` build step.** `bootTestShell.ts:38-40` resolves `dist/main/index.js`. No build script emits to that exact path today; follow-up needs `pnpm --filter showx-main build` wiring.
5. **`/pairing` route under test mode.** `pairStation.ts:17` does `goto(url + '/pairing?testMode=1')`. The `testMode` query param isn't currently consumed by `PairingView.tsx`. Follow-up needs to short-circuit PIN gen when `SHOWX_TEST_MODE=1` AND `testMode=1` on the URL.

These 5 items are appropriate scope for a ShowX-1.1 (or ShowX-3 cleanup
sibling of B003-024). They do NOT require revising B003-020 artifacts.

## Minor non-blockers

- Test 7 mixes selector styles: `secondRow` string passed to `smPage.locator(secondRow)` while `lxPage.locator('[data-testid="cue-row"]').nth(1)` is used for LX. Functionally equivalent; stylistic only.
- `openTwoPwaSessions.ts` is unused by `multiop.spec.ts` (the spec inlines its logic). Not waste — explicit spec target file `helpers/openTwoPwaSessions.ts` is delivered as documented.
- `playwright.config.ts` doesn't pin a `projects` array. Fine for current single Electron-flow test; may need a `setup` project once the build hook is added in follow-up.

## Notes for Architect

- B003-020 is **closeable as accepted now**. Runtime validation gate is
  honored by the spec's anticipated-gap clause.
- Recommend Architect queue a ShowX-1.1 follow-up bundle (or append to
  ShowX-3 cleanup) with the 5 gap items above. They are precisely scoped
  and low-risk individually.
- Architect-rescue authorship is sound; the post-mortem accurately identifies
  why Forge timed out and proposes a precise unblock.
