# Decision — F4 AI Showcaller architecture

**Date:** 2026-06-14
**Author:** Architect (Opus)
**Status:** RATIFIED (Jindřich „je to v pohode, jed f4" 2026-06-14 — schválil design proposal showx_f4_ai_showcaller_design.md vč. defaultů: Pro+, ElevenLabs+lokální fallback, SW interrupt teď, CZ+EN).
**Inputs:** F4 design proposal + F4 seam map (Explore agent) + podcast ElevenLabs integrace (reference).
**Blocks:** F4 bundle (ShowX-7) specs.
**Note:** Jindřich zvolil F4 PŘÍMO (LTC odloženo — nemá tvrdou vazbu na F4). F4 = bundle ShowX-7. LTC = pozdější bundle.

---

## Keystone decisions

### 1. caller_lines na Cue (datový model, pattern jako pre_wait_ms)
- `Cue.caller_lines?: CallerLineGroup | null` (cue.ts:40). Typ: per-department standby + společné go:
  `CallerLineGroup = { standby: Record<DepartmentTag,string>, go: string, aggregate?: string }`.
- Document helper `setCueCallerLines` (`assertEditAllowed(doc,'meta')`, jako ostatní settery), factory default null. Pattern přesně dle pre_wait_ms/armed.

### 2. Generátor hlášek = deterministická šablona (zdarma) + volitelný LLM draft
- **Deterministická šablona** z cue dat (departments, cue_number, label): `„{depts} — standby for {cue_number} {label}"` → GO `„{depts} — GO"`. Pokrývá většinu cues, žádné náklady, žádná závislost.
- **Agregace souběžných marků:** víc oddělení se stejným GO okamžikem (compound cue) → sloučí: „Lights, pyro, sound — standby… GO". Čistá logika nad compound-cue strukturou.
- **LLM draft (volitelný):** Claude navrhne přirozenější text do `caller_lines` (editovatelné pole, člověk má poslední slovo). Anthropic API.

### 3. ElevenLabs v Node (main proces), NE reuse Python
- ShowX je Electron/TS. Použít ElevenLabs **Node SDK (`@elevenlabs/elevenlabs-js`) nebo přímo REST** v MAIN procesu (má fs + network). Podcast Python (`podcast/src/tts.py`, model `eleven_multilingual_v2`, voice config pattern) = REFERENCE pro model/voice handling, NE import.
- **Voice clone:** ElevenLabs Instant Voice Clone z nahrávky showcallera (onboarding) → voice_id uložené k show profilu.
- **API key v SecretStore** (existující), NE env/plaintext.
- ⚠ ověřit: cloning ToS + kvalita krátkých imperativních frází (pravděpodobně výborná).

### 4. Pre-generace při REHEARSAL→SHOW, audio do .showx/media (LAN-first jádro)
- Audio se NEgeneruje živě na show. Hook v `transitions.ts:56` (REHEARSAL→SHOW, po writeSnapshot): main proces vygeneruje audio pro každý cue s caller_lines → `.showx/media/<cue_id>_<dept>_standby.mp3` + `<cue_id>_go.mp3` (media/ dir už existuje, prázdný).
- Showcaller při zkoušce slyší/přegeneruje/upraví text dopředu.
- **Na show jen LOKÁLNÍ playback** předpřipravených souborů — nulová latence, žádný internet, plná spolehlivost. Součást zamčeného show stavu (jako payload_frozen_at).
- Ad-lib/změny bez pre-gen → deterministická šablona live (rychlý fallback) nebo showcaller mluví sám.

### 5. Playback = shell renderer Web Audio + setSinkId (intercom device)
- Audio playback NEEXISTUJE. MVP: **shell renderer** (FOH Mac okno) přehrává přes Web Audio API; `HTMLMediaElement.setSinkId(deviceId)` směruje na zvolený **CoreAudio output device = intercom kanál**.
- Caller komponenta subscribuje side-channel: `standby.broadcast` (goEventChannel:138) → přehraj standby; `go.dispatched` (:76) → přehraj GO. Reaguje na F3 cue-lights stav (táž data).
- Pre-gen (network+fs) = main proces; playback (device routing) = renderer. IPC most pro „přehraj soubor X na device Y".

### 6. Interrupt = stop playback <200 ms
- Velké TAKE OVER / MUTE tlačítko (SM/caller view). Okamžitě stopne Web Audio playback → showcaller mluví živě. Stav „AI běží" vs „ruční" viditelný. (HW tlačítko později, SW teď — per default.)

### 7. Pozice & tier
- Caller běží na FOH Macu (shell) — tam je intercom audio out. Modul **Pro+** (monetizace diferenciátoru, per default).
- CZ + EN hlášky (ElevenLabs multilingual), per-show jazyk.

---

## F4 task breakdown (bundle ShowX-7)
B007-001 caller_lines model+UI · 002 deterministický generátor+agregace · 003 LLM draft (Claude) · 004 ElevenLabs Node client+voice clone+SecretStore · 005 rehearsal pre-gen→.showx/media · 006 playback engine (renderer Web Audio+setSinkId)+cue-lights subscribe+fallback · 007 interrupt · 008 intercom device select · 009 E2E gate.

Levná půlka (001-003) dá hodnotu i bez hlasu. Hlas (004-008) těžší.
Nové deps: @elevenlabs/elevenlabs-js (nebo REST), Anthropic SDK (LLM draft) — nebo přímo fetch.

## Otevřené (k ověření, neblokují)
- ElevenLabs cloning kvalita/ToS (B007-004 ověří). Cena pre-genu → Rothschild před širším nasazením. Intercom device select UX (B007-008).
