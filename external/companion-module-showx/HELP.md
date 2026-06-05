# ShowX — Companion module help

Controls the ShowX live show cuelist platform over a LAN WebSocket connection.

## Setup

1. Start ShowX on your FOH Mac (LAN-first mode, no internet required).
2. Open ShowX → Cuelist Core panel → Companion → **Generate Companion token**.
3. Copy the token and paste it into the **Pairing token** field here.
4. Set the **Show ID** and **Cuelist ID** from ShowX (File info / Cuelist settings).

## Connection

Connects to `ws://<host>:<port>/events/<show_id>` using the pairing token for auth. Reconnects automatically with exponential backoff on disconnect.

## Key variables

- `$(showx:armed_cue_label)` — next cue ready to fire  
- `$(showx:last_fired_label)` — most recently fired cue  
- `$(showx:mode)` — `rehearsal` or `show`  
- `$(showx:stations_online)` — number of connected operator stations

## GO authority

In **SHOW mode**, only the designated Stage Manager station can fire GO. Companion's GO action sends a request; ShowX will reject it with a `go.rejected` message if Companion isn't the SM station. Use **GO override** for emergency bypass.
