# Open Questions for Architect / Jindřich Review

**Date:** 2026-06-05 night
**Status:** Accumulated during ShowX-1 Foundation spec writing
**Action:** Review next session (post-rest); answers update specs + queue follow-up tasks if needed

This document aggregates open questions surfaced by spec-writing subagents during the 2026-06-05 autonomous bundle planning night. Each question lists the source spec and proposed default; Jindřich's call needed before Forge starts on dependent tasks.

---

## From module_loader.md (2026-06-05 night)

### Q1. License tier source-of-truth

**Where does ModuleLoader read the current `tier` (free/pro)?**

Options:
- (A) Local cache of cloud license check (Supabase periodic refresh) — requires Cloud Sync module logic, but tier lives outside it
- (B) Pairing token claim (token signed with tier embedded) — requires cloud round-trip at pairing time, but stable for venue runtime
- (C) SecretStore key (license file imported manually) — offline-friendly, but easy to bypass (just edit the file)
- (D) Hybrid: pairing token primary, SecretStore fallback for offline first-install

**Default in spec:** option D (deferred to license-gating implementation, not 0.1).

**Impact:** affects SHOW mode + Custom Router + Cloud Sync gating in 0.2-0.3.
**Needed by:** ShowX-4 bundle planning (Q1 2027).

---

### Q2. `onCueCatalog` — Module hook or EventBus event?

The strategy doc `showx_module_architecture.md` listed `onCueCatalog?(catalog): void` as a first-class Module interface hook. The module loader spec subsumes it into the EventBus pattern (`'cue-catalog-updated'` typed event).

**Trade-off:** explicit hook = stronger typing per module, but adds Module interface surface; EventBus = leaner interface, but loses per-module type-checking.

**Default in spec:** EventBus.

**Impact:** Cuelist Core publishes; Custom Router + OutputDispatcher routing UI consume.
**Needed by:** ShowX-3 (Cuelist Core) and ShowX-5 (Custom Router).

---

### Q3. Strict-vs-lenient malformed module mode

In production: ShowX should skip broken modules + log discovery error + continue booting (don't kill the FOH app over a bad module).

In dev: Forge will silently not see a broken manifest unless they click into the sidebar.

**Proposal:** ship `SHOWX_STRICT_MODULES=1` env var that throws on any manifest validation failure. Default off in production builds, on in dev/CI.

**Default in spec:** production-lenient is the law; dev strict via env var is recommended (cheap to add now).

**Decision needed:** confirm env var name + behavior before B001-010 ships.

---

---

## From data_model.md (2026-06-05 night)

### Q4. Payload-level `department` field

MVP currently infers payload department from `cue.department` + tag heuristic. Proposing first-class `payload.department: DepartmentTag | null` in 0.2. Changes Cue/Payload type shape and affects view filtering algorithm. (data_model §6.6, §12.2)

**Default in spec:** infer in 0.1, first-class field in 0.2.

### Q5. `auto_follow` completion when `duration_hint_ms` is null

Spec recommendation: fire immediately (equivalent to `auto_continue(0)`). Alternatives: wait forever, infer from payload type. Forge needs ruling before implementing scheduler. (data_model §4.2.a, §12.3)

**Default in spec:** fire-immediately.

### Q6. Per-cue lock granularity in SHOW mode

Currently all-or-nothing per cuelist. Production-tier customers may want "lock Act 1, leave Act 2 editable". Recommendation: NO per-cue locking in MVP (UX complexity); revisit 0.3. (data_model §7, §12.10)

**Default in spec:** cuelist-level lock only in MVP.

### Q7–Q15. Lower-priority data model decisions

Listed in `data_model.md` §12.1, §12.4–9, §12.11, §12.12: Y.Text vs strings, label LWW in SHOW, history rotation, snapshot retention, Postgres UUID privacy, Group nesting depth, idempotency LRU sizing, presence color palette, UTI registration. All need rulings before respective Forge tasks but not blocking ShowX-1 Foundation.

---

## From protocol_dictionary.md (2026-06-05 night)

### Q16. `/showx/cue/fire` IN default in SHOW mode

Should external direct cue fire (bypassing playhead) be default-OFF in SHOW mode? Recommendation: OFF for safety, opt-in toggle per show. Affects Companion automation patterns + emergency-cue scripting. (protocol_dictionary §3.3.4)

**Default in spec:** off in SHOW unless explicitly enabled.

### Q17. Direct DMX from cuelist payloads in 0.1

Ship DMX-direct path in 0.1 or defer to 0.2 (DMX-out lives only in BridgeX-absorbed EventX Bridge code path for 0.1; cuelist DMX waits). Recommendation: defer. Existing BridgeX customers keep DMX flows; new ShowX users get OSC/MSC-to-console only. (protocol_dictionary §6.3)

**Default in spec:** defer to 0.2.

### Q18. Protocol version negotiation on Yjs WSS connect

Should stations send `client_protocol_version` in `Sec-WebSocket-Protocol` so older PWAs can connect to newer shells (or get explicit upgrade-required handshake)? Recommendation: yes for 0.2; for 0.1 rely on heartbeat post-connect = version mismatch only detected after session starts. (protocol_dictionary §11.4)

**Default in spec:** post-connect heartbeat in 0.1.

---

---

## From pairing_auth.md (2026-06-05 night)

### Q19. QR custom-scheme vs HTTPS

`showx://` URI scheme doesn't work pre-PWA-install (browser doesn't know the scheme); `https://` requires TLS on LAN (post-MVP — self-signed cert UX is rough). Spec defaults to plain `http://showx.local:5300/pair?...` for first install; revisits when TLS lands in 0.2. (pairing_auth §18.4)

**Default in spec:** `http://` for 0.1.

### Q20. PIN length 6 vs 8

6 digits = UX-friendly default. Theatre/corporate venue security policies may demand 8. Spec proposes "Strict pairing mode" advanced setting that bumps to 8 + tightens rate limit. (pairing_auth §18.1)

**Default in spec:** 6 digits with strict-mode opt-in to 8.
**Customer interview question pre-Kongres:** does any venue contract require >6 digits?

### Q21. Pairing during SHOW mode

Allow SM to admit a new station while show is locked? Risk: rogue admit mid-show. Counter: real-world "operator's iPad died, need backup station now." Spec proposes "allowed but station gets read-only intermediate state until SM grants write." (pairing_auth §18.7)

**Default in spec:** allowed with intermediate read-only state.
**Cross-spec dependency:** SHOW mode module spec author needs to ratify the read-only intermediate state semantics before B001-009 Forge implementation can finalize the API.

---

(Final batch — bridgex_absorption — pending.)
