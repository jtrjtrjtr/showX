# ShowX v0.1.14 — Testovací checklist pro Jindřicha

> Stav: nainstalováno v /Applications, vše níže Architect ověřil 2026-06-11 ráno.
> Demo Show má první cue přejmenované na "House up (E2E edit)" — to je můj testovací artefakt
> (důkaz persistence). Vrátíš fresh demo přes File → Open Demo → "Replace with fresh demo".

## Spuštění

1. Spusť **ShowX Test.command** na ploše (nebo /Applications/ShowX.app)
2. V ShowX okně otevři **Demo Show**
3. V shell okně dole najdeš **STATIONS panel**: QR kódy + URL s předvyplněným PINem
   - Mobil: naskenuj QR → spárováno bez psaní PINu
   - Tento Mac: tlačítko **"Open station in this Mac's browser"**

## Co testovat (vše by mělo projít)

| # | Test | Očekávání |
|---|---|---|
| 1 | Spáruj se jako **Stage Manager** | Tmavé čitelné UI, 25 cues |
| 2 | **Refresh stránky (F5)** | Zůstaneš přihlášený — ŽÁDNÝ PIN znovu |
| 3 | Klikni na cue | Playhead (teal pruh + podbarvení) se přesune |
| 4 | Tlačítko **Arm cue …** dole | GO button se rozsvítí teal s názvem cue |
| 5 | **GO** | Calling text ukáže GO; v shell okně **DISPATCH LOG** přibyde řádek (cue, lx_ref×1, ok, ms) |
| 6 | OSC ven: spusť v terminálu `nc -ul 7000` a dej GO | Přijde packet `/eos/cue/…/fire` |
| 7 | **Double-click na cue** | Edit dialog (label / description / standby note) |
| 8 | Změň label → Save | Změna hned vidět; ulož se — **přežije restart aplikace** |
| 9 | Druhé zařízení (mobil přes QR) | Oba vidí stejný stav; edit z jednoho se objeví na druhém |
| 10 | Zavři show v shellu | Browser do 2 s: "Show closed by stage manager" |
| 11 | SHOW mode (badge vpravo nahoře) | GO zčervená + zámek; editace zablokovaná |

## Známé drobnosti (post-Kongres polish)

- Dlouhý label ("Announce") přetéká do popisu — kosmetické
- Horní část shell okna (CuelistCorePanel) je stále světlá — dark sweep editor screens je follow-up
- `nc -ul 7000` vs. Notch simulátor: integration osc-ws-bridge poslouchá na stejném portu — pro plný vizuál spusť `cd ../integration && pnpm bridge` (pokud běží můj capture listener, nejdřív `pkill -f osc_capture`)

## Co čeká na tvoje OK

1. **git push** (4 commity: checkpoint 3.4, bundle open, bundle complete, E2E rescues)
2. **Launch sekce na showx.xlabproject.net** — připravím draft, deploy po schválení
