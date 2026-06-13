# Decision — F2 Time layer architecture (master clock, timecode, MTC, LTC deferral)

**Date:** 2026-06-13
**Author:** Architect (Opus)
**Status:** RATIFIED (Jindřich schválil design defaulty + „rozjeď další fázi" 2026-06-12/13)
**Inputs:** seam map (Explore agent) + LTC/MTC library research agent + Kobbi mail (big timecode požadavek) + MX4D screenshot.
**Blocks:** F2 bundle (ShowX-5) specs.

---

## Keystone decisions

### 1. Master clock = integer totalFrames model
- Canonical time = `{ rate: 24|25|29.97|30, dropFrame: boolean, totalFrames: number }`. NE ms (frame quantization, 29.97 rounding).
- Free-run z monotonic timeru (hrtime/performance.now). Format HH:MM:SS:FF (a drop-frame `;` math) až při zobrazení.
- Jeden zdroj pravdy → víc emitorů (MTC gen, future LTC gen, OSC time, display). Lives `src/main/src/shared/Clock.ts` (MasterClock service), registr v Shell boot po SyncBroker + do ModuleContext.
- Módy: `internal` (free-run), `chase` (následuje externí MTC/LTC vstup). Operace: start/stop/locate(tc).

### 2. Clock broadcast = anchor + lokální interpolace (NE flood)
- **Problém:** 30Hz × 30 stanic = 900 msg/s na side-channel. Nepřijatelné.
- **Řešení:** Shell broadcastuje přes side-channel topic `clock.anchor` **autoritativní kotvu** (`{ totalFrames, at_wall_ms, rate, dropFrame, running, source }`) **nízkou frekvencí ~2–4 Hz** (+ okamžitě při start/stop/locate/source-change).
- **Stanice interpolují lokálně** přes requestAnimationFrame: `displayFrames = anchor.totalFrames + (now - anchor.at_wall_ms) * rate/1000` (jen když running). useClock hook v PWA.
- Plynulé 60fps čísla bez síťového floodu. Standard „NTP anchor + local interpolation".

### 3. MTC = hand-roll, žádné nové deps
- Research: jediná maintained lib s MTC helperem je `jzz`, ale znamenala by druhý MIDI stack vedle `@julusian/midi` (duplicitní port ownership). Nevyplatí se pro ~100-150 LOC stavový automat.
- **Decode:** `parseMidi` (`midiIn.ts`) přidá `status===0xF1` (quarter-frame) → `MtcReceiver` akumulátor (8 QF = 1 TC, frame-rate v top bitech hours nibble) + full-frame SysEx branch (`F0 7F .. 01 01 hh mm ss ff F7`). Plně unit-testovatelné (`_injectForTest` existuje).
- **Generate:** `MtcGenerator` z master clocku píše `[0xF1, data]` přes `midiOut.ts` + full-frame SysEx na locate.
- Bit-packing lze opsat z `jzz` smpte.js (MIT) bez dependency.
- **Ships ve F2.**

### 4. LTC = DEFERRED do samostatného bundlu (po/s F3)
- LTC decode = biphase-mark audio, notoricky fiddly; potřebuje native: `libltc-wrapper` (codec, bitfocus, prebuilt arm64, stale 2022 ale production u Companion) + `audify` (RtAudio/CoreAudio device I/O, maintained 2025).
- Náklad: 2 native addony → DMG `asarUnpack` + notarizace native `.node` (lekce `feedback_electron_workspace_imports_packed`). To je přesně práce, kterou dělá **F3 (signed/notarized DMG)** — LTC se tam přirozeně páruje.
- **Decision:** F2 NEobsahuje LTC. Trigger typ `timecode` má `source: 'ltc'|'mtc'|'internal'` — ve F2 funguje `internal` + `mtc`; `ltc` je inert (UI volitelné, klid) do LTC bundlu.
- Pořadí dle research: internal clock → MTC → (LTC gen → LTC decode) v pozdějším bundlu. LTC gen je snazší než decode → split.

### 5. Timecode trigger wiring
- `scheduler.ts:49-51` dnes vrací null pro timecode. F2: TriggerEngine subscribuje master clock; armed timecode-trigger cues fire když aktivní clock překročí `time_ms` → publish `cuelist-go` (`by_operator_id:'timecode'`). UI buňka už existuje (B003/3.6).
- Pozn.: cue-fire vs cuelist-go bridge — ověřit cestu (GoExecutor poslouchá cue-fire; TriggerEngine emituje cuelist-go; bridging v cuelist-core).

### 6. Big timecode display (Kobbi + MX4D)
- Nový sdílený `TimecodeDisplay.tsx`: velké mono tabular-nums číslice (≥48px, GT America Mono), show time HH:MM:SS:FF + source indikátor (INT/MTC/LTC + lock stav) + elapsed/remaining.
- Umístění: PlaybackHeader (SM) **+ operator views** (dnes bez headeru — přidat). Vidět na všech pracovištích (Kobbi: „měla by vidět na všech").

### 7. Countdown-only view + Pi kiosk
- Nová role `countdown` (rozšířit role enum `pwa/src/lib/types.ts:16`, StationRouter, PairingView). `CountdownView.tsx` = obří číslice + current/next cue label, subscribe clock, žádné cue ovládání (no authority).
- Pi recept = doc artefakt (Pi 4 + Chromium kiosk + countdown URL). „Hardware odpočtový modul skoro zadarmo" (Kobbi).

---

## F2 task breakdown (bundle ShowX-5)
B005-001 master clock · 002 broadcast+PWA interpolace · 003 big TC display · 004 timecode trigger live · 005 MTC decode (chase in) · 006 MTC generate (out) · 007 show time OSC broadcast · 008 countdown view+role · 009 Pi recept (docs) · 010 E2E gate.

LTC (in/out) = samostatný budoucí bundle, gated za F3 native-addon/DMG práci.
