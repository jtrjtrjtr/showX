import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

interface StatusRow {
  key: string
  state: 'ok' | 'wip' | 'no'
}

const statusRows: StatusRow[] = [
  { key: 'foundation', state: 'ok' },
  { key: 'shell', state: 'ok' },
  { key: 'pwa', state: 'ok' },
  { key: 'tests', state: 'ok' },
  { key: 'dmg', state: 'wip' },
  { key: 'cuelist', state: 'no' },
]

const todayItems = ['t1', 't2', 't3', 't4', 't5', 't6'] as const
const notItems = ['dmg', 'bridge', 'cuelist', 'show', 'cloud', 'repo'] as const
const bundleCards = ['b1', 'b2', 'b3'] as const
const roadmapKeys = ['t1', 't2', 't3', 't4', 't5', 't6'] as const

export function Home() {
  const { t, lang } = useI18n()
  const cs = lang === 'cs'

  const previewMailto =
    "mailto:hello@xlabproject.net?subject=ShowX%20dev%20preview%20cohort&body=Hi%20XLAB%2C%0A%0AI'd%20like%20a%20seat%20in%20the%20ShowX%20dev%20preview%20cohort.%0A%0AWho%20I%20am%3A%20%0AVenue%20%2F%20role%3A%20%0AWhat%20I%20want%20to%20see%20from%20ShowX%3A%20%0A%0AThanks!"

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-24">
          <div className="grid grid-cols-12 gap-6 lg:gap-10 items-start">
            <div className="col-span-12 lg:col-span-7 animate-fade-up">
              <div className="section-label mb-8">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-deep mr-2 align-middle" />
                {t('home.label')}
              </div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('home.hero.line1')}
                <br />
                <em className="font-light text-accent-deep not-italic">{t('home.hero.line2')}</em>
                <br />
                <span className="text-muted italic font-light">{t('home.hero.line3')}</span>
              </h1>
              <p className="copy text-lg mt-10 max-w-xl">{t('home.hero.copy')}</p>
              <div className="mt-12 flex flex-wrap gap-3">
                <Link to="/try-it" className="btn-primary">
                  {t('home.cta.try')}
                </Link>
                <Link to="/status" className="btn-ghost">
                  {t('home.cta.status')}
                </Link>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-5 animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="border border-rule bg-paper/40 rounded-lg p-6">
                <div className="section-label mb-4 flex items-center justify-between">
                  <span>{t('home.live.status')}</span>
                  <span className="font-mono text-[10px] text-muted">2026-06-06</span>
                </div>
                <ul className="space-y-2 text-sm font-mono">
                  {statusRows.map(row => {
                    const dotClass =
                      row.state === 'ok'
                        ? 'bg-accent-deep'
                        : row.state === 'wip'
                          ? 'bg-paper border border-accent-deep/60'
                          : 'bg-transparent border border-muted/40'
                    const label =
                      row.state === 'ok'
                        ? t('home.live.ok')
                        : row.state === 'wip'
                          ? t('home.live.wip')
                          : t('home.live.no')
                    return (
                      <li key={row.key} className="flex items-center justify-between">
                        <span>{t(`home.live.${row.key}`)}</span>
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                          <span className="text-muted">{label}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <div className="mt-6 pt-4 border-t border-rule text-[11px] text-muted">
                  {t('home.live.footnote')}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">
          01
        </div>
      </section>

      {/* WHAT YOU CAN DO TODAY */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.today.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('home.today.h1')}
                <br />
                <em className="text-accent-deep italic font-light not-italic">{t('home.today.h2')}</em>
              </h2>
              <p className="copy mt-8 max-w-2xl">{t('home.today.intro')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-rule border border-rule">
            {todayItems.map((k, i) => (
              <div key={k} className="bg-ground p-8 flex flex-col gap-3 min-h-[200px]">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs text-accent-deep">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                    {cs ? 'Hotové' : 'Live'}
                  </span>
                </div>
                <h3 className="display-serif text-xl">{t(`home.today.${k}`)}</h3>
                <p className="copy text-sm">{t(`home.today.${k}.body`)}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Link to="/try-it" className="font-mono text-xs uppercase tracking-[0.18em] text-accent-deep hover:text-ink">
              {cs ? 'Plný 8-krokový návod →' : 'Full 8-step walkthrough →'}
            </Link>
          </div>
        </div>
      </section>

      {/* WHAT YOU CAN'T DO YET */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.not.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('home.not.h1')}
                <br />
                <span className="text-muted italic font-light">{t('home.not.h2')}</span>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
            {notItems.map((k, i) => (
              <div key={k} className="border-t border-ink pt-5">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">✗</span>
                </div>
                <h3 className="display-serif text-lg mb-2">{t(`home.not.${k}`)}</h3>
                <p className="text-sm copy">{t(`home.not.${k}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW TO GET A SEAT */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-7">
              <div className="section-label mb-6">{t('home.seat.label')}</div>
              <h2 className="display-serif text-display-1 leading-[0.95]">
                {t('home.seat.h1')}
                <br />
                <em className="font-light text-accent-deep not-italic">{t('home.seat.h2')}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-5 flex flex-col gap-6">
              <p className="copy">{t('home.seat.body')}</p>
              <div className="flex flex-wrap gap-3">
                <a href={previewMailto} className="btn-primary">
                  {t('home.seat.cta')} →
                </a>
              </div>
              <div className="font-mono text-[11px] text-muted">
                hello@xlabproject.net · subject: ShowX dev preview cohort
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BUNDLE PROGRESS */}
      <section className="rule-top bg-ink text-cream relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
          <div className="display-serif text-[40rem] leading-none text-cream absolute -bottom-40 -right-20 select-none">
            13
          </div>
        </div>
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24 relative">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label text-cream/60">{t('home.bundle.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 text-cream leading-tight">
                {t('home.bundle.h1')}
                <br />
                <em className="text-accent font-light not-italic">{t('home.bundle.h2')}</em>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            {bundleCards.map((b, i) => (
              <div key={b} className="border border-cream/15 rounded-sm p-6 bg-ink/40">
                <div className="flex items-baseline justify-between mb-4">
                  <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/60">
                    {t(`home.bundle.${b}.status`)}
                  </span>
                </div>
                <h3 className="display-serif text-xl text-cream mb-3">{t(`home.bundle.${b}.title`)}</h3>
                <p className="text-cream/70 text-xs leading-relaxed">{t(`home.bundle.${b}.body`)}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Link
              to="/status"
              className="font-mono text-xs uppercase tracking-[0.18em] text-accent hover:text-cream"
            >
              {cs ? 'Detailní status →' : 'Full status →'}
            </Link>
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.roadmap.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('home.roadmap.h1')}
                <br />
                <em className="text-accent-deep font-light not-italic">{t('home.roadmap.h2')}</em>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
            {roadmapKeys.map((k, i) => (
              <div key={k} className="border-t border-ink pt-4">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-xs text-accent-deep">{String(i + 1).padStart(2, '0')}</span>
                  {i < roadmapKeys.length - 1 && <span className="text-muted text-xs">→</span>}
                </div>
                <h3 className="display-serif text-base mb-1">{t(`home.roadmap.${k}`)}</h3>
                <p className="text-muted text-xs leading-relaxed">{t(`home.roadmap.${k}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-32">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-7">
              <div className="section-label mb-6">{t('home.foot.label')}</div>
              <h2 className="display-serif text-display-1 leading-[0.95]">
                {t('home.foot.h1')}
                <br />
                <em className="font-light text-accent-deep not-italic">{t('home.foot.h2')}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-5 flex flex-col gap-6 md:items-end md:justify-end">
              <div className="flex flex-wrap gap-3">
                <Link to="/try-it" className="btn-primary">
                  {t('home.foot.try')}
                </Link>
                <Link to="/docs" className="btn-ghost">
                  {t('home.foot.docs')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
