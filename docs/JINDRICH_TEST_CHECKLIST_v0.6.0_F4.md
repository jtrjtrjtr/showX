# ShowX v0.6.0 — F4 AI Showcaller test (přidává se k F1-F3 checklistu)

> Pro Jindřicha. DMG: `dist-electron/ShowX-0.6.0-arm64.dmg` (unsigned arm64). F1-F3 položky viz `JINDRICH_TEST_CHECKLIST_v0.5.0.md` — testuj vše na tomhle v0.6.0 buildu (F1+F2+F3+F4 najednou, jak jsi chtěl).
> Architekt ověřil automaticky: typecheck, 2133 testů, build, DMG, žádný leak. **Audio/hlas + intercom hardware = tvoje GUI session (to z headless neudělám).**

## F4 — AI Showcaller (nové)
- [ ] **Caller script u cue**: dvojklik na cue → sekce „Caller script", per-oddělení standby + go text editovatelný?
- [ ] **Generuj ze sheetu**: tlačítko vyplní standby/go z dat cue (šablona). Pro víc oddělení naráz → agregovaná hláška („Lights, pyro, sound — GO")?
- [ ] **LLM draft** (volitelné, potřebuje Anthropic key): navrhne přirozenější text do editovatelného pole?
- [ ] **Voice clone**: onboarding — nahraj vzorek hlasu → vznikne voice profil (potřebuje ElevenLabs key, viz níže)?
- [ ] **Pre-gen při REHEARSAL→SHOW**: přepnutí do SHOW vyrobí audio do `.showx/media`? Slyšíš předem (preview) co to řekne?
- [ ] **Playback na show**: dáš standby → ozve se standby hláška; GO → ozve se „GO" — přes zvolený audio výstup?
- [ ] **Interrupt**: velké TAKE OVER / MUTE → okamžitě (<200ms) utne AI, mluvíš sám? Stav „AI / ruční" jasný?
- [ ] **Intercom out**: v nastavení vybereš audio device (intercom) → hláška jde tam, ne do repráků Macu?
- [ ] **Offline**: na show bez internetu se předgenerované hlášky pořád přehrají (lokálně)?

## Klíč k pochopení
Cue lights (F3) a AI caller jsou **táž data**: co F3 ukazuje jako standby/ack/GO světlo na stanici, F4 **vysloví** v intercomu. Stejný stav, dvě modality.

## Potřebuje klíče (jinak se feature gracefully vypne)
- **ElevenLabs API key** → voice clone + pre-gen hlasu. Bez něj: caller_lines text funguje, hlas ne.
- **Anthropic API key** → LLM draft (volitelné). Bez něj: deterministická šablona funguje.
- Oba do **SecretStore** (ne plaintext). Postup v `docs/dev/`.

## Akce pro tebe (mimo test)
1. **ElevenLabs cloning kvalita + cena** — verdikt po vyzkoušení. Note: `docs/dev/elevenlabs_tos_cost_note.md` (ToS consent, kvalita krátkých frází, odhad ceny pro Rothschilda).
2. **Apple cert** (z F3) — pořád čeká, dokončí signing.
3. Po testu → rozhodnutí o dalším směru (LTC bundle? pricing? produkční web?).

## Co NEfunguje (vědomě)
- LTC in/out — odložené (MTC funguje). Signed DMG — čeká na cert. HW interrupt tlačítko — SW verze je live.
