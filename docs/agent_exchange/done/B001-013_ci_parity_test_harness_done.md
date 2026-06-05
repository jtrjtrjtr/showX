---
id: "B001-013"
title: "CI workflow + parity test harness skeleton"
status: "done"
round: 1
forge_agent: "forge"
started_at: "2026-06-06T09:20:00Z"
ended_at: "2026-06-06T09:35:00Z"
---

# Done Report — B001-013 CI workflow + parity test harness skeleton

## Summary

Implemented CI pipeline, parity test harness skeleton, and dashboard scripts. All 5 parity tests pass.

## Files changed

| File | Action |
|---|---|
| `.github/workflows/ci.yml` | Created |
| `tests/parity/types.ts` | Created |
| `tests/parity/harness.ts` | Created |
| `tests/parity/example.parity.test.ts` | Created |
| `tests/parity/fixtures/.gitkeep` | Created |
| `scripts/render_dashboard.py` | Created |
| `scripts/agent_exchange_refresh_dashboard.py` | Created |
| `scripts/agent_exchange_estimate_split.py` | Created |
| `vitest.config.ts` | Modified (see note) |

## Tests run

```
> showx-workspace@0.0.1 test:parity
> vitest run tests/parity

 RUN  v1.6.1 /Users/machintoshhd/Daniel-local/showX

 ✓ tests/parity/example.parity.test.ts  (5 tests) 681ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  09:08:13
   Duration  1.05s
```

All 5 cases pass:
- passes when scripted target emits exactly the expected outputs ✓
- reports missing_expected when target emits nothing ✓
- reports payload_mismatch when payload differs ✓
- handles missing bridgex target gracefully ✓
- matches within tolerance window ✓

## Dashboard script verification

```
$ python3 scripts/render_dashboard.py
Dashboard written to .../docs/agent_exchange/TASK_DASHBOARD.md

$ python3 scripts/agent_exchange_refresh_dashboard.py
Dashboard written to .../docs/agent_exchange/TASK_DASHBOARD.md
```

Both produce: status counts table, open bundle (falls back to scope bundle_id when no bundles[] entry), Forge bandwidth section, task list sorted by ID. No hardcoded `/Users/machintoshhd/...` paths — repo root derived from `Path(__file__).resolve().parents[1]`.

`agent_exchange_estimate_split.py` — static review confirmed: shebang `#!/usr/bin/env python3`, `from __future__ import annotations`, no external deps, threshold=700, correct frontmatter parse + grouping logic. Could not run interactively (shell permission restriction in runner sandbox); structure and logic matches spec exactly.

## Decisions within task scope

**vitest.config.ts (minor out-of-scope change, necessary):** Added `tests/parity/**/*.test.ts` to the `include` array. In Vitest 1.x, CLI path arguments filter *within* the `include` candidates — without this, `vitest run tests/parity` finds zero files. `passWithNoTests: true` would silently pass with no tests run. 1-line fix; no architectural implication.

**compareOutputs greedy matcher:** For each expected entry, finds the first unmatched actual within `at_ms ± tolerance_ms` with matching transport. Greedy pick means if two expected outputs share transport and overlapping timing windows, assignment may be non-optimal. Documented in a comment in `harness.ts` — ShowX-2 scenario designers should use unambiguous `at_ms` values per transport.

**sleepUntil is wall-clock:** Uses real `setTimeout`. Adequate for skeleton tests (duration_ms < 300ms in examples). A virtual-time mode may be useful in ShowX-2 when real BridgeX golden recordings are added with longer durations.

**Executable bits:** `chmod +x` / `git update-index --chmod=+x` blocked by runner sandbox permissions. Architect should run once:
```
git update-index --chmod=+x scripts/render_dashboard.py scripts/agent_exchange_refresh_dashboard.py scripts/agent_exchange_estimate_split.py
```

**Package.json scripts:** All required scripts already present from B001-001 (`typecheck`, `test`, `test:parity`, `test:e2e`, `lint`, `build`). No changes needed.

## Notes for Critic

- `pnpm/action-setup@v3` runs BEFORE `actions/setup-node@v4` in all CI jobs — correct ordering for `cache: pnpm` to work.
- `pnpm install --frozen-lockfile` in all jobs.
- Playwright installs chromium only (not all browsers).
- Python scripts: no hardcoded paths; all use `Path(__file__).resolve().parents[1]` for repo root.
- `estimate_split` is a HEURISTIC — returns exit 1 if over threshold, Architect decides whether to split. Documented in script docstring.
- `compareOutputs` greedy algorithm edge case is documented in a comment in `harness.ts`.
- `tests/parity/fixtures/.gitkeep` present; ready for ShowX-2 golden recordings.
- CI gate: unit-tests, parity-tests, e2e-tests, build all `needs: [typecheck]`. Lint runs in parallel (independent). Satisfies "typecheck must pass before unit-tests run".
- `tests/parity/.gitkeep` was already present (from B001-001 skeleton); `tests/parity/fixtures/.gitkeep` is the new one per spec.
