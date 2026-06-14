---
id: "B007-006"
title: "Caller playback engine + cue-lights subscription + fallback"
status: "done"
owner: "forge"
started_at: "2026-06-14T07:00:00Z"
ended_at: "2026-06-14T08:00:00Z"
review_round: 1
---

## Files changed

- `src/main/src/ipc/channels.ts` — Added `CALLER_MEDIA_MANIFEST: 'caller:media:manifest'`.

- `src/main/src/ipc/callerBridge.ts` — Added imports (`path`, `fs`, `pathToFileURL`, `CallerManifest`, `CallerMediaEntry` from preGenerate). Added `CALLER_MEDIA_MANIFEST` IPC handler: reads `{pkgPath}/media/caller_manifest.json` from disk, enriches each entry with an absolute `file://` URL via `pathToFileURL()`, and returns the enriched manifest. Returns `null` if no active show or manifest file does not exist. This lets the renderer play audio directly from local files without any network hop.

- `pwa/src/lib/callerAudio.ts` — NEW: `CallerAudio` class — the playback engine. Constructor injects `sideChannel` (subscribe-only interface), `getManifest` (async IPC call), and optional `_createAudio` factory (for testing). Subscribes to `standby.broadcast` + `go.dispatched` on construction. On `standby.broadcast (standby=true)`: cancels stale standby, resolves first available dept standby file from manifest, plays via injected/default `new Audio(url)`, updates state to `playing-standby`. On `standby=false`: cancels and returns to `idle`. On `go.dispatched`: skips historic events, cancels current, plays go file, updates state to `playing-go`. Missing manifest entries → `no-audio` state (visual indicator, never blocks show). Disabled → all events no-op. State transitions notified via `onStateChange` listeners. `destroy()` unsubscribes and stops playback. Exported types: `CallerManifestPWA`, `CallerMediaEntryPWA`, `MockableAudio`, `CallerAudioState`, `CallerSideChannel`, `CallerAudioOpts`.

- `pwa/src/components/caller/CallerPlayer.tsx` — NEW: React component. Props: `sideChannel`, `getManifest`, `defaultEnabled`. Creates `CallerAudio` engine on mount (destroyed on unmount). Toggle button switches enabled state. When enabled: shows state label (`Ready` / `Standby ▶` / `GO ▶` / `No audio`) with colour coding and a `⚠` tooltip indicator when in `no-audio` state. Uses `data-testid` attributes throughout for testability.

- `tests/unit/pwa/callerAudio.test.ts` — NEW: 16 tests across 5 describe groups:
  - standby plays correct dept file; aggregate (multi-dept) plays first available; stale standby cancelled; `standby=false` cancels + idles; missing audio → no-audio state
  - go plays correct go file; historic go ignored; missing go → no-audio state
  - disabled → zero audio; disable after enable stops playback + silences further events
  - state transitions: `onended` returns to idle; `onStateChange` fires on each transition
  - manifest loading: fetched once on first enable; null manifest → no-audio; events before setEnabled → silent

## Tests run

```
Test Files  166 passed (166)
     Tests  2117 passed (2117)
  Duration  13.31s
```

New tests: 16 (callerAudio.test.ts).

## Decisions made

- **IPC returns file:// URLs**: The main process enriches manifest entries with `pathToFileURL()` absolute URLs before returning to renderer. This avoids the renderer needing pkgPath and keeps file access in the main process.

- **Standby aggregate = first available dept**: When `standby.broadcast` carries multiple departments, the engine plays the first dept's audio that exists in the manifest. For compound cues (B007-002), all dept standby texts are identical, so the choice is arbitrary. No separate aggregate audio file needed.

- **Historic go.dispatched silenced**: Events with `historic: true` (> 5s old, set by SideChannelClient) are ignored at the engine level. This prevents replaying past audio on reconnect.

- **`as unknown as MockableAudio` cast**: `HTMLAudioElement.onended` types with `(this: GlobalEventHandlers, ev: Event) => any` which is incompatible with `(() => void) | null`. The cast is safe: at runtime HTMLAudioElement accepts no-arg callbacks for `onended`. The cast is limited to one line inside `createAudio()`.

- **CallerPlayer not wired into ShellRouter**: Target files don't include ShellRouter.tsx. The component is complete and self-contained; shell integration is a 2-line mount in B007-007 or architect wiring.

- **No preload additions**: The renderer can reach `CALLER_MEDIA_MANIFEST` via the existing `window.showxApi.cuelistCore.invoke(...)` generic bridge. No preload changes required.

## Notes for Critic

- `pnpm -r typecheck` clean (all 5 workspaces). `pnpm --filter showx-pwa build` clean (no node:* leak, 272 modules transformed). All 2117 tests pass.
- `CallerPlayer.tsx` is dependency-injection-friendly: `sideChannel` and `getManifest` are props. Shell mounts it with the active SideChannelClient (however it's provided to the shell renderer). Device selection (B007-008) and interrupt (B007-007) extend this component.
- Fallback behavior documented in `no-audio` state: visual `⚠` indicator + tooltip tells operator to run pre-gen. Never blocks the show — no exception thrown, no promise rejection bubbles.
- The shell renderer WebSocket connection (how it gets a SideChannelClient) is a pre-existing architecture concern scoped to B007-007/008 integration. CallerPlayer is ready to accept any conforming `CallerSideChannel`.
