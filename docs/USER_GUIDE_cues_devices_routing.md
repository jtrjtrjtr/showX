# ShowX návod: Jak propojit cue → zařízení → OSC/MIDI

> v0.1.14 · Tři vrstvy: **Payload** (CO poslat) → **Device** (KAM) → **Routing rule** (CO jde KAM)

## Mentální model

```
Cue "House up"
 └── Payload: lx_ref, cue_number 0        ← CO se má stát (v jazyce show)
        │
        ▼  routing rules (přiřazení)
 Device "Eos pult" = OSC 192.168.1.50:8000, driver eos   ← KAM to letí
        │
        ▼  driver přeloží do dialektu zařízení
 OSC packet: /eos/cue/1/0/fire
```

Driver dělá překlad: stejný payload `cue_number 0` se pro `driver: eos` přeloží na `/eos/cue/1/0/fire`, pro `driver: qlab` na `/cue/0/go`, pro `ma3` na `/cmd "GO Cue 0"`. **Proto se v cue nepíše surová OSC adresa** — cue říká záměr, device říká dialekt.

## Kde co edituju (dnes, v0.1.14)

| Co | Kde | Jak |
|---|---|---|
| **Texty cue** (label, popis, standby note) | Browser stanice | Double-click na cue (rehearsal mode) |
| **Payloady cue** (typ, cue number, hodnoty) | ShowX okno (shell) — Cuelist panel | CueEditor + payload editory (ta světlá horní část okna) |
| **Devices** (IP, port, transport, driver) | ShowX okno — Routing sekce | Devices tabulka → Add device |
| **Routing rules** (co jde kam) | ShowX okno — Routing sekce | Rules tabulka: match (typ payloadu / department / device_id) → target device |
| **Výsledek** | ShowX okno — Dispatch Log | Každý GO: čas, cue, transport, ok/fail, ms |

## Příklad: chci, aby GO odpálilo cue v QLabu na tomhle Macu

1. ShowX okno → Routing → **Add device**: label „QLab local", transport OSC, host `127.0.0.1`, port `53000`, driver `qlab`
2. **Add rule**: match `payload_type: lx_ref` (nebo department LX) → target „QLab local"
3. V cue měj payload `lx_ref` s číslem cue, které existuje v QLabu
4. Stanice → ARM → **GO** → QLab odpálí cue, Dispatch Log ukáže `lx_ref×1 ok`

## Testovací fallback (zabudovaný)

Bez vlastní konfigurace letí všechno na `127.0.0.1:7000` (integration simulátor / `nc -ul 7000`). Env `SHOWX_OSC_OUT=host:port` to přesměruje. Vlastní pravidla mají vždy přednost před fallbackem.

## Co zatím NEjde (a kdy bude)

- Editace payloadů z browseru (jen v shell okně) — M1 roadmapy
- MIDI device UI end-to-end (engine umí, UI chybí) — M1
- Vidět health zařízení (připojené/odpojené) — M3 „Trust"
- EventX divácké eventy ve stejném logu — M2 „One App"

*Roadmap: `xlab-strategy/docs/showx_product_roadmap.md` · Feature mapa: `showx_competitive_feature_map.md`*
