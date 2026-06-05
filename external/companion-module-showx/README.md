# companion-module-showx

Bitfocus Companion module for **ShowX** — XLAB live show cuelist platform.

## Install

Once accepted to the Companion community module index, install via Companion UI → Modules → ShowX.

For manual installation during development: place this directory in your Companion `developer-modules` folder and enable developer mode.

> **Note:** PR submission to the Companion community repo is handled by the project maintainer (XLAB / Jindřich). This module directory is the submitter-ready artifact.

---

## Configuration

1. In Companion, add a new connection of type **ShowX**.
2. Fill in the connection settings:

| Field | Description | Default |
|---|---|---|
| **ShowX host** | Hostname or IP of the Mac running ShowX | `showx.local` |
| **ShowX port** | ShowX side-channel port | `5300` |
| **Show ID** | UUIDv7 of the active show (copy from ShowX → File info) | — |
| **Cuelist ID** | UUIDv7 of the cuelist to control (copy from ShowX → Cuelist settings) | — |
| **Pairing token** | Token from ShowX: Cuelist Core panel → Companion → "Generate Companion token" → paste here | — |

3. The connection status indicator turns green when ShowX accepts the pairing token.

---

## Actions

| Action | Description |
|---|---|
| **GO** | Fire the currently armed cue |
| **GO override** | Fire armed cue bypassing SM authority (emergency only) |
| **Standby Next** | Arm the next cue in sequence |
| **Stop cuelist** | Stop cuelist playback |
| **Pause cuelist** | Pause cuelist playback |
| **Resume cuelist** | Resume paused cuelist |
| **Goto cue** | Jump playhead to a cue by ID or label |

---

## Feedbacks (button states)

| Feedback | Visual | Condition |
|---|---|---|
| **Connection status** | Green background | Connected to ShowX |
| **Disconnected** | Red background | Not connected |
| **SHOW mode active** | Red background | Show mode is locked |
| **Cue armed** | Yellow background | A cue is armed and ready to fire |

---

## Variables

| Variable | Description |
|---|---|
| `$(showx:connected)` | 1 = connected, 0 = not connected |
| `$(showx:current_cue_label)` | Label of the current (last fired) cue |
| `$(showx:armed_cue_label)` | Label of the armed cue (next to fire) |
| `$(showx:last_fired_label)` | Label of the most recently fired cue |
| `$(showx:mode)` | Current show mode (`rehearsal` / `show`) |
| `$(showx:stations_online)` | Number of connected PWA operator stations |

---

## Presets

Six button presets are included:

1. **GO button** — large GO button with mode feedback (green / red for SHOW mode)
2. **Standby Next** — arm next cue, pulses yellow when armed
3. **Cue Label Display** — shows `$(showx:armed_cue_label)`
4. **Mode Indicator** — shows `$(showx:mode)`, red in SHOW mode
5. **Stations Counter** — shows `$(showx:stations_online)`
6. **Connection Status** — green = connected, red = disconnected

---

## Reconnect

The module reconnects automatically on disconnect with exponential backoff (1s → 2s → 4s → ... → 30s max). No manual restart needed.

---

## Troubleshooting

**Connection stays red:**
- Verify ShowX is running and the side-channel is listening on the configured port.
- Verify the Show ID and Pairing token match exactly (copy-paste from ShowX).
- Check firewall — TCP port 5300 must be reachable from the Companion Mac to the ShowX Mac.

**GO does nothing:**
- Verify the Cuelist ID is correct.
- Verify the station has GO authority in ShowX (SHOW mode restricts GO to the SM station).
- Check the `$(showx:mode)` variable — in SHOW mode, non-SM GO attempts are rejected.

**Variables show blank:**
- Trigger a GO or standby action to populate variables; they update on events only.

---

## License

MIT — XLAB s.r.o.
