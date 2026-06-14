import { useI18n } from '../lib/i18n'

interface FeatureArea {
  slug: string
  letter: string
  tier: string
  name: { cs: string; en: string }
  tagline: { cs: string; en: string }
  body: { cs: string; en: string }
  bullets: { cs: string[]; en: string[] }
  note?: { cs: string; en: string }
}

interface CrossFeature {
  slug: string
  number: string
  name: { cs: string; en: string }
  body: { cs: string; en: string }
  snippet?: string
}

const areas: FeatureArea[] = [
  {
    slug: 'cuelist-core',
    letter: 'A',
    tier: 'Free / Pro',
    name: { cs: 'Cuelist Core', en: 'Cuelist Core' },
    tagline: {
      cs: 'Jeden show dokument. Cuelist. Cue + payloady.',
      en: 'One show doc. Cuelist. Cue + payloads.',
    },
    body: {
      cs: 'Multi-operator cuelist nad jedním sdíleným show dokumentem. Per-department views (LX/SX/VIDEO/PYRO/FS/AUTO) jsou filtr nad stejným modelem. Compound cue = jedna cue, víc payloadů pro různá oddělení. Přepínání REHEARSAL ↔ SHOW režim. Inline editace, desetinná čísla cue, autoring (přidat/vložit/smazat/táhnout) přímo v prohlížeči.',
      en: 'A multi-operator cuelist over one shared show document. Per-department views (LX/SX/VIDEO/PYRO/FS/AUTO) are filters over the same model. A compound cue = one cue, multiple department payloads. Toggle REHEARSAL ↔ SHOW mode. Inline editing, decimal cue numbers, authoring (add/insert/delete/drag) right in the browser.',
    },
    bullets: {
      cs: [
        'Payloady (autorovatelné v prohlížeči): OSC, MIDI, MSC, DMX (Art-Net + sACN), webhook, wait, group, lx_ref (Eos/MA3/ChamSys/Hog)',
        'Triggery: manual GO, auto-follow, auto-continue (delay), timecode, hotkey',
        'Časování: pre-wait (před-čekání), duration, živý odpočet v řádku + elapsed/remaining v hlavičce',
        'GO ergonomie: armed zelený rámeček, Back, hold-to-GO v SHOW, panic',
        'Disarm (odjištění) — přeskočí cue a zachová řetěz',
        'Audition / náhled GO — odpálí cue BEZ reálného výstupu (vidíš, co by poslala)',
        'Stanice: PWA v prohlížeči (iPad/Mac/Win), mDNS discovery, QR + PIN párování',
        'Local-first (Yjs CRDT) — show běží dál i když spadne Wi-Fi',
      ],
      en: [
        'Payloads (authorable in the browser): OSC, MIDI, MSC, DMX (Art-Net + sACN), webhook, wait, group, lx_ref (Eos/MA3/ChamSys/Hog)',
        'Triggers: manual GO, auto-follow, auto-continue (delay), timecode, hotkey',
        'Timing: pre-wait, duration, live countdown in the row + elapsed/remaining in the header',
        'GO ergonomics: armed green border, Back, hold-to-GO in SHOW, panic',
        'Disarm — skip a cue, keep the chain intact',
        'Audition / preview GO — fire a cue with NO real output (see what it would send)',
        'Stations: PWA in any browser (iPad/Mac/Win), mDNS discovery, QR + PIN pairing',
        'Local-first (Yjs CRDT) — run the show even if Wi-Fi drops',
      ],
    },
  },
  {
    slug: 'time-layer',
    letter: 'B',
    tier: 'Pro+',
    name: { cs: 'Time layer', en: 'Time layer' },
    tagline: {
      cs: 'Hlavní hodiny. Timecode chase + generování.',
      en: 'Master clock. Timecode chase + generate.',
    },
    body: {
      cs: 'Jeden zdroj času pro celou show. Hlavní hodiny (interní free-run) řídí všechno, velký timecode display (HH:MM:SS:FF) je na všech views — SM, operátor, shell, odpočet. ShowX umí chase i generovat MTC a LTC, fire cues podle timecode a broadcastovat show-time přes OSC do externích displejů a automatizace.',
      en: 'One source of time for the whole show. The master clock (internal free-run) drives everything; the big timecode display (HH:MM:SS:FF) is on every view — SM, operator, shell, countdown. ShowX can chase and generate MTC and LTC, fire cues on timecode, and broadcast show-time over OSC to external displays and automation.',
    },
    bullets: {
      cs: [
        'Hlavní hodiny (master clock) — jeden zdroj pro vše',
        'Velký timecode display (HH:MM:SS:FF) na všech views',
        'MTC (MIDI Time Code) chase IN + generování OUT',
        'LTC (Linear/SMPTE) chase IN + generování OUT',
        'Cues spouštěné timecodem (fire když hodiny překročí TC)',
        'Show-time OSC broadcast (řízení externích displejů/automatizace)',
        'Odpočtová stanice — obří číslice na zeď, běží na Raspberry Pi v Chromium kiosku (recept v docs)',
      ],
      en: [
        'Master clock — one source for everything',
        'Big timecode display (HH:MM:SS:FF) on all views',
        'MTC (MIDI Time Code) chase IN + generate OUT',
        'LTC (Linear/SMPTE) chase IN + generate OUT',
        'Timecode-triggered cues (fire when the clock crosses a TC)',
        'Show-time OSC broadcast (drive external displays/automation)',
        'Countdown-only view — giant digits for a wall, runs on a Raspberry Pi in a Chromium kiosk (recipe in docs)',
      ],
    },
    note: {
      cs: 'LTC vyžaduje audio interface; live-signal lock je ověřený na hardwaru.',
      en: 'LTC needs an audio interface; live-signal lock is validated on hardware.',
    },
  },
  {
    slug: 'trust-safety',
    letter: 'C',
    tier: 'Pro+',
    name: { cs: 'Trust & Safety', en: 'Trust & Safety' },
    tagline: {
      cs: 'Cue lights. Zdraví zařízení. Failover.',
      en: 'Cue lights. Device health. Failover.',
    },
    body: {
      cs: 'Software cue lights jsou moderní náhrada za vyřazený ETC CueSystem: SM pošle STANDBY oddělení → operátorská stanice ukáže velké STANDBY + ACKNOWLEDGE → SM vidí, kdo je připravený → GO. K tomu zdraví zařízení per-device (zelená/červená) z reálných výsledků dispatchu, potvrzený stav z OSC odpovědí, primární + záložní cíl s failoverem a předshow kontrola.',
      en: 'Software cue lights are the modern replacement for the discontinued ETC CueSystem: the SM sends STANDBY to a department → the operator station shows a big STANDBY + ACKNOWLEDGE → the SM sees who is ready → GO. Plus per-device health (green/red) from real dispatch outcomes, confirmed state from OSC replies, primary + backup destination with failover, and a pre-show check.',
    },
    bullets: {
      cs: [
        'Cue lights protokol: SM standby → operátor potvrzení → SM vidí připravenost → GO',
        'Zdraví zařízení per-device (zelená/červená) v Routing + na stanicích, z reálného dispatchu',
        'Potvrzený stav zařízení přes OSC odpověď (kde to gear umí — Eos/QLab)',
        'Multi-destination patch: primární + záložní cíl, failover',
        'Předshow kontrola (wizard): zařízení dostupná? assety k dispozici? stanice spárované?',
        'Návrhy změn v SHOW: operátoři navrhnou edit v zamčeném SHOW, SM schvaluje',
        'Oprávnění operátorů: kdo smí GO co (SM vs per-department)',
      ],
      en: [
        'Cue lights protocol: SM standby → operator acknowledge → SM sees readiness → GO',
        'Per-device health (green/red) in Routing + stations, from real dispatch',
        'Confirmed device state via OSC reply (where the gear supports it — Eos/QLab)',
        'Multi-destination patch: primary + backup, failover',
        'Pre-show health check wizard: devices reachable? assets present? stations paired?',
        'SHOW-mode proposals: operators propose edits during a locked SHOW, the SM accepts',
        'Per-operator authority: who may GO what (SM vs per-department)',
      ],
    },
  },
  {
    slug: 'ai-showcaller',
    letter: 'D',
    tier: 'Pro+',
    name: { cs: 'AI Showcaller', en: 'AI Showcaller' },
    tagline: {
      cs: 'Diferenciátor. Cue lights a hlas jsou stejná data.',
      en: 'The differentiator. Cue lights and voice are the same data.',
    },
    body: {
      cs: 'Caller script per cue (standby + go text pro každé oddělení). ShowX generuje hlášky ze scénáře deterministickou šablonou a agreguje souběžné marky („Světla, pyro, zvuk — standby… GO"). Volitelně LLM draft (Claude) pro přirozenější formulaci — vždy editovatelný. Klíčový insight: cue lights a AI caller jsou STEJNÁ data — jedno ukázané jako světlo, druhé vyslovené.',
      en: 'A caller script per cue (per-department standby + go text). ShowX generates calls from the sheet with a deterministic template and aggregates simultaneous marks ("Lights, pyro, sound — standby… GO"). Optional LLM draft (Claude) for natural phrasing — always editable. Key insight: cue lights and the AI caller are the SAME data — one shown as light, one spoken.',
    },
    bullets: {
      cs: [
        'Caller script per cue (standby + go text per oddělení)',
        'Generování ze scénáře — deterministická šablona + agregace souběžných marků',
        'LLM draft (Claude) pro přirozené formulace — volitelný, vždy editovatelný',
        'Klonování hlasu (ElevenLabs) — vlastní hlas showcallera',
        'Předgenerování při zkoušce → audio zamrzlé do .showx → lokální přehrávání při show (bez internetu, bez latence)',
        'Interrupt — velké TAKE OVER / MUTE, přeruší AI do <200 ms, showcaller mluví živě',
        'Intercom výstup — hlas callera do zvoleného audio zařízení (intercom)',
      ],
      en: [
        'Caller script per cue (per-department standby + go text)',
        'Generate from the sheet — deterministic template + aggregation of simultaneous marks',
        'LLM draft (Claude) for natural phrasing — optional, always editable',
        'Voice clone (ElevenLabs) — the showcaller’s own voice',
        'Rehearsal pre-generation → audio frozen into the .showx package → local playback at show (no internet, no latency)',
        'Interrupt — big TAKE OVER / MUTE, cuts the AI in <200 ms so the caller speaks live',
        'Intercom out — caller voice routed to a chosen audio device (intercom)',
      ],
    },
    note: {
      cs: 'Klonování hlasu vyžaduje ElevenLabs API klíč; LLM draft vyžaduje Anthropic klíč. Bez nich se tyto funkce elegantně vypnou.',
      en: 'Voice clone needs an ElevenLabs API key; the LLM draft needs an Anthropic key. Without them those features gracefully disable.',
    },
  },
  {
    slug: 'protocols-io',
    letter: 'E',
    tier: 'Pro+',
    name: { cs: 'Protocols I/O', en: 'Protocols I/O' },
    tagline: {
      cs: 'OSC, MIDI, MSC, DMX, webhook, MTC, LTC, mDNS.',
      en: 'OSC, MIDI, MSC, DMX, webhook, MTC, LTC, mDNS.',
    },
    body: {
      cs: 'Routing UI mapuje payloady → zařízení, s per-device zdravím. Vše obousměrné tam, kde to dává smysl. Tahle vrstva je společná pro cuelist i time layer.',
      en: 'The Routing UI maps payloads → devices, with per-device health. Everything bidirectional where it makes sense. This layer is shared by both the cuelist and the time layer.',
    },
    bullets: {
      cs: [
        'OSC (out + in)',
        'MIDI (out + in)',
        'MSC (MIDI Show Control)',
        'DMX Art-Net + DMX sACN',
        'Webhook (out + in)',
        'MTC (in + out), LTC (in + out)',
        'mDNS discovery',
        'Routing UI: payload → device mapping + per-device health',
      ],
      en: [
        'OSC (out + in)',
        'MIDI (out + in)',
        'MSC (MIDI Show Control)',
        'DMX Art-Net + DMX sACN',
        'Webhook (out + in)',
        'MTC (in + out), LTC (in + out)',
        'mDNS discovery',
        'Routing UI: payload → device mapping + per-device health',
      ],
    },
  },
  {
    slug: 'import-export',
    letter: 'F',
    tier: 'Free / Pro',
    name: { cs: 'Import / Export', en: 'Import / Export' },
    tagline: {
      cs: 'CSV in. JSON / PDF out. Otevřený .showx.',
      en: 'CSV in. JSON / PDF out. Open .showx.',
    },
    body: {
      cs: 'Naimportuj existující sheet z QLabu nebo Eosu přes CSV (oba dialekty, včetně mapování pre-wait/post-wait), exportuj do JSON nebo PDF. Show file je otevřený .showx package — žádný proprietární binární formát.',
      en: 'Import an existing QLab or Eos sheet via CSV (both dialects, including pre-wait/post-wait mapping), export to JSON or PDF. The show file is an open .showx package — no proprietary binary format.',
    },
    bullets: {
      cs: [
        'CSV import (dialekty QLab + Eos, vč. mapování pre-wait/post-wait)',
        'JSON export',
        'PDF export',
        'Otevřený .showx package: Yjs doc + cuelisty + snapshoty + media + history',
      ],
      en: [
        'CSV import (QLab + Eos dialects, incl. pre-wait/post-wait mapping)',
        'JSON export',
        'PDF export',
        'Open .showx package: Yjs doc + cuelists + snapshots + media + history',
      ],
    },
  },
]

const installSteps: { cs: string; en: string }[] = [
  {
    cs: 'Stáhni `ShowX-0.7.0-arm64.dmg` (Apple Silicon Mac). Je NEPODEPSANÝ (interní) → první otevření: pravý klik → Otevřít, nebo `xattr -dr com.apple.quarantine /Applications/ShowX.app`.',
    en: 'Download `ShowX-0.7.0-arm64.dmg` (Apple Silicon Mac). It is UNSIGNED (internal) → first open: right-click → Open, or `xattr -dr com.apple.quarantine /Applications/ShowX.app`.',
  },
  {
    cs: 'Přetáhni ShowX do Applications.',
    en: 'Drag ShowX to Applications.',
  },
  {
    cs: 'Spusť. Pro testování použij fixní párovací PIN: spusť s `SHOWX_PAIRING_TEST_PIN=000000` (terminál) → PIN 000000 nikdy nevyprší.',
    en: 'Launch. For testing, use a fixed pairing PIN: launch with `SHOWX_PAIRING_TEST_PIN=000000` (terminal) → PIN 000000 never expires.',
  },
  {
    cs: 'Otevři show (demo show je součástí) nebo vytvoř novou.',
    en: 'Open a show (a demo show is included) or create one.',
  },
  {
    cs: 'Na druhém zařízení (nebo v dalším tabu) otevři URL stanice zobrazené v ShowX (mDNS / LAN IP), naskenuj QR nebo zadej PIN a vyber roli (SM / operátor / odpočet).',
    en: 'On another device (or browser tab), open the station URL shown in ShowX (mDNS / LAN IP), scan the QR or enter the PIN, pick a role (SM / operator / countdown).',
  },
  {
    cs: 'Volitelné klíče: ElevenLabs (AI hlas), Anthropic (LLM draft) — nastav v appce; bez nich se tyto funkce elegantně vypnou.',
    en: 'Optional keys: ElevenLabs (AI voice), Anthropic (LLM draft) — set them in the app; without them those features gracefully disable.',
  },
  {
    cs: 'Ověř OSC na drátě: `nc -ul 7000`. DMX: capture Art-Net/sACN.',
    en: 'Verify OSC on the wire: `nc -ul 7000`. DMX: Art-Net/sACN capture.',
  },
]

const crossFeatures: CrossFeature[] = [
  {
    slug: 'compound',
    number: '01',
    name: { cs: 'Compound cues', en: 'Compound cues' },
    body: {
      cs: 'Jedna cue „Door slam" nese tři payloady: SX audio, LX cue 47 na Eos, VIDEO marker v Disguise. Každé oddělení vidí svůj payload ve svém per-department view. Stage Manager vidí všechny tři vedle sebe. GO spustí všechny tři naráz, nebo s offsety podle trigger pravidel.',
      en: 'One cue "Door slam" carries three payloads: SX audio, LX cue 47 on Eos, VIDEO marker in Disguise. Each department sees its own payload in its per-department view. The Stage Manager sees all three side by side. GO fires all three at once, or with offsets per trigger rules.',
    },
    snippet: `{
  "id": "01J8H7K2V9...",
  "label": "Q 47 — Door slam",
  "department": ["LX", "SX", "VIDEO"],
  "trigger": { "mode": "manual" },
  "payloads": [
    { "type": "lx_ref", "console": "eos", "list": 1, "cue": 47 },
    { "type": "osc", "device": "qlab", "address": "/cue/door_slam/start" },
    { "type": "osc", "device": "disguise", "address": "/d3/showcontrol/cue", "args": [1,47,0] }
  ]
}`,
  },
  {
    slug: 'cue-lights-voice',
    number: '02',
    name: { cs: 'Cue lights = AI hlas', en: 'Cue lights = AI voice' },
    body: {
      cs: 'Cue lights a AI showcaller čtou stejná data. Standby pro oddělení se ukáže jako velké STANDBY na stanici toho oddělení (operátor potvrdí) A zároveň se vysloví hlasem callera. Jeden zdroj pravdy, dvě modality. Proto agregace souběžných marků („Světla, pyro, zvuk — standby… GO") platí pro obojí.',
      en: 'Cue lights and the AI showcaller read the same data. A department standby shows as a big STANDBY on that department’s station (operator acknowledges) AND is spoken by the caller voice. One source of truth, two modalities. That is why the aggregation of simultaneous marks ("Lights, pyro, sound — standby… GO") applies to both.',
    },
  },
  {
    slug: 'local-first',
    number: '03',
    name: { cs: 'Local-first běh show', en: 'Local-first show runtime' },
    body: {
      cs: 'Každá stanice drží plnou Yjs CRDT replikaci show dokumentu. Edity merge bez konfliktu. Když spadne Wi-Fi nebo broker, stanice fungují dál lokálně a dohoní sync při reconnect. AI hlas se předgeneruje při zkoušce a zamrzne do .showx, takže při show se přehrává lokálně — bez internetu, bez latence. To je smysl „LAN-first".',
      en: 'Every station holds a full Yjs CRDT replica of the show document. Edits merge conflict-free. If Wi-Fi or the broker drops, stations keep running locally and resync on reconnect. The AI voice is pre-generated at rehearsal and frozen into the .showx, so at show time it plays locally — no internet, no latency. That is what "LAN-first" means.',
    },
  },
  {
    slug: 'showx-format',
    number: '04',
    name: { cs: 'Otevřený .showx package', en: 'Open .showx package' },
    body: {
      cs: 'Show file je adresář, ne proprietární binárka. Yjs doc + cuelisty + snapshoty + media + history audit log. Když ze ShowX odejdeš, show jde s tebou. Když XLAB zítra zmizí, show se otevře v textovém editoru.',
      en: 'The show file is a directory, not a proprietary binary. Yjs doc + cuelists + snapshots + media + a history audit log. Walk away from ShowX, the show walks with you. If XLAB disappeared tomorrow, the show opens in a text editor.',
    },
    snippet: `hamlet_2026-06-17.showx/
├── manifest.json        # show meta, devices, cuelists, cues
├── history.jsonl        # append-only audit log
├── snapshots/           # SHOW-mode payload snapshots
├── scripts/             # optional prompt-book PDFs
└── assets/              # local audio/video + pre-gen AI voice`,
  },
]

export function Features() {
  const { t, lang } = useI18n()
  const cs = lang === 'cs'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">
                {cs ? 'Funkce · v0.7.0 internal preview' : 'Features · v0.7.0 internal preview'}
              </div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {cs ? 'Všechno, co' : 'Everything'}<br />
                <em className="font-light text-accent-deep not-italic">
                  {cs ? 'je postavené.' : 'that is built.'}
                </em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">
                {cs
                  ? 'LAN-first FOH show-control na Macu — cuelist, timecode, cue lights a AI showcaller. Stanice běží v prohlížeči, žádná instalace pro operátory. Tohle je kompletní inventář funkcí postavených ve v0.7.0 (interní preview, ~2240 testů), seskupený podle oblastí A–F. Pro testery: konkrétně a upřímně, včetně toho, co potřebuje hardware nebo klíče.'
                  : 'LAN-first FOH show control on a Mac — cuelist, timecode, cue lights and an AI showcaller. Stations run in any browser, zero install for operators. This is the full inventory of features built in v0.7.0 (internal preview, ~2240 tests), grouped by area A–F. For testers: concrete and honest, including what needs hardware or keys.'}
              </p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">02</div>
      </section>

      {/* FEATURE AREAS */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="section-label mb-10">
            {cs ? 'Šest oblastí · A–F' : 'Six areas · A–F'}
          </div>
          <div className="space-y-20">
            {areas.map(a => (
              <article key={a.slug} id={a.slug} className="grid grid-cols-12 gap-8 scroll-mt-24">
                <div className="col-span-12 md:col-span-3">
                  <div className="font-mono text-xs text-accent-deep mb-3">{a.letter}</div>
                  <div className="badge bg-ink text-accent border-ink mb-4 inline-block">{a.tier}</div>
                  <h2 className="display-serif text-3xl mb-2">{cs ? a.name.cs : a.name.en}</h2>
                  <p className="text-sm italic text-muted">{cs ? a.tagline.cs : a.tagline.en}</p>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <p className="copy">{cs ? a.body.cs : a.body.en}</p>
                  <ul className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    {(cs ? a.bullets.cs : a.bullets.en).map((b, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="font-mono text-[10px] text-accent-deep mt-1.5">●</span>
                        <span className="copy">{b}</span>
                      </li>
                    ))}
                  </ul>
                  {a.note && (
                    <p className="mt-6 text-sm text-muted border-l-2 border-accent pl-4">
                      {cs ? a.note.cs : a.note.en}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* HOW THE PIECES FIT */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Jak to drží pohromadě' : 'How it fits'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Čtyři principy napříč' : 'Four principles across'}<br />
                <span className="text-accent-deep italic font-light">
                  {cs ? 'celým produktem.' : 'the whole product.'}
                </span>
              </h2>
            </div>
          </div>
          <div className="space-y-16">
            {crossFeatures.map(f => (
              <article key={f.slug} id={f.slug} className="grid grid-cols-12 gap-8 scroll-mt-24">
                <div className="col-span-12 md:col-span-3">
                  <div className="font-mono text-xs text-accent-deep mb-3">{f.number}</div>
                  <h3 className="display-serif text-2xl">{cs ? f.name.cs : f.name.en}</h3>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <p className="copy">{cs ? f.body.cs : f.body.en}</p>
                  {f.snippet && (
                    <pre className="mt-6 bg-ink text-cream/90 font-mono text-[11px] leading-relaxed p-6 rounded-sm overflow-x-auto border border-rule">
                      <code>{f.snippet}</code>
                    </pre>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* INSTALL GUIDE FOR TESTERS */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Pro testery' : 'For testers'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Instalace v sedmi krocích.' : 'Install in seven steps.'}
              </h2>
              <p className="copy mt-6 max-w-2xl">
                {cs
                  ? 'v0.7.0 je interní preview, ne veřejný prodej. Build je nepodepsaný; podepsaný/notarizovaný build a plná hardwarová validace LTC se teprve dodělávají.'
                  : 'v0.7.0 is an internal preview, not public sale. The build is unsigned; a signed/notarized build and full LTC hardware validation are still pending.'}
              </p>
            </div>
          </div>
          <ol className="grid grid-cols-12 gap-x-8 gap-y-6">
            {installSteps.map((s, i) => (
              <li key={i} className="col-span-12 md:col-span-6 flex items-start gap-4 scroll-mt-24">
                <span className="font-mono text-sm text-accent-deep mt-0.5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <span className="copy text-sm">{cs ? s.cs : s.en}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ROADMAP + CTA */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-center">
            <div className="col-span-12 md:col-span-8">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Tohle je v0.7.0 — postaveno teď.' : 'This is v0.7.0 — built now.'}<br />
                <span className="text-muted italic font-light">
                  {cs
                    ? 'Na roadmapě 1.0: rundown vrstva, ceny live, produktový web. (EventX integrace zatím ne.)'
                    : 'On the 1.0 roadmap: rundown layer, pricing live, product web. (EventX integration not yet.)'}
                </span>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 flex flex-wrap gap-3">
              <a href="mailto:hello@xlabproject.net?subject=ShowX%20preview" className="btn-primary">
                {t('nav.preview')}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
