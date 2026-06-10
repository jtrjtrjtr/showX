# ShowX-3.4 bundle open — Station Data Plane wiring

**Project:** ShowX
**Date:** 2026-06-08 ~14:50 CEST
**Bundle:** ShowX-3.4 (Station Data Plane — Y.Doc bridge + pairing show_id)
**Spawned from:** ShowX-3.3 close + v0.1.9 testing 2026-06-08 — found that PWA stations connect to empty SyncBroker doc, not to shell's ActiveShowDoc

---

## Why

After ShowX-3.3 wired shell-side IPC (Devices, Routing, ShowState), v0.1.9 live testing revealed the **PWA station mode hangs at "Loading show…"** even after successful pairing. Root cause:

- PWA connects to `ws://localhost:5300/yjs/<show_id>` after pairing
- `YWebsocketAdapter.getOrCreateDoc(name)` creates a NEW empty Y.Doc per room
- That doc is **completely separate** from the Y.Doc that `ActiveShowDoc` (B003-301) loaded from `.showx` package
- PWA waits for cuelist data in empty broker doc → forever
- Pairing claim response has no `show_id`, so PWA defaults to room `'default'` — wrong room entirely

The data plane between shell and stations was never connected. ShowX-3.3 built CRUD bridges to shell IPC for the shell's view of the doc — but stations were always intended to share the SAME doc via Yjs sync (LAN-first architecture per spec).

## Scope — 3 task specs

| Task | Title | LOC est. |
|---|---|---|
| **B003-401** | YWebsocketAdapter.attachDoc + ActiveShowDoc integration — broker serves shell's Y.Doc | ~150 |
| **B003-402** | Pairing claim returns active show_id; PairingView + StationRouter use it | ~120 |
| **B003-403** | Cuelist Core panel show_id awareness + reactive show-changed (PWA reconnects to new room when shell opens different show) | ~130 |

**Manual verification step (Architect, not Forge):** build v0.1.10 DMG, install, launch test launcher, pair PWA at `http://localhost:5300/pairing` with PIN 000000, open Demo Show in shell → verify SM master view shows 25 cues + GO button works.

## Architecture

**Shared Y.Doc pattern (B003-401):**

```
.showx package  →  ActiveShowDoc.open()
                       │
                       ├── reads show.json → extracts show_id
                       ├── loads Y.Doc D via openShowxPackage()
                       └── calls SyncBroker.attachDoc(show_id, D)

SyncBroker.attachDoc(name, D):
  ├── stores D in YWebsocketAdapter.docs map under name
  └── any subsequent /yjs/<name> upgrade serves D directly

PWA → ws://host:5300/yjs/<show_id>?token=...
  ├── token validated
  ├── adapter finds existing entry for show_id → returns D (shell's doc)
  ├── y-protocols sync: PWA receives full state of D
  ├── changes flow both ways through y-protocols
  └── ActiveShowDoc's update listener fires for saves
```

This means: when SM operator on iPad adds/edits a cue, the change propagates over Yjs to shell's D, shell's IPC observers (B003-302/303/304) fire `devices-changed` / `show-state` broadcasts. Single source of truth.

**show_id propagation (B003-402):**

```
Pairing flow:
  Shell IPC issues PIN → activeShow.getShowId() returns current pkgPath's show_id (or null)
  POST /api/pairing/claim → response now includes show_id
  PWA stores session.show_id from response
  StationRouter.buildConnectOpts uses session.show_id (already does, just needs to be populated)
  WebsocketProvider connects to /yjs/<show_id> → gets shell's actual doc
```

**Reactive show change (B003-403):**

Current PWA assumes show_id is static for session lifetime. But Jindřich's workflow could be: pair when no show, then open show in shell. Or close current show, open different one. PWA needs to react.

Option A: PWA subscribes to `cuelist-core/show-state` events over Yjs awareness, gets new show_id, reconnects to new room. Complex.

Option B: For ShowX-3.4 MVP, PWA reconnects on any 'show-state' notification it receives (via existing side-channel or new dedicated channel). Simple, but requires shell to push.

Recommend Option B for 3.4 — keep complexity low. Multi-show reconnection nuance can come post-Kongres.

## Out of scope (defer to ShowX-3.5+)

- Yjs awareness for live cursor/selection across operators
- Stations panel in shell showing connected SM/operator devices
- Health bus → PWA health indicator
- Stream Deck integration end-to-end test
- Cross-LAN station discovery (mDNS through router/firewall)

## Success criteria

- v0.1.10 DMG builds + installs
- `~/Desktop/ShowX Test.command` launches → browser opens at `/pairing`
- Pair with PIN 000000, role SM
- Shell window: open Demo Show
- Browser SM master view: shows "Main Show" cuelist with 25 cues
- Click GO button → OSC sends to test_eos (test device added in ShowX-3.3 testing)
- Editing cue in browser → shell's Show tab cueCount reflects update
- Tests: each task includes vitest unit coverage; B003-403 has playwright sanity test

## Bundle scope flag

```json
{
  "enabled": true,
  "bundle_id": "ShowX-3.4",
  "allowed_task_ids": ["B003-401", "B003-402", "B003-403"]
}
```

Serial dependency: B003-401 → 402 → 403. B003-401 unblocks the actual data flow; 402 routes PWA to right room; 403 makes it reactive.

---

**Architect:** Opus
**Bundle authorization:** Jindřich 2026-06-08 ("Spec ShowX-3.4 + Forge over night" implicit, Visa pitch posunut o 2 týdny → no time pressure)
