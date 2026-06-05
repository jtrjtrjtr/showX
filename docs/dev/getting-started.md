# Getting Started

This page covers local dev setup. It does NOT cover signing / notarizing DMG (that's `docs/specs/bridgex_absorption.md` §8 and the deploy runbook, not in scope here).

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | `>= 20.0.0` | Required by root `package.json` `engines` block. Electron 32 ships its own Node, but tooling needs Node 20 for ESM + WebSocket support. |
| **pnpm** | `8.15.0` (exact) | Pinned via root `packageManager` field. `pnpm` workspace resolves `src/main`, `src/modules/*`, `src/shared`, `pwa`. |
| **macOS** | recommended for Electron development | Linux works for Node-only services and PWA dev; Electron features (signing, Keychain SecretStore, OS MIDI ports) are macOS-first. Windows + Linux ports of ShowX are not in MVP scope. |
| **git** | any modern | The repo uses standard git; no LFS / submodule tricks. |
| **Python 3** | 3.10+ | Required for `scripts/_run_with_timeout.py` (LaunchAgent wrapper). Not required for daily dev. |

Optional extras for full E2E:

| Tool | Why |
|---|---|
| Xcode Command Line Tools | Needed by `@julusian/midi`, `bufferutil`, `utf-8-validate` native modules. Install with `xcode-select --install`. |
| Playwright browsers | `pnpm exec playwright install` after first install for E2E. |
| `keytar` (auto-installed) | macOS Keychain access for `SecretStore`. First run prompts for permission. |

## 2. Clone and install

```bash
git clone <your-fork-or-the-repo>
cd showX

pnpm install         # installs root + every workspace package
```

`pnpm install` resolves the workspace (`pnpm-workspace.yaml`):

```yaml
packages:
  - "src/main"
  - "src/modules/*"
  - "src/shared"
  - "pwa"
```

The first install downloads Electron (~150 MB), `@julusian/midi` native binaries, and Vite + React for the PWA. Plan ~3 minutes on a fresh checkout with good bandwidth.

## 3. Workspace structure overview

```
showX/
├── package.json               ← root workspace + dev scripts
├── pnpm-workspace.yaml        ← workspace globs
├── tsconfig.base.json         ← shared TS config
├── src/
│   ├── main/                  ← Electron main process (pnpm pkg: showx-main)
│   ├── modules/<slug>/        ← each module is its own pnpm package
│   ├── shared/                ← code shared main ↔ modules
│   └── types/module.ts        ← public Module / ModuleContext contract
├── pwa/                       ← React 18 + Vite station UI (pnpm pkg: showx-pwa)
├── tests/
│   ├── unit/                  ← Vitest
│   ├── e2e/                   ← Playwright
│   └── parity/                ← BridgeX 0.3.x byte-parity harness
├── docs/
│   ├── specs/                 ← binding specs (read first)
│   ├── dev/                   ← these dev docs
│   └── agent_exchange/        ← Architect / Forge / Critic coordination
├── scripts/                   ← LaunchAgent runners, helper Python
└── launchagents/              ← macOS LaunchAgent plists (Forge + Critic)
```

See `architecture.md` §"What lives WHERE in the repo" for a fuller annotated tree.

## 4. Common commands

All commands from the repo root unless noted.

### Typecheck

```bash
pnpm typecheck
```

Runs `tsc --noEmit` recursively through every workspace package. This is the most useful gate before committing — TS errors here mean Forge/Critic will reject the change.

### Tests

```bash
pnpm test                # Vitest one-shot
pnpm test:watch          # Vitest watch mode
pnpm test:e2e            # Playwright (boots a stub ShowX + drives PWA)
pnpm test:parity         # BridgeX 0.3.x byte-parity harness
```

Vitest configuration lives in each workspace package. The root script delegates to `vitest run`. For per-package tests:

```bash
pnpm --filter showx-main test
pnpm --filter @showx/module-eventx-bridge test
```

### Lint

```bash
pnpm lint
```

ESLint config is shared (`eslint.config.mjs` at root). Auto-fix:

```bash
pnpm lint --fix
```

### Dev servers

```bash
pnpm dev:electron        # boots the Electron main + a hot-reloading window
pnpm dev:pwa             # boots the Vite PWA dev server (browser at :5173)
```

For end-to-end work you usually want both running in two terminals. The PWA dev server points at `http://localhost:5300` for sync (the Electron shell's asset server / sync broker default port). If you started Electron on a non-default port, set `VITE_SHOWX_HOST=http://localhost:<port>` in the PWA env.

### Build

```bash
pnpm build               # production build of every workspace package
```

This does NOT produce a DMG. DMG signing is `scripts/build-mac.sh` (post-MVP; see `docs/specs/bridgex_absorption.md` §8). Production builds are NOT auto-deployed.

## 5. Recommended IDE setup

VS Code with these extensions:

- **TypeScript** (built-in — make sure you select "Use Workspace Version" if it prompts; pinned to TS 5.4 by `package.json`).
- **ESLint** (`dbaeumer.vscode-eslint`).
- **Prettier** (`esbenp.prettier-vscode`) — `.prettierrc` is shared workspace-wide.
- **Vitest** (`vitest.explorer`) — run individual tests from the gutter.

`tsconfig.base.json` enables strict mode + `noUnusedLocals` + `noUnusedParameters`. Forge runs with these flags on; if the IDE shows green and CI shows red, check that you really did select workspace TS version (`Cmd+Shift+P` → "TypeScript: Select TypeScript Version").

## 6. Troubleshooting common pitfalls

### "TS6059: File is not under 'rootDir'"

Symptom: `tsc` complains a source file in another workspace package is outside `rootDir`.

Cause: TypeScript NodeNext module resolution rejects cross-package imports of `.ts` source files. Workspace packages must import each other via the package name (e.g. `import type { Module } from '@showx/types'`), not relative `../../other-package/src/...`.

Fix: add the target as a `workspace:*` dependency in your package's `package.json` and import by name. Make sure the target package builds first (or exports `types` from `package.json`).

### "Cannot find module './foo' or its corresponding type declarations"

Symptom: an `import './foo'` works in dev but fails on `pnpm build`.

Cause: NodeNext ESM resolution requires explicit `.js` extensions even for `.ts` source. (Yes, you write `.ts` but import `.js` — TypeScript will resolve correctly during compile.)

Fix: change `import './foo'` to `import './foo.js'`. This is mandatory in any file that ends up bundled by Vite or compiled by `tsc` with `module: NodeNext` / `module: ESNext`.

### Electron main fails to find a native module (`@julusian/midi`, `keytar`)

Cause: Electron uses a different Node ABI than the system Node. Native modules need to be rebuilt against Electron's headers.

Fix: `pnpm rebuild` or, if that fails, `npx electron-rebuild` from inside `src/main/`. On Apple Silicon, set `npm_config_arch=arm64` before install.

### `pnpm install` fails with EACCES near `~/Library/Keychains/`

Cause: `keytar` post-install tries to read your Keychain. If the FileVault prompt was missed, install bails.

Fix: re-run `pnpm install` and click "Allow" / type your password when macOS prompts. To avoid the prompt in CI, set `SHOWX_SKIP_KEYTAR=1` (the SecretStore falls back to an encrypted file under `~/Library/Application Support/ShowX/secrets.enc`).

### Port 5300 already in use

Cause: a prior ShowX process is still running (and probably its LaunchAgent restarted it).

Fix:

```bash
lsof -i :5300                 # find the PID
launchctl stop com.xlab.showx-forge-runner   # if Forge is running
kill <pid>                    # or `pkill -f 'showx-main'`
```

For dev-only, override the port via `SHOWX_PORT=5301 pnpm dev:electron`.

### Vitest "ESM cannot import CJS"

Cause: a dependency ships CJS but is imported as ESM under our `module: ESNext` config.

Fix: add the offending package to `vitest.config.ts` under `optimizeDeps.include` and `server.deps.inline`. As a last resort, dynamic `import()` inside an async test setup.

### "ENOENT: no such file or directory, .showx/show.json" in tests

Cause: a test forgot to create the temporary `.showx` directory bundle.

Fix: use the helper `tests/helpers/make_temp_show.ts` (when present) or write a minimal `show.json` + `cuelists/main.json` to a `tmp` dir before the test runs. See `cuelist-data-model.md` §"Code snippets" for the minimal valid shape.

## 7. Where to file issues

ShowX is a private XLAB project (proprietary; license TBD pre-public-beta Q4 2027). For internal coordination:

- **Bug or behaviour question:** open an issue in the GitHub repo if configured, otherwise post in `#showx` chat with a minimal repro.
- **Task you want Forge to pick up:** file a task spec under `docs/agent_exchange/queued/<ID>_<slug>.md` and update `docs/agent_exchange/state.json` to add the task. See `agent-exchange-workflow.md`.
- **Architectural decision needed:** open question goes in `docs/agent_exchange/decisions/2026-06-05_open_questions_architect.md` (the canonical aggregator). Architect reviews next session.

## 8. Read next

- `architecture.md` — system-level mental model
- `module-sdk.md` — write your first module
- `agent-exchange-workflow.md` — how task specs reach you and how done reports flow back
- `testing-and-ci.md` — test patterns + parity harness
