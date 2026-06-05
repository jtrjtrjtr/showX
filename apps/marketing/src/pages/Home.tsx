import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function Home() {
  const { t, lang } = useI18n()
  const cs = lang === 'cs'

  const modules = [
    { key: 'eventx-bridge', tier: 'Free', n: '01' },
    { key: 'cuelist-core', tier: 'Free / Pro', n: '02' },
    { key: 'show-mode', tier: 'Pro+', n: '03' },
    { key: 'router', tier: 'Pro+', n: '04' },
    { key: 'cloud', tier: 'Pro+', n: '05' },
  ] as const

  const whynots = [
    { key: 'qlab', logo: 'QLab 5' },
    { key: 'cuepilot', logo: 'CuePilot' },
    { key: 'companion', logo: 'Companion' },
    { key: 'eos', logo: 'Eos / MA' },
  ] as const

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-32">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-8 animate-fade-up">
              <div className="section-label mb-8">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-deep mr-2 align-middle" />
                {t('home.label')}
              </div>
              <h1 className="display-serif text-display-1 text-ink">
                {t('home.hero.line1')}
                <br />
                <em className="font-light text-accent-deep not-italic">{t('home.hero.line2')}</em>
              </h1>
              <p className="copy text-xl mt-10 max-w-xl">{t('home.hero.copy')}</p>
              <div className="mt-12 flex flex-wrap gap-3">
                <a
                  href="mailto:hello@xlabproject.net?subject=ShowX%20beta"
                  className="btn-primary"
                >
                  {t('home.cta.beta')}
                </a>
                <Link to="/compare" className="btn-ghost">{t('home.cta.compare')}</Link>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-4 animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="border border-rule bg-paper/40 rounded-lg p-6">
                <div className="section-label mb-3 flex items-center justify-between">
                  <span>{t('home.live.status')}</span>
                  <span className="font-mono text-[10px] text-muted">showx.local:5300</span>
                </div>
                <ul className="space-y-2 text-sm font-mono">
                  <li className="flex items-center justify-between">
                    <span>{t('home.live.broker')}</span>
                    <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent-deep" />{t('home.live.ok')}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('home.live.mdns')}</span>
                    <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent-deep" />{t('home.live.ok')}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('home.live.pairing')}</span>
                    <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent-deep" />{t('home.live.ok')}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>{t('home.live.dispatch')}</span>
                    <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent-deep" />{t('home.live.ok')}</span>
                  </li>
                </ul>
                <div className="mt-6 pt-4 border-t border-rule text-[11px] text-muted">
                  {t('home.live.footnote')}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">01</div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.who.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <p className="display-serif text-display-2 leading-tight">
                {t('home.who.h1')}<br />
                {t('home.who.h2')}<br />
                <span className="text-muted">{t('home.who.h3')}</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-16">
                <div>
                  <div className="section-label mb-3">{t('home.who.sm')}</div>
                  <p className="copy text-sm">{t('home.who.sm.body')}</p>
                </div>
                <div>
                  <div className="section-label mb-3">{t('home.who.ops')}</div>
                  <p className="copy text-sm">{t('home.who.ops.body')}</p>
                </div>
                <div>
                  <div className="section-label mb-3">{t('home.who.prod')}</div>
                  <p className="copy text-sm">{t('home.who.prod.body')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.problem.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('home.problem.h1')}<br />
                <span className="text-accent-deep italic font-light">{t('home.problem.h2')}</span><br />
                <span className="text-muted">{t('home.problem.h3')}</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mt-12 max-w-4xl">
                <p className="copy">{t('home.problem.body1')}</p>
                <p className="copy">{t('home.problem.body2')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THREE PILLARS */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.pillars.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('home.pillars.h1')}<br />
                {t('home.pillars.h2')}<br />
                <span className="text-accent-deep italic font-light">{t('home.pillars.h3')}</span>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <div className="bg-ground p-10">
              <div className="font-mono text-xs text-accent-deep mb-4">01</div>
              <div className="section-label mb-4">{t('home.pillars.views.label')}</div>
              <p className="copy text-sm mb-4">{t('home.pillars.views.p1')}</p>
              <p className="copy text-sm">{t('home.pillars.views.p2')}</p>
            </div>
            <div className="bg-ground p-10">
              <div className="font-mono text-xs text-accent-deep mb-4">02</div>
              <div className="section-label mb-4">{t('home.pillars.modes.label')}</div>
              <p className="copy text-sm mb-4">{t('home.pillars.modes.p1')}</p>
              <p className="copy text-sm">{t('home.pillars.modes.p2')}</p>
            </div>
            <div className="bg-ground p-10">
              <div className="font-mono text-xs text-accent-deep mb-4">03</div>
              <div className="section-label mb-4">{t('home.pillars.lan.label')}</div>
              <p className="copy text-sm mb-4">{t('home.pillars.lan.p1')}</p>
              <p className="copy text-sm">{t('home.pillars.lan.p2')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="rule-top bg-ink text-cream relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
          <div className="display-serif text-[40rem] leading-none text-cream absolute -bottom-40 -right-20 select-none">5</div>
        </div>
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24 relative">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label text-cream/60">{t('home.how.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 text-cream leading-tight">
                {t('home.how.h1')}<br />
                <em className="text-accent font-light not-italic">{t('home.how.h2')}</em>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
            {[
              { n: '01', t: t('home.how.station'), d: t('home.how.station.body') },
              { n: '02', t: t('home.how.broker'), d: t('home.how.broker.body') },
              { n: '03', t: t('home.how.dispatch'), d: t('home.how.dispatch.body') },
              { n: '04', t: t('home.how.down'), d: t('home.how.down.body') },
            ].map((s, i) => (
              <div key={s.n} className="border-t border-cream/20 pt-5">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-xs text-accent">{s.n}</span>
                  {i < 3 && <span className="text-cream/30 text-xs">→</span>}
                </div>
                <h3 className="display-serif text-lg mb-2">{s.t}</h3>
                <p className="text-cream/60 text-xs leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-16 border border-cream/15 rounded-sm p-6 font-mono text-[11px] text-cream/80 leading-relaxed">
            <div className="text-accent mb-2">{cs ? '// LAN runtime' : '// LAN runtime'}</div>
            <div>SM iPad ───┐</div>
            <div>LX op browser ┼──→ http://showx.local:5300 ──→ [ShowX Electron]</div>
            <div>Video op iPad ┘&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(mDNS _showx._tcp)&nbsp;&nbsp;&nbsp;│</div>
            <div className="ml-[28ch]">▼</div>
            <div className="ml-[20ch]">protocol dispatcher</div>
            <div className="ml-[20ch]">│&nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;│&nbsp;&nbsp;&nbsp;│</div>
            <div className="ml-[20ch]">▼&nbsp;&nbsp;&nbsp;▼&nbsp;&nbsp;▼&nbsp;&nbsp;&nbsp;▼</div>
            <div className="ml-[20ch] text-accent">Eos&nbsp;&nbsp;MA&nbsp;&nbsp;QLab&nbsp;&nbsp;Disguise</div>
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.modules.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('home.modules.h1')}<br />
                <span className="text-muted italic font-light">{t('home.modules.h2')}</span>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-rule border border-rule">
            {modules.map(m => (
              <Link
                key={m.key}
                to={`/features#${m.key}`}
                className="group bg-ground p-8 hover:bg-cream transition-colors flex flex-col gap-6 min-h-[220px]"
              >
                <div className="flex items-start justify-between">
                  <span className="font-mono text-xs text-muted">{m.n}</span>
                  <span className="text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm bg-ink text-accent">
                    {m.tier}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="display-serif text-2xl mb-2 group-hover:text-accent-deep transition-colors">
                    {t(`home.modules.${m.key}`)}
                  </h3>
                  <p className="text-sm copy">{t(`home.modules.${m.key}.body`)}</p>
                </div>
              </Link>
            ))}
            <div className="bg-paper/40 p-8 flex flex-col justify-center min-h-[220px]">
              <div className="section-label mb-3">{cs ? 'Plný surface' : 'Full surface'}</div>
              <p className="copy text-sm mb-4">
                {cs ? 'Šest cross-cutting funkcí napříč moduly: Yjs CRDT, compound cues, GO semantics, open .showx, USITT import, Stream Deck.' : 'Six cross-cutting capabilities across modules: Yjs CRDT, compound cues, GO semantics, open .showx, USITT import, Stream Deck.'}
              </p>
              <Link to="/features" className="font-mono text-xs uppercase tracking-[0.18em] text-accent-deep hover:text-ink">
                {cs ? 'Prohlédnout funkce →' : 'Browse features →'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* WHY NOT */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.whynot.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('home.whynot.h1')}<br />
                <span className="text-accent-deep italic font-light">{t('home.whynot.h2')}</span>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-12">
            {whynots.map((w, i) => (
              <div key={w.key} className="border-t border-ink pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</div>
                  <span className="font-mono text-[10px] text-muted">{w.logo}</span>
                </div>
                <h3 className="display-serif text-xl mb-3">{t(`home.whynot.${w.key}.title`)}</h3>
                <p className="text-sm copy">{t(`home.whynot.${w.key}.body`)}</p>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <Link to="/compare" className="font-mono text-xs uppercase tracking-[0.18em] text-accent-deep hover:text-ink">
              {cs ? 'Detailní srovnání →' : 'See full comparison →'}
            </Link>
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.pricing.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('home.pricing.h1')}<br />
                <span className="text-muted italic font-light">{t('home.pricing.h2')}</span>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-rule border border-rule">
            {(['free', 'pro', 'production', 'team'] as const).map((tier, i) => (
              <div key={tier} className={`p-8 flex flex-col gap-3 ${i === 1 ? 'bg-ink text-cream' : 'bg-ground'}`}>
                <div className={`section-label ${i === 1 ? 'text-cream/60' : ''}`}>0{i + 1}</div>
                <div className="display-serif text-2xl">{t(`home.pricing.${tier}`)}</div>
                <p className={`text-xs ${i === 1 ? 'text-cream/70' : 'text-muted'}`}>{t(`home.pricing.${tier}.body`)}</p>
                <div className="mt-auto pt-4">
                  <div className={`font-mono text-[10px] uppercase tracking-[0.18em] ${i === 1 ? 'text-accent' : 'text-muted'}`}>
                    {tier === 'free' ? 'ShowX Free' : tier === 'pro' ? 'ShowX Pro' : tier === 'production' ? 'ShowX Production' : 'ShowX Team'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <Link to="/pricing" className="btn-ghost">{t('home.pricing.detail')}</Link>
          </div>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('home.timeline.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('home.timeline.h1')}<br />
                <em className="text-accent-deep font-light not-italic">{t('home.timeline.h2')}</em>
              </h2>
              <p className="copy mt-8 max-w-2xl">{t('home.timeline.body')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
            {['t1', 't2', 't3', 't4', 't5'].map((k, i) => (
              <div key={k} className="border-t border-ink pt-4">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="font-mono text-xs text-accent-deep">{String(i + 1).padStart(2, '0')}</span>
                  {i < 4 && <span className="text-muted text-xs">→</span>}
                </div>
                <h3 className="display-serif text-lg mb-1">{t(`home.timeline.${k}`)}</h3>
                <p className="text-muted text-xs leading-relaxed">{t(`home.timeline.${k}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BETA CTA */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-32">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-7">
              <div className="section-label mb-6">{t('home.cta.label')}</div>
              <h2 className="display-serif text-display-1 leading-[0.95]">
                {t('home.cta.h1')}<br />
                <em className="font-light text-accent-deep not-italic">{t('home.cta.h2')}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-5 flex flex-col gap-6 md:justify-end">
              <p className="copy">{t('home.cta.body')}</p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="mailto:hello@xlabproject.net?subject=ShowX%20beta"
                  className="btn-primary"
                >
                  {t('home.cta.email')} →
                </a>
                <Link to="/docs" className="btn-ghost">{t('home.cta.docs')}</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
