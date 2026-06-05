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

---

## From bridgex_absorption.md (2026-06-05 night)

### Q22. `outputs/html-renderer.ts` (~134 LOC) fate

Ambiguous — Supabase Realtime broadcast output target. EventX engine may or may not still rely on it for dashboard live-state. Spec defers decision pending cross-check with EventX repo (out of audit scope).

**Default in spec:** flagged as Open Q1 in absorption doc. **Cross-check needed:** EventX dashboard subscription to `html-renderer` channel — does it exist? If yes → migrate as `shared/output-dispatcher/supabase-broadcast.ts`. If no → retire.
**Needed by:** before EventX Bridge module migration (ShowX-2 Phase 1).

### Q23. `auth-manager.ts` placement

Genuinely unclear. Three options:
- (A) Module-local in EventX Bridge until Cloud Sync absorbs Q3 2027 — spec's default
- (B) Move to shell SecretStore + Cloud Sync precursor service from day one
- (C) Ship as tiny new "Identity" core service

**Default in spec:** (A) — module-local; Architect should rule before Step 3 of migration (EventX Bridge module skeleton in ShowX-2).
**Needed by:** ShowX-2 Phase 2 (EventX Bridge module shell).

### Q24. TesterX dev tool / category K

`packages/testerx-contract/` + `tools/testerx/` don't fit Module/Shared/Retired/Replaced taxonomy. Spec created 5th category K (Kept-in-BridgeX) for these. Implication: ShowX development-time injection needs a fresh affordance later.

**Default in spec:** keep frozen with BridgeX 0.3.x; ShowX dev-mode injection re-designed in ShowX-4+ if needed.
**Needed by:** ShowX-3 (Cuelist Core) if Forge needs a dev-time cue-injection harness.

### Q25. OSC packet ordering nondeterminism

Parity test harness uncertainty: if BridgeX 0.3.x has nondeterministic OSC packet ordering across multiple adapters writing in parallel, byte-diff comparator fails. Order-insensitive comparator adds ~300 LOC.

**Default in spec:** byte-diff first; switch to order-insensitive comparator if parity tests reveal nondeterminism.
**Needed by:** ShowX-2 parity test pass.

### Q26. Migration scope: legacy YAML-profile pipeline (~2,800 LOC) really retired?

Spec recommends RETIRE all of: `aggregation/`, `calibration/`, `channels/`, `mapping/`, `outputs/` (profile-side), `coalesce/`, `patterns/`, `cli/`, `dev/`, `inputs/` (cloud + sensor-raw + ingestion-pipeline + local-inject). Customers run the event-driven path (`event-runtime.ts` → `event_bridge_outputs` → `adapters/`), not YAML profiles.

**Default in spec:** retire all ~2,800 LOC.
**Risk:** if even ONE customer uses YAML profile mode, retire = breakage. **Customer interview pre-Kongres:** ask 3-5 BridgeX customers if they use YAML profiles.

---

---

## From task-spec subagents (B001-012 vs B001-005, B001-006, B001-009)

### Q27. B001-012 references `/_showx/ping` not in B001-005 AssetServer spec

B001-012 PWA discovery probe hits `GET /_showx/ping` for cross-origin LAN probe. B001-005 AssetServer spec does not include this route. Either patch B001-005 to add the route + permissive CORS, or accept Forge adding it inline at B001-012 implementation time with explicit done-report mention.

**Default:** patch B001-005 spec before Forge picks up (cleaner).
**Needed by:** before B001-005 or B001-012 starts.

### Q28. B001-012 sync URL diverges from protocol_dictionary.md §7.1

B001-012 PWA `syncClient.ts` uses `ws://${host}:${port}/sync`. Canonical protocol_dictionary.md §7.1 specifies `ws://showx.local:5300/yjs/<show_id>?token=...` for Yjs + `/events/<show_id>` for side-channel.

**Default:** patch B001-012 to use canonical URLs (drift = future bug).
**Needed by:** before B001-012 starts.

### Q29. B001-012 pairing payload simplified vs pairing_auth.md §5.2

B001-012 uses `{ pin, display_name }`. Canonical pairing_auth.md §5.2 requires `{ offer_id, pin, display_name, owned_departments, watched_departments, client_pubkey, ... }`.

**Default:** patch B001-012 to use canonical payload (drift = SHOW mode pairing breakage).
**Needed by:** before B001-012 starts.

---

## Summary

29 open questions identified across 5 specs + task-spec consistency review. Approximately 5 need decisions before ShowX-1 Foundation execution can start (Q1-Q3, plus Q27-Q29 patches); the rest cascade through ShowX-2 through ShowX-4 bundles. None block bundle-opening; most have sensible spec defaults.

---

## Late additions (post-launch 2026-06-05)

### Q31. Forge cycle 1 timed out 20 min without output

Forge subprocess on B001-001 spawned at 2026-06-05T01:38:51Z, timed out 1200s later without:
- moving spec to in_progress/
- updating state.json
- writing any source files

Hypothesis: Forge spent budget reading the rich spec foundation (5005 lines of binding specs + 5675 lines of task specs + CLAUDE.md + WORKFLOW.md + STARTING_PROMPTS) at session start, then ran out of time to actually do B001-001.

**Mitigation candidates:**
1. STARTING_PROMPTS could say "skip docs/specs/ for B001-001 task — pure tooling task" — too task-specific
2. Add task spec note "Skip docs/specs/ reading — this task is tooling only"
3. Architect rescue: write B001-001 (~200 lines pnpm/tsconfig) manually if cycle 2 also fails
4. Lower STARTING_PROMPTS read-set to just CLAUDE.md + WORKFLOW.md + task spec

**Status:** Cycle 2 launched 02:02:51Z; observing. If cycle 2 also empty at 02:22:51Z, Architect rescues.

### Q30. B001-007 OutputDispatcher sync vs async claim signature

Subagent reviewing B001-007 flagged real type-signature mismatch: showx-shared's sync `claim()` declaration (from B001-002 spec) vs the necessary async impl in B001-007 OutputDispatcher.

**Default in spec:** B001-007 spec recommends `@ts-expect-error` + a separate `claimAsync` method, OR a follow-up task to widen B001-002's signature to `Promise<TransportHandle>`.

**Architect ruling:** Widen B001-002's signature to `claim(...): Promise<TransportHandle>` (cleaner long-term). If B001-002 is already in_progress/done when this lands, file a B001-002-revision task.

**Status:** Forge starting B001-001 first; B001-002 is next; correct the signature in spec before B001-002 picks up.

**Recommended morning workflow:**
1. Read this doc top-to-bottom (~10 min)
2. Confirm defaults for Q1-Q3 (Module Loader) — needed for B001-010 implementation
3. Confirm Q16-Q18 (Protocol) — needed for B001-007 + B001-008
4. Confirm Q19-Q21 (Pairing) — needed for B001-009
5. Defer Q4-Q15 (Data model lower priority) + Q22-Q26 (BridgeX absorption) to follow-up sessions — not on ShowX-1 critical path
6. Enable scope, start Forge on B001-001

---

## Architect rulings — ShowX-3 data model questions (2026-06-06)

Applied as defaults per Jindřich's "max autonomy" delegation 2026-06-06. Each ruling lifts the spec-recommended default to binding for ShowX-3 (B003-001..023) execution. Forge MUST treat these as authoritative; Critic enforces.

**Q4 — Payload-level `department` field.** RULING: infer from `cue.department` + tag heuristic in 0.1. First-class `payload.department` field deferred to 0.2 (follow-up bundle). Applies to B003-002 (Cue/Payload factories — no `department` field on Payload type yet), B003-005 (view filter algorithm reads cue-level), B003-006 (compound cues inherit cue department), B003-009 (dispatch resolves via cue context).

**Q5 — `auto_follow` with null `duration_hint_ms`.** RULING: fire immediately on previous-cue start (equivalent to `auto_continue(0)`). Applies to B003-007 trigger engine. Rationale: matches QLab/Eos auto-follow semantics, predictable for SM mental model.

**Q6 — Per-cue lock granularity in SHOW mode.** RULING: cuelist-level lock only in MVP. Per-cue locking deferred to 0.3. Applies to B003-004 REHEARSAL state machine.

**Q7 — Y.Text vs strings for label/notes + label LWW in SHOW.** RULING: plain strings (Y.Map values, not Y.Text). Label LWW allowed in SHOW mode (per protocol_dictionary §7.6 conflict-free convention). Applies to B003-002, B003-004, B003-016.

**Q8 — Group nesting depth + cycle detection.** RULING: 4 levels max + cycle detection on insert. Reject deeper. Applies to B003-009 (dispatch traversal) + B003-002 (group factory validation).

**Q9 — Idempotency LRU sizing.** RULING: default 1000 entries, configurable via `cuelist-core.idempotency_lru_size`. Applies to B003-001 config schema + B003-008 GO event channel.

**Q10 — Snapshot retention policy.** RULING: keep last 50 snapshots per cuelist + size cap 100 MB. Configurable. Applies to B003-002 / B003-003.

**Q11 — Presence color palette.** RULING: null in 0.1 (no fixed palette). Operator color = SM-assignable at pairing time. Follow-up task post-ShowX-3 for default palette. Applies to B003-001 config + B003-013/B003-014 PWA presence indicators.

**Q12 — UTI registration for `.showx` package.** RULING: register `cz.xlab.showx.package` in Info.plist during packaging (B003-023). Applies to B003-003 + B003-023.

**Q13 — Postgres UUID privacy in cloud-sync.** RULING: defer — cloud-sync module is out of ShowX-3 scope. Document as open Q for ShowX-4.

**Q14 — History rotation.** RULING: 50 MB or 10 days, whichever hits first (matches B003-001 config defaults). Applies to B003-001, B003-002.

**Q15 — Compound cue payload ordering semantics.** RULING: payloads dispatch in array order, no inter-payload await (fire-and-forget per payload). Compound = atomic from cue PoV; payload delivery races are dispatcher-side, not cue-engine concern. Applies to B003-006, B003-009.

**Pre-emptive split decision (Pattern 8 advisory ≥700 LOC):** SKIPPED — let Forge attempt B003-002 (800), B003-013 (800), B003-016 (800) as-written first. Architect rescues if Forge times out 2× consecutively (pattern from ShowX-1 B001-001 / B001-012). Splitting pre-emptively burns Architect tokens without proof of need; reactive split is cheaper.

**Status:** All Q4-Q15 rulings binding. Forge may pick up B003-001 on next scope-enabled tick. Q13 explicitly deferred (out of scope). Q16-Q17 already ruled in protocol_dictionary block above (OFF, defer to 0.2).
