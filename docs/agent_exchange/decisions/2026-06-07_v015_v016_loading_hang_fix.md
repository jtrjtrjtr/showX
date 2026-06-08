# v0.1.5 + v0.1.6 — Loading hang root cause + fix

**Project:** ShowX
**Date:** 2026-06-07 22:00 CEST
**Type:** Architect rescue (debugging + source fixes + DMG rebuild)
**Source thread:** Continuation of session_close_20260607 handoff doc `~/Daniel/memory/session_handoff_20260607_showx_debugging.md`

---

## Symptom

v0.1.4 DMG hung on "Loading…" indefinitely. Per handoff doc, top hypothesis was Vite externalizing cuelist-core UI imports (H1). Diagnosis disproved that — source map showed all components in bundle.

## Diagnosis path

1. Extracted packed app.asar, grepped for component symbols → 0 hits in production JS (misleading: names are minified).
2. Source map inspection → `FirstLaunchPicker.tsx`, `CuelistCorePanel.tsx`, `RecentShowsList.tsx` ARE in sources. H1 disproven.
3. Launched packed app with `--remote-debugging-port=9222 --remote-allow-origins=*` and connected via Python CDP client.
4. Probe revealed `typeof window.showxApi === 'undefined'`.
5. Re-ran probe with `Page.reload` and full event capture → caught the error:

```
Unable to load preload script: .../ui/preload.js
Error: require() of ES Module ... preload.js not supported.
Instead change the require of preload.js in null to a dynamic import() which is available
```

6. Also caught in main process stderr: `module.import.failed cuelist-core: SyntaxError: The requested module './dist/CuelistCore.js' does not provide an export named 'default'`
7. And: `module.manifest.invalid cuelist-core: transports[0..3] expected string, received object`

## Root causes (three, all independent)

### Cause A — Preload ESM/CJS mismatch
Electron 29 loads preload scripts via `require()`. ESM `.js` files (where parent package.json declares `type: module`) cannot be `require()`'d — Node throws and Electron silently swallows. Result: `contextBridge.exposeInMainWorld('showxApi', ...)` never runs, `window.showxApi` is `undefined`, `ShellRouter.createIpcBridge()` throws, `ipcBridge` is `null`, line 50 (`if (!ipcBridge || !state) return <Loading />`) returns Loading forever.

Per Electron 29 ESM docs, preload ESM requires `.mjs` extension OR conversion to CommonJS.

### Cause B — Manifest schema mismatch
`src/main/src/moduleLoader/types.ts` ModuleManifestSchema declares `transports: z.array(z.string()).optional()`.
`src/modules/cuelist-core/manifest.json` had `transports: [{ "kind": "osc-out" }, ...]` (object form, BridgeX heritage).
Zod validation failed → module marked manifest_invalid → not loaded.

### Cause C — Cuelist-core default export = class, not instance
Loader check: `typeof mod.default.init !== 'function'`. CuelistCore is a class; `init` is a prototype method — `typeof Class.init === 'undefined'`. Loader rejects.
`src/modules/cuelist-core/src/index.ts` exported `CuelistCore as default` (class).

Surfaced because Cause B previously blocked module load before reaching Cause C. Once Cause B fixed (v0.1.5), Cause C surfaced.

## Fixes

### Fix A — preload .mjs
- `src/main/src/Shell.ts:170` — `preloadFilePath()` now returns `ui/preload.mjs`.
- `src/main/package.json` — build script: `tsc && cp dist/ui/preload.js dist/ui/preload.mjs`.
- electron-builder picks up `.mjs` automatically (files map copies entire `dist/`).

### Fix B — manifest.json transports
- `src/modules/cuelist-core/manifest.json` — `transports: ["osc-out", "midi-out", "msc-out", "webhook-out"]`. Removed `permissions`, `min_shell_version` (not in loader schema; ignored anyway).

### Fix C — default export = instance
- `src/modules/cuelist-core/src/index.ts` — added `export default new CuelistCore()`. Class still exported as named for tests/types.

## Verification

v0.1.6 DMG built, installed to `/Applications/ShowX.app`, launched with `--remote-debugging-port=9222`. CDP probe results:

- `typeof window.showxApi === 'object'` ✓
- `window.showxApi.shell` has 6 methods: getState, openDemo, openExisting, createNew, openRecent, onShowChanged ✓
- `await window.showxApi.shell.getState()` returns `{ kind: 'no-show', recentShows: [4 entries from earlier debugging sessions] }` ✓
- React root rendered `<h2>Recent shows</h2>` + button list — RecentShowsList component rendering correctly ✓
- Main process stderr: `cuelist-core init complete` → `cuelist-core started` (no module errors) ✓

## Outstanding

1. **New Show flow** not interactively retested in this session — Jindřich previously reported the dialog opened but submit produced no result. Worth manual retest now that preload + cuelist-core both work.
2. **Workspace import migration** (handoff doc Q2) — defer. Current relative path imports work; not blocking.
3. **Sandbox: false** — kept (per v0.1.4 fix). Re-enabling sandbox is a future Cause-A-style refactor (preload CJS conversion).

## Files changed

```
src/main/src/Shell.ts                          (preloadFilePath → .mjs)
src/main/package.json                          (build script + cp postbuild)
src/modules/cuelist-core/manifest.json         (transports: string array)
src/modules/cuelist-core/src/index.ts          (default export = instance)
package.json                                   (version 0.1.4 → 0.1.6)
electron-builder-unsigned.yml                  (version 0.1.4 → 0.1.6)
src/modules/cuelist-core/index.js              (shim — re-export default from dist/index.js, not CuelistCore.js)
```

## Build artifacts

- `dist-electron/ShowX-0.1.6-arm64.dmg` (102 MB, unsigned)
- `/Applications/ShowX.app` (installed for local testing)
- Marketing site `apps/marketing/public/ShowX-*.dmg` — **NOT yet updated**; pending Jindřich OK to deploy.

## Pattern observations

- **Three root causes stacked.** Fix A unblocked preload; Fix B unblocked module load; Fix C surfaced only after B was fixed. Iterative diagnosis essential — fixing B without A would still hang; fixing C without B would still hang.
- **CDP remote-debugging-port + Python client is the right tool** for packed Electron debugging. Avoids rebuilding to add DevTools instrumentation. `--remote-allow-origins=*` required for non-frontend WS clients.
- **Source map sources field is more reliable than minified bundle grep** when verifying Vite bundling. Component names get mangled in production but file paths are preserved.

---

**Architect:** Opus
**Authorization:** Explicit rescue mode per Jindřich 2026-06-07 22:00 ("Architect rescue — fixni hned")
