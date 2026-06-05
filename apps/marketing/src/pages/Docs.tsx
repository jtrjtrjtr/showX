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
      cs: 'OSC dictionary, MIDI mapping conventions, DMX universe layout, MSC commands, sACN universe routing, LTC sync.',
      en: 'OSC dictionary, MIDI mapping conventions, DMX universe layout, MSC commands, sACN universe routing, LTC sync.',
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
      cs: 'Vitest unit tests, Playwright E2E, BridgeX 0.3.x parity test harness, broker chaos testing, GitHub Actions.',
      en: 'Vitest unit tests, Playwright E2E, BridgeX 0.3.x parity test harness, broker chaos testing, GitHub Actions.',
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
      cs: 'Architektonické decision notes (Architect ratifies). Why LAN-first, why one Cuelist per Show v 0.1, why GO event off-CRDT, atd.',
      en: 'Architectural decision notes (Architect ratifies). Why LAN-first, why one Cuelist per Show in 0.1, why GO event off-CRDT, etc.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/tree/main/docs/agent_exchange/decisions',
    external: true,
  },
  {
    number: '10',
    title: { cs: 'Bundle progress', en: 'Bundle progress' },
    body: {
      cs: 'Live task dashboard: ShowX-1 Foundation bundle, ShowX-2 (Cuelist Core), ShowX-3 (SHOW mode). Status per task.',
      en: 'Live task dashboard: ShowX-1 Foundation bundle, ShowX-2 (Cuelist Core), ShowX-3 (SHOW mode). Status per task.',
    },
    href: 'https://github.com/jtrjtrjtr/showX/blob/main/docs/agent_exchange/TASK_DASHBOARD.md',
    external: true,
    badge: { cs: 'Live', en: 'Live' },
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
              <div className="section-label mb-8">{t('docs.label')}</div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('docs.headline.line1')}<br />
                <em className="font-light text-accent-deep not-italic">{t('docs.headline.line2')}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">{t('docs.intro')}</p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">05</div>
      </section>

      {/* DOC GRID */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
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
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-4">
              <div className="section-label mb-4">{cs ? 'Rychlý start' : 'Quick start'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'Pro developery' : 'For developers'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'tří kroků.' : 'in three steps.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-8">
              <pre className="bg-ink text-cream/90 font-mono text-[11px] leading-relaxed p-6 rounded-sm overflow-x-auto border border-rule">
                <code>{`# 1. Clone the repo
git clone https://github.com/jtrjtrjtr/showX.git
cd showx

# 2. Install dependencies (pnpm workspace)
pnpm install

# 3. Run the Electron shell + PWA dev server
pnpm dev

# Open http://localhost:5300 in your browser
# (or scan the QR code printed in the terminal from another device)`}</code>
              </pre>
              <p className="text-xs text-muted mt-4">
                {cs
                  ? 'Pre-release; očekávejte rough edges. Bug reports na GitHub Issues.'
                  : 'Pre-release; expect rough edges. Bug reports on GitHub Issues.'}
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
