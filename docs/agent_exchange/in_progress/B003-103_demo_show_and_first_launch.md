---
id: "B003-103"
title: "Demo show fixture + first-launch picker (Demo / Open / New)"
type: "implementation"
estimated_size_lines: 500
priority: "P0"
depends_on: []
target_files:
  - "resources/demo-show/demo.showx/show.json"
  - "resources/demo-show/demo.showx/cuelists/cl_main.json"
  - "resources/demo-show/demo.showx/operators.json"
  - "resources/demo-show/demo.showx/routing.json"
  - "resources/demo-show/demo.showx/history.jsonl"
  - "resources/demo-show/README.md"
  - "src/main/src/ipc/showActions.ts"
  - "src/modules/cuelist-core/src/ui/FirstLaunchPicker.tsx"
  - "src/modules/cuelist-core/src/ui/RecentShowsList.tsx"
  - "src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx"
  - "src/modules/cuelist-core/src/document/demoFactory.ts"
  - "electron-builder.yml"
  - "electron-builder-unsigned.yml"
  - "tests/unit/modules/cuelist-core/document/demoFactory.test.ts"
  - "tests/unit/modules/cuelist-core/ui/FirstLaunchPicker.test.tsx"
acceptance_criteria:
  - "`resources/demo-show/demo.showx/` is a complete .showx package committed to git. Contains 25 cues across 3 departments (LX, SX, VIDEO), one compound cue (LX+SX), one group cue (parallel fire of 3 children), mix of triggers (manual, auto_follow, auto_continue with delay). Includes 3 sample devices (Eos console at 127.0.0.1:8000, QLab at 127.0.0.1:53000, dmxnet stub) and routing rules wired to those. README.md documents what's in the show."
  - "Demo show package is bundled inside the app distribution: electron-builder.yml + electron-builder-unsigned.yml both add `resources/demo-show/` to `extraResources` (read-only inside `.app/Contents/Resources/demo-show/`)"
  - "First-launch detection: if `PersistedStore.get('cuelist-core:last-opened-show')` is null AND there is no recent shows list, render `<FirstLaunchPicker />` as the panel's main content"
  - "FirstLaunchPicker shows THREE big cards (60vh height each on first launch):\n  1. **Open Demo Show** (left) — opens the bundled demo.showx in a writable copy at `~/Documents/ShowX/Demo Show.showx` (so the user can edit without modifying the read-only bundle). Subtext: \"A full sample show with 25 cues, 3 devices, and example routing. Best place to start.\"\n  2. **Open Existing Show** (middle) — opens system file picker to select a `.showx` package. Subtext: \"Browse to a .showx file you already have.\"\n  3. **Create New from Scratch** (right) — opens 'Save new show' dialog asking for path + show name. Creates empty .showx with one empty cuelist. Subtext: \"Start with a blank show.\""
  - "Each card has an icon (sips or unicode glyphs in 0.1: ▶ / 📁 / + ), title, subtext, and primary CTA button. Cards have hover state. Keyboard navigation: Tab cycles between cards, Enter triggers the active one"
  - "Open Demo flow: `ipcInvoke('cuelist-core:open-demo')` → main process copies `app.getPath('userData')/../Documents/ShowX/Demo Show.showx` (or platform-equivalent) from the bundle, opens it. If the destination already exists, prompt: 'Demo Show already exists — open existing or replace?'"
  - "After first launch, `FirstLaunchPicker` is replaced by `RecentShowsList` for subsequent launches. List shows last 5 opened shows (path, last-opened timestamp, cue count if available). Each item is a clickable row. Below the list: same three buttons (Open Demo, Open Existing, New) as compact pills"
  - "Recent shows list backed by `PersistedStore.get('cuelist-core:recent-shows') as Array<{path, last_opened_at, cue_count}>`. Updated on each show open + close. Capped at 10 entries; oldest evicted"
  - "Show menu in app menubar: File → Open Demo Show / Open... / Open Recent → [submenu] / New Show... — wired through same IPC handlers"
  - "`demoFactory.ts` exports `createDemoShow(): ShowJson` that builds the demo show programmatically (used in tests + initial bundle generation). Output is byte-stable for fixture commit"
  - "Tests: demoFactory returns expected shape (25 cues, 3 devices, 4 routing rules); FirstLaunchPicker renders 3 cards correctly; Open Demo flow copies to writable path; Open Demo idempotency (second click while already open in writable copy)"
  - "Full suite still passing; no regressions"
  - "TypeScript strict typecheck clean"
---

## Context

Opening ShowX 0.1 today shows an empty CuelistCorePanel with vague Open/New buttons. A first-time tester has nothing to click — no demo, no recent shows, no obvious "start here" affordance. Per Architect's user-journey audit, the first 60 seconds are pure friction.

This task fixes that. After install, the user gets a three-card picker:

```
┌──────────────────┬──────────────────┬──────────────────┐
│                  │                  │                  │
│       ▶          │       📁         │       +          │
│                  │                  │                  │
│   Demo Show      │  Open Existing   │   New From       │
│                  │                  │   Scratch        │
│   25 cues, 3     │   Browse .showx  │   Start blank    │
│   devices, mix   │   you already    │                  │
│   of triggers    │   have           │                  │
│                  │                  │                  │
│   [ Open Demo ]  │  [ Browse... ]   │   [ Create... ]  │
│                  │                  │                  │
└──────────────────┴──────────────────┴──────────────────┘
```

Best place to start is unambiguous; if you have a real show you brought, open it; if you want to start blank, do that.

For subsequent launches, recent shows take over but the three actions remain accessible as compact pills.

## Implementation notes

### Demo show content

Build via `createDemoShow()` in `demoFactory.ts`. Should cover:

- **3 departments**: LX, SX, VIDEO
- **25 cues** distributed:
  - Cues 1-5: Pre-show (manual, LX-only ambient lighting)
  - Cues 6-15: Act 1 (mix LX + SX, some auto_follow)
  - Cue 11 = COMPOUND (LX scene 47 + SX music cue) — labelled "Storm starts"
  - Cue 14 = GROUP (parallel fire of 3 child cues) — labelled "Battle climax"
  - Cues 16-25: Act 2 (LX + VIDEO heavy, some auto_continue with delay)
- **3 devices**: `lx_eos` (osc, 127.0.0.1:8000), `sx_qlab` (osc, 127.0.0.1:53000), `video_disguise` (osc, 127.0.0.1:9000)
- **4 routing rules**:
  - payload_type=lx_ref → lx_eos
  - tag_pattern="SX" → sx_qlab
  - tag_pattern="VIDEO" → video_disguise
  - default fallback to lx_eos (lowest priority)
- **operators.json** with 2 stations stubbed (SM + 1 LX operator) for "stations table populated" feel
- **history.jsonl** with 3 entries showing past mode transitions + 1 cue-fire (illustrative, no real run)

Content should be theatrical — labels like "Sunset", "Door slam", "Storm intensifies", "Curtain call". The aim is the demo feels like a real show, not a placeholder.

### Bundling

```yaml
# electron-builder.yml + electron-builder-unsigned.yml
extraResources:
  - from: resources/demo-show
    to: demo-show
    filter:
      - "**/*"
```

Inside the running Electron app:

```ts
const demoSrc = path.join(process.resourcesPath, 'demo-show', 'demo.showx')
```

### Writable copy on Open Demo

The bundled demo is read-only (inside .app). On Open Demo:

```ts
const userDocs = app.getPath('documents')
const destDir = path.join(userDocs, 'ShowX')
await fs.mkdir(destDir, { recursive: true })
const dest = path.join(destDir, 'Demo Show.showx')
if (existsSync(dest)) {
  const choice = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Open existing', 'Replace with fresh demo', 'Cancel'],
    message: 'Demo Show already exists',
    detail: 'You have an existing Demo Show. Open it (keep your edits) or replace with a fresh copy?',
  })
  if (choice.response === 2) return
  if (choice.response === 1) await fs.rm(dest, { recursive: true })
}
if (!existsSync(dest)) await fs.cp(demoSrc, dest, { recursive: true })
return openShowxPackage(dest)
```

### IPC channel layout

Add to `src/main/src/ipc/showActions.ts`:

- `cuelist-core:open-demo` → `{ path: string }` (after copy + open)
- `cuelist-core:open-file-picker` → opens dialog, returns `{ path } | { cancelled: true }`
- `cuelist-core:create-new` → opens save dialog, creates empty .showx
- `cuelist-core:recent-shows-get` → `Array<{path, last_opened_at, cue_count}>`
- `cuelist-core:recent-shows-clear` → removes all recents (for testing)

### Menu wiring

In `src/main/src/Shell.ts` or wherever the app menu is built (add if not present):

```ts
{
  label: 'File',
  submenu: [
    { label: 'Open Demo Show', click: () => ipcMain.emit('cuelist-core:open-demo') },
    { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => /* file picker */ },
    { label: 'Open Recent', submenu: buildRecentSubmenu() },
    { type: 'separator' },
    { label: 'New Show...', accelerator: 'CmdOrCtrl+N', click: () => /* new */ },
  ]
}
```

### FirstLaunchPicker styling

Use existing design tokens — warm cream + deep teal accent. Three equal-width cards on desktop; stack on narrow widths. Icons can be Lucide React or simple Unicode glyphs in 0.1 (▶ 📁 + ) — icons can be polished post-pilot.

### RecentShowsList behavior

```tsx
{recentShows.length > 0 ? (
  <>
    <h2 className="section-label">Recent shows</h2>
    {recentShows.slice(0, 5).map(s => <RecentShowRow show={s} onOpen={...} />)}
    <div className="mt-8 flex gap-4">
      <Pill onClick={openDemo}>Demo show</Pill>
      <Pill onClick={openFile}>Open existing...</Pill>
      <Pill onClick={createNew}>New show...</Pill>
    </div>
  </>
) : <FirstLaunchPicker />}
```

## Notes for Critic

- Verify demo show is byte-stable (createDemoShow output equals committed demo.showx contents to bit)
- Verify Open Demo handles existing-destination gracefully (3 choices: open / replace / cancel)
- Verify recent shows persists across restarts via PersistedStore
- Verify file picker can be cancelled cleanly without crashing
- Verify FirstLaunchPicker keyboard navigation works (Tab cycles, Enter triggers)
- Out of scope: demo show updates between releases (currently each release ships its own demo; user's writable copy can drift)
- Non-blocking flag: icons in cards — Unicode glyphs OK for 0.1; future polish task to use Lucide

## Why this matters

Without B003-103, the entire user journey starts with confusion. With it, the journey is: install → launch → see "Open Demo" prominently → click → 25-cue show ready → press Q + Space → see GO fire → workflow understood in 60 seconds.

Single most important onboarding investment in the bundle.
