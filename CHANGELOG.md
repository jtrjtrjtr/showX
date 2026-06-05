# ShowX Changelog

All notable changes to ShowX are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.1.0] — 2026-06-17

### Added

**Workspace + toolchain (ShowX-1 / B001 bundle)**
- pnpm workspace with packages: `showx-main`, `showx-pwa`, `showx-shared`, `showx-cuelist-core`, `showx-eventx-bridge`
- TypeScript strict mode, ESLint, Vitest, Playwright
- CI workflow (GitHub Actions) — typecheck + unit + E2E
- Parity test harness skeleton for BridgeX 0.3.x compatibility regression

**Shared services (ShowX-1)**
- `Logger` — structured JSON log with level filter + context tagging
- `EventBus` — typed pub/sub backbone
- `HealthBus` — service health aggregator with `degraded`/`healthy`/`offline` states
- `PersistedStore` — atomic JSON file persistence with `.tmp` + rename strategy
- `SecretStore` — keytar-backed credential vault
- `AssetServer` — Express static file server (serves PWA bundle on `:5300`)
- `mDNS` — Bonjour `_showx._tcp.local` advertisement via bonjour-service
- `SyncBroker` — embedded y-websocket server (room-per-show CRDT sync)
- `OutputDispatcher` — OSC (osc-min), MIDI (@julusian/midi), DMX (dmxnet Art-Net + e131 sACN)
- `InputRegistrar` — OSC + MIDI listener infrastructure
- `PairingStore` — device pairing state with QR + PIN flows
- `ModuleLoader` — dynamic module loading + lifecycle (init/start/stop/status)
- Electron main entry + IPC handlers + shell skeleton

**Cuelist Core module (ShowX-3 / B003 bundle)**
- `YjsDocumentModel` — `Y.Doc`-backed Show / Cuelist / Cue / Payload factories + typed accessors
- `.showx` package read/write — atomic save with JSON projection fallback on corrupt `doc.yjs`
- REHEARSAL / SHOW mode state machine — `rehearsal → locked → rehearsal` transitions + `history.jsonl` snapshot writer
- `DepartmentViewFilter` — per-department cue filtering + `actionable` / `highlighted` computation
- Compound cue model — `MultiPayload` type with invariants (≥1 payload, no duplicate dept in single multi-payload)
- `TriggerEngine` — manual / `auto_follow` / `auto_continue` scheduler with debounce + cancellation
- GO event side-channel — idempotent pub/sub on `/events/<show_id>` with 5s replay window + SHA-256 request_id
- `CuePayloadDispatcher` — resolves routing from Cuelist config, calls OutputDispatcher per payload type
- Cue catalog publishing — `cue-catalog-updated` EventBus events + cache write on Yjs doc mutation
- Module panel UI in Electron shell — IPC-connected cuelist state display
- `CsvImporter` — QLab, ETC Eos, and generic cue list CSV ingestion with column detection
- `.showx` JSON export + single-file portable export round-trip
- PDF cue sheet export via pdfkit — per-department + SM master, A4, table layout
- Multi-operator integration tests (Playwright E2E) — Electron shell + 2 PWA sessions via WebSocket fixture
- First-paid-pilot deployment playbook (`docs/customer-comms/pre-pilot-checklist.md`)

**PWA stations**
- Yjs hooks, awareness presence, reconnect with exponential backoff
- SM master view — full cuelist table, calling text panel, standby cue panel
- Per-department operator views — LX, SX, VIDEO, AUTO, PYRO, FS variants
- GO button + standby panel — SM authoritative dispatch with confirmation animation
- Cue editor (REHEARSAL mode) — per-payload-type editors (OSC address/args, MIDI note/program, label)

**Stream Deck / Companion**
- Bitfocus Companion community module (`showx-companion`) — GO, standby advance, cue jump actions + module info feedback

**Release tooling**
- `electron-builder.yml` — signed DMG config for `cz.xlab.showx` with Apple Developer ID
- `build/entitlements.mac.plist` — hardened runtime entitlements
- `scripts/build-release.sh` — full gate (typecheck + lint + tests) then signed DMG
- `scripts/notarize-release.sh` — `xcrun notarytool` submit + staple + validate
- `scripts/verify-release.sh` — codesign + spctl + stapler + SHA-256 verification gate
- `releases/0.1.0/RELEASE_NOTES.md` — user-facing release notes
- `releases/0.1.0/CHANGELOG_PUBLIC.md` — user-friendly feature summary
- `releases/0.1.0/smoke-test-checklist.md` — 30-item pre-publish gate

### Changed

- BridgeX 0.3.x source designated for absorption into `showx/src/modules/eventx-bridge/` (Q3 2026; B002 bundle)
- Module loader contract finalized in `showx-shared/module.ts` (Module, ModuleContext, ServiceRegistry interfaces)

### Known limitations

- SHOW mode proposal queue: stubbed (no UI for operator edit suggestions during lock)
- Cloud Sync module: not included
- Custom Router module: not included
- Timecode triggers (LTC/MTC): not supported
- USITT ASCII import: not supported
- Direct DMX dispatch from cuelist payloads: use EventX Bridge path
- Auto-update: manual DMG download only
- Linux / Windows: Mac only

---

[Unreleased]: https://github.com/xlab-cz/showx/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/xlab-cz/showx/releases/tag/v0.1.0
