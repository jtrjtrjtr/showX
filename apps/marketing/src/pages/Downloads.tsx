import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

interface Release {
  version: string
  name: { cs: string; en: string }
  target: string
  status: 'development' | 'planned' | 'preview'
  notes: { cs: string; en: string }
}

const releases: Release[] = [
  {
    version: '0.5',
    name: { cs: 'Internal release', en: 'Internal release' },
    target: 'End-2026',
    status: 'development',
    notes: {
      cs: 'EventX Bridge module reaches BridgeX 0.3.x feature parity. Electron shell + module loader + 11 shared services + signed + notarized DMG (Apple Developer ID rebrand). Bez public download — výhradně pro 5-10 BridgeX zákazníků na hand-rolled testu.',
      en: 'EventX Bridge module reaches BridgeX 0.3.x feature parity. Electron shell + module loader + 11 shared services + signed + notarized DMG (Apple Developer ID rebrand). No public download — for 5-10 BridgeX customers on hand-rolled test only.',
    },
  },
  {
    version: '0.1',
    name: { cs: '0.1.1 — první použitelná beta', en: '0.1.1 — first usable beta' },
    target: 'Released 2026-06-07',
    status: 'preview',
    notes: {
      cs: 'Cuelist Core + REHEARSAL/SHOW + 7 dept Operator views + GO button + cue editor + Routing/Devices UI + real-time playhead broadcast přes Yjs awareness + bundled demo show (25 cues, 3 oddělení, compound + group cue) + first-launch picker (Open Demo / Open / New) + native File menubar. CSV import, JSON export, PDF cue-sheet, Stream Deck Companion. macOS Apple Silicon. Unsigned beta — viz instalační instrukce níže.',
      en: 'Cuelist Core + REHEARSAL/SHOW + 7-dept Operator views + GO button + cue editor + Routing/Devices UI + real-time playhead broadcast via Yjs awareness + bundled demo show (25 cues, 3 depts, compound + group cue) + first-launch picker (Open Demo / Open / New) + native File menubar. CSV import, JSON export, PDF cue-sheet, Stream Deck Companion. macOS Apple Silicon. Unsigned beta — see install instructions below.',
    },
  },
  {
    version: '0.2',
    name: { cs: 'SHOW mode + první placený pilot', en: 'SHOW mode + first paid pilot' },
    target: 'Q2 2027',
    status: 'planned',
    notes: {
      cs: 'SHOW mode module + edit proposal queue + history snapshots. MSC out, USITT ASCII import, Stream Deck via Companion (komunitní modul). První placený pilot s vybraným venuem.',
      en: 'SHOW mode module + edit proposal queue + history snapshots. MSC out, USITT ASCII import, Stream Deck via Companion (community module). First paid pilot with a select venue.',
    },
  },
  {
    version: '0.3',
    name: { cs: 'Cloud Sync + Custom Router + 5 zákazníků', en: 'Cloud Sync + Custom Router + 5 customers' },
    target: 'Q3 2027',
    status: 'planned',
    notes: {
      cs: 'Cloud Sync opt-in module. Custom Router rule table (WD-style OSC↔MIDI↔DMX glue). Multi-cuelist per show + Master Timeline read-only (LTC/MTC chase). Cíl: 5 platících zákazníků.',
      en: 'Cloud Sync opt-in module. Custom Router rule table (WD-style OSC↔MIDI↔DMX glue). Multi-cuelist per show + Master Timeline read-only (LTC/MTC chase). Target: 5 paying customers.',
    },
  },
  {
    version: '1.0',
    name: { cs: 'Public beta', en: 'Public beta' },
    target: 'Q4 2027',
    status: 'planned',
    notes: {
      cs: 'Open signups. Marketing site + docs portal. iPad PWA fully polished. Companion community modul published. Path k 50 paying customers do konce 2027.',
      en: 'Open signups. Marketing site + docs portal. iPad PWA fully polished. Companion community module published. Path to 50 paying customers by end of 2027.',
    },
  },
]

const bundleProgress = [
  { id: 1, title: 'Workspace + TypeScript + ESLint setup', status: 'accepted' },
  { id: 2, title: 'Shared types (Module, ModuleContext, services)', status: 'accepted' },
  { id: 3, title: 'Logger + EventBus + HealthBus services', status: 'accepted' },
  { id: 4, title: 'PersistedStore + SecretStore services', status: 'accepted' },
  { id: 5, title: 'AssetServer + mDNS services', status: 'accepted' },
  { id: 6, title: 'SyncBroker (embedded y-websocket)', status: 'accepted' },
  { id: 7, title: 'OutputDispatcher (OSC + MIDI + DMX)', status: 'accepted' },
  { id: 8, title: 'InputRegistrar (OSC + MIDI listeners)', status: 'accepted' },
  { id: 9, title: 'PairingStore + pairing flow API', status: 'accepted' },
  { id: 10, title: 'Module loader implementation', status: 'accepted' },
  { id: 11, title: 'Electron main entry + shell skeleton', status: 'accepted' },
  { id: 12, title: 'PWA workspace (Vite + React + Yjs + IndexedDB)', status: 'accepted' },
  { id: 13, title: 'CI workflow + parity test harness skeleton', status: 'accepted' },
]

const statusBadge = (s: string, cs: boolean) => {
  if (s === 'accepted') return { label: cs ? 'Accepted' : 'Accepted', cls: 'bg-accent text-ink' }
  if (s === 'in_progress') return { label: cs ? 'In progress' : 'In progress', cls: 'bg-paper text-ink border border-ink/30' }
  if (s === 'queued') return { label: cs ? 'Queued' : 'Queued', cls: 'border border-rule text-muted' }
  return { label: s, cls: 'text-muted' }
}

const releaseStatusBadge = (s: string, cs: boolean) => {
  if (s === 'development') return { label: cs ? 'Vývoj' : 'In development', cls: 'bg-ink text-accent' }
  if (s === 'planned') return { label: cs ? 'Plánováno' : 'Planned', cls: 'border border-rule text-muted' }
  if (s === 'preview') return { label: cs ? 'Preview' : 'Preview', cls: 'bg-accent text-ink' }
  return { label: s, cls: '' }
}

export function Downloads() {
  const { t, lang } = useI18n()
  const cs = lang === 'cs'

  const accepted = bundleProgress.filter(b => b.status === 'accepted').length

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">{t('dl.label')}</div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('dl.headline.line1')}<br />
                <em className="font-light text-accent-deep not-italic">{t('dl.headline.line2')}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">{t('dl.intro')}</p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">04</div>
      </section>

      {/* DOWNLOAD v0.1 — LIVE */}
      <section className="rule-top bg-accent/10">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Aktuální release' : 'Current release'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                ShowX 0.1.4<br />
                <em className="text-accent-deep font-light not-italic">
                  {cs ? 'beta — dostupné nyní' : 'beta — available now'}
                </em>
              </h2>
              <p className="copy mt-6 max-w-2xl">
                {cs
                  ? 'První použitelná beta. Cuelist Core + REHEARSAL/SHOW + bundled demo show (25 cues) + Routing/Devices UI + real-time playhead broadcast. Klikneš "Open Demo Show" a v 60 vteřinách jsi v reálném cuelist workflow. macOS Apple Silicon. Unsigned beta — Gatekeeper bypass instrukce dole.'
                  : 'First usable beta. Cuelist Core + REHEARSAL/SHOW + bundled demo show (25 cues) + Routing/Devices UI + real-time playhead broadcast. Click "Open Demo Show" and you\'re in a real cuelist workflow in 60 seconds. macOS Apple Silicon. Unsigned beta — Gatekeeper bypass instructions below.'}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <a
                  href="/ShowX-0.1.4-arm64.dmg"
                  className="btn-primary"
                  download
                >
                  {cs ? 'Stáhnout ShowX 0.1.4 (arm64, ~102 MB)' : 'Download ShowX 0.1.4 (arm64, ~102 MB)'}
                </a>
                <a
                  href="https://github.com/jtrjtrjtr/showX/releases/tag/v0.1.1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm copy underline decoration-1 underline-offset-4 self-center"
                >
                  {cs ? 'Release notes na GitHubu' : 'Release notes on GitHub'} →
                </a>
              </div>

              <div className="mt-12 border-l-2 border-accent-deep pl-6 max-w-2xl">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-3">
                  {cs ? 'Instalace (unsigned beta)' : 'Install (unsigned beta)'}
                </div>
                <ol className="copy text-sm space-y-2 list-decimal list-inside">
                  <li>{cs ? 'Stáhněte DMG (tlačítko výše)' : 'Download the DMG (button above)'}</li>
                  <li>{cs ? 'Otevřete DMG, přetáhněte ShowX.app do /Applications' : 'Open the DMG, drag ShowX.app into /Applications'}</li>
                  <li>
                    {cs
                      ? 'Při prvním spuštění Gatekeeper zobrazí "ShowX nelze otevřít" — pravý klik na ShowX.app → '
                      : 'On first launch Gatekeeper will show "ShowX can\'t be opened" — right-click ShowX.app → '}
                    <code className="font-mono text-xs">Open</code>
                    {cs ? ' → potvrdit "Open" v dialogu.' : ' → confirm "Open" in the dialog.'}
                  </li>
                  <li>
                    {cs
                      ? 'Alternativně přes terminal:'
                      : 'Or via terminal:'}{' '}
                    <code className="font-mono text-xs">xattr -dr com.apple.quarantine /Applications/ShowX.app</code>
                  </li>
                </ol>
                <p className="copy text-xs text-muted mt-4">
                  {cs
                    ? '⚠️ Beta. Žádný Apple cert ani notarizace. Production-grade signing přijde v 0.2.'
                    : '⚠️ Beta. No Apple cert / notarization yet. Production-grade signing arrives in 0.2.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RELEASES */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('dl.roadmap.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('dl.roadmap.h')}
              </h2>
            </div>
          </div>
          <div className="space-y-4">
            {releases.map(r => {
              const badge = releaseStatusBadge(r.status, cs)
              return (
                <div
                  key={r.version}
                  className="border border-rule rounded-sm p-6 bg-ground grid grid-cols-12 gap-6 items-start"
                >
                  <div className="col-span-12 md:col-span-2">
                    <div className="display-serif text-3xl">{r.version}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mt-1">
                      {r.target}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-2">
                    <span className={`text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm font-mono ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="col-span-12 md:col-span-8">
                    <h3 className="display-serif text-xl mb-2">{cs ? r.name.cs : r.name.en}</h3>
                    <p className="copy text-sm">{cs ? r.notes.cs : r.notes.en}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* DEV PREVIEW PATH */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('dl.dev.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('dl.dev.h')}
              </h2>
              <p className="copy mt-6 max-w-2xl">{t('dl.dev.body')}</p>
              <div className="mt-8">
                <Link to="/try-it" className="btn-primary">{t('dl.dev.cta')}</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BUNDLE PROGRESS */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('dl.bundle.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                ShowX-1 Foundation<br />
                <em className="text-accent-deep font-light not-italic">
                  {accepted}/{bundleProgress.length} {cs ? 'tasků accepted' : 'tasks accepted'}
                </em>
              </h2>
              <p className="copy mt-4 max-w-2xl text-sm">{t('dl.bundle.body')}</p>
            </div>
          </div>
          <div className="border border-rule rounded-sm bg-ground overflow-hidden">
            <table className="w-full">
              <thead className="bg-paper/40 border-b border-rule">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-12">#</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    {cs ? 'Task' : 'Task'}
                  </th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-32">
                    {cs ? 'Stav' : 'Status'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {bundleProgress.map(b => {
                  const badge = statusBadge(b.status, cs)
                  return (
                    <tr key={b.id} className="border-b border-rule last:border-b-0">
                      <td className="px-4 py-3 font-mono text-xs text-muted">{String(b.id).padStart(2, '0')}</td>
                      <td className="px-4 py-3 text-sm">{b.title}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm font-mono ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/status" className="btn-ghost">{cs ? 'Detailní status' : 'Full status'} →</Link>
            <Link to="/docs" className="btn-ghost">{cs ? 'Bundle docs' : 'Bundle docs'}</Link>
          </div>
        </div>
      </section>

      {/* WHEN DMG */}
      <section className="rule-top bg-ink text-cream">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label text-cream/60">{t('dl.dmg.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 text-cream leading-tight">
                {t('dl.dmg.h')}
              </h2>
              <p className="text-cream/80 mt-6 max-w-3xl text-sm leading-relaxed">{t('dl.dmg.body')}</p>
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
                {cs ? 'Čekat na DMG?' : 'Wait for the DMG?'}<br />
                <em className="text-accent-deep italic font-light not-italic">
                  {cs ? 'Nebo si to vyzkoušet teď ze sourcu.' : 'Or try it from source now.'}
                </em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 flex md:justify-end flex-wrap gap-3">
              <Link to="/try-it" className="btn-primary">
                {cs ? 'Návod /try-it' : 'Walkthrough /try-it'} →
              </Link>
              <a
                href="mailto:hello@xlabproject.net?subject=ShowX%20dev%20preview%20cohort"
                className="btn-ghost"
              >
                {cs ? 'Preview přístup' : 'Preview access'}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
