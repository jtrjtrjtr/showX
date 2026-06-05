# Contributing

ShowX is a private XLAB project built by a three-Claude team (Architect / Forge / Critic) with Jindřich Trapl as the user-approval gate. This page covers contributor hygiene — what every role agrees to before pushing code.

If you have not read `agent-exchange-workflow.md`, read that first. It defines who you are and which scope you can touch.

## 1. Role-specific hard limits

Inherited from `CLAUDE.md` and `docs/agent_exchange/WORKFLOW.md`.

### Architect

- NO production source code edits (except explicit rescue mode authorized by Jindřich).
- NO `git push` to remote without explicit user OK.
- NO deploy / DMG sign / Supabase production push without user OK.
- NO LaunchAgent install (except during initial bootstrap with explicit authorization).
- YES — operational reads (`pnpm typecheck`, `pnpm test`, `pnpm status`) authorized on demand.
- YES — `claude_runner_scope.json` edits at discretion.
- YES — bundle planning, task spec authoring, decision notes.

### Forge (Implementer)

- NO architectural decisions — those go to `docs/agent_exchange/decisions/2026-06-05_open_questions_architect.md` for Architect to ratify with Jindřich.
- NO tasks outside `claude_runner_scope.json.allowed_task_ids`.
- NO self-review (Critic owns review).
- NO scope expansion mid-task.
- YES — app code, tests, done reports per the task spec.
- YES — refactor inside task scope.

### Critic

- NO production code edits.
- NO behaviour edits.
- NO scope changes.
- YES — independent review of Forge artefacts in `done/`.
- YES — verdict: `accepted` / `changes_requested` / `blocked` written to `reviews/`.

## 2. Branching strategy

ShowX uses **trunk-based development**:

- `main` is the integration branch. Always green (typecheck + test + lint).
- Feature work happens in **short-lived branches** named `forge/<task-id>-<slug>` (e.g. `forge/B001-001-workspace-setup`).
- One branch per task. Merge to `main` via PR after Critic accepts.
- **No long-lived feature branches.** If a task gets large, split it.

Forge convention:

```bash
git checkout main
git pull
git checkout -b forge/B001-001-workspace-setup
# do work
git add <specific files>     # NOT `git add -A` — avoid sensitive files
git commit -m "..."
git push -u origin forge/B001-001-workspace-setup
# open PR; Critic reviews; merge to main; delete branch
```

Architect branches (rescue mode):

- Named `architect/rescue/<task-id>` so they're distinguishable in logs.
- Subject to extra scrutiny in PR review (Jindřich's explicit OK is the gate).

## 3. Commit message conventions

ShowX uses Conventional Commits with a project-specific scope.

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | When |
|---|---|
| `feat` | new feature visible to module authors / operators |
| `fix` | bug fix |
| `refactor` | code change that neither adds feature nor fixes bug |
| `test` | test-only change |
| `docs` | docs-only change |
| `chore` | tooling, deps, config |
| `perf` | performance improvement with measurement |
| `revert` | revert a previous commit |

### Scopes

Use the module or service name, or `shell` for the Electron core, or `pwa` for the station UI, or `docs` for documentation, or `ci` for GitHub Actions.

Examples:

```
feat(eventx-bridge): port wordcloud handler with state-snapshot dedup
fix(output-dispatcher): refcount race on simultaneous claim+release
refactor(shell): extract Logger into separate file
test(cuelist-core): cover REHEARSAL→SHOW snapshot path
docs(dev): add module-sdk worked example
chore(deps): bump zod 3.22 → 3.23
```

### Body

- Why, not what (the diff says what).
- Cite the task ID: `Implements task B001-002.`
- Cite the spec section that motivates the change: `Per docs/specs/module_loader.md §3.4.`
- Wrap at 72 chars.

### Footer

- `Co-Authored-By:` for multi-author commits.
- `Refs:` for related issues / decisions: `Refs: docs/agent_exchange/decisions/2026-06-05_showx_1_foundation_opened.md`.

### Example

```
feat(eventx-bridge): port wordcloud handler with state-snapshot dedup

Migrates bridgex/src/handlers/wordcloud.ts verbatim into
src/modules/eventx-bridge/handlers/wordcloud.ts. Preserves the silent
state-snapshot dedup behaviour locked by parity test PT-003.

Per docs/specs/bridgex_absorption.md §5 and §6.

Implements task B002-003.

Refs: docs/agent_exchange/bundles/ShowX-2-eventx-bridge-module.md
```

## 4. Pre-commit checklist

Before pushing ANY branch, the three gates:

```bash
pnpm typecheck       # MUST be green
pnpm lint            # MUST be green
pnpm test            # MUST be green
```

For module changes:

```bash
pnpm test --filter @showx/module-<slug>
```

For parity-sensitive changes (anything in `src/modules/eventx-bridge/`):

```bash
pnpm test:parity
```

If you ran tests via `pnpm --filter`, also run the root `pnpm test` once before committing to catch cross-package breakage.

### Pre-commit hooks (optional)

Forge and Architect can install a Husky-style pre-commit hook that runs `pnpm typecheck && pnpm lint`. Tests are deliberately NOT in the pre-commit hook (too slow); they run in CI on push.

```bash
# .git/hooks/pre-commit
#!/bin/sh
set -e
pnpm typecheck
pnpm lint
```

## 5. Code style

### Formatting

- **Prettier** is the source of truth. `.prettierrc` is shared workspace-wide.
- Run `pnpm prettier --write <file>` or configure VS Code to format on save.
- 2-space indent. Single quotes. Trailing commas. Semicolons mandatory.

### Linting

- **ESLint** via `eslint.config.mjs` (flat config).
- `@typescript-eslint/recommended-type-checked` baseline.
- `noUnusedLocals` + `noUnusedParameters` from `tsconfig.base.json` (strict).
- Unused params: prefix with `_` (e.g. `function init(_ctx: ModuleContext)`).

### TypeScript style

- **NodeNext module resolution** — use explicit `.js` extensions in imports even for `.ts` source.
- **Discriminated unions** preferred over inheritance for shapes like `Payload`, `Trigger`, `TransportDescriptor`.
- **`unknown` over `any`** for unvalidated external data; use Zod to narrow.
- **Module-level state forbidden** in module `index.ts` files (see `docs/specs/module_loader.md` §8 — hot-reload constraint).
- **No top-level side effects** in module entries.
- **Avoid `as` casts** outside Zod parse boundaries. If you need an assertion, leave a `// TODO: replace with type guard` comment.

### React style (PWA + module UI)

- Functional components only.
- Hooks rules enforced by `eslint-plugin-react-hooks`.
- Co-locate component-specific styles via CSS modules (`Panel.module.css`) or Tailwind utility classes (TBD which we pick in PWA bootstrap — see `B001-012`).
- Test components with `@testing-library/react`.

### File naming

- `kebab-case.ts` for everything except React components (`PascalCase.tsx`).
- Test files: `<name>.test.ts` (NOT `.spec.ts`).
- Types: `types.ts` for module-internal; `src/types/<name>.ts` for public contracts.

## 6. Where decisions live

```
docs/agent_exchange/decisions/
├── 2026-06-05_open_questions_architect.md  ← canonical aggregator
├── 2026-06-05_showx_1_foundation_opened.md
├── 2026-MM-DD_<topic>.md
└── ...
```

Decisions follow a fixed template:

```markdown
# <Topic>

**Date:** YYYY-MM-DD
**Status:** ratified | open | superseded by <other decision>
**Owners:** Architect, Jindřich

## Context

[Why we needed to decide]

## Decision

[What we decided]

## Consequences

[What changes; what's enabled; what's now forbidden]

## Alternatives considered

[Other options + why they lost]

## References

- Linked specs
- Linked tasks
- Prior decisions
```

If your task spec or done report invokes a decision, **cite it by file path** so the chain stays auditable.

## 7. Open questions process

When you (Forge, Critic, or Architect) discover a question that requires Architect / Jindřich ratification:

1. **Don't make the decision yourself.** Forge especially: if a spec is ambiguous, file an open question.
2. **Add a `### Q<N>. <Question title>` section** to `docs/agent_exchange/decisions/2026-06-05_open_questions_architect.md` (the canonical aggregator).
3. Include in the question:
   - The source spec section
   - The options
   - The spec's default recommendation (if any)
   - What downstream task / module / bundle depends on the answer
4. Tag it `(needed by ShowX-<N>)` so urgency is visible.
5. Continue with the default recommendation if non-blocking. Flag the assumption explicitly in your done report so Critic + Architect can reverse it if needed.

Architect surfaces open questions during `/sync-state` and works them through with Jindřich.

## 8. Sensitive files — do NOT commit

- `.env`, `.env.production`, `.env.local` — anything with secrets.
- `secrets.enc`, `bridgex-session.enc`, `showx-session.enc`.
- macOS Keychain exports.
- `*.p12`, `*.cer`, `*.key`.
- Anything in `~/Library/Application Support/ShowX/`.

`.gitignore` should already cover these. Double-check before `git add -A` (or better: avoid `-A` and add files explicitly).

If you ever accidentally commit a secret, do NOT just delete it in a follow-up commit (git history retains). File a P0 task to rotate the secret + use `git filter-repo` to scrub history. Notify Jindřich immediately.

## 9. License + attribution

- **License:** Proprietary (XLAB). Terms TBD pre-public-beta (Q4 2027 target).
- **Copyright:** All source files carry implicit XLAB copyright; no per-file header required.
- **Third-party code:** any vendored library or dependency licensed under MIT / Apache-2 / ISC / BSD is fine; GPL / AGPL / proprietary needs explicit Architect approval before being added to `dependencies`.
- **AI attribution:** when a commit is generated by a Claude agent, the commit footer may include `Co-Authored-By: Claude <noreply@anthropic.com>` — this is standard practice in the agent-exchange flow and acceptable.

When ShowX reaches public beta (Q4 2027), an OSS-core vs. closed-source decision will be ratified by Architect + Jindřich. Until then, treat all code as proprietary.

## 10. Reporting bugs

- **Bugs that block your task:** add a note to your done report; let Critic flag during review.
- **Bugs in committed code:** file a task spec under `docs/agent_exchange/queued/` with `type: "fix"` and explicit acceptance criteria (e.g. "regression test in tests/unit/X.test.ts passes").
- **Bugs that need Architect attention:** decision note in `docs/agent_exchange/decisions/`.
- **External-tool / customer-reported bugs (BridgeX 0.3.x customers in particular):** route through Margaret + Jindřich; not all bugs are ShowX bugs.

## 11. Performance regressions

If you suspect your change regressed performance:

1. Run `pnpm test:parity` — PT-034 (latency p95) and PT-035 (memory soak) are budgeted gates.
2. If PT-034 fails, you have either (a) a real regression or (b) the baseline needs updating. Real regressions block merge; baseline updates require Architect + decision note.
3. Add a focused benchmark next to your change (in `tests/perf/`, when present).

## 12. Documentation expectations

When you change behaviour:

- **Update the spec** if the change is canonical (`docs/specs/*.md`). Architect-owned; flag for ratification.
- **Update the dev doc** if the change affects how contributors / module authors / integrators interact with the system (`docs/dev/*.md`).
- **Add an inline TSDoc comment** on every new exported symbol.

```typescript
/**
 * Refcounts a transport destination so multiple modules share one socket.
 *
 * @param destination The transport endpoint to claim.
 * @param slug Slug of the module claiming. Tracked for conflict reporting.
 * @returns Token to release when the module disowns the destination.
 */
export function claim(destination: TransportDestination, slug: string): ClaimToken;
```

## 13. Further reading

- `agent-exchange-workflow.md` — three-Claude team coordination
- `getting-started.md` — local setup + common commands
- `testing-and-ci.md` — test gates that decide your PR
- `module-sdk.md` — write a new module
- `docs/agent_exchange/WORKFLOW.md` — canonical workflow (binding)
- `CLAUDE.md` — project DNA (root) and `~/.claude/CLAUDE.md` (user-global)
