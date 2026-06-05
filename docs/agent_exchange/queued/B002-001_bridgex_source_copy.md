---
id: "B002-001"
title: "BridgeX 0.3.x source copy + workspace setup for eventx-bridge module"
type: "implementation"
estimated_size_lines: 250
priority: "P0"
depends_on: []
target_files:
  - "src/modules/eventx-bridge/package.json"
  - "src/modules/eventx-bridge/tsconfig.json"
  - "src/modules/eventx-bridge/README.md"
  - "src/modules/eventx-bridge/src/legacy/**"
  - "pnpm-workspace.yaml"
acceptance_criteria:
  - "Directory `src/modules/eventx-bridge/` exists and registers as a pnpm workspace member (already covered by `src/modules/*` glob in pnpm-workspace.yaml; verify on `pnpm install`)"
  - "`src/modules/eventx-bridge/package.json` declares `name: '@showx/module-eventx-bridge'`, `type: 'module'`, `private: true`, workspace dep on `showx-shared`, and runtime deps `@supabase/supabase-js@^2`, `osc@^2.4.4`, `@julusian/midi@^3.5.x`, `dmx-ts@^1.x`, `ws@^8`, `pino@^9`"
  - "`src/modules/eventx-bridge/tsconfig.json` extends `../../../tsconfig.base.json`, sets `composite: true`, `outDir: dist`, references `showx-shared`"
  - "`src/modules/eventx-bridge/src/legacy/` contains a verbatim copy of every file currently under `~/Daniel-local/bridgeX/bridgex/src/` (preserving subdirectories: adapters, aggregation, calibration, channels, cli, coalesce, dev, handlers, inputs, listener, mapping, outputs, patterns, runtime, plus top-level `event-runtime.ts`, `main.ts`, `output-dispatcher.ts`, `session-tracker.ts`, `health-reporter.ts`, `periodic-state-push.ts`, `legacy-mode.ts`, `index.ts`)"
  - "Top-level `src/modules/eventx-bridge/src/legacy/README_LEGACY.md` documents the namespace marker: source is verbatim BridgeX 0.3.x; imports still use old relative paths and will be re-pathed in B002-003"
  - "`pnpm install` from repo root succeeds; `pnpm --filter @showx/module-eventx-bridge ls` shows the workspace"
  - "`pnpm --filter @showx/module-eventx-bridge typecheck` is allowed to FAIL at this stage (legacy code references things not yet ported); document this in done report"
  - "No edits to files outside `src/modules/eventx-bridge/` or `pnpm-workspace.yaml`"
---

## Context

ShowX-2 absorbs BridgeX 0.3.x into the `eventx-bridge` module. The first step is a mechanical, auditable source copy: bring BridgeX's `bridgex/src/` tree under `src/modules/eventx-bridge/src/legacy/` so subsequent tasks (B002-003, B002-004) can refactor in place rather than re-importing file by file. Keeping the original directory structure under a `legacy/` namespace marker preserves blame, makes the diff to BridgeX 0.3.x reviewable, and lets Critic verify byte-equality of the initial copy.

This task is **tooling only** — no behavioral changes, no rewrites. The module skeleton (`index.ts`, `manifest.ts`, `EventXBridge.ts`) is added in B002-002; import remapping happens in B002-003.

## Implementation notes

### Workspace registration

`pnpm-workspace.yaml` already includes `src/modules/*` (per B001-001). Verify after creating the directory that `pnpm install` from repo root picks up `@showx/module-eventx-bridge`. If pnpm requires an explicit re-install, run it once. Do NOT modify `pnpm-workspace.yaml` unless the glob fails (it should not).

### package.json shape

```json
{
  "name": "@showx/module-eventx-bridge",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "showx-shared": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "osc": "^2.4.4",
    "@julusian/midi": "^3.5.0",
    "dmx-ts": "^1.0.4",
    "ws": "^8.18.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.0.0",
    "zod": "^3.22.0"
  }
}
```

Pin versions to match `~/Daniel-local/bridgeX/bridgex/package.json` where possible (read the BridgeX package.json before writing this to capture exact pinned versions; if BridgeX uses `^3.5.0` for `@julusian/midi`, match it).

### tsconfig.json shape

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "tsBuildInfoFile": "tsconfig.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "src/legacy/**/*.test.ts"],
  "references": [
    { "path": "../../shared" }
  ]
}
```

Important: legacy `*.test.ts` files are excluded from typecheck for now (B002-003 ports tests forward properly). Keep the test files in `legacy/` for reference.

### Source copy

Use `cp -R`:

```bash
mkdir -p src/modules/eventx-bridge/src/legacy
cp -R ~/Daniel-local/bridgeX/bridgex/src/. src/modules/eventx-bridge/src/legacy/
```

Verify counts: should be approximately 6,240 LOC of production code across the directories listed in `docs/specs/bridgex_absorption.md` §2 (`adapters/`, `aggregation/`, `calibration/`, `channels/`, `cli/`, `coalesce/`, `dev/`, `handlers/`, `inputs/`, `listener/`, `mapping/`, `outputs/`, `patterns/`, `runtime/`, plus 9 top-level files).

Add `src/modules/eventx-bridge/src/legacy/README_LEGACY.md`:

```markdown
# Legacy BridgeX 0.3.x source — DO NOT IMPORT FROM SHELL CODE

This directory contains a verbatim copy of `~/Daniel-local/bridgeX/bridgex/src/`
at the commit pinned at BridgeX 0.3.23 freeze (post-Kongres 2026-06-17).

**Status:** Transitional. Files migrate out of `legacy/` into module-internal
locations in B002-003 (core), B002-004 (adapters → OutputDispatcher), and
subsequent tasks. When migration completes, this directory is deleted.

**DO NOT** import from `legacy/` in `EventXBridge.ts`, `manifest.ts`, or any
module-public surface. Refactor first, then import from the new location.

Source provenance: `bridgex-app@0.3.23`, `@bridgex/core@0.3.x`.
Migration plan: `docs/specs/bridgex_absorption.md` §3 Classification Matrix.
```

### README.md (module-level)

Brief module-level README at `src/modules/eventx-bridge/README.md` explaining what the module is and pointing to the absorption spec:

```markdown
# @showx/module-eventx-bridge

Free-tier ShowX module that absorbs BridgeX 0.3.x functionality. Subscribes
to EventX Supabase changes and dispatches semantic events to OSC / MIDI / DMX
/ webhook / WebSocket via the shell's shared OutputDispatcher.

- Migration plan: `../../../docs/specs/bridgex_absorption.md`
- Module loader contract: `../../../docs/specs/module_loader.md`
- Predecessor: `~/Daniel-local/bridgeX/` (frozen at 0.3.23)
```

### Source-copy verification

After copy, write a small note in the done report listing:
- File count copied (target: matches `find ~/Daniel-local/bridgeX/bridgex/src -type f | wc -l`)
- Total LOC copied (target: ≈ 6,240 production + tests)
- Any binary files skipped (should be none — `bridgex/src/` is all TS / TSX / test.ts)

## Test plan

This task has no behavioral tests. Verification is mechanical:

1. `pnpm install` from `~/Daniel-local/showX/` succeeds and lists `@showx/module-eventx-bridge` as a workspace member.
2. `pnpm --filter @showx/module-eventx-bridge ls` returns the module + its dependencies.
3. `pnpm --filter @showx/module-eventx-bridge typecheck` runs (allowed to error on legacy paths — capture stderr in done report; this is expected because legacy imports won't resolve until B002-003).
4. Spot-check that `src/modules/eventx-bridge/src/legacy/event-runtime.ts` is byte-equal to `~/Daniel-local/bridgeX/bridgex/src/event-runtime.ts` (use `diff`).
5. Spot-check `src/modules/eventx-bridge/src/legacy/adapters/osc-adapter.ts` is byte-equal.
6. Spot-check `src/modules/eventx-bridge/src/legacy/handlers/wordcloud.ts` is byte-equal.

## Out of scope

- Writing `index.ts` / `manifest.ts` / `EventXBridge.ts` module class (B002-002).
- Re-pathing imports in `legacy/` (B002-003).
- Adapter rewrites to shared OutputDispatcher (B002-004).
- Supabase subscriber wiring (B002-005).
- Rule engine (B002-006).
- Any deletions from `legacy/` (deferred to B002-003 cleanup pass).
- Touching `~/Daniel-local/bridgeX/` source (READ-ONLY for the copy).
- Editing `tsconfig.base.json` or any other workspace root config.

## Notes for Critic

- Verify `pnpm install` actually succeeds after this change (run it).
- Verify file count + LOC count match BridgeX 0.3.x source (`find ... | wc -l`, `wc -l ... | tail -1`).
- Confirm `README_LEGACY.md` documents the namespace marker.
- Confirm no shell code (`src/main/`) imports from `src/modules/eventx-bridge/src/legacy/`.
- Confirm `tsconfig.json` does NOT include `legacy/**/*.test.ts` (excluding `.test.ts` is fine; we'll port tests properly in B002-003).
- Look for accidental modifications to `~/Daniel-local/bridgeX/` (would show up if Forge ran `mv` instead of `cp`). The source repo MUST remain untouched.
