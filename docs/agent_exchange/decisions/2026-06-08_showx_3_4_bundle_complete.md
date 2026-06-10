# ShowX-3.4 bundle complete — Station Data Plane LIVE

**Project:** ShowX
**Date:** 2026-06-08 ~21:30 CEST
**Bundle:** ShowX-3.4 (closed)
**Duration:** 2026-06-08 15:00 → 21:30 CEST (~6h30m end-to-end)
**Decision opening this bundle:** `decisions/2026-06-08_showx_3_4_bundle_open.md`

---

## Outcome

End-to-end station mode WORKING in v0.1.13. Jindřich confirmed live: paired browser → SMMasterView shows Demo Show's 25 cues.

| Task | Title | Critic | Round |
|---|---|---|---|
| B003-401 | SyncBroker.attachDoc + ActiveShowDoc integration | accepted | r1 |
| B003-402 | Pairing claim returns active show_id | accepted | r2 |
| B003-403 | PWA reactive show-change polling | accepted | r1 |
| **Total Forge** | — | **3/3** | **avg 1.3** |

**Architect rescues during E2E live test (post-Forge work):**
1. **PWA StationRouter Y.Array vs Y.Map mismatch** — used `doc.getMap('cuelists')` but cuelist-core uses `Y.Array<Y.Map>`. Yjs throws "Type with name cuelists has already been defined with different constructor" → silent failure → "Loading show…" forever. Fix: `doc.getArray<Y.Map>('cuelists')` + `.get(0).get('id')`.
2. **PWA PairingView missing role/departments in session** — session JSON constructed without role/owned_departments/watched_departments, so StationRouter fell through to GenericOperatorView (no cues visible). Fix: spread these fields into PairedSession.
3. **Hardcoded test PIN '000000' lost** — Forge's Shell.ts rewrite during ShowX-3.4 reverted the `?? '000000'` fallback from 2026-06-08 session. Re-applied.

Critic accepted all 3 Forge tasks before these rescues — the rescues were behavioral gaps not caught by Forge's unit tests because they required actual browser + WS sync to surface. Healthy: Critic verified spec compliance; live testing caught spec-vs-reality gaps.

## Cumulative ShowX status

| Bundle | Tasks | Architect rescues |
|---|---|---|
| ShowX-3 main | 24/24 | 1 |
| ShowX-3.1 hotfix | 3/3 | 1 |
| ShowX-3.2 wiring | 3/3 | 1 |
| ShowX-3.3 IPC backend | 4/4 | 0 |
| **ShowX-3.4 station data plane** | **3/3** | **0 (Forge) + 3 (post-build E2E fixes)** |

**Cumulative: 37/37 task specs accepted, 6 Architect interventions (16% — bumped up by today's E2E debugging).** Live testing remains essential — unit tests + Critic review are necessary but not sufficient for catching wire-format + integration bugs.

## DMG iteration log (today)

- v0.1.6 → Loading hang root cause (preload .mjs, manifest schema, default-export instance — fixed)
- v0.1.7 → relative paths in packed asar broke boot — fixed with workspace exports + node_modules mount
- v0.1.8 → ShowState shape mismatch (cuelistName/cueCount flat vs nested) — fixed
- v0.1.9 → hardcoded test PIN 000000
- v0.1.10 → ShowX-3.4 Forge complete, broker bridge live
- v0.1.11 → re-applied hardcoded PIN (Forge overwrite)
- v0.1.12 → PWA Y.Array fix
- v0.1.13 → PWA session role/departments fix → **END-TO-END WORKS**

## Architecture changes

`src/main/src/shared/syncBroker/yWebsocketAdapter.ts`:
- `attachDoc(name, doc)` — registers external Y.Doc as canonical for room <name>; replaces existing entry + closes stale WS conns
- `detachDoc(name)` — removes entry without destroying external doc

`src/main/src/shared/SyncBroker.ts` — exposes attachDoc/detachDoc as passthrough

`src/main/src/runtime/ActiveShowDoc.ts`:
- Constructor accepts optional `syncBroker?: SyncBroker`
- `open()` reads show_id from doc.meta + show.json, calls `syncBroker.attachDoc(showId, doc)`
- `close()` calls `syncBroker.detachDoc(showId)`
- New: `getShowId(): string | null`

`src/main/src/shared/pairing/api.ts`:
- `PairingApiDeps` gains optional `activeShow`
- `/api/pairing/claim` response includes `show_id: activeShow.getShowId() ?? null`
- New endpoint `GET /api/active-show` returns `{ open, show_id, title, mode }`

`pwa/src/components/StationRouter.tsx`:
- Polls `/api/active-show` every 2s, triggers reconnect via `key={currentShowId}` on ConnectionProvider when shell opens different show
- ShowClosedView when shell closes show

`pwa/src/components/PairingView.tsx`:
- Session now includes `role`, `owned_departments`, `watched_departments`, `show_id`

## Outstanding

- **`feedback_electron_workspace_imports_packed`** memory needs extension: same Y.Array-vs-Y.Map type-collision trap will hit future modules. Worth documenting.
- **Forge spec discipline:** spec B003-401/402/403 had right architectural shape but Forge didn't catch the type-collision (because tests on isolated docs work, only multi-process integration surfaces it). Future bundles need at least one E2E sanity task.
- **Re-applying hardcoded PIN** is annoying — every Forge edit to Shell.ts may overwrite it. Worth either gating it differently (separate file?) or sticking with env var via launcher.
- **Routing UI** still shows broker doc's routing — verify CRUD survives reload (post-Kongres polish task).
- **Cue editing in browser** — Jindřich saw 25 cues; haven't tested if editing in browser propagates back to shell + saves to .showx. Worth testing now or post-deploy.

## Bundle scope flag

`docs/agent_exchange/claude_runner_scope.json` → `enabled: false`, `bundle_id: "ShowX-3.4-CLOSED"`.

---

**Architect:** Opus
**Close authorization:** Jindřich 2026-06-08 21:30 ("uz to vidim" — browser SMMasterView shows 25 cues confirmed visually)
