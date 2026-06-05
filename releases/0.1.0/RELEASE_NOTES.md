# ShowX 0.1.0 — Release Notes

**Released:** 2026-06-17 (Kongres pilot)
**Distribution:** signed + notarized DMG via https://showx.xlabproject.net/downloads
**macOS:** 13 (Ventura) or later, Intel + Apple Silicon

---

## What's new

ShowX 0.1.0 is the first public release of XLAB's master FOH cuelist product. It delivers a complete multi-operator cue list system with per-department station views, collaborative REHEARSAL mode, and hardware dispatch.

### Cuelist Core

- **Yjs-based show model** — conflict-free collaborative document (Show / Cuelist / Cue / Payload)
- **REHEARSAL mode** — multi-operator collaborative editing; SM and operators edit simultaneously via CRDT
- **SHOW mode lock** — SM locks the cuelist; operator stations display a read-only lock banner; snapshots written to `history.jsonl`
- **Compound cues** — one cue can carry payloads for multiple departments (LX + SX + VIDEO simultaneously)
- **Per-department view filter** — each operator sees only their department's cues + highlighted cross-dept cues
- **Trigger taxonomy** — manual (Space/GO button), `auto_follow` (next cue starts automatically), `auto_continue` (follow with delay)
- **GO event side-channel** — idempotent publish/subscribe on `/events/<show_id>`; replay window protects against duplicate fires; acknowledged by all connected stations

### Cue payload dispatch

- **OSC** — sends to configured console (e.g. ETC Eos, QLab)
- **MIDI** — note on/off, program change, MSC
- **DMX** — Art-Net and sACN (via EventX Bridge module code path)
- **GO broadcast** — all PWA stations receive `go.dispatched` event with cue metadata

### PWA stations (iPad / laptop via LAN)

- **SM master view** — full cuelist with calling text panel and standby cue panel
- **Per-department operator views** — LX, SX, VIDEO, AUTO, PYRO, FS
- **GO button** — large tap target; keyboard shortcut (Space); real-time confirmation
- **Cue editor (REHEARSAL)** — per-payload-type editors for each department
- **Pairing** — QR code or 6-digit PIN; mDNS auto-discovery on LAN

### Import / export

- **CSV import** — QLab, ETC Eos, and generic cue list CSV formats
- **.showx package** — native format, atomic save with JSON projection fallback
- **Single-file JSON export** — portable self-contained export
- **PDF cue sheets** — per-department and SM master, A4 printable

### Integration

- **Stream Deck** — via Bitfocus Companion community module (`showx-companion`)
- **Multi-operator integration tests** — Playwright E2E harness validates full chain

---

## Known limitations (0.1)

| Feature | Status |
|---------|--------|
| SHOW mode proposal queue | Stubbed — coming in 0.2 |
| Cloud Sync | Not included — coming in 0.4 |
| Custom Router | Not included — coming in 0.5 |
| Timecode triggers (LTC/MTC) | Not supported — coming in 0.4 |
| USITT ASCII import | Not supported — coming in 0.4 |
| Direct DMX from cuelist payloads | Use EventX Bridge path — direct DMX dispatch in 0.3 |
| Auto-update | Manual download only for 0.1 |
| Linux / Windows | Mac only for 0.1 |
| App Store | Direct DMG only for 0.1 |

---

## Installation

1. Download `ShowX-0.1.0.dmg` from https://showx.xlabproject.net/downloads
2. Open the DMG, drag **ShowX.app** to **Applications**
3. First launch: macOS Gatekeeper may show "ShowX is from Apple Developer XLAB s.r.o." — click **Open**
4. Grant **Network** and **Bonjour** permissions when prompted on first launch
5. Open an existing `.showx` file or create a new show

**System requirements:**
- macOS 13 (Ventura) or later
- 8 GB RAM (16 GB recommended for shows with ≥100 cues)
- Gigabit LAN at FOH for station connections
- WiFi 5 or 6 for iPad connectivity

---

## Migrating from BridgeX 0.3.x

ShowX is a **separate app** with a separate bundle ID (`cz.xlab.showx`) — install it alongside BridgeX 0.3.x. Both can run simultaneously on the same Mac.

When ready to migrate your BridgeX config:
> ShowX → Tools → Import BridgeX 0.3.x config

BridgeX 0.3.x is frozen at 0.3.23 and will receive security patches through Q2 2027, then sunset.

**Breaking changes from BridgeX:** None. ShowX is a parallel install with no shared state.

---

## Security

ShowX 0.1.0 is:
- Signed with **Developer ID Application: XLAB s.r.o.**
- Notarized by Apple
- Built with hardened runtime

To verify manually:
```bash
codesign --verify --verbose ShowX.app
spctl --assess --type exec ShowX.app
```

---

## Support

- **Documentation:** https://docs.showx.xlabproject.net
- **Email:** support@xlab.cz
- **Discord:** https://discord.gg/showx

---

## License

ShowX 0.1.0 is free during the public beta period (Kongres 2026 pilot through Q3 2027). Paid plans begin Q4 2027.

— XLAB s.r.o., Prague, June 2026
