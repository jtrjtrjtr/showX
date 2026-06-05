---
id: "B001-001"
title: "Workspace + TypeScript + ESLint setup"
type: "implementation"
estimated_size_lines: 250
priority: "P0"
depends_on: []
target_files:
  - "src/main/package.json"
  - "src/main/tsconfig.json"
  - "src/shared/package.json"
  - "src/shared/tsconfig.json"
  - "pwa/package.json"
  - "pwa/tsconfig.json"
  - "pwa/vite.config.ts"
  - "pwa/index.html"
  - "eslint.config.mjs"
  - ".prettierrc.json"
  - "vitest.config.ts"
  - "playwright.config.ts"
acceptance_criteria:
  - "pnpm install runs cleanly at repo root"
  - "pnpm typecheck passes (no source code yet, but tsc --noEmit on each workspace succeeds)"
  - "pnpm test runs (no tests yet — exit cleanly)"
  - "pnpm lint runs (no source — exits clean)"
  - "Each workspace package has its own tsconfig.json extending tsconfig.base.json"
  - "PWA workspace uses Vite + React preset; main + shared use Node ESM target"
  - "ESLint config in eslint.config.mjs uses flat config format with TypeScript + React parsers"
  - "Prettier config: 2-space indent, single quotes, trailing comma, semi: true"
  - "Vitest config runs tests from tests/unit/ + each workspace src/"
  - "Playwright config skeleton (e2e dir = tests/e2e)"
---

## Context

ShowX repo is freshly bootstrapped. Forge needs to set up the pnpm workspace structure so subsequent tasks can install dependencies and write code. This is purely scaffolding — no application logic.

The workspace has FOUR packages:
- `src/main` — Electron main process (Node ESM, TypeScript)
- `src/shared` — code shared between main + modules + (some) PWA (TypeScript types-mostly)
- `src/modules/*` — module packages (will be added by later tasks; B001-001 only sets up the workspace shape, not specific modules)
- `pwa` — React PWA frontend (Vite + TypeScript)

## Implementation notes

### `src/main/package.json`

```json
{
  "name": "showx-main",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "showx-shared": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "typescript": "^5.4.0"
  }
}
```

### `src/main/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*"]
}
```

### `src/shared/package.json`

```json
{
  "name": "showx-shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

### `src/shared/tsconfig.json`

Same shape as src/main.

### `pwa/package.json`

```json
{
  "name": "showx-pwa",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "showx-shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

### `pwa/tsconfig.json`

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src/**/*"]
}
```

### `pwa/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: { outDir: 'dist', sourcemap: true },
});
```

### `pwa/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ShowX</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

(Note: `pwa/src/main.tsx` is NOT created in this task — B001-012 owns PWA bootstrap. B001-001 only creates the workspace package + Vite config so that `pnpm install` succeeds at root.)

### `eslint.config.mjs`

Flat config, TypeScript + React. Include rules: no-unused-vars (error), no-explicit-any (warn), prefer-const (error). Don't lint dist/, node_modules/, .pnpm-store/.

### `.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts', 'pwa/src/**/*.test.tsx'],
    environment: 'node',
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
```

### `playwright.config.ts`

Skeleton (no tests yet). Set testDir = 'tests/e2e', baseURL = 'http://localhost:5174'.

## Test plan

No application tests yet. The success criterion is that the toolchain assembles:

1. `pnpm install` — completes without error
2. `pnpm typecheck` — no errors (no source code, so tsc has nothing to fail on)
3. `pnpm lint` — no errors
4. `pnpm test` — vitest exits clean (no tests found is acceptable)

Run those four commands; capture output in done report.

## Out of scope

- Source code files (B001-002 onwards)
- pwa/src/main.tsx (B001-012)
- Module workspaces (added per module in ShowX-2+)
- GitHub Actions workflow (B001-013)
- Sign / notarize scripts
- Electron forge / electron-builder config

## Notes for Critic

- Verify each acceptance criterion with a command run
- Check `pnpm-workspace.yaml` at repo root includes `src/main`, `src/modules/*`, `src/shared`, `pwa`
- Ensure no production dependencies leaked into devDependencies
- Ensure all tsconfigs extend tsconfig.base.json
