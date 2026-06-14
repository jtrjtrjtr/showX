import { useI18n } from '../lib/i18n'

interface DocCard {
  number: string
  title: { cs: string; en: string }
  body: { cs: string; en: string }
  href: string
  external?: boolean
  badge?: { cs: string; en: string }
}

const cards: DocCard[] = [
  {
    number: '01',
    title: { cs: 'Developer documentation', en: 'Developer documentation' },
    body: {
      cs: 'Root index pro developer docs. Postup setup, architektonický overview, jak přispět.',
      en: 'Root index for developer docs. Setup walkthrough, architectural overview, how to contribute.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/blob/main/docs/dev/index.md',
    external: true,
  },
  {
    number: '02',
    title: { cs: 'Architecture overview', en: 'Architecture overview' },
    body: {
      cs: 'Electron shell, modul loader, shared services (Dispatcher, SyncBroker, AssetServer, mDNS, Pairing), IPC layout, PWA wire-up.',
      en: 'Electron shell, module loader, shared services (Dispatcher, SyncBroker, AssetServer, mDNS, Pairing), IPC layout, PWA wire-up.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/blob/main/docs/specs/module_loader.md',
    external: true,
  },
  {
    number: '03',
    title: { cs: 'Module SDK', en: 'Module SDK' },
    body: {
      cs: 'Jak napsat ShowX modul. ModuleContext API, lifecycle hooks (init/start/stop), shared service access, persistence patterns.',
      en: 'How to write a ShowX module. ModuleContext API, lifecycle hooks (init/start/stop), shared service access, persistence patterns.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/blob/main/docs/specs/module_loader.md#sdk',
    external: true,
  },
  {
    number: '04',
    title: { cs: 'Protocol reference', en: 'Protocol reference' },
    body: {
      cs: 'OSC dictionary, MIDI mapping, MSC commands, DMX Art-Net + sACN universe routing, MTC/LTC sync, webhook payloads.',
      en: 'OSC dictionary, MIDI mapping, MSC commands, DMX Art-Net + sACN universe routing, MTC/LTC sync, webhook payloads.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/blob/main/docs/specs/protocol_dictionary.md',
    external: true,
  },
  {
    number: '05',
    title: { cs: 'Data model', en: 'Data model' },
    body: {
      cs: 'Show, Cuelist, Cue, Payload, Device entities. Yjs document layout. .showx package directory layout.',
      en: 'Show, Cuelist, Cue, Payload, Device entities. Yjs document layout. .showx package directory layout.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/blob/main/docs/specs/data_model.md',
    external: true,
  },
  {
    number: '06',
    title: { cs: 'Pairing + auth', en: 'Pairing + auth' },
    body: {
      cs: 'Lokální pairing token flow (QR + 6-digit PIN). mDNS discovery handshake. Manual fallback pro non-mDNS prostředí.',
      en: 'Local pairing token flow (QR + 6-digit PIN). mDNS discovery handshake. Manual fallback for non-mDNS environments.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/blob/main/docs/specs/pairing_auth.md',
    external: true,
  },
  {
    number: '07',
    title: { cs: 'Testing + CI', en: 'Testing + CI' },
    body: {
      cs: 'Vitest unit tests, Playwright E2E, broker chaos testing, ~2240 testů, GitHub Actions.',
      en: 'Vitest unit tests, Playwright E2E, broker chaos testing, ~2240 tests, GitHub Actions.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/blob/main/docs/dev/testing.md',
    external: true,
  },
  {
    number: '08',
    title: { cs: 'Strategy docs (ShowX MVP scope)', en: 'Strategy docs (ShowX MVP scope)' },
    body: {
      cs: 'Master MVP scope: pitch, target users, modules, pricing, roadmap. Plus product family map a competitive research.',
      en: 'Master MVP scope: pitch, target users, modules, pricing, roadmap. Plus product family map and competitive research.',
    },
    href: 'https://github.com/xlab/xlab-strategy/blob/main/docs/showx_mvp_scope.md',
    external: true,
    badge: { cs: 'Strategy', en: 'Strategy' },
  },
  {
    number: '09',
    title: { cs: 'Open decisions', en: 'Open decisions' },
    body: {
      cs: 'Architektonické decision notes (Architect ratifies). Why LAN-first, why GO event off-CRDT, atd.',
      en: 'Architectural decision notes (Architect ratifies). Why LAN-first, why GO event off-CRDT, etc.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/tree/main/docs/agent_exchange/decisions',
    external: true,
  },
  {
    number: '10',
    title: { cs: 'Bundle progress', en: 'Bundle progress' },
    body: {
      cs: 'Live task dashboard: F1 operator essentials → F2 time → F3 trust + cue lights → F4 AI showcaller → LTC. Status per task.',
      en: 'Live task dashboard: F1 operator essentials → F2 time → F3 trust + cue lights → F4 AI showcaller → LTC. Status per task.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/blob/main/docs/agent_exchange/TASK_DASHBOARD.md',
    external: true,
    badge: { cs: 'Live', en: 'Live' },
  },
]

// ── Architecture pieces ──────────────────────────────────────────────
interface ArchRow {
  k: string
  title: { cs: string; en: string }
  body: { cs: string; en: string }
}
const arch: ArchRow[] = [
  {
    k: 'app',
    title: { cs: 'Jeden Electron app na FOH Macu', en: 'One Electron app on the FOH Mac' },
    body: {
      cs: 'Celý runtime běží jako jediný signed Electron proces na FOH Macu — modul loader + shared services. Žádný server, žádný cloud pro provoz venue.',
      en: 'The whole runtime is a single signed Electron process on the FOH Mac — module loader + shared services. No server, no cloud needed to run a venue.',
    },
  },
  {
    k: 'stations',
    title: { cs: 'Stanice = PWA v prohlížeči přes LAN', en: 'Stations = browser PWA over LAN' },
    body: {
      cs: 'Operátoři otevřou stanici v libovolném prohlížeči (iPad / Mac / Win) — žádná instalace. PWA se připojí k FOH Macu přes LAN. Role: SM / operátor / odpočtová stanice.',
      en: 'Operators open a station in any browser (iPad / Mac / Win) — zero install. The PWA connects to the FOH Mac over the LAN. Roles: SM / operator / countdown.',
    },
  },
  {
    k: 'crdt',
    title: { cs: 'Local-first Yjs CRDT', en: 'Local-first Yjs CRDT' },
    body: {
      cs: 'Jeden sdílený show dokument je Yjs CRDT replikovaný na každou stanici (y-indexeddb). Když Wi-Fi vypadne, stanice běží dál z lokální repliky a po obnovení se sloučí — žádné WAN není potřeba.',
      en: 'The one shared show doc is a Yjs CRDT replicated to every station (y-indexeddb). If Wi-Fi drops, a station keeps running off its local replica and merges back on reconnect — no WAN required.',
    },
  },
  {
    k: 'broker',
    title: { cs: 'Embedded sync broker + asset server', en: 'Embedded sync broker + asset server' },
    body: {
      cs: 'SyncBroker (embedded y-websocket) drží Yjs repliky v synchronizaci. AssetServer (Express) servíruje PWA bundle a media na portu 5300. Oboje uvnitř Electron main procesu.',
      en: 'The SyncBroker (embedded y-websocket) keeps Yjs replicas in sync. The AssetServer (Express) serves the PWA bundle and media on port 5300. Both live inside the Electron main process.',
    },
  },
  {
    k: 'mdns',
    title: { cs: 'mDNS discovery', en: 'mDNS discovery' },
    body: {
      cs: 'FOH Mac advertuje `_showx._tcp.local`. Stanice ho na LAN najdou samy. Manuální URL fallback (`http://<ip>:5300`) pro sítě, kde je mDNS blokované (corporate Wi-Fi, VPN, firewall).',
      en: 'The FOH Mac advertises `_showx._tcp.local`. Stations find it on the LAN automatically. A manual URL fallback (`http://<ip>:5300`) covers networks where mDNS is blocked (corporate Wi-Fi, VPN, firewall).',
    },
  },
  {
    k: 'pairing',
    title: { cs: 'Pairing tokeny', en: 'Pairing tokens' },
    body: {
      cs: 'Stanice se spáruje QR kódem nebo 6-místným PINem. Token se ukládá AES-GCM šifrovaný. Pro testování: spuštění s `SHOWX_PAIRING_TEST_PIN=000000` dá fixní PIN bez expirace.',
      en: 'A station pairs by QR code or a 6-digit PIN. The token is stored AES-GCM encrypted. For testing: launch with `SHOWX_PAIRING_TEST_PIN=000000` for a fixed, non-expiring PIN.',
    },
  },
]

// ── Protocols I/O reference ──────────────────────────────────────────
interface ProtoRow {
  proto: string
  dir: { cs: string; en: string }
  port: string | { cs: string; en: string }
  notes: { cs: string; en: string }
}
const protocols: ProtoRow[] = [
  {
    proto: 'OSC',
    dir: { cs: 'out + in', en: 'out + in' },
    port: 'UDP 7000 / 8000',
    notes: {
      cs: 'Address + typed args. Příchozí OSC může triggerovat cue; OSC reply slouží jako device feedback (Eos/QLab).',
      en: 'Address + typed args. Inbound OSC can trigger a cue; OSC reply gives device feedback (Eos/QLab).',
    },
  },
  {
    proto: 'MIDI',
    dir: { cs: 'out + in', en: 'out + in' },
    port: { cs: 'CoreMIDI port', en: 'CoreMIDI port' },
    notes: {
      cs: 'Note / CC / program change přes CoreMIDI. Příchozí MIDI lze namapovat na trigger.',
      en: 'Note / CC / program change over CoreMIDI. Inbound MIDI can be mapped to a trigger.',
    },
  },
  {
    proto: 'MSC',
    dir: { cs: 'out', en: 'out' },
    port: { cs: 'přes MIDI', en: 'over MIDI' },
    notes: {
      cs: 'MIDI Show Control — GO / STOP / RESUME na cílové ID zařízení.',
      en: 'MIDI Show Control — GO / STOP / RESUME to a target device ID.',
    },
  },
  {
    proto: 'DMX Art-Net',
    dir: { cs: 'out', en: 'out' },
    port: 'UDP 6454',
    notes: {
      cs: 'Universe + channel values přes Ethernet (broadcast/unicast).',
      en: 'Universe + channel values over Ethernet (broadcast/unicast).',
    },
  },
  {
    proto: 'DMX sACN',
    dir: { cs: 'out', en: 'out' },
    port: 'UDP 5568',
    notes: {
      cs: 'E1.31 streaming ACN — universe + priority, multicast.',
      en: 'E1.31 streaming ACN — universe + priority, multicast.',
    },
  },
  {
    proto: 'Webhook',
    dir: { cs: 'out + in', en: 'out + in' },
    port: 'HTTP(S)',
    notes: {
      cs: 'Odchozí HTTP request jako payload; příchozí endpoint může triggerovat cue.',
      en: 'Outbound HTTP request as a payload; an inbound endpoint can trigger a cue.',
    },
  },
  {
    proto: 'MTC',
    dir: { cs: 'in + out', en: 'in + out' },
    port: { cs: 'přes MIDI', en: 'over MIDI' },
    notes: {
      cs: 'MIDI Time Code — chase IN (hodiny sledují vnější zdroj) + generate OUT.',
      en: 'MIDI Time Code — chase IN (clock follows an external source) + generate OUT.',
    },
  },
  {
    proto: 'LTC',
    dir: { cs: 'in + out', en: 'in + out' },
    port: { cs: 'audio interface', en: 'audio interface' },
    notes: {
      cs: 'Lineární SMPTE audio timecode — chase IN + generate OUT. Vyžaduje audio rozhraní; lock na živý signál ověřen na hardwaru.',
      en: 'Linear SMPTE audio timecode — chase IN + generate OUT. Needs an audio interface; live-signal lock validated on hardware.',
    },
  },
  {
    proto: 'mDNS',
    dir: { cs: 'discovery', en: 'discovery' },
    port: 'UDP 5353',
    notes: {
      cs: 'Advertuje `_showx._tcp.local` pro objevení stanic na LAN.',
      en: 'Advertises `_showx._tcp.local` so stations discover the FOH Mac on the LAN.',
    },
  },
]

// ── Tiers ────────────────────────────────────────────────────────────
interface TierRow {
  name: string
  price: { cs: string; en: string }
  body: { cs: string; en: string }
  pro?: boolean
}
const tiers: TierRow[] = [
  {
    name: 'Free',
    price: { cs: 'zdarma', en: 'free' },
    body: {
      cs: 'Cuelist Core + 1 REHEARSAL stanice. Všechny payload typy a protokoly, jeden operátor.',
      en: 'Cuelist Core + 1 REHEARSAL station. All payload types and protocols, single operator.',
    },
  },
  {
    name: 'Pro',
    price: { cs: '$29 / místo / měs', en: '$29 / seat / mo' },
    body: {
      cs: 'Všechny moduly + multi-operátor + SHOW režim + AI showcaller.',
      en: 'All modules + multi-operator + SHOW mode + AI showcaller.',
    },
    pro: true,
  },
  {
    name: 'Production',
    price: { cs: '$99 / show', en: '$99 / show' },
    body: {
      cs: 'Plné Pro funkce na jednu produkci — bez měsíčního závazku.',
      en: 'Full Pro features for one production — no monthly commitment.',
    },
    pro: true,
  },
  {
    name: 'Team',
    price: { cs: '$499 / měs', en: '$499 / mo' },
    body: {
      cs: 'Více míst pro tým / firmu, vše z Pro.',
      en: 'Multiple seats for a team / company, everything in Pro.',
    },
    pro: true,
  },
]

export function Docs() {
  const { t, lang } = useI18n()
  const cs = lang === 'cs'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">{t('docs.label')} · v0.7.0</div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('docs.headline.line1')}<br />
                <em className="font-light text-accent-deep not-italic">{t('docs.headline.line2')}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">{t('docs.intro')}</p>
              <p className="copy text-sm mt-4 max-w-2xl text-muted">
                {cs
                  ? 'Tahle stránka je technická reference pro testery a integrátory: architektura, protokoly I/O, timecode, formát .showx, import/export, tiery a build poznámky. Stav v0.7.0 — interní preview, ne veřejný prodej.'
                  : 'This page is the technical reference for testers and integrators: architecture, protocols I/O, timecode, the .showx format, import/export, tiers, and build notes. Status v0.7.0 — internal preview, not public sale.'}
              </p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">05</div>
      </section>

      {/* ARCHITECTURE */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-4">
              <div className="section-label mb-4">{cs ? 'A — Architektura' : 'A — Architecture'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'LAN-first.' : 'LAN-first.'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'Žádný cloud na běh.' : 'No cloud to run.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-8">
              <p className="copy">
                {cs
                  ? 'Jeden Electron app na FOH Macu obsluhuje celou show. Stanice běží v prohlížeči přes LAN. Sdílený stav je local-first Yjs CRDT — show pojede i bez WAN. Objevování přes mDNS, párování tokenem.'
                  : 'One Electron app on the FOH Mac drives the whole show. Stations run in the browser over the LAN. Shared state is a local-first Yjs CRDT — the show runs even without WAN. Discovery via mDNS, pairing by token.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-rule border border-rule">
            {arch.map(a => (
              <div key={a.k} className="bg-ground p-8 flex flex-col gap-3 min-h-[180px]">
                <h3 className="display-serif text-lg">{cs ? a.title.cs : a.title.en}</h3>
                <p className="text-sm copy">{cs ? a.body.cs : a.body.en}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROTOCOLS I/O */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-10">
            <div className="col-span-12 md:col-span-4">
              <div className="section-label mb-4">{cs ? 'B — Protokoly I/O' : 'B — Protocols I/O'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'Co umí poslat' : 'What it sends'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'a přijmout.' : 'and receives.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-8">
              <p className="copy">
                {cs
                  ? 'Routing UI mapuje payloady → zařízení. Per-device health (zelená/červená) z reálných výsledků dispatche. Multi-destination patch (primární + záložní) pro failover. Výchozí porty níže lze v aplikaci přepsat.'
                  : 'The routing UI maps payloads → devices. Per-device health (green/red) from real dispatch outcomes. Multi-destination patch (primary + backup) for failover. Default ports below are overridable in the app.'}
              </p>
            </div>
          </div>
          <div className="border border-rule overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink text-cream/90 font-mono text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-normal">{cs ? 'Protokol' : 'Protocol'}</th>
                  <th className="text-left px-4 py-3 font-normal">{cs ? 'Směr' : 'Direction'}</th>
                  <th className="text-left px-4 py-3 font-normal">{cs ? 'Výchozí port' : 'Default port'}</th>
                  <th className="text-left px-4 py-3 font-normal">{cs ? 'Poznámka' : 'Notes'}</th>
                </tr>
              </thead>
              <tbody>
                {protocols.map((p, i) => (
                  <tr key={p.proto} className={i % 2 ? 'bg-cream/40' : 'bg-ground'}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap">{p.proto}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted whitespace-nowrap">
                      {cs ? p.dir.cs : p.dir.en}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-accent-deep whitespace-nowrap">
                      {typeof p.port === 'string' ? p.port : (cs ? p.port.cs : p.port.en)}
                    </td>
                    <td className="px-4 py-3 copy">{cs ? p.notes.cs : p.notes.en}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* TIMECODE */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-4">
              <div className="section-label mb-4">{cs ? 'C — Timecode' : 'C — Timecode'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'Jedny hodiny' : 'One clock'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'pro celou show.' : 'for the whole show.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-px bg-rule border border-rule">
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">{cs ? 'Hlavní hodiny' : 'Master clock'}</h3>
                <p className="text-sm copy">
                  {cs
                    ? 'Jeden zdroj pro vše. Frame rate 24 / 25 / 29.97 drop-frame / 30. Velký timecode displej (HH:MM:SS:FF) na všech pohledech.'
                    : 'One source for everything. Frame rate 24 / 25 / 29.97 drop-frame / 30. Big timecode display (HH:MM:SS:FF) on every view.'}
                </p>
              </div>
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">{cs ? 'MTC + LTC' : 'MTC + LTC'}</h3>
                <p className="text-sm copy">
                  {cs
                    ? 'Chase (sledování) IN i generování OUT pro MTC i LTC. LTC vyžaduje audio rozhraní; lock na živý signál ověřen na hardwaru.'
                    : 'Chase IN and generate OUT for both MTC and LTC. LTC needs an audio interface; live-signal lock validated on hardware.'}
                </p>
              </div>
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">{cs ? 'Timecode triggery' : 'Timecode triggers'}</h3>
                <p className="text-sm copy">
                  {cs
                    ? 'Cue se odpálí, když hodiny přejdou daný timecode. Pro show řízené video serverem.'
                    : 'A cue fires when the clock crosses a timecode. For shows driven by a video server.'}
                </p>
              </div>
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">{cs ? 'Show-time OSC' : 'Show-time OSC'}</h3>
                <p className="text-sm copy">
                  {cs
                    ? 'Broadcast aktuálního času přes OSC pro externí displeje a automatizaci. Odpočtová stanice = obří číslice na zeď (Raspberry Pi v Chromium kiosku).'
                    : 'Broadcast the running clock over OSC to external displays and automation. Countdown station = giant digits for a wall (Raspberry Pi in a Chromium kiosk).'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* .showx FORMAT */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-4">
              <div className="section-label mb-4">{cs ? 'D — Formát .showx' : 'D — The .showx format'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'Otevřený' : 'An open'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'balíček show.' : 'show package.'}</em>
              </h2>
              <p className="copy text-sm mt-6">
                {cs
                  ? 'Celá show je jeden samostatný balíček, který si odnesete a otevřete kdekoli. Žádný proprietární zámek.'
                  : 'A show is one self-contained package you can carry and open anywhere. No proprietary lock-in.'}
              </p>
            </div>
            <div className="col-span-12 md:col-span-8">
              <pre className="bg-ink text-cream/90 font-mono text-[11px] leading-relaxed p-6 rounded-sm overflow-x-auto border border-rule">
                <code>{`show.showx/
├── doc.yjs            # ${cs ? 'Yjs dokument (CRDT stav show)' : 'Yjs document (CRDT show state)'}
├── cuelists/          # ${cs ? 'cuelisty + cue + payloady' : 'cuelists + cues + payloads'}
├── snapshots/         # ${cs ? 'verzované snímky stavu' : 'versioned state snapshots'}
├── media/             # ${cs ? 'assety + předgenerovaný AI hlas' : 'assets + pre-generated AI voice'}
└── history.jsonl      # ${cs ? 'append-only log GO / editů' : 'append-only log of GO / edits'}`}</code>
              </pre>
              <p className="text-xs text-muted mt-4">
                {cs
                  ? 'Yjs doc je zdroj pravdy pro živý stav; snapshots a history.jsonl dávají auditní stopu a rollback. Media drží i AI hlas předgenerovaný při zkoušce — lokální přehrávání při show bez internetu.'
                  : 'The Yjs doc is the source of truth for live state; snapshots and history.jsonl give an audit trail and rollback. Media also holds the AI voice pre-generated at rehearsal — local playback at the show with no internet.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* IMPORT / EXPORT */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-4">
              <div className="section-label mb-4">{cs ? 'E — Import / Export' : 'E — Import / Export'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'Z vašeho' : 'From your'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'stávajícího sheetu.' : 'existing sheet.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-px bg-rule border border-rule">
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">CSV</h3>
                <p className="text-sm copy">
                  {cs
                    ? 'Import z QLab i Eos dialektů, včetně mapování pre-wait / post-wait. Cross-platform booth: importujte existující sheet a operátoři jedou v prohlížeči.'
                    : 'Import from both QLab and Eos dialects, including pre-wait / post-wait mapping. Cross-platform booth: import an existing sheet and operators run in the browser.'}
                </p>
              </div>
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">JSON</h3>
                <p className="text-sm copy">
                  {cs ? 'Export celé struktury cuelistu jako JSON pro skripty a integrace.' : 'Export the full cuelist structure as JSON for scripting and integrations.'}
                </p>
              </div>
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">PDF</h3>
                <p className="text-sm copy">
                  {cs ? 'Export cuelistu do PDF k tisku — running order pro SM a tým.' : 'Export the cuelist to PDF for print — a running order for the SM and crew.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TIERS */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-10">
            <div className="col-span-12 md:col-span-4">
              <div className="section-label mb-4">{cs ? 'F — Tiery' : 'F — Tiers'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'Co je' : 'What is'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'Pro+.' : 'Pro+.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-8">
              <p className="copy">
                {cs
                  ? 'Cuelist Core a všechny protokoly jsou ve Free. Pro+ odemyká AI Showcaller, SHOW režim a (do budoucna) Custom Router a Cloud Sync. Cloud Sync je vždy opt-in — venue runtime na něm nikdy nezávisí.'
                  : 'Cuelist Core and all protocols are in Free. Pro+ unlocks the AI Showcaller, SHOW mode, and (future) Custom Router and Cloud Sync. Cloud Sync is always opt-in — venue runtime never depends on it.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-rule border border-rule">
            {tiers.map(tr => (
              <div key={tr.name} className="bg-ground p-6 flex flex-col gap-3 min-h-[170px]">
                <div className="flex items-center justify-between">
                  <h3 className="display-serif text-xl">{tr.name}</h3>
                  {tr.pro && (
                    <span className="text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm bg-accent text-ink font-mono">
                      Pro+
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-accent-deep">{cs ? tr.price.cs : tr.price.en}</div>
                <p className="text-sm copy">{cs ? tr.body.cs : tr.body.en}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-4">
            {cs
              ? 'Pro+ funkce: AI Showcaller (caller script, generování ze scénáře, klonování hlasu ElevenLabs, interrupt), SHOW režim (lock + návrhy editů + oprávnění operátorů). Custom Router a Cloud Sync jsou na roadmapě.'
              : 'Pro+ features: AI Showcaller (caller script, generate from sheet, ElevenLabs voice clone, interrupt), SHOW mode (lock + edit proposals + operator authority). Custom Router and Cloud Sync are on the roadmap.'}
          </p>
        </div>
      </section>

      {/* BUILD / NATIVE */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-4">
              <div className="section-label mb-4">{cs ? 'G — Build / native' : 'G — Build / native'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'arm64 DMG.' : 'arm64 DMG.'}<br />
                <em className="text-muted italic font-light">{cs ? 'Upřímně k tomu, co chybí.' : 'Honest about what is pending.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-px bg-rule border border-rule">
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">{cs ? 'arm64 DMG' : 'arm64 DMG'}</h3>
                <p className="text-sm copy">
                  {cs
                    ? 'Distribuce jako `ShowX-0.7.0-arm64.dmg` pro Apple Silicon Mac. Přetáhněte do Applications.'
                    : 'Ships as `ShowX-0.7.0-arm64.dmg` for Apple Silicon Macs. Drag into Applications.'}
                </p>
              </div>
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">{cs ? 'LTC build dep' : 'LTC build dep'}</h3>
                <p className="text-sm copy">
                  {cs
                    ? 'LTC audio závislosti se kompilují nativně — pro build je potřeba cmake (`brew install cmake`).'
                    : 'LTC audio deps build natively — you need cmake to build them (`brew install cmake`).'}
                </p>
              </div>
              <div className="bg-ground p-6 flex flex-col gap-2">
                <h3 className="display-serif text-lg">{cs ? 'Podpis / notarizace' : 'Signing / notarization'}</h3>
                <p className="text-sm copy">
                  {cs
                    ? 'Build je zatím NEpodepsaný (interní). Při prvním otevření: pravý klik → Otevřít, nebo `xattr -dr com.apple.quarantine /Applications/ShowX.app`. Podpis + notarizace jsou pending.'
                    : 'The build is UNSIGNED for now (internal). First open: right-click → Open, or `xattr -dr com.apple.quarantine /Applications/ShowX.app`. Signing + notarization are pending.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DOC GRID */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="section-label mb-8">{cs ? 'H — Deep-dive docs (repo)' : 'H — Deep-dive docs (repo)'}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-rule border border-rule">
            {cards.map(c => (
              <a
                key={c.number}
                href={c.href}
                target={c.external ? '_blank' : undefined}
                rel={c.external ? 'noreferrer' : undefined}
                className="group bg-ground p-8 hover:bg-cream transition-colors flex flex-col gap-4 min-h-[220px]"
              >
                <div className="flex items-start justify-between">
                  <span className="font-mono text-xs text-muted">{c.number}</span>
                  {c.badge && (
                    <span className="text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm bg-accent text-ink font-mono">
                      {cs ? c.badge.cs : c.badge.en}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="display-serif text-xl mb-2 group-hover:text-accent-deep transition-colors">
                    {cs ? c.title.cs : c.title.en}
                  </h3>
                  <p className="text-sm copy">{cs ? c.body.cs : c.body.en}</p>
                </div>
                <div className="font-mono text-[10px] text-muted/80 truncate">
                  → {c.href.replace('https://', '')}
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* QUICK START */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-4">
              <div className="section-label mb-4">{cs ? 'Rychlý start' : 'Quick start'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'Pro testery' : 'For testers'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'v pár krocích.' : 'in a few steps.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-8">
              <pre className="bg-ink text-cream/90 font-mono text-[11px] leading-relaxed p-6 rounded-sm overflow-x-auto border border-rule">
                <code>{`# 1. ${cs ? 'Stáhnout + nainstalovat (Apple Silicon)' : 'Download + install (Apple Silicon)'}
#    ShowX-0.7.0-arm64.dmg  →  ${cs ? 'přetáhnout do Applications' : 'drag into Applications'}
#    ${cs ? 'NEpodepsaný build, první otevření:' : 'Unsigned build, first open:'}
xattr -dr com.apple.quarantine /Applications/ShowX.app

# 2. ${cs ? 'Spustit s fixním test PINem' : 'Launch with a fixed test PIN'}
SHOWX_PAIRING_TEST_PIN=000000 open -a ShowX

# 3. ${cs ? 'Otevřít stanici na jiném zařízení' : 'Open a station on another device'}
#    ${cs ? 'URL z aplikace (mDNS / LAN IP), QR nebo PIN 000000' : 'use the URL shown in the app (mDNS / LAN IP), QR or PIN 000000'}
#    ${cs ? 'vyberte roli: SM / operátor / odpočet' : 'pick a role: SM / operator / countdown'}

# 4. ${cs ? 'Ověřit OSC na drátě' : 'Verify OSC on the wire'}
nc -ul 7000`}</code>
              </pre>
              <p className="text-xs text-muted mt-4">
                {cs
                  ? 'Volitelné klíče: ElevenLabs (AI hlas) + Anthropic (LLM draft hlášek) nastavíte v aplikaci — bez nich se ty funkce elegantně vypnou. Bug reporty na GitHub Issues.'
                  : 'Optional keys: ElevenLabs (AI voice) + Anthropic (LLM caller draft) are set in the app — without them those features gracefully disable. Bug reports on GitHub Issues.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Něco chybí?' : 'Something missing?'}<br />
                <em className="text-muted italic font-light">{cs ? 'Otevřete issue, nebo nám napište.' : 'Open an issue, or email us.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 flex md:justify-end flex-wrap gap-3">
              <a href="https://github.com/jtrjtrjtr/showX/issues" target="_blank" rel="noreferrer" className="btn-ghost">
                GitHub Issues →
              </a>
              <a href="mailto:hello@xlabproject.net?subject=ShowX%20docs" className="btn-ghost">
                {cs ? 'Email' : 'Email'}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
