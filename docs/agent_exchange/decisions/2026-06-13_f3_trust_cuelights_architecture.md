# Decision — F3 Trust + Cue Lights architecture

**Date:** 2026-06-13
**Author:** Architect (Opus)
**Status:** RATIFIED (design defaults schváleny; „rozjeď další fázi" + self-run gate)
**Inputs:** F3 seam map (Explore agent) + DMG regression diagnosis + competitive map P1/P2.
**Blocks:** F3 bundle (ShowX-6) specs.

---

## Keystone decisions

### 1. DMG packaging fix — keep `to: .`, fix metadata only
- Shell.ts:163-173 packed-mode path detection REQUIRES `files: src/main/dist → .` (Shell.js at asar root → `pwa` resolves `<asar>/pwa`, `modules` → `<asar>/modules`). Changing `to:` would break runtime paths. So fix the metadata, not the layout.
- Asar root needs: a `package.json` whose `main` = the in-asar entry (`index.js`). Fix = `extraMetadata.main: index.js` + ensure a package.json lands at asar root. Verify by BOOTING the produced DMG (empirical), not just a green build.
- Root cause was app-builder-lib drift (see 2026-06-13_dmg_packaging_regression.md). Pin native deps if needed.

### 2. Device health — slug convention + dispatch feedback
- HealthBus (HealthBus.ts:25) slug = `device:${device_id}`. OutputDispatcher.send() DispatchResult (OutputDispatcher.ts:120-151) feeds per-device health (ok→healthy, fail→error, stale→unknown).
- Surface green/red in DevicesTable (wire the TODO at DevicesTable.tsx:31) + RoutingTable (RoutingTable.tsx:113) + station views. Reachability probe optional; primary signal = last-dispatch outcome.

### 3. Device feedback (Companion) — best-effort, OSC-reply only
- Full confirmed-state needs request_id↔reply correlation; only OSC-reply-capable gear (Eos/QLab) supports it. Scope: opt-in per-device "expects reply" → correlate inbound OSC → show confirmed vs last-sent. Protocols without reply (DMX/MSC) stay at last-sent. Best-effort, not universal.

### 4. Multi-destination = primary + backup (not arbitrary fan-out)
- RoutingRule (routing.ts:15-21) gains `backup_device_id?: string`. On primary DispatchResult.ok===false → dispatch to backup. DispatchRecord tracks which fired. Design said "primary + backup jedním cue" — keep it to that, not N-way fan-out.

### 5. Cue lights protocol — standby → acknowledge → GO
- Builds on existing ArmBroadcast (goEventChannel.ts:102-107) + side-channel.
- New side-channel topics: `standby.broadcast` (SM→dept ops: cue X, standby) and `operator.acknowledge` (op→SM: acked cue X). Add to services.ts:129-133 topic enum + PWA client.
- Flow: SM marks standby for a cue/dept → operator stations in that dept show a STANDBY alert + big Acknowledge button → ack flows back → SM sees per-dept ack state (who's ready) → GO. This is the differentiator (ETC CueSystem dead, DIY on r/techtheatre). Split into protocol+SM-send (B006-007) and operator-receive+ack (B006-008).

### 6. SHOW-mode proposals — define schema + submit + review
- getProposals() Y.Array (show.ts:76-78) schema: `{ id, cue_id, author_operator_id, kind:'cue'|'payload', change: <patch>, status:'pending'|'accepted'|'rejected', created_at, resolved_by? }`.
- Operator in locked SHOW editor submits a proposal (replaces CueEditor.tsx:173 alert). SM reviews queue → accept (applies change) / reject. Keep change representation simple (field-level patch).

### 7. Per-operator authority/registry — real octx from pairing
- authority.ts:23-50 + GoExecutor.ts:100-108: build a real operator registry from PairingStore (device_id → {display_name, owned_departments, role, status:active|revoked, last_seen}). Wire octx so `sm_called` + `per_dept` authorities work with real data (today: "without octx sm_called always rejects").

### 8. LTC — still deferred to its own bundle (ShowX-7) after F3
- LTC native addons (audify + libltc-wrapper) + DMG asarUnpack/notarization. F3 delivers the signed-DMG pipeline (B006-002) which LTC needs; LTC itself = next bundle. Confirmed per F2 decision §4.

### 9. F4 AI Showcaller design proposal (Kobbi-notes-independent)
- Per Jindřich: don't wait for Kobbi's ChatGPT notes. At END of F3, Architect writes a design proposal for the AI Showcaller built from the mail description + own design: caller script field per cue, standby/go line generation from the sheet (deterministic template + LLM draft), aggregation of simultaneous marks, ElevenLabs voice clone, rehearsal pre-generation into .showx (local playback = no latency), interrupt, intercom output. B006-011, owner architect, delivered for Jindřich review.

---

## F3 task breakdown (bundle ShowX-6)
B006-001 DMG fix+boot · 002 signed/notarized pipeline · 003 device health · 004 device feedback (best-effort) · 005 multi-dest primary+backup · 006 pre-show health wizard · 007 cue-lights protocol+SM · 008 cue-lights operator+ack · 009 proposals UI · 010 operator authority/registry · 011 F4 design proposal (architect) · 012 E2E gate (batched F1+F2+F3).

B006-002 signing may need Jindřich's Apple Developer ID cert in keychain → pipeline wired now, full signing verified when cert present (flag).
