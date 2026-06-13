# ShowX v0.5.0 — test checklist (F1 + F2 + F3 najednou)

> Pro Jindřicha. ~15 min. DMG: `dist-electron/ShowX-0.5.0-arm64.dmg` (unsigned arm64 — při prvním otevření Ctrl+klik → Otevřít, nebo `xattr -dr com.apple.quarantine` pokud Gatekeeper brání).
> Architekt ověřil automaticky: typecheck, 1977 testů, build, DMG. **Tohle je vizuální/funkční část, kterou Architekt z headless kontextu nedokáže.**

## Spuštění
```
open dist-electron/ShowX-0.5.0-arm64.dmg   # nainstaluj přetažením do Applications
SHOWX_PAIRING_TEST_PIN=000000 /Applications/ShowX.app/Contents/MacOS/ShowX
```
Otevři show (File → Open Recent / demo). Stanici spáruj v browseru přes QR/PIN 000000.

## F1 — Dotáhnout co papírově je
- [ ] Dvojklik na cue → **vytvoř nový payload každého typu** (OSC, MIDI, MSC, lx_ref, **DMX**, webhook, wait, group). Jdou vytvořit a uložit?
- [ ] OSC payload → `nc -ul 7000` zachytí odeslání? (DMX → Art-Net capture, webhook → lokální server)
- [ ] **Pre-wait**: nastav cue pre_wait 2s → GO → vidíš „armed/waiting" 2s odpočet, pak dispatch?
- [ ] **Disarm** cue → GO ho přeskočí, řetěz pokračuje, v Dispatch Logu [DISARMED]?
- [ ] **Audition** cue → [AUDITION] v logu, ŽÁDNÝ reálný výstup, playhead se nehne?
- [ ] **Hotkey** trigger na cue → stisk klávesy vystřelí?
- [ ] Payload editace je teď **viditelně dostupná** (✎ na řádku, ne jen dvojklik)?

## F2 — Time vrstva
- [ ] **Velký timecode** HH:MM:SS:FF viditelný na shell + SM + operator stanici (ne malý)?
- [ ] Clock běží/start/stop, countdown stanice (spáruj jako role „countdown") = obří číslice?
- [ ] **Timecode trigger**: cue na TC → spusť clock → vystřelí při překročení? Stop clocku = nestřílí?
- [ ] **MTC out**: jiný SW/zařízení chytne ShowX MTC? **MTC in**: externí MTC → ShowX clock chase (locked)?
- [ ] Show-time OSC na `nc -ul`?

## F3 — Trust + Cue Lights
- [ ] **Device health**: rozbij zařízení (špatný port) → červená v Routing/Devices? Oprav → zelená?
- [ ] **Multi-dest**: rule s backup zařízením → při výpadku primary jde na backup?
- [ ] **Pre-show wizard**: projde demo, flagne rozbité zařízení?
- [ ] **Cue lights**: SM dá standby oddělení → operator stanice ukáže STANDBY + velké Acknowledge → SM vidí ack → GO?
- [ ] **Proposals**: v SHOW módu operator pošle návrh změny → SM ho vidí ve frontě → accept aplikuje?
- [ ] **Authority**: operator bez práv nedostane GO na cizí oddělení?

## Co NEfunguje (vědomě)
- **LTC** in/out — odložené do samostatného bundlu (potřebuje native audio + signed DMG). MTC funguje.
- **Signed/notarized DMG** — pipeline nadrátovaná, ale **potřebuju tvůj Apple Developer ID cert** (viz níže). Tenhle build je unsigned.

## Akce pro tebe (mimo test)
1. **Apple cert** pro B006-002 signing — postup v `docs/dev/`. Bez něj zůstávají buildy unsigned.
2. **F4 AI Showcaller design** k revizi: `xlab-strategy/docs/showx_f4_ai_showcaller_design.md` (návrh bez Kobbiho poznámek — klíč: cue lights + AI caller = táž data, hlas vs světlo).
3. Po tvém OK → LTC bundle (ShowX-7) + pak F4.

## Co najdeš → piš mi
Cokoli rozbitého nebo ošklivého (layout, čitelnost) → mini-bundle fix. Jinak F3 zavřu na zelenou a jedeme dál.
