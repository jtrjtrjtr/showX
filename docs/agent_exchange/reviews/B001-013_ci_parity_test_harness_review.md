---
id: "B001-013"
critic_started_at: "2026-06-06T09:10:00Z"
critic_completed_at: "2026-06-06T09:18:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **CI workflow runs on push to any branch + PR to main** → `.github/workflows/ci.yml:3-7` — `push: branches: ['**']` and `pull_request: branches: [main]`.
- [x] **CI jobs: typecheck, lint, unit-tests, e2e-tests-headless, parity-tests, build — all run in parallel where possible** → `ci.yml:9-118` — all 6 jobs present. `typecheck` and `lint` run independently. `unit-tests` (line 39), `parity-tests` (line 61), `e2e-tests` (line 76), `build` (line 99) all `needs: [typecheck]` — so they run in parallel after typecheck passes.
- [x] **Node 20.x + pnpm 8.15 via pnpm/action-setup; pnpm store cached** → `ci.yml:14-20,42-48` etc. — `pnpm/action-setup@v3` (version: 8.15.0) runs BEFORE `actions/setup-node@v4` (node-version: 20, cache: pnpm). Modern `cache: pnpm` on setup-node delegates to actions/cache internally — equivalent to the spec ask.
- [x] **Coverage report uploaded as artifact (vitest --coverage)** → `ci.yml:51` runs `pnpm test -- --coverage ...`; `ci.yml:52-58` uploads `coverage/` + `junit-unit.xml` as `unit-coverage` artifact with `if: always()`.
- [x] **Workflow fails fast: typecheck must pass before unit-tests run** → `ci.yml:39, 61, 76, 99` — `unit-tests`, `parity-tests`, `e2e-tests`, `build` all `needs: [typecheck]`. Verified.
- [x] **Parity harness loads a 'scenario' = { name, input_events[], expected_outputs[] }; runs against ShowX and (when fixtures present) BridgeX 0.3.x; compares output streams** → `tests/parity/types.ts:19-27` defines `ParityScenario` with exactly those fields + optional `bridgex_golden_path` + `duration_ms`. `harness.ts:17-49` `runScenario` sends events to both ShowX target and (if present) BridgeX target, drains outputs, calls `compareOutputs` for both expected-vs-ShowX and BridgeX-vs-ShowX (line 36).
- [x] **Harness handles BridgeX fixtures being ABSENT gracefully — logs skipped, doesn't fail** → `harness.ts:32` `targets.bridgex ? ... : undefined`. `harness.ts:45-48` notes message `'bridgex target not provided — comparison limited to expected_outputs'`. Verified by `example.parity.test.ts:81-101` ("handles missing bridgex target gracefully") — passes with `bridgex: null`.
- [x] **example.parity.test.ts validates the harness on a tiny scenario against a stubbed dispatcher** → `tests/parity/example.parity.test.ts` defines `FakeTarget` (line 6-20) + 5 test cases: happy path, missing_expected, payload_mismatch, missing bridgex graceful, tolerance window. All 5 pass.
- [x] **render_dashboard.py reads docs/agent_exchange/state.json and renders TASK_DASHBOARD.md** → `scripts/render_dashboard.py:18-92`. Reads `state.json` (line 19) + `claude_runner_scope.json` (line 20). Renders: status counts table (44-56), open bundle (58-67) with scope fallback when no bundles[] entry, Forge bandwidth section (69-75), task list sorted by ID (77-83). Manual run confirmed: `TASK_DASHBOARD.md` shows 11 accepted / 1 queued / 1 done, scope bundle ShowX-1, all 13 tasks listed.
- [x] **agent_exchange_refresh_dashboard.py is the runner-callable wrapper; agent_exchange_estimate_split.py is the 700-line split helper** → `scripts/agent_exchange_refresh_dashboard.py:1-11` — clean wrapper, imports `render_dashboard.main`. `scripts/agent_exchange_estimate_split.py:1-62` — parses frontmatter, checks `estimated_size_lines` against `THRESHOLD = 700`, suggests subtask split by clustering target_files by top-level directory.
- [x] **scripts have shebang + chmod-executable note, are valid Python 3.10+, type-hinted** → All three: `#!/usr/bin/env python3` shebang, `from __future__ import annotations`, type hints throughout, no external deps. Files are not marked executable on disk (rw-r--r--) — Forge transparently documented this gap in done report (sandbox blocked `chmod +x`) and provided the exact `git update-index --chmod=+x` command for Architect. Scripts invocable via `python3 scripts/...` which is what render_dashboard and refresh both succeeded with.

## Test run verification

```
pnpm test:parity
 ✓ tests/parity/example.parity.test.ts  (5 tests) 673ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Full suite (regression check):
```
pnpm test
 Test Files  28 passed (28)
      Tests  262 passed (262)
```

Typecheck:
```
pnpm -r typecheck → all 3 workspaces (src/shared, src/main, pwa) clean
```

Dashboard scripts:
```
$ python3 scripts/render_dashboard.py     → Dashboard written
$ python3 scripts/agent_exchange_refresh_dashboard.py → Dashboard written (same output)
```

`estimate_split.py` not invoked due to sandbox permission denial during this review, but static inspection of `scripts/agent_exchange_estimate_split.py:43-54` confirms: threshold gate at line 48 (`est < THRESHOLD` → "OK" exit 0), warn path at line 51-53 (calls `suggest_split` then exits 1), entry guard at 57-61 requires arg. Logic matches spec.

## Code review notes

**CI ordering** — `pnpm/action-setup@v3` runs BEFORE `actions/setup-node@v4` in every job (verified `ci.yml:14-19, 28-33, 43-48, 65-70, 80-85, 103-108`). Required for `cache: pnpm` to find the pnpm binary. No ordering bugs.

**`pnpm install --frozen-lockfile`** — present in all 6 jobs. Catches dependency drift. ✓

**Playwright** — `pnpm exec playwright install --with-deps chromium` (ci.yml:88). Chromium only; no browser sprawl. ✓

**E2E artifact upload** — `if: failure()` for playwright-report (ci.yml:92-96). Correct — only uploaded when tests fail.

**`compareOutputs` matcher** (`harness.ts:58-143`) — sorts both lists by `at_ms` (lines 64-65), tracks matched indices (line 66), first pass finds timing-window match within `transport + at_ms ± tolerance_ms` (lines 73-78), checks payload via `node:assert.deepStrictEqual` wrapped in try/catch (lines 85-90) — emits `payload_mismatch` if differs. Second pass for unmatched expecteds finds payload match outside timing window → `timing_drift` (lines 103-121). Remaining unmatched expecteds → `missing_expected` (line 122-127). Unmatched actuals → `unexpected_emitted` (lines 132-140). All 4 diff kinds reachable.

**Greedy matcher caveat documented** — `harness.ts:51-57` comment explicitly warns ShowX-2 scenario authors that greedy first-match means scenarios should use unambiguous `at_ms` values per transport. Matches the spec's "Notes for Critic" guidance.

**Tolerance default** — `tol = exp.tolerance_ms ?? 5` (`harness.ts:70`). Matches `ParityOutput.tolerance_ms?` default in types.ts. ✓ Tolerance test verified at 3ms drift within 5ms default (`example.parity.test.ts:103-123`).

**Event dispatch order** — `harness.ts:24` sorts input events by `at_ms` before dispatching. Defensive: ensures chronological dispatch even if spec author lists events out of order.

**`sleepUntil`** (`harness.ts:145-148`) — wall-clock `setTimeout`. Forge correctly noted this in done report; spec also flagged it as acceptable for skeleton. Sufficient at scenario `duration_ms < 300ms`.

**Python scripts** — no hardcoded `/Users/machintoshhd/...` paths found. All use `Path(__file__).resolve().parents[1]` (render_dashboard.py:8, refresh wrapper computes via sibling import). Confirmed at `render_dashboard.py:8`.

**`render_dashboard.py` open-bundle fallback** (lines 60-66) — when `state.bundles[]` is empty (current state — no bundles array exists in state.json), falls back to scope `bundle_id`. Sensible deviation from spec template (spec said "_none_" branch). Output reflects what's actually running.

**Vitest config change** (`vitest.config.ts:15`) — single-line addition of `'tests/parity/**/*.test.ts'` to `include`. Necessary: without it, `vitest run tests/parity` finds zero files (CLI args filter within `include`), and `passWithNoTests: true` would silently pass. Minimal, in-scope, correct.

**Dashboard end-state correctness** — generated `TASK_DASHBOARD.md` shows status counts (11 accepted / 1 queued / 1 done — accurate at render time, before this review), scope `ShowX-1 enabled`, all 13 tasks listed sorted by ID.

**Out-of-scope correctly skipped**: no BridgeX golden recordings (deferred to ShowX-2), no coverage threshold enforcement, no DMG sign pipeline. ✓

## Verdict rationale

All 11 acceptance criteria met with file:line citations. 5/5 parity tests pass, 262/262 full suite passes, typecheck clean across 3 workspaces. CI workflow correct (job topology, action versions, pnpm/node ordering, frozen lockfile, coverage upload, playwright chromium-only). Parity harness correctly emits all 4 diff kinds, handles absent BridgeX target gracefully, documents greedy-matcher caveat for ShowX-2 authors. Python scripts shebanged, type-hinted, dep-free, no hardcoded paths. Forge transparently documented the only gap (exec bit blocked by sandbox) with the exact remediation command. Vitest config tweak is minimal and necessary.

**Accepted.**
