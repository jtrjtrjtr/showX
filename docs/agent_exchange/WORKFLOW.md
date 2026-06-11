# ShowX — WORKFLOW (canonical)

> **Status:** ⭐ Single source of truth pro multi-agent ekosystem ShowX.
> **Inspirace:** BridgeX workflow (přímý parent — 2026-06-05 absorpční pivot).
> **Mandatory read at every Architect session start.**

---

## 1. Team & Roles

Three-Claude team. Každá role má jasně vymezený cognitive scope.

| Role | Model | Runtime | Owns | Does NOT |
|---|---|---|---|---|
| **Architect** | Opus | User's Claude Code CLI (`ShowX Architect` chat nebo hub session) | Talks to Jindřich. Plánování, task specs, bundle approvals, decision notes, scope edits (`claude_runner_scope.json`), Tier 1-4 rescues, dashboard maintenance, memory updates. | Produkční kód (mimo rescue mode), deploy, scope expansion bez user OK, LaunchAgent install (mimo bootstrap autorizovaný Jindřichem). |
| **Forge** (Implementer) | Sonnet | LaunchAgent `com.xlab.showx-forge-runner` (every 4 min) | App code, tests, done reports pro IDs v `claude_runner_scope.json`. Stops automaticky když bundle complete nebo scope disabled. | Self-review, architektonická rozhodnutí, tasky mimo approved scope. |
| **Critic** | Opus | LaunchAgent `com.xlab.showx-critic-runner` (every 4 min) | Independent review `done/` artefactů. Píše `reviews/`. Verdikt: `accepted` / `changes_requested` / `blocked`. Čte kód + diff + testy; nikdy nečte Forge reasoning chain. Ověřuje proti `docs/specs/` akceptačním kritériím. | Produkční kód, behaviour edits, scope changes. |
| **Approval (User)** | — | Jindřich (jindrich.trapl@xlab.cz) | Spec ratifikace, scope expansion, deploy approvals, real production changes, LaunchAgent install (mimo bootstrap). | — |

---

## 2. Coordination model — file-based, pull-based

Žádný shared runtime, žádné push notifikace. Všechny role koordinují přes repo files v `docs/agent_exchange/`:

```
state.json                  → THE coordination signal (task lifecycle)
claude_runner_scope.json    → které IDs Forge + Critic smí běžet
queued/<ID>_*.md            → task spec (Architect píše)
in_progress/<ID>_*.md       → moves here když Forge picks up
done/<ID>_*.md              → done report (Forge / Architect rescue píše)
reviews/<ID>_*.md           → Critic review
decisions/YYYY-MM-DD_*.md   → ratifikace, bundle closures, architektonické poznámky
bundles/ShowX-<N>-*.md      → bundle definitions (cíl + queueable tasks)
logs/                       → runner logs
TASK_DASHBOARD.md           → auto-rendered (script every 4 min)
WORKFLOW.md                 → this file
```

---

## 3. Task lifecycle

Status enum (per `state.json` `tasks[].status`):

```
queued → in_progress → done → reviewing → accepted
                              ↓
                              changes_requested → in_progress → done → ...  (max 5 cycles)
                              ↓
                              blocked  ← Architect intervention needed
```

| Status | Owner | Next transition |
|---|---|---|
| `queued` | (no owner) | Forge picks up if ID in scope → `in_progress` |
| `in_progress` | Forge subprocess | Forge napíše kód + testy + done report → `done` |
| `done` | (awaits Critic) | Critic reviews → `accepted` / `changes_requested` / `blocked` |
| `changes_requested` | Forge | Forge revises → `done` (max 5 cycles) |
| `blocked` | (Architect intervention) | Architect rescues / escalates |
| `accepted` | (terminal) | — |

**Forge serializes** — pouze ONE task in_progress per LaunchAgent tick. `state.json` drives pickup order.

### Subprocess timeout

Forge runner + Critic runner subprocess timeout = **1200 sekund** (20 min). Hard-coded v `scripts/forge_runner_service.sh` a `scripts/critic_runner_service.sh`. Bumps require nový Implementer task.

### Pre-emptive split advisory

Task specs include `estimated_size_lines:` in YAML frontmatter. Architect splits tasks ≥ 700 lines pre-emptively into atomic subtasks (Pattern 8 z BridgeX).

---

## 4. Task spec format

Task spec v `queued/<ID>_<slug>.md` má YAML frontmatter + markdown body:

```markdown
---
id: "B001-001"                  # bundle-id-task-id format
title: "Module loader implementation"
type: "implementation"          # implementation | spec | test | docs | refactor
estimated_size_lines: 400
priority: "P0"                  # P0 critical | P1 high | P2 normal
depends_on: ["B001-000"]        # other task IDs (optional)
target_files:                   # files this task will create/modify
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

[Anything Forge should NOT do]
```

---

## 5. Done report format

Forge writes `done/<ID>_<slug>_done.md` with:

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

[Any small judgment calls Forge made]

## Notes for Critic

[Anything Critic should look at first]
```

---

## 6. Review format

Critic writes `reviews/<ID>_<slug>_review.md`:

```markdown
---
id: "B001-001"
critic_started_at: "2026-06-15T10:25:00Z"
critic_completed_at: "2026-06-15T10:35:00Z"
verdict: "accepted"             # accepted | changes_requested | blocked
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

[Why accepted/changes_requested/blocked]
```

---

## 7. Bundle definition format

Architect defines bundles in `docs/agent_exchange/bundles/ShowX-<N>-<slug>.md`:

```markdown
---
bundle_id: "ShowX-1"
title: "Foundation"
status: "in_progress"            # planning | in_progress | review | complete
opened_at: "2026-06-05T22:00:00Z"
goal: "Bootstrap ShowX repo + Electron shell + module loader + initial PWA + scaffold infrastructure"
tasks: ["B001-001", "B001-002", ..., "B001-008"]
---

## Why this bundle

[Strategic context]

## Tasks

[Bulleted list with brief descriptions]

## Definition of done (bundle)

[What "ShowX-1 complete" means]
```

---

## 8. Hard limits (per role)

### Architect
- ❌ NO production source code edits (mimo explicit rescue mode)
- ❌ NO git push to remote without explicit user OK
- ❌ NO deploy / DMG sign without user OK
- ❌ NO LaunchAgent install (mimo bootstrap autorizovaný Jindřichem)

### Forge
- ❌ NO architectural decisions
- ❌ NO tasks outside `claude_runner_scope.json.allowed_task_ids`
- ❌ NO self-review
- ❌ NO scope expansion mid-task

### Critic
- ❌ NO production code edits
- ❌ NO behaviour edits
- ❌ NO scope changes

---

## 9. Scope management

`claude_runner_scope.json` controls which task IDs Forge + Critic may pick up:

```json
{
  "enabled": true,
  "bundle_id": "ShowX-1",
  "allowed_task_ids": ["B001-001", "B001-002", "B001-003"],
  "rationale": "ShowX-1 Foundation bundle — Forge focuses on module loader + Electron shell + PWA scaffold first",
  "updated_at": "2026-06-05T22:30:00Z",
  "updated_by": "architect"
}
```

Architect edits this file to:
- Add new task IDs as the bundle progresses
- Disable Forge (`enabled: false`) when bundle complete or emergency stop
- Switch to next bundle when previous is `accepted`

---

## 10. References

- Parent workflow: `../bridgeX/docs/agent_exchange/WORKFLOW.md` (direct ancestor — ShowX absorbs BridgeX)
- Sister workflow: `../eventx/docs/agent_exchange/WORKFLOW.md`
- Binding strategy: `../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`
- MVP scope: `../xlab-strategy/docs/showx_mvp_scope.md`
- Module architecture: `../xlab-strategy/docs/showx_module_architecture.md`

## E2E gate (binding od ShowX-3.6, per Jindřich 2026-06-11)

Každý bundle MUSÍ obsahovat finální architect-owned verifikační task (`type: verification`, `owner_hint: architect`):
1. Plný typecheck + test suite zelené
2. Production build (`pnpm build` + PWA build) + DMG + instalace do /Applications
3. Proklik klíčových flows NA INSTALOVANÉ aplikaci (browser stanice + shell okno), včetně OSC capture kde relevantní
4. Evidence (logy, capture, screenshoty) v bundle close decision

Bundle nelze uzavřít bez tohoto tasku. Rationale: 3.4 (3 post-accept rescues) + 3.5 (4 rescues — mj. GO nikdy nemohl projít, rozbitý prod build) — unit testy + Critic review nechytají wiring-level bugy.

### E2E gate dodatek (2026-06-11 večer, po 3.6 layout regresi)
Gate MUSÍ zahrnovat vizuální prohlídku screenshotů lidským/architektovým okem — testid asserty layout regrese nechytí (3.6: prohozené grid sloupce prošly gate, Jindřich je našel za 5 minut).
