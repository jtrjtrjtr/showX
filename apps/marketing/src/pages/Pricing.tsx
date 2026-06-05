import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

interface Tier {
  slug: 'free' | 'pro' | 'production' | 'team' | 'enterprise'
  name: string
  price: { cs: string; en: string }
  period: { cs: string; en: string }
  target: { cs: string; en: string }
  featured?: boolean
  available: { cs: string; en: string }
  features: { cs: string[]; en: string[] }
}

const tiers: Tier[] = [
  {
    slug: 'free',
    name: 'ShowX Free',
    price: { cs: '$0', en: '$0' },
    period: { cs: 'navždy', en: 'forever' },
    target: { cs: 'Současní BridgeX zákazníci, studenti, hodnotitelé', en: 'Current BridgeX customers, students, evaluators' },
    available: { cs: 'Q1 2027', en: 'Q1 2027' },
    features: {
      cs: [
        'EventX Bridge module (full BridgeX 0.3.x parity)',
        '1 cuelist v REHEARSAL mode',
        '1 operátor / station',
        'Watermarked PDF cue-sheet export',
        'Open .showx file format',
        'Komunitní support',
      ],
      en: [
        'EventX Bridge module (full BridgeX 0.3.x parity)',
        '1 cuelist in REHEARSAL mode',
        '1 operator / station',
        'Watermarked PDF cue-sheet export',
        'Open .showx file format',
        'Community support',
      ],
    },
  },
  {
    slug: 'pro',
    name: 'ShowX Pro',
    price: { cs: '$29', en: '$29' },
    period: { cs: 'měsíc / seat', en: 'per seat / mo' },
    target: { cs: 'Working FOH op, indie SM, freelance TD', en: 'Working FOH op, indie SM, freelance TD' },
    featured: true,
    available: { cs: 'Q2 2027', en: 'Q2 2027' },
    features: {
      cs: [
        'Všechny moduly: EventX Bridge, Cuelist Core, SHOW mode, Custom Router, Cloud Sync',
        'Multi-operator collab v REHEARSAL i SHOW mode',
        'Edit proposal queue + history snapshots',
        'Plný PDF export (žádný watermark)',
        'Custom Router rule table',
        'BridgeX integration (existující zákazník = free upgrade)',
        'Email support',
      ],
      en: [
        'All modules: EventX Bridge, Cuelist Core, SHOW mode, Custom Router, Cloud Sync',
        'Multi-operator collab in REHEARSAL and SHOW mode',
        'Edit proposal queue + history snapshots',
        'Full PDF export (no watermark)',
        'Custom Router rule table',
        'BridgeX integration (existing customer = free upgrade)',
        'Email support',
      ],
    },
  },
  {
    slug: 'production',
    name: 'ShowX Production',
    price: { cs: '$99', en: '$99' },
    period: { cs: 'na show', en: 'per show' },
    target: { cs: 'Freelance SM s <3 show / měsíc', en: 'Freelance SM running <3 shows/mo' },
    available: { cs: 'Q2 2027', en: 'Q2 2027' },
    features: {
      cs: [
        'Jedna-show licence, všechny moduly',
        '7-day expiry od datum show',
        'Multi-operator collab (bez omezení na jedné show)',
        'Plný PDF export',
        'Cloud Sync backup',
        'Email support',
      ],
      en: [
        'One-show license, all modules',
        'Expires 7 days after show date',
        'Multi-operator collab (unrestricted on the one show)',
        'Full PDF export',
        'Cloud Sync backup',
        'Email support',
      ],
    },
  },
  {
    slug: 'team',
    name: 'ShowX Team',
    price: { cs: '$499', en: '$499' },
    period: { cs: 'měsíc, flat', en: 'per month flat' },
    target: { cs: 'Mid-size theatres, corporate AV týmy', en: 'Mid-size theatres, corporate AV teams' },
    available: { cs: 'Q3 2027', en: 'Q3 2027' },
    features: {
      cs: [
        'Unlimited seats per venue / producer',
        'Všechny moduly, multi-show concurrent',
        'Priority support (4h response)',
        'Onboarding session (1× zdarma)',
        'Cloud Sync neomezeně',
      ],
      en: [
        'Unlimited seats per venue / producer',
        'All modules, multi-show concurrent',
        'Priority support (4h response)',
        'Onboarding session (1× free)',
        'Unlimited Cloud Sync',
      ],
    },
  },
  {
    slug: 'enterprise',
    name: 'ShowX Enterprise',
    price: { cs: 'Custom', en: 'Custom' },
    period: { cs: 'kontaktujte', en: 'contact us' },
    target: { cs: 'Broadcast, theme parks, velké venues', en: 'Broadcast, theme parks, large venues' },
    available: { cs: 'Post-MVP', en: 'Post-MVP' },
    features: {
      cs: [
        'On-prem deployment option',
        'SSO (SAML / OIDC)',
        'Audit log export',
        'Dedicated CSM',
        'Custom SLA',
      ],
      en: [
        'On-prem deployment option',
        'SSO (SAML / OIDC)',
        'Audit log export',
        'Dedicated CSM',
        'Custom SLA',
      ],
    },
  },
]

const faqs = [
  {
    q: { cs: 'Co když mi vypadne WAN uprostřed show?', en: 'What if my WAN dies mid-show?' },
    a: {
      cs: 'Nic se nestane. ShowX je LAN-first. Embedded sync broker + asset server + protocol dispatcher běží na FOH Macu, žádná závislost na cloud. Cloud Sync je opt-in modul; když selže, ShowX dál jede.',
      en: 'Nothing happens. ShowX is LAN-first. The embedded sync broker + asset server + protocol dispatcher run on the FOH Mac with no cloud dependency. Cloud Sync is opt-in; if it fails, ShowX keeps going.',
    },
  },
  {
    q: { cs: 'Mohu migrovat z BridgeX?', en: 'Can I migrate from BridgeX?' },
    a: {
      cs: 'Ano, zdarma. ShowX Free tier zahrnuje EventX Bridge module, který nahrazuje BridgeX 0.3.x s plnou parity. Stávající BridgeX zákazníci dostanou outreach s migration guide a manual config import support.',
      en: 'Yes, free of charge. The ShowX Free tier includes the EventX Bridge module, which replaces BridgeX 0.3.x with full parity. Existing BridgeX customers will get an outreach with a migration guide and manual config import support.',
    },
  },
  {
    q: { cs: 'Potřebuju Supabase account?', en: 'Do I need a Supabase account?' },
    a: {
      cs: 'Pro venue runtime ne. Pairing je lokální (QR / 6-digit PIN). Supabase account vyžaduje jen Cloud Sync module (opt-in), který přidává backup, cross-venue accounts a remote collab.',
      en: 'For venue runtime, no. Pairing is local (QR / 6-digit PIN). A Supabase account is only required for the Cloud Sync module (opt-in), which adds backup, cross-venue accounts, and remote collab.',
    },
  },
  {
    q: { cs: 'Můžu ShowX použít na grandMA / Eos show?', en: 'Can I use ShowX on a grandMA / Eos show?' },
    a: {
      cs: 'Ano. ShowX volá LX cue na Eos/MA referencí (cue list + cue number → OSC nebo MSC). Konzole zůstává mistrem light states; ShowX je koordinační vrstva nad ní. Nepokoušíme se nahrazovat lighting konzoli a nikdy nebudeme.',
      en: 'Yes. ShowX fires LX cues on Eos/MA by reference (cue list + cue number → OSC or MSC). The console remains the master of light state; ShowX is the coordination layer above it. We do not try to replace a lighting console and never will.',
    },
  },
  {
    q: { cs: 'Mac only?', en: 'Mac only?' },
    a: {
      cs: 'FOH Electron app zatím ano (macOS signed + notarized DMG). PWA stanice běží v jakémkoliv moderním prohlížeči — iPad, Android tablet, Windows / Linux laptop. Windows ShowX shell zvažujeme pro 0.3+.',
      en: 'The FOH Electron app, yes for now (macOS signed + notarized DMG). PWA stations run in any modern browser — iPad, Android tablet, Windows / Linux laptop. A Windows ShowX shell is under consideration for 0.3+.',
    },
  },
  {
    q: { cs: 'Open source?', en: 'Open source?' },
    a: {
      cs: 'OSS-core rozhodnutí jsme odložili na post-MVP. Closed-source pro 0.1. Plánujeme zveřejnit dokumentaci OSC dictionary + .showx file format + module SDK pro third-party autoring; samotná core code base zůstává proprietary v 0.1.',
      en: 'OSS-core decision is deferred to post-MVP. Closed-source for 0.1. We plan to publish OSC dictionary docs + .showx file format + module SDK for third-party authoring; the core code base stays proprietary in 0.1.',
    },
  },
]

export function Pricing() {
  const { t, lang } = useI18n()
  const cs = lang === 'cs'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">{t('pricing.label')}</div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('pricing.headline.line1')}<br />
                <em className="font-light text-accent-deep not-italic">{t('pricing.headline.line2')}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">{t('pricing.intro')}</p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">03</div>
      </section>

      {/* TIERS */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiers.slice(0, 4).map(tier => (
              <div
                key={tier.slug}
                className={`tier-card ${tier.featured ? 'featured' : ''} relative`}
              >
                {tier.featured && (
                  <div className="absolute -top-3 left-6 bg-accent text-ink font-mono text-[10px] uppercase tracking-[0.18em] px-3 py-1 rounded-sm">
                    {cs ? 'Vlajková loď' : 'Flagship'}
                  </div>
                )}
                <div className="section-label mb-2">{tier.name}</div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="display-serif text-4xl">{cs ? tier.price.cs : tier.price.en}</span>
                  <span className={`font-mono text-xs ${tier.featured ? 'text-ground/60' : 'text-muted'}`}>
                    {cs ? tier.period.cs : tier.period.en}
                  </span>
                </div>
                <p className={`text-xs mb-6 ${tier.featured ? 'text-ground/70' : 'text-muted'} italic`}>
                  {cs ? tier.target.cs : tier.target.en}
                </p>
                <ul className="space-y-2 text-sm flex-1">
                  {(cs ? tier.features.cs : tier.features.en).map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono text-[10px] text-accent-deep mt-1.5 shrink-0">●</span>
                      <span className={tier.featured ? 'text-ground/90' : 'copy'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className={`mt-6 pt-4 border-t ${tier.featured ? 'border-ground/20' : 'border-rule'} font-mono text-[10px] uppercase tracking-[0.18em] ${tier.featured ? 'text-accent' : 'text-muted'}`}>
                  {cs ? 'Dostupné' : 'Available'} · {cs ? tier.available.cs : tier.available.en}
                </div>
              </div>
            ))}
          </div>

          {/* Enterprise full-width */}
          <div className="mt-6 border border-rule rounded-sm p-8 bg-paper/40 grid grid-cols-12 gap-6 items-center">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label mb-2">{tiers[4].name}</div>
              <div className="display-serif text-3xl">{cs ? tiers[4].price.cs : tiers[4].price.en}</div>
            </div>
            <div className="col-span-12 md:col-span-6">
              <p className="copy text-sm mb-3 italic">{cs ? tiers[4].target.cs : tiers[4].target.en}</p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {(cs ? tiers[4].features.cs : tiers[4].features.en).map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-mono text-[10px] text-accent-deep mt-1.5 shrink-0">●</span>
                    <span className="copy">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="col-span-12 md:col-span-3 flex md:justify-end">
              <a
                href="mailto:hello@xlabproject.net?subject=ShowX%20Enterprise"
                className="btn-ghost"
              >
                {cs ? 'Kontaktovat sales' : 'Talk to sales'} →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* MIGRATION NOTE */}
      <section className="rule-top bg-ink text-cream">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16">
          <div className="grid grid-cols-12 gap-8 items-center">
            <div className="col-span-12 md:col-span-8">
              <div className="section-label text-cream/60 mb-4">
                {cs ? 'Pro BridgeX zákazníky' : 'For BridgeX customers'}
              </div>
              <h2 className="display-serif text-display-3 text-cream leading-tight">
                {cs ? 'BridgeX 0.3.x migrace na ShowX Free' : 'BridgeX 0.3.x migration to ShowX Free'}<br />
                <em className="text-accent font-light not-italic">{cs ? 'je zdarma.' : 'is free.'}</em>
              </h2>
              <p className="copy text-cream/70 mt-6 max-w-2xl">
                {cs
                  ? 'Pokud dnes platíte za BridgeX, dostanete ShowX Free s plnou EventX Bridge module parity. BridgeX 0.3.x zůstává bugfix-only do konce 2026; pak EOL announcement.'
                  : 'If you pay for BridgeX today, you get ShowX Free with full EventX Bridge module parity. BridgeX 0.3.x stays bugfix-only through end-2026; EOL announcement follows.'}
              </p>
            </div>
            <div className="col-span-12 md:col-span-4 flex md:justify-end">
              <a
                href="mailto:hello@xlabproject.net?subject=BridgeX%20migration"
                className="btn-primary"
              >
                {cs ? 'Migrace info' : 'Migration info'} →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('pricing.faq.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('pricing.faq.h')}
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            {faqs.map((f, i) => (
              <div key={i} className="border-t border-ink pt-5">
                <div className="font-mono text-xs text-accent-deep mb-3">{String(i + 1).padStart(2, '0')}</div>
                <h3 className="display-serif text-xl mb-3">{cs ? f.q.cs : f.q.en}</h3>
                <p className="text-sm copy">{cs ? f.a.cs : f.a.en}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Jestě jste neviděli' : 'Still need to see'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'srovnání s konkurencí?' : 'how it compares?'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 flex md:justify-end">
              <Link to="/compare" className="btn-ghost">
                {cs ? 'Srovnání nástrojů' : 'Tool comparison'} →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
