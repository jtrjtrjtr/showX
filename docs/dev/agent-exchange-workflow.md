# Multi-Claude Coordination — Agent Exchange Workflow

ShowX is built by a three-Claude team. This page is the developer view of that team — how they coordinate, what each role can and cannot do, and how to add work to the queue. The canonical workflow doc is `docs/agent_exchange/WORKFLOW.md`; when this page disagrees, that file wins.

## 1. The three roles

| Role | Model | Runtime | Owns | Does NOT |
|---|---|---|---|---|
| **Architect** | Opus | User's Claude Code CLI (Jindřich's chat or hub session) | Talks to Jindřich. Planning, task specs, bundle approvals, decision notes, scope edits, dashboard maintenance, memory updates, Tier 1-4 rescues. | Production code (except rescue mode), git push, deploy, LaunchAgent install (except bootstrap). |
| **Forge** (Implementer) | Sonnet | LaunchAgent `com.xlab.showx-forge-runner`, every 4 min | App code, tests, done reports for task IDs in `claude_runner_scope.json`. Stops automatically when bundle complete or scope disabled. | Self-review, architectural decisions, tasks outside approved scope. |
| **Critic** | Opus | LaunchAgent `com.xlab.showx-critic-runner`, every 4 min | Independent review of `done/` artefacts. Writes `reviews/`. Verdict: `accepted` / `changes_requested` / `blocked`. Reads code + diff + tests; **never** reads Forge's reasoning. Checks against `docs/specs/` acceptance criteria. | Production code, behaviour edits, scope changes. |
| **Approval (User)** | — | Jindřich (jindrich.trapl@xlab.cz) | Spec ratification, scope expansion, deploy approvals, real production changes, LaunchAgent install (except bootstrap). | — |

## 2. File-based coordination — no shared runtime

The three roles never see each other in real time. They coordinate exclusively through files in `docs/agent_exchange/`:

```
docs/agent_exchange/
├── WORKFLOW.md                  ← canonical workflow (binding)
├── STARTING_PROMPTS.md          ← prompt skeletons for each role
├── state.json                   ← THE coordination signal (task lifecycle)
├── claude_runner_scope.json     ← which IDs Forge + Critic may run
├── TASK_DASHBOARD.md            ← auto-rendered every 4 min
├── bundles/                     ← bundle definitions (ShowX-1, ShowX-2, ...)
├── queued/<ID>_<slug>.md        ← task specs awaiting Forge
├── in_progress/<ID>_<slug>.md   ← active tasks (moved from queued/ on pickup)
├── done/<ID>_<slug>_done.md     ← Forge done reports
├── reviews/<ID>_<slug>_review.md ← Critic verdicts
├── decisions/YYYY-MM-DD_*.md    ← architectural ratifications, bundle closures
└── logs/                        ← per-runner per-cycle logs
```

`state.json` is the single source of truth for task status. The runner LaunchAgents read it, pick the next runnable task, do the work, and write back.

## 3. Task lifecycle

```
queued → in_progress → done → reviewing → accepted
                              ↓
                              changes_requested → in_progress → done → ...  (max 5 cycles)
                              ↓
                              blocked  ← Architect intervention needed
```

| Status | Owner | Next transition |
|---|---|---|
| `queued` | (no owner) | Forge picks up if ID is in `claude_runner_scope.json` → `in_progress` |
| `in_progress` | Forge subprocess | Forge writes code + tests + done report → `done` |
| `done` | (awaits Critic) | Critic reviews → `accepted` / `changes_requested` / `blocked` |
| `changes_requested` | Forge | Forge revises → `done` (max 5 cycles before auto-block) |
| `blocked` | (Architect intervention) | Architect rescues / escalates |
| `accepted` | (terminal) | — |

**Forge serializes** — only ONE task `in_progress` per LaunchAgent tick. `state.json` drives pickup order.

### Subprocess timeout

Forge runner + Critic runner subprocess timeout = **1200 seconds** (20 min). Hard-coded in `scripts/forge_runner_service.sh` and `scripts/critic_runner_service.sh`. Bumps require a new Implementer task.

### Pre-emptive split advisory

Task specs include `estimated_size_lines:` in YAML frontmatter. Architect splits tasks ≥ 700 lines pre-emptively into atomic subtasks (Pattern 8 inherited from BridgeX).

## 4. Task spec format

```markdown
---
id: "B001-001"                       # bundle-id-task-id
title: "Module loader implementation"
type: "implementation"               # implementation | spec | test | docs | refactor
estimated_size_lines: 400
priority: "P0"                       # P0 critical | P1 high | P2 normal
depends_on: ["B001-000"]             # other task IDs (optional)
target_files:
  - src/main/module_loader.ts
  - src/types/module.ts
  - tests/unit/module_loader.test.ts
acceptance_criteria:
  - "Module loader can dynamically import a module from src/modules/{slug}/index.ts"
  - "Lifecycle hooks (init/start/stop/teardown) called in correct order"
  - "Failed module load isolated; doesn't crash ShowX shell"
  - "Vitest unit tests pass for happy path + 3 failure modes"
---

## Context

[1-2 paragraphs: what's this task and why]

## Implementation notes

[Specific guidance for Forge: which files, which deps, which patterns]

## Test plan

[Concrete tests Forge should write]

## Out of scope

[Anything Forge should NOT do — explicit non-goals]
```

The YAML frontmatter is mandatory; Forge parses it. Acceptance criteria are what Critic checks against — be specific and binary (`x can do y` or `tests pass`, not `x is good`).

## 5. Done report format

```markdown
---
id: "B001-001"
status: "done"
forge_attempt: 1
forge_started_at: "2026-06-15T10:00:00Z"
forge_completed_at: "2026-06-15T10:18:00Z"
files_changed:
  - "src/main/module_loader.ts"
  - "src/types/module.ts"
  - "tests/unit/module_loader.test.ts"
tests_run:
  command: "pnpm test src/main/module_loader"
  passed: 12
  failed: 0
---

## What I did

[Bullet list of changes]

## Diff summary

[Key code excerpts]

## Test results

[Output of test run]

## Decisions made within task scope

[Any small judgment calls Forge made — flag them so Critic notices]

## Notes for Critic

[Anything Critic should look at first]
```

## 6. Review format

```markdown
---
id: "B001-001"
critic_started_at: "2026-06-15T10:25:00Z"
critic_completed_at: "2026-06-15T10:35:00Z"
verdict: "accepted"               # accepted | changes_requested | blocked
review_round: 1
---

## Acceptance criteria check

- [x] Module loader can dynamically import a module from src/modules/{slug}/index.ts → src/main/module_loader.ts:42-58
- [x] Lifecycle hooks called in correct order → tests/unit/module_loader.test.ts:25
- [x] Failed module load isolated → src/main/module_loader.ts:72 wraps in try/catch
- [x] Vitest unit tests pass → 12 passed, 0 failed

## Code review notes

[Critic's independent reading of the diff]

## Verdict rationale

[Why accepted / changes_requested / blocked, with specific cites]
```

Critic **never reads Forge's done report reasoning**. Critic reads the spec, the actual code, the actual tests, and the actual test output. The Forge "Notes for Critic" section is a hint for where to look, not a justification.

## 7. Bundle definitions

A bundle is a group of related tasks shipped as one logical unit. ShowX bundles:

```markdown
---
bundle_id: "ShowX-1"
title: "Foundation"
status: "in_progress"             # planning | in_progress | review | complete
opened_at: "2026-06-05T22:00:00Z"
goal: "Bootstrap ShowX repo + Electron shell + module loader + initial PWA + scaffold infrastructure"
target_completion: "2026-07-31"
tasks: ["B001-001", "B001-002", ..., "B001-013"]
---
```

### Current bundle roadmap

| Bundle | Title | Status | Target | Notes |
|---|---|---|---|---|
| **ShowX-1** | Foundation | in_progress (2026-06-05) | 2026-07-31 | Bootstraps shell + module loader + shared services + PWA scaffold + parity harness skeleton. 13 tasks (`B001-001` ... `B001-013`). |
| **ShowX-2** | EventX Bridge Module — BridgeX 0.3.x Absorption | planned | 2026-12-31 | Absorbs BridgeX 0.3.x source code into `src/modules/eventx-bridge/`. Parity gate. 15 tasks (`B002-001` ... `B002-015`). |
| **ShowX-3** | Cuelist Core Module | planned | 2027-Q1 | Yjs document, REHEARSAL mode, per-department views. |
| **ShowX-4** | SHOW mode + Cloud Sync | planned | 2027-Q2 | Lock state machine, proposal queue, optional Supabase sync. |
| **ShowX-5** | Custom Router | planned | 2027-Q3 | WD-style rule table. |
| **ShowX-6** | PWA polish + customer migration tooling | planned | 2027-Q4 | Public 0.1 ship gate. |

Each bundle has a definition file under `docs/agent_exchange/bundles/`. ShowX-1 is the only one currently open; opening ShowX-2 requires ShowX-1 to be `accepted` and an Architect decision note.

## 8. LaunchAgent runners

Two macOS LaunchAgents on the FOH-development Mac:

```
launchagents/
├── com.xlab.showx-forge-runner.plist    ← every 4 min
└── com.xlab.showx-critic-runner.plist   ← every 4 min
```

Each plist runs `scripts/forge_runner_service.sh` / `critic_runner_service.sh`, which:

1. Reads `claude_runner_scope.json`.
2. If `enabled === true` and there is at least one runnable task in scope, spawns a Claude Code subprocess with the role prompt.
3. Subprocess timeout: 1200 s. After timeout, the subprocess is killed; logged as `subprocess_timeout`.
4. Writes a per-cycle log under `docs/agent_exchange/logs/`.

The LaunchAgents are installed by Jindřich during initial bootstrap (Architect cannot self-install per role discipline; see `feedback_architect_no_role_substitution.md`).

To stop / start manually:

```bash
launchctl stop com.xlab.showx-forge-runner
launchctl start com.xlab.showx-forge-runner
launchctl unload ~/Library/LaunchAgents/com.xlab.showx-forge-runner.plist
launchctl load ~/Library/LaunchAgents/com.xlab.showx-forge-runner.plist
```

For disabling without unloading (preferred while iterating):

```bash
# edit docs/agent_exchange/claude_runner_scope.json
{ "enabled": false, ... }
```

Next 4-minute tick reads this and exits without spawning.

## 9. Scope management

`claude_runner_scope.json` is the bandwidth knob:

```json
{
  "enabled": true,
  "bundle_id": "ShowX-1",
  "allowed_task_ids": ["B001-001", "B001-002", "B001-003"],
  "rationale": "ShowX-1 Foundation — focus Forge on workspace + types + Logger first",
  "updated_at": "2026-06-05T22:30:00Z",
  "updated_by": "architect"
}
```

Architect edits this file to:

- Add new task IDs as the bundle progresses (Forge can only work on listed IDs).
- Disable Forge (`enabled: false`) when bundle complete or for emergency stop.
- Switch to next bundle when previous is `accepted`.

Forge refuses to work on tasks NOT in `allowed_task_ids` even if they're `queued`. This is the primary cost control + scope discipline mechanism.

## 10. Architect rescue protocol

When Forge times out repeatedly on the same task (5+ failures, or 3+ subprocess timeouts), Architect may invoke **rescue mode**:

1. Architect explicitly asks Jindřich for rescue authorization.
2. With explicit OK, Architect edits the actual source files (against the normal "no production code" hard limit).
3. Architect writes a done report flagged with `forge_attempt: -1` (sentinel for rescue) + a decision note explaining why.
4. Critic reviews as usual.
5. Bundle dashboard records the rescue for transparency.

Rescue mode is exceptional, not routine. Repeated rescue use indicates either a too-large task (split it) or a missing spec (write it).

See `feedback_architect_no_role_substitution.md` — Architect does NOT routinely sub for Forge; gaps are flagged as extension tasks within Forge's domain.

## 11. How to add a new bundle / task

### Adding a task to an open bundle

1. **Identify the gap.** What can Forge build? Write the spec.
2. **Create `docs/agent_exchange/queued/B00X-NNN_<slug>.md`** with YAML frontmatter + acceptance criteria.
3. **Update `docs/agent_exchange/state.json`** — add the task entry with status `queued`.
4. **Update `docs/agent_exchange/claude_runner_scope.json.allowed_task_ids`** to include the new ID (if you want Forge to pick it up).
5. **Optionally update the bundle definition file** in `docs/agent_exchange/bundles/` to list the new task.

### Opening a new bundle

1. **Make sure the previous bundle is `accepted`** (or `complete` if the bundle has its own DOD).
2. **Write a decision note** in `docs/agent_exchange/decisions/YYYY-MM-DD_<bundle-id>_opened.md` — strategic context, dependencies, target completion.
3. **Create the bundle definition** in `docs/agent_exchange/bundles/ShowX-<N>-<slug>.md` with YAML frontmatter + task list.
4. **Update `state.json`** — set the new bundle to `in_progress`; add first wave of tasks.
5. **Update `claude_runner_scope.json`** — switch `bundle_id` + populate `allowed_task_ids` with the first wave only (drip-feed; don't pre-queue everything).
6. **Notify Jindřich** — bundle openings should be announced; he is the user-approval gate.

Forge picks up the new tasks on its next 4-minute tick. No manual restart needed.

## 12. Hard limits per role — at a glance

### Architect

- NO production source code edits (except explicit rescue mode authorized by Jindřich).
- NO `git push` to remote without explicit user OK.
- NO deploy / DMG sign without user OK.
- NO Supabase production push without user OK.
- NO LaunchAgent install without user OK (except during initial bootstrap with explicit authorization).
- YES — operational reads (typecheck, test, status) authorized on demand.
- YES — scope edits (`claude_runner_scope.json`) at Architect's discretion.
- YES — bundle planning + decision notes.

### Forge

- NO architectural decisions.
- NO tasks outside `claude_runner_scope.json.allowed_task_ids`.
- NO self-review (Critic owns review).
- NO scope expansion mid-task.
- YES — app code, tests, done reports per task spec.
- YES — refactor inside task scope.

### Critic

- NO production code edits.
- NO behaviour edits.
- NO scope changes.
- YES — independent review of Forge artefacts.
- YES — verdict: accepted / changes_requested / blocked.

## 13. Open questions process

When a spec needs Architect / Jindřich ratification:

1. Add a `### Q<N>. <Question title>` section to `docs/agent_exchange/decisions/2026-06-05_open_questions_architect.md` (the canonical aggregator).
2. Include: the source spec, the options, the spec's default recommendation, what depends on the answer.
3. Tagged for the next Architect session. Architect surfaces during `/sync-state`.

Don't pile up open questions on Forge — file them as decisions and let Architect work them with Jindřich.

## 14. Further reading

- `docs/agent_exchange/WORKFLOW.md` — canonical workflow (binding)
- `docs/agent_exchange/STARTING_PROMPTS.md` — role prompts
- `docs/agent_exchange/bundles/ShowX-*.md` — bundle definitions
- `docs/dev/contributing.md` — branching, commit conventions, code style
- `~/.claude/projects/-Users-machintoshhd-Daniel-local/memory/feedback_architect_no_role_substitution.md` — why Architect doesn't routinely sub for Forge
