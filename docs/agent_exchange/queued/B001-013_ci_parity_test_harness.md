---
id: "B001-013"
title: "CI workflow + parity test harness skeleton"
type: "implementation"
estimated_size_lines: 300
priority: "P1"
depends_on: ["B001-001"]
target_files:
  - ".github/workflows/ci.yml"
  - "tests/parity/harness.ts"
  - "tests/parity/types.ts"
  - "tests/parity/fixtures/.gitkeep"
  - "tests/parity/example.parity.test.ts"
  - "scripts/render_dashboard.py"
  - "scripts/agent_exchange_refresh_dashboard.py"
  - "scripts/agent_exchange_estimate_split.py"
acceptance_criteria:
  - "CI workflow runs on push to any branch + PR to main"
  - "CI jobs: typecheck, lint, unit-tests, e2e-tests-headless, parity-tests, build — all run in parallel where possible"
  - "Node 20.x + pnpm 8.15 via pnpm/action-setup; pnpm store cached via actions/cache for fast subsequent runs"
  - "Coverage report uploaded as artifact (vitest --coverage)"
  - "Workflow fails fast: typecheck must pass before unit-tests run"
  - "Parity harness loads a 'scenario' = { name, input_events[], expected_outputs[] }; runs against ShowX (with stubbed EventX Bridge) and (when fixtures present) BridgeX 0.3.x; compares output streams"
  - "Harness handles BridgeX fixtures being ABSENT gracefully — logs skipped, doesn't fail (ShowX-2 will populate fixtures)"
  - "example.parity.test.ts validates the harness on a tiny scenario against a stubbed dispatcher"
  - "render_dashboard.py reads docs/agent_exchange/state.json and renders TASK_DASHBOARD.md with: status counts table + open bundle + task list with status + Forge bandwidth from scope JSON"
  - "agent_exchange_refresh_dashboard.py is the runner-callable wrapper; agent_exchange_estimate_split.py is the 700-line split helper, both adapted from bridgeX equivalents"
  - "scripts have shebang + chmod-executable note, are valid Python 3.10+, type-hinted"
---

## Context

ShowX-1 ends with a runnable Electron shell + module loader + PWA scaffold, but no real modules. To enable confident iteration once ShowX-2 lands the EventX Bridge module migration, we need:

1. **CI pipeline** so every commit gets typechecked, linted, tested, and built — no Forge regression slips through.
2. **Parity test harness** so when EventX Bridge module is built (ShowX-2), Critic can validate it behaves identically to BridgeX 0.3.x on the same input. The harness is built here as a SKELETON — fixtures will be populated in ShowX-2 from BridgeX 0.3.x golden recordings.
3. **Dashboard scripts** — the Architect needs the TASK_DASHBOARD.md auto-rendered every runner tick (mirrors BridgeX pattern). These scripts are direct adaptations of the BridgeX equivalents (`/Users/machintoshhd/Daniel-local/bridgeX/scripts/agent_exchange_refresh_dashboard.py` etc.) with path adjustments.

## Implementation notes

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 8.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 8.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  unit-tests:
    needs: [typecheck]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 8.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage --reporter=default --reporter=junit --outputFile.junit=junit-unit.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: unit-coverage
          path: |
            coverage/
            junit-unit.xml

  parity-tests:
    needs: [typecheck]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 8.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:parity

  e2e-tests:
    needs: [typecheck]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 8.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
        env: { CI: 'true' }
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: e2e-playwright-report, path: playwright-report/ }

  build:
    needs: [typecheck]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 8.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
      - uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: |
            src/main/dist/
            src/shared/dist/
            pwa/dist/
```

Add these scripts to root `package.json`:
```json
{
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "test": "vitest run",
    "test:parity": "vitest run tests/parity",
    "test:e2e": "playwright test"
  }
}
```

(If they already exist from B001-001, only ADD the missing ones; don't churn.)

### `tests/parity/types.ts`

```ts
export interface ParityEvent {
  /** Where the event originated. */
  source: 'eventx_supabase' | 'osc_in' | 'midi_in' | 'http_in';
  /** ms offset from scenario start. */
  at_ms: number;
  /** Source-specific payload. */
  payload: Record<string, unknown>;
}

export interface ParityOutput {
  transport: 'osc' | 'midi' | 'dmx' | 'msc' | 'webhook';
  /** ms offset from scenario start, with tolerance window. */
  at_ms: number;
  tolerance_ms?: number;       // default 5
  /** Transport-specific shape. */
  payload: Record<string, unknown>;
}

export interface ParityScenario {
  name: string;
  description?: string;
  duration_ms: number;
  input_events: ParityEvent[];
  expected_outputs: ParityOutput[];
  /** Optional: golden recording from BridgeX 0.3.x against which to also compare. */
  bridgex_golden_path?: string;
}

export interface ParityResult {
  scenario: string;
  passed: boolean;
  diffs: ParityDiff[];
  showx_outputs: ParityOutput[];
  bridgex_outputs?: ParityOutput[];
  notes: string[];
}

export interface ParityDiff {
  kind: 'missing_expected' | 'unexpected_emitted' | 'payload_mismatch' | 'timing_drift';
  expected?: ParityOutput;
  actual?: ParityOutput;
  detail: string;
}
```

### `tests/parity/harness.ts`

```ts
import { ParityScenario, ParityResult, ParityOutput, ParityDiff } from './types.js';

export interface ParityTargets {
  /** ShowX dispatcher under test — receives input events, emits captured outputs. */
  showx: ParityTarget;
  /** Optional BridgeX 0.3.x reference. If null, BridgeX comparison is skipped. */
  bridgex?: ParityTarget | null;
}

export interface ParityTarget {
  name: string;
  /** Send an input event into the target. Resolves when ingested. */
  send(event: ParityEvent): Promise<void>;
  /** Drain all captured outputs from start of scenario. */
  drain(): Promise<ParityOutput[]>;
  /** Reset state between scenarios. */
  reset(): Promise<void>;
}

export async function runScenario(scenario: ParityScenario, targets: ParityTargets): Promise<ParityResult> {
  await targets.showx.reset();
  if (targets.bridgex) await targets.bridgex.reset();

  const startedAt = Date.now();

  // Schedule events at their at_ms offsets — use a queue, not naïve setTimeout-per-event,
  // so test runtime stays deterministic.
  for (const ev of scenario.input_events) {
    await sleepUntil(startedAt + ev.at_ms);
    await targets.showx.send(ev);
    if (targets.bridgex) await targets.bridgex.send(ev);
  }
  await sleepUntil(startedAt + scenario.duration_ms);

  const showxOutputs = await targets.showx.drain();
  const bridgexOutputs = targets.bridgex ? await targets.bridgex.drain() : undefined;

  const diffs = compareOutputs(scenario.expected_outputs, showxOutputs);
  if (bridgexOutputs) {
    diffs.push(...compareOutputs(bridgexOutputs, showxOutputs, { label: 'bridgex_vs_showx' }));
  }

  return {
    scenario: scenario.name,
    passed: diffs.length === 0,
    diffs,
    showx_outputs: showxOutputs,
    bridgex_outputs: bridgexOutputs,
    notes: bridgexOutputs ? [] : ['bridgex target not provided — comparison limited to expected_outputs'],
  };
}

function compareOutputs(expected: ParityOutput[], actual: ParityOutput[], opts?: { label?: string }): ParityDiff[] {
  // Greedy match each expected to an actual within tolerance_ms; classify diffs.
  // Order matters less than timing; sort both by at_ms first.
  // ...
}

async function sleepUntil(ms: number) {
  const d = ms - Date.now();
  if (d > 0) await new Promise(r => setTimeout(r, d));
}
```

`compareOutputs` is the core logic:
1. Sort both lists by `at_ms`.
2. For each expected entry, find the FIRST unmatched actual within `at_ms ± tolerance_ms` (default 5ms) where transport + payload deep-equal.
3. Unmatched expecteds → `missing_expected`. Unmatched actuals → `unexpected_emitted`.
4. Match within timing window but payload differs → `payload_mismatch`.
5. Match payload but outside timing window → `timing_drift`.

Use `node:assert` `deepStrictEqual` semantics for payload — wrap in try/catch for the boolean check.

### `tests/parity/example.parity.test.ts`

Validates the harness itself with a fake `ParityTarget`:

```ts
import { describe, it, expect } from 'vitest';
import { runScenario } from './harness.js';
import type { ParityScenario, ParityTarget, ParityOutput } from './types.js';

class FakeTarget implements ParityTarget {
  name = 'fake';
  emitted: ParityOutput[] = [];
  scriptedOnSend: (ev) => ParityOutput[] = () => [];
  async send(ev) { this.emitted.push(...this.scriptedOnSend(ev)); }
  async drain() { return [...this.emitted]; }
  async reset() { this.emitted = []; }
}

describe('parity harness', () => {
  it('passes when scripted target emits exactly the expected outputs', async () => {
    const showx = new FakeTarget();
    showx.scriptedOnSend = (ev) => [{ transport: 'osc', at_ms: ev.at_ms, payload: { address: '/showx/cue', args: [1] } }];

    const scenario: ParityScenario = {
      name: 'happy',
      duration_ms: 200,
      input_events: [{ source: 'eventx_supabase', at_ms: 50, payload: { row_id: 'r1' } }],
      expected_outputs: [{ transport: 'osc', at_ms: 50, tolerance_ms: 10, payload: { address: '/showx/cue', args: [1] } }],
    };
    const res = await runScenario(scenario, { showx });
    expect(res.passed).toBe(true);
    expect(res.diffs).toEqual([]);
  });

  it('reports missing_expected when target emits nothing', async () => { ... });
  it('reports payload_mismatch when payload differs', async () => { ... });
  it('handles missing bridgex target gracefully', async () => { ... });
  it('matches within tolerance window', async () => { ... });
});
```

### `tests/parity/fixtures/.gitkeep`

Empty file so the dir is committed. Add a sibling `README.md` (also empty for now, OR — given the "no markdown unless needed" rule — skip it and just use .gitkeep).

### `scripts/render_dashboard.py`

Adapted from `/Users/machintoshhd/Daniel-local/bridgeX/scripts/agent_exchange_refresh_dashboard.py` (look there for the structure). Output target: `docs/agent_exchange/TASK_DASHBOARD.md`.

```python
#!/usr/bin/env python3
"""Render docs/agent_exchange/TASK_DASHBOARD.md from state.json + scope + bundles."""
from __future__ import annotations
import json
from pathlib import Path
from datetime import datetime, timezone

REPO_ROOT = Path(__file__).resolve().parents[1]
AE = REPO_ROOT / "docs" / "agent_exchange"

def load_json(p: Path) -> dict:
    if not p.exists(): return {}
    return json.loads(p.read_text())

def render() -> str:
    state = load_json(AE / "state.json")
    scope = load_json(AE / "claude_runner_scope.json")
    tasks = state.get("tasks", [])
    counts = {}
    for t in tasks:
        counts[t["status"]] = counts.get(t["status"], 0) + 1

    open_bundle = next((b for b in state.get("bundles", []) if b.get("status") in ("planning", "in_progress", "review")), None)

    lines = []
    lines.append(f"# ShowX Task Dashboard")
    lines.append("")
    lines.append(f"_Last rendered: {datetime.now(timezone.utc).isoformat(timespec='seconds')}_")
    lines.append("")
    lines.append("## Status counts")
    lines.append("")
    lines.append("| Status | Count |")
    lines.append("|---|---|")
    for status in ["queued", "in_progress", "done", "reviewing", "changes_requested", "blocked", "accepted"]:
        lines.append(f"| {status} | {counts.get(status, 0)} |")
    lines.append("")

    lines.append("## Open bundle")
    lines.append("")
    if open_bundle:
        lines.append(f"- **{open_bundle.get('bundle_id')}** — {open_bundle.get('title')} ({open_bundle.get('status')})")
        lines.append(f"- Tasks: {', '.join(open_bundle.get('tasks', []))}")
    else:
        lines.append("- _none_")
    lines.append("")

    lines.append("## Forge bandwidth")
    lines.append("")
    lines.append(f"- enabled: {scope.get('enabled', False)}")
    lines.append(f"- bundle: {scope.get('bundle_id', '—')}")
    lines.append(f"- allowed_task_ids: {', '.join(scope.get('allowed_task_ids', [])) or '—'}")
    lines.append("")

    lines.append("## Tasks")
    lines.append("")
    lines.append("| ID | Status | Title | Bundle |")
    lines.append("|---|---|---|---|")
    for t in sorted(tasks, key=lambda x: x.get("id", "")):
        lines.append(f"| {t.get('id','')} | {t.get('status','')} | {t.get('title','')} | {t.get('bundle','')} |")
    lines.append("")

    return "\n".join(lines)

def main() -> int:
    out = AE / "TASK_DASHBOARD.md"
    out.write_text(render())
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

### `scripts/agent_exchange_refresh_dashboard.py`

Wrapper used by runner scripts (forge_runner_service.sh + critic_runner_service.sh) — calls `render_dashboard.main()` so the runner doesn't import a Python module by path. Simply:

```python
#!/usr/bin/env python3
"""Runner-callable wrapper. Re-renders TASK_DASHBOARD.md."""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_dashboard import main

if __name__ == "__main__":
    raise SystemExit(main())
```

### `scripts/agent_exchange_estimate_split.py`

Adapted from `/Users/machintoshhd/Daniel-local/bridgeX/scripts/agent_exchange_estimate_split.py`. Helper that warns when a task spec's `estimated_size_lines` >= 700 and suggests subtask boundaries. Usage:

```
python scripts/agent_exchange_estimate_split.py docs/agent_exchange/queued/B001-010_module_loader_impl.md
```

```python
#!/usr/bin/env python3
"""Pre-emptive 700-line task split advisory.

Reads YAML frontmatter from a task spec, checks estimated_size_lines.
If >= 700, prints subtask split suggestion based on target_files clustering.
"""
from __future__ import annotations
import sys, re
from pathlib import Path

THRESHOLD = 700

def parse_frontmatter(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not m: return {}
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.strip().startswith("-"):
            k, _, v = line.partition(":")
            fm[k.strip()] = v.strip().strip('"')
    # crude: collect target_files list
    files = re.findall(r'^  - "([^"]+)"', m.group(1), re.MULTILINE)
    fm["target_files"] = files
    return fm

def suggest_split(fm: dict) -> list[str]:
    files = fm.get("target_files", [])
    # Group by top-level directory.
    groups: dict[str, list[str]] = {}
    for f in files:
        parts = f.split("/", 3)
        key = "/".join(parts[:3]) if len(parts) >= 3 else parts[0]
        groups.setdefault(key, []).append(f)
    suggestions = []
    for k, fs in groups.items():
        suggestions.append(f"- subtask: {k} ({len(fs)} file(s))")
    return suggestions

def main(path: str) -> int:
    text = Path(path).read_text()
    fm = parse_frontmatter(text)
    est = int(fm.get("estimated_size_lines", "0") or 0)
    if est < THRESHOLD:
        print(f"OK: {fm.get('id','?')} estimated {est} lines (< {THRESHOLD})")
        return 0
    print(f"WARN: {fm.get('id','?')} estimated {est} lines (>= {THRESHOLD}); consider splitting:")
    for s in suggest_split(fm):
        print(s)
    return 1

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]) if len(sys.argv) > 1 else 64)
```

All three scripts: Python 3.10+, no external deps, executable shebang. Mark executable in done report — `chmod +x` documented but not committed via git mode change (git will track via core.fileMode if configured). Forge: run `git update-index --chmod=+x` per file after creation.

## Refer to specs

- `docs/specs/protocol_dictionary.md` — parity scenarios will reference its address/payload shapes. Harness types here mirror the dispatcher message shape but stay structural.
- BridgeX scripts: `/Users/machintoshhd/Daniel-local/bridgeX/scripts/agent_exchange_refresh_dashboard.py` and `agent_exchange_estimate_split.py` — direct ancestors. Copy + path-adjust, don't rewrite from scratch.

## Test plan

CI workflow validation:
- Push to a feature branch → GitHub Actions runs all 6 jobs.
- typecheck failure → unit-tests + parity-tests + e2e-tests skip (via `needs:` gate).
- Coverage artifact is uploaded on every unit-tests run.

Parity harness:
- `pnpm test:parity` runs the example test → all 5 cases pass.
- Confirm harness handles `bridgex` target = `null` without throwing.

Dashboard scripts (manual, local, NOT in CI):
- `python scripts/render_dashboard.py` → writes `docs/agent_exchange/TASK_DASHBOARD.md`. Inspect output: status counts table present, open bundle section present, task list present.
- `python scripts/agent_exchange_estimate_split.py docs/agent_exchange/queued/B001-001_workspace_setup.md` → prints "OK: B001-001 estimated 250 lines".
- `python scripts/agent_exchange_refresh_dashboard.py` → re-runs the renderer; same output.

Forge should run these locally during this task and capture output in done report. Do NOT add the dashboard script as a CI step yet — it's runner-side, not CI-side.

## Out of scope

- Real BridgeX 0.3.x golden recordings (ShowX-2 populates `tests/parity/fixtures/`)
- Performance benchmark suite (ShowX-2 latency budget)
- macOS-specific CI runners (need for signed-DMG smoke tests — ShowX-6)
- DMG sign + notarize pipeline (ShowX-6)
- Coverage threshold enforcement (let Forge sketch it; no hard fail yet)
- Hooking dashboard scripts into LaunchAgent runners (Architect installs runners post-bundle, separate task)
- Branch protection rules / required-status-checks (Jindřich configures at repo settings level)

## Notes for Critic

- CI workflow uses `actions/checkout@v4`, `pnpm/action-setup@v3`, `actions/setup-node@v4`, `actions/upload-artifact@v4` — all current as of 2026. Pin major versions only; do NOT pin to commit SHAs (overkill for this stage).
- `cache: pnpm` on setup-node requires `pnpm/action-setup@v3` to run BEFORE it. Common ordering bug.
- `pnpm install --frozen-lockfile` is non-negotiable in CI. Catches dependency drift.
- Playwright `install --with-deps chromium` is OS-level; CI's ubuntu-latest needs it. Don't pull every browser — chromium only for now.
- Parity harness `sleepUntil` is naïve (real wall-clock setTimeout). Acceptable for skeleton; ShowX-2 may want to add a virtual-time mode. Note in done report.
- `compareOutputs` greedy matcher: tricky edge case — if expected[0] could match actual[0] or actual[1] within tolerance, greedy picks the first. Document this in a comment so ShowX-2 authors know to design scenarios with unambiguous matches.
- Python scripts: confirm shebang `#!/usr/bin/env python3` works on macOS + Linux. Type hints with `from __future__ import annotations` keep 3.10 compat.
- Dashboard renderer is intentionally minimal; deeper data (per-task durations, Critic round counts) is fine to add in follow-up tasks once state.json schema stabilizes.
- The estimate_split script is a HEURISTIC, not policy enforcement. It just prints a warning; Architect decides whether to actually split. Document accordingly.
- Confirm none of the three scripts hard-code `/Users/machintoshhd/...` paths — they must use `Path(__file__).resolve().parents[1]` for repo root. Easy slip from copying BridgeX originals.
