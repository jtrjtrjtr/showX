---
id: "B003-011"
title: "Cuelist Core module panel UI in Electron shell"
status: "done"
round: 1
forge_ended_at: "2026-06-06T22:30:00Z"
---

## Summary

Implemented the Cuelist Core Electron shell panel: 5 React components, design tokens, manifest patch, and 25 Vitest tests (all passing).

## Files changed

### New files
- `src/modules/cuelist-core/src/ui/tokens.ts` — ShowX design tokens (cream, ink, teal, red, gray palette + spacing/radius/font)
- `src/modules/cuelist-core/src/ui/StationsTable.tsx` — Awareness map table: presence dot, display_name, owned/watched dept chips, last_heartbeat relative time, SM-gated kick button
- `src/modules/cuelist-core/src/ui/StatusStrip.tsx` — Health indicator dot + file path + autosave status
- `src/modules/cuelist-core/src/ui/ShowFilePicker.tsx` — Open .showx / New show button pair
- `src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx` — Main panel: empty state, loaded state, ModeBadge, IPC subscriptions, error toast
- `src/modules/cuelist-core/src/ui/index.ts` — Default export `CuelistCorePanel` (lazy import target for `manifest.uiPanel`)
- `tests/unit/modules/cuelist-core/ui/CuelistCorePanel.test.tsx` — 16 tests across 5 describe groups
- `tests/unit/modules/cuelist-core/ui/StationsTable.test.tsx` — 9 tests

### Modified files
- `src/modules/cuelist-core/src/manifest.ts` — Added `uiPanel: () => import('./ui/index.js')`
- `src/modules/cuelist-core/tsconfig.json` — Added `"jsx": "react-jsx"` (required for .tsx UI files)
- `src/modules/cuelist-core/package.json` — Added `react`, `react-dom`, `@types/react`, `@types/react-dom` to devDependencies

## Tests run

```
Test Files  2 passed (2)
     Tests  25 passed (25)
  Duration  880ms
```

All 25 tests pass. Test files use `// @vitest-environment jsdom` and explicit `afterEach(cleanup)` for DOM isolation.

### Test coverage
- CuelistCorePanel — empty state (5 tests): Open/New buttons render, empty state copy, no Cuelist h2, IPC channels called correctly
- CuelistCorePanel — populated state (4 tests): title/venue/date, cuelist name/count, REHEARSAL/SHOW badge color
- CuelistCorePanel — mode toggle (3 tests): badge disabled for non-SM, enabled for SM, transition-mode IPC called with correct target
- CuelistCorePanel — error toast (1 test): alert rendered on IPC reject
- CuelistCorePanel — health indicator (2 tests): unknown default, updates on health event
- StationsTable (9 tests): empty state, 3-station render, dept chips, presence dot aria-label, kick button visibility (SM / non-SM), onKick callback, kick count per station, header columns

## Decisions within task scope

1. **Inline styles throughout** — PWA scaffold (B001-012) uses plain CSS, no CSS Modules or styled-components configured in Vite. Inline styles avoid any bundler configuration changes and keep the panel self-contained.

2. **`Awareness` interface defined in `StationsTable.tsx`** — spec defines it inline in that component; exported from `index.ts` for external use.

3. **`IpcBridge` interface exported from `CuelistCorePanel.tsx`** — renderer-side callers need the typed IPC bridge shape; exporting from the component file keeps it co-located.

4. **`tsconfig.json` + `package.json` updated** — necessary infrastructure change for `.tsx` files to typecheck in the cuelist-core package. Noted here because they're outside `target_files` list. `react`/`@types/react` added as devDependencies (not peer deps, since this is a workspace package whose tests run via root vitest).

5. **`manifest.ts` patch** — explicit instruction in task spec to patch `manifest.uiPanel`; no `// uiPanel registered in B003-011` comment left behind.

## Notes for Critic

- **No GO button anywhere in this panel.** Shell-side GO is a spec hazard; panel contains only file management, mode toggle, and station admin.
- **ModeBadge**: `disabled={!isSm}`, `cursor: not-allowed` when non-SM, `aria-label` with descriptive mode + toggle hint.
- **All IPC channels** follow `cuelist-core/<verb>` naming convention: `get-state`, `show-state`, `stations`, `health`, `pick-show-file`, `open-show`, `new-show-flow`, `transition-mode`, `kick-station`.
- **Panel imports**: `CuelistCorePanel.tsx` imports from `./tokens.js`, `./ShowFilePicker.js`, `./StationsTable.js`, `./StatusStrip.js` only — no imports from cuelist-core main-process internals.
- **StatusStrip** has `aria-label` on health dot; `ModeBadge` has `aria-label` with mode + SM gating hint; `StationsTable` has aria-label on presence dot.
- **Tables** have `<thead>` with header rows for Name, Owned, Watched, Last seen columns.
- **Empty state**: centered CTA with "Open .showx" + "New show" + copy "Open a show file or create a new one to start."
