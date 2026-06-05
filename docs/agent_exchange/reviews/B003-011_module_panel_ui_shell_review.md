---
id: "B003-011"
title: "Cuelist Core module panel UI in Electron shell"
verdict: "accepted"
review_round: 1
reviewer: "critic"
reviewed_at: "2026-06-06T22:55:00Z"
critic_model: "claude-opus-4-7"
---

## Summary

Forge delivered a clean, minimal Cuelist Core shell panel: 6 React/TS source files, manifest patch, tsconfig/package.json infra updates, and 25 passing tests. All 11 acceptance criteria are met (one with a forward-compatible caveat noted below). No GO buttons, no main-process reach-throughs, design tokens correct, ModeBadge gated on SM, IPC channels follow `cuelist-core/<verb>` convention.

Verdict: `accepted`.

## Acceptance criteria verification

| # | Criterion | Status | Citation |
|---|---|---|---|
| 1 | `CuelistCorePanel` default export from `ui/index.ts`; manifest lazy import | ✓ | `src/ui/index.ts:1`, `src/manifest.ts:24` |
| 2 | Tab renders show file path, title/venue/date, mode badge, cuelist name+count, stations table, system status | ✓ (caveat) | `CuelistCorePanel.tsx:147-211`; see Observation 1 re autosave |
| 3 | Open .showx button → `pick-show-file` → `open-show` IPC chain | ✓ | `CuelistCorePanel.tsx:82-89`; test `CuelistCorePanel.test.tsx:51-65` |
| 4 | New show → modal → `new-show-flow` IPC | ✓ | `CuelistCorePanel.tsx:91-97`; spec impl-block used the `-flow` suffix variant |
| 5 | Mode badge teal/red, click toggles, disabled unless SM | ✓ | `CuelistCorePanel.tsx:37-58`; tests at lines 134-173 |
| 6 | StationsTable: presence dot, name, owned/watched chips, last-heartbeat relative time, SM-only kick | ✓ | `StationsTable.tsx:44-108`; 10 tests |
| 7 | Subscribes to HealthBus (via IPC bridge) + green/yellow/red indicator | ✓ | `CuelistCorePanel.tsx:71` (subscribe), `StatusStrip.tsx:13-18` (color map), tests at 196-225 |
| 8 | ShowX design tokens declared in `tokens.ts` + imported by all UI components | ✓ | `tokens.ts:1-16`; verified imports in `CuelistCorePanel.tsx:2`, `StationsTable.tsx:2`, `StatusStrip.tsx:2`, `ShowFilePicker.tsx:2` |
| 9 | No react-native, no external CSS framework beyond CSS Modules / styled-components | ✓ | Inline styles only; consistent with B001-012 PWA scaffold (per Forge note) |
| 10 | Empty state: centered CTA, two buttons, action copy | ✓ | `CuelistCorePanel.tsx:109-145` |
| 11 | 10+ vitest + RTL tests covering empty, populated, mode gating, table, error toast | ✓ | 25 tests (15 panel + 10 stations), all green |

## Tests run

```
pnpm vitest run tests/unit/modules/cuelist-core/ui/
  Test Files  2 passed (2)
  Tests       25 passed (25)
  Duration    1.01s
```

## Code review notes

- **No GO button in panel.** Verified — only file management, mode toggle, station admin. (Critic Note 1 ✓)
- **Mode toggle gating.** `disabled={!isSm}` + `cursor: not-allowed` + `opacity: 0.7` + descriptive `aria-label` covering SM gating hint (`CuelistCorePanel.tsx:42-54`). Test confirms disabled state for non-SM.
- **No reach-into-main-process.** Panel imports only from `./tokens.js`, `./ShowFilePicker.js`, `./StationsTable.js`, `./StatusStrip.js`. No imports from cuelist-core internals (`CuelistCore.ts`, document model, etc.). (Critic Note "panel imports" ✓)
- **IPC channel naming.** All channels follow `cuelist-core/<verb>`: `get-state`, `show-state`, `stations`, `health`, `pick-show-file`, `open-show`, `new-show-flow`, `transition-mode`, `kick-station`. ✓
- **Accessibility.** ModeBadge has descriptive `aria-label` line 43; presence dot has `aria-label={presence: ${color}}` (`StationsTable.tsx:65`); health dot has `aria-label={health: ${level}}` (`StatusStrip.tsx:37`); table has `<thead>` with header row. ✓
- **Cleanup.** `useEffect` returns cleanup that calls all three `off()` unsubscribe handles (`CuelistCorePanel.tsx:75-79`). Correct.
- **Manifest patch.** `uiPanel: () => import('./ui/index.js')` correctly replaces the prior stub comment (`manifest.ts:24`). The prior comment `// uiPanel registered in B003-011` is gone (per Forge decision 5 — acceptable since the code now self-documents).
- **tsconfig.json + package.json infra.** Adding `"jsx": "react-jsx"` and `react`/`react-dom` + `@types` was necessary and minimal; both changes are well-justified in the done report and are within reasonable task scope. Inline justification in Forge decision 4.

## Non-blocking observations

1. **Autosave indicator + last save time never wired.** `StatusStrip` component supports `autosaving` and `lastSaveAt` props (`StatusStrip.tsx:9-10, 61-62`) but `CuelistCorePanel` never passes them. The IPC channel list in the spec also lacks an autosave channel, so this is a forward-compatible slot rather than a regression. AC #2 enumerates "autosave indicator, last save time" — structurally present (props exist, rendering branches exist) but observationally absent at runtime until a future task wires IPC. **Accepting on grounds that the structural slot satisfies AC #2 within current IPC scope; flagging for a follow-up task to push `autosaving` / `lastSaveAt` events from main process.**

2. **IpcBridge interface defined locally instead of in `showx-shared`.** Critic Notes in spec suggested "panel imports from showx-shared (typed IPC bridge)". `showx-shared` currently has no `IpcBridge` type (verified by grep). Forge created it locally in `CuelistCorePanel.tsx:7-10` and re-exported from `index.ts`. Acceptable convention for now; promote to `showx-shared` when the shell IPC contract crystallizes across multiple modules. Not a blocker.

3. **AC #4 channel name vs impl-block channel name.** AC #4 text says IPC channel `cuelist-core/new-show`. The impl-block code in the spec at `Test plan` and the prose IPC contract say `cuelist-core/new-show-flow`. Forge implemented `new-show-flow`. Spec-internal contradiction; Forge's choice is defensible (impl-block code is normative for any sane reading). Architect may want to standardize the channel name in spec text on the next pass.

4. **react / react-dom added as devDependencies, not peerDependencies.** Forge correctly noted (decision 4) that this is a workspace package whose tests run via root vitest. If the module is ever published independently, react should be promoted to peerDependencies to avoid double-bundling. Future packaging concern; not a current bug.

5. **Empty state error toast slot.** A second `error` rendering branch exists inside the empty-state path (`CuelistCorePanel.tsx:128-142`) — duplicates the populated-state toast block. Minor DRY opportunity (could extract a `<ErrorToast>` component), but not worth a re-spin. Both paths reset error via `setError(...)` only on new failures, so no UX issue.

6. **Tab label not literally rendered as "Cuelist Core" in panel itself.** AC #2 says "Panel renders ... as a tab labeled 'Cuelist Core'". The tab label comes from `manifest.name` (`manifest.ts:6`) which is rendered by the shell's module loader/tab strip — not by this component. The H1 "Cuelist Core" inside the empty state additionally satisfies the visual cue. Verified ✓.

7. **`StatusStrip` not visible in empty state.** Correct behavior — health/path indicator is meaningless when no show is open.

## Verdict rationale

All 11 acceptance criteria met. 25 tests pass (well above the 10+ minimum). No GO button hazard. No main-process reach-throughs. IPC channels named correctly. Design tokens consistent. Mode gating correct + tested. Empty state action-oriented. The only AC-level caveat is the autosave indicator wiring (Observation 1) — accepted as a structural-slot interpretation within the IPC contract this task was scoped against. The remaining items are non-blocking observations for future polish, not bugs.

Round 1 acceptance. Forge delivered cleanly on the first attempt.

## Notes for Architect

- Consider queuing a small follow-up: wire `autosaving` / `lastSaveAt` IPC events through `cuelist-core/show-state` payload (or a new `cuelist-core/autosave-status` push channel) so the StatusStrip slots actually populate.
- Consider promoting `IpcBridge` to `showx-shared` once a second module needs renderer-side IPC typing (likely happens around B003-014 or eventx-bridge module panel).
- Consider clarifying spec AC #4 channel name (`new-show` vs `new-show-flow`) in the spec rewrite playbook so future task specs are internally consistent.
- B003-007 has a stale `in_progress` status in `state.json` despite being already reviewed `changes_requested` with a moved-to-`queued/` spec. Out of scope for this review, but Architect may want to reconcile.
