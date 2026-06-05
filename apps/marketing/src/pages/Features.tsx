import { useI18n } from '../lib/i18n'

interface Module {
  slug: string
  number: string
  tier: string
  name: string
  tagline: { cs: string; en: string }
  body: { cs: string; en: string }
  bullets: { cs: string[]; en: string[] }
}

interface CrossFeature {
  slug: string
  number: string
  name: { cs: string; en: string }
  body: { cs: string; en: string }
  snippet?: string
}

const modules: Module[] = [
  {
    slug: 'eventx-bridge',
    number: '01',
    tier: 'Free',
    name: 'EventX Bridge',
    tagline: {
      cs: 'BridgeX 0.3.x, absorbováno.',
      en: 'BridgeX 0.3.x, absorbed.',
    },
    body: {
      cs: 'Subscribuje EventX Supabase Realtime changes a dispatchuje je na OSC, MIDI, DMX, WebSocket nebo Webhook. Žádný cuelist, jen mapování channelu na hardware. Pro existující BridgeX zákazníky = nulový migrace overhead.',
      en: 'Subscribes to EventX Supabase Realtime changes and dispatches them to OSC, MIDI, DMX, WebSocket or Webhook. No cuelist — just channel-to-hardware mapping. For existing BridgeX customers = zero-friction migration.',
    },
    bullets: {
      cs: [
        'Channel catalog kontrakt s EventX engine',
        'OSC out (UDP), MIDI out (USB + RTP-MIDI), DMX out (USB + Art-Net + sACN)',
        'WebSocket + Webhook side-channel',
        'Žádný UI lock-in: catalog → tabulkový routing',
      ],
      en: [
        'Channel catalog contract with EventX engine',
        'OSC out (UDP), MIDI out (USB + RTP-MIDI), DMX out (USB + Art-Net + sACN)',
        'WebSocket + Webhook side-channel',
        'No UI lock-in: catalog → tabular routing',
      ],
    },
  },
  {
    slug: 'cuelist-core',
    number: '02',
    tier: 'Free / Pro',
    name: 'Cuelist Core',
    tagline: {
      cs: 'Show file. Cuelist. Cue + payloads.',
      en: 'Show file. Cuelist. Cue + payloads.',
    },
    body: {
      cs: 'Jeden Show dokument, jeden kanonický Cuelist (0.1), per-department views jako filtr nad sdíleným modelem. Multi-trigger semantics: Manual GO, Auto-Follow, Auto-Continue. Free pro jednoho operátora v REHEARSAL mode; Pro pro multi-op kolaboraci.',
      en: 'One Show document, one canonical Cuelist (0.1), per-department views as filters over the shared model. Multi-trigger semantics: Manual GO, Auto-Follow, Auto-Continue. Free for single operator REHEARSAL; Pro for multi-op collab.',
    },
    bullets: {
      cs: [
        'Department-tagged cue: LX, SX, VIDEO, AUTO, PYRO, FS, SM, OTHER',
        'Compound cues: jedna cue, více payloadů (light + sound + video)',
        'Yjs CRDT collab + presence dots přes embedded broker',
        'Keyboard-first ergonomie (space = GO, arrows = navigate, Q = standby)',
        'CSV import + JSON .showx export',
      ],
      en: [
        'Department-tagged cues: LX, SX, VIDEO, AUTO, PYRO, FS, SM, OTHER',
        'Compound cues: one cue, multiple payloads (light + sound + video)',
        'Yjs CRDT collab + presence dots over embedded broker',
        'Keyboard-first ergonomics (space = GO, arrows = navigate, Q = standby)',
        'CSV import + JSON .showx export',
      ],
    },
  },
  {
    slug: 'show-mode',
    number: '03',
    tier: 'Pro+',
    name: 'SHOW mode',
    tagline: {
      cs: 'Jeden klik. Show je zamčená.',
      en: 'One click. Show is locked.',
    },
    body: {
      cs: 'SM kliká LOCK SHOW. Cuelist payloads zmrznou na snapshot. Edity strukturálních cue jdou do schvalovací fronty. GO autorita je single-station. history.jsonl loguje každý event. Re-enter REHEARSAL vyžaduje SM auth.',
      en: 'SM clicks LOCK SHOW. Cuelist payloads freeze to snapshot. Structural edits go to an approval queue. GO authority is single-station. history.jsonl captures every event. Re-entering REHEARSAL requires SM auth.',
    },
    bullets: {
      cs: [
        'Single-action LOCK SHOW (žádné 2FA v 0.1)',
        'Edit proposals s SM approval queue',
        'History snapshots + diff/revert UI (0.2)',
        'GO event side-channel (mimo CRDT, nikdy se nereplay)',
      ],
      en: [
        'Single-action LOCK SHOW (no 2FA in 0.1)',
        'Edit proposals with SM approval queue',
        'History snapshots + diff/revert UI (0.2)',
        'GO event side-channel (off-CRDT, never replays)',
      ],
    },
  },
  {
    slug: 'router',
    number: '04',
    tier: 'Pro+',
    name: 'Custom Router',
    tagline: {
      cs: 'WD-style rule table.',
      en: 'WD-style rule table.',
    },
    body: {
      cs: 'Když Cuelist sémantika nestačí — když potřebujete OSC ←→ MIDI ←→ DMX glue mimo cuelist (např. fader z Eos console na video opacity v Disguise). Tabulkový router s podmínkami a transformy. Reference: Widget Designer node graph minus node graph.',
      en: 'When Cuelist semantics are not enough — OSC ←→ MIDI ←→ DMX glue beyond cuelist (e.g. Eos fader to Disguise video opacity). Tabular router with conditions and transforms. Reference: Widget Designer node graph minus the node graph.',
    },
    bullets: {
      cs: [
        'IF (incoming OSC /eos/cue/active changes) THEN (send MIDI Note Off ch1 n42)',
        'Conditional rules s value transforms (clamp, scale, gate)',
        'Per-show config (uložené v .showx)',
      ],
      en: [
        'IF (incoming OSC /eos/cue/active changes) THEN (send MIDI Note Off ch1 n42)',
        'Conditional rules with value transforms (clamp, scale, gate)',
        'Per-show config (stored in .showx)',
      ],
    },
  },
  {
    slug: 'cloud',
    number: '05',
    tier: 'Pro+',
    name: 'Cloud Sync',
    tagline: {
      cs: 'Opt-in. Nikdy core path.',
      en: 'Opt-in. Never the core path.',
    },
    body: {
      cs: 'Když ho zapnete, ShowX přidá druhý Yjs provider mířící na cloud broker. Multi-provider stack zaručí, že edity merge napříč LAN + cloud, a když jeden link umře, show jede dál. Plus Supabase backup + cross-venue account.',
      en: 'When enabled, ShowX adds a second Yjs provider pointing at a cloud broker. The multi-provider stack ensures edits merge across LAN + cloud, and if one link dies, the show keeps running. Plus Supabase backup + cross-venue account.',
    },
    bullets: {
      cs: [
        'Yjs multi-provider stack (LAN + cloud transparentně)',
        'Supabase Postgres backup',
        'Cross-venue account + remote collab proxy',
        'Žádná závislost pro venue runtime (zůstává opt-in)',
      ],
      en: [
        'Yjs multi-provider stack (LAN + cloud transparently)',
        'Supabase Postgres backup',
        'Cross-venue account + remote collab proxy',
        'No dependency for venue runtime (stays opt-in)',
      ],
    },
  },
]

const crossFeatures: CrossFeature[] = [
  {
    slug: 'yjs',
    number: '01',
    name: { cs: 'Yjs CRDT kolaborace', en: 'Yjs CRDT collab' },
    body: {
      cs: 'Každá stanice drží plnou IndexedDB replikaci Show dokumentu. Edity merge bez konfliktu díky CRDT semantice. Když broker umře, stanice dál fungují lokálně a sync se dohoní při reconnect. Presence dots ukazují, kdo edituje jaký cue.',
      en: 'Every station holds a full IndexedDB replica of the Show document. Edits merge conflict-free via CRDT semantics. If the broker dies, stations keep working locally and resync on reconnect. Presence dots show who edits which cue.',
    },
  },
  {
    slug: 'compound',
    number: '02',
    name: { cs: 'Compound cues', en: 'Compound cues' },
    body: {
      cs: 'Jedna cue „Door slam" má tři payloady: SX audio file, LX cue 47 na Eos, VIDEO marker v Disguise. Každé oddělení vidí svůj payload v per-department view. Stage Manager vidí všechny tři vedle sebe. GO spustí všechny tři naráz, nebo s offsetem podle trigger pravidel.',
      en: 'One cue "Door slam" carries three payloads: SX audio file, LX cue 47 on Eos, VIDEO marker in Disguise. Each department sees its own payload in its per-department view. The Stage Manager sees all three side by side. GO fires all three at once, or with offsets per trigger rules.',
    },
    snippet: `{
  "id": "01J8H7K2V9...",
  "label": "Q 47",
  "department": ["LX", "SX", "VIDEO"],
  "trigger": { "mode": "manual" },
  "payloads": [
    { "type": "lx_ref",   "console": "eos", "list": 1, "cue": 47 },
    { "type": "osc",      "device": "qlab", "address": "/cue/door_slam/start" },
    { "type": "osc",      "device": "disguise", "address": "/d3/showcontrol/cue", "args": [1,47,0] }
  ]
}`,
  },
  {
    slug: 'go-semantics',
    number: '03',
    name: { cs: 'GO event semantika', en: 'GO event semantics' },
    body: {
      cs: 'GO události NEJSOU součást CRDT stavu. Letí přes side-channel WSS topic. Důvod: kdyby GO byl součást Yjs dokumentu, reconnect po síťové výpadce by mohl znovu „odpálit" cue ze stavu. GO je událost, ne stav. Tahle separace je tvrdě uzamčená v specu.',
      en: 'GO events are NOT part of the CRDT state. They travel on a side-channel WSS topic. Reason: if GO lived inside the Yjs document, a reconnect could replay a cue from state. GO is an event, not state. The separation is hard-locked in the spec.',
    },
  },
  {
    slug: 'showx-format',
    number: '04',
    name: { cs: 'Open .showx file format', en: 'Open .showx file format' },
    body: {
      cs: 'Show file je package directory — žádný proprietární binární formát. JSON manifest, JSONL history audit log, optional script PDFs, lokální asset cache. Když ze ShowX odejdete, váš show jde s vámi. Když XLAB zítra zmizí, show se otevře v textovém editoru.',
      en: 'The show file is a package directory — no proprietary binary format. JSON manifest, JSONL history audit log, optional script PDFs, local asset cache. Walk away from ShowX, the show walks with you. If XLAB disappeared tomorrow, the show opens in a text editor.',
    },
    snippet: `hamlet_2026-06-17.showx/
├── manifest.json        # show meta, devices, cuelists, cues
├── history.jsonl        # append-only audit log
├── routing.json         # venue-scoped channel→hardware map
├── scripts/             # optional prompt-book PDFs
│   └── act1.pdf
└── assets/              # local audio/video cache (refs only)`,
  },
  {
    slug: 'usitt-import',
    number: '05',
    name: { cs: 'USITT ASCII import (0.2)', en: 'USITT ASCII import (0.2)' },
    body: {
      cs: 'Jediný skutečný cross-vendor lighting interchange standard. ShowX 0.2 import: vezme Eos / MA / Vista USITT export, seedne LX department cues do nového showu. SM si může v REHEARSAL přidat SX a VIDEO payloady k existujícím cue.',
      en: 'The only true cross-vendor lighting interchange standard. ShowX 0.2 import: takes an Eos / MA / Vista USITT export and seeds LX-department cues into a fresh show. SM can attach SX and VIDEO payloads to existing cues in REHEARSAL.',
    },
  },
  {
    slug: 'streamdeck',
    number: '06',
    name: { cs: 'Stream Deck přes Companion', en: 'Stream Deck via Companion' },
    body: {
      cs: 'ShowX neships vlastní Stream Deck plugin. Místo toho ships dokumentovanou OSC dictionary, kterou Companion komunitní modul může připojit. Jeden Stream Deck → Companion → OSC do ShowX → GO/standby/next list. Companion komunita = volný GTM kanál.',
      en: 'ShowX does not ship a native Stream Deck plugin. Instead, it ships a documented OSC dictionary that a Companion community module can attach to. One Stream Deck → Companion → OSC into ShowX → GO/standby/next list. The Companion community is a free GTM channel.',
    },
    snippet: `# ShowX OSC dictionary (excerpt)
/showx/cuelist/go              [cuelist_id]
/showx/cuelist/pause           [cuelist_id]
/showx/cuelist/resume          [cuelist_id]
/showx/cue/standby             [cuelist_id, cue_id]
/showx/show/lock               [show_id, operator_id]`,
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
              <div className="section-label mb-8">{t('features.label')}</div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('features.headline.line1')}<br />
                <em className="font-light text-accent-deep not-italic">{t('features.headline.line2')}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">{t('features.intro')}</p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">02</div>
      </section>

      {/* MODULES */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="section-label mb-10">{cs ? 'Pět modulů' : 'Five modules'}</div>
          <div className="space-y-20">
            {modules.map(m => (
              <article key={m.slug} id={m.slug} className="grid grid-cols-12 gap-8 scroll-mt-24">
                <div className="col-span-12 md:col-span-3">
                  <div className="font-mono text-xs text-accent-deep mb-3">{m.number}</div>
                  <div className="badge bg-ink text-accent border-ink mb-4 inline-block">{m.tier}</div>
                  <h2 className="display-serif text-3xl mb-2">{m.name}</h2>
                  <p className="text-sm italic text-muted">{cs ? m.tagline.cs : m.tagline.en}</p>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <p className="copy">{cs ? m.body.cs : m.body.en}</p>
                  <ul className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    {(cs ? m.bullets.cs : m.bullets.en).map((b, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="font-mono text-[10px] text-accent-deep mt-1.5">●</span>
                        <span className="copy">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CROSS-CUTTING */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Cross-cutting' : 'Cross-cutting'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Šest funkcí napříč' : 'Six capabilities across'}<br />
                <span className="text-accent-deep italic font-light">{cs ? 'všemi moduly.' : 'every module.'}</span>
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

      {/* CTA */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-center">
            <div className="col-span-12 md:col-span-8">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Tohle je 0.1 surface.' : 'This is the 0.1 surface.'}<br />
                <span className="text-muted italic font-light">{cs ? '0.2 přidává cloud sync, MSC out, USITT import.' : '0.2 adds cloud sync, MSC out, USITT import.'}</span>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 flex flex-wrap gap-3">
              <a href="mailto:hello@xlabproject.net?subject=ShowX%20beta" className="btn-primary">
                {t('home.cta.beta')}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
