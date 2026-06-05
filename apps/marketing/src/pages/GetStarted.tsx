import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function GetStarted() {
  const { t, lang } = useI18n()
  const cs = lang === 'cs'

  const steps = [
    {
      n: '01',
      h: { cs: 'Napište nám', en: 'Email us' },
      body: {
        cs: 'Pošlete email na hello@xlabproject.net s předmětem "ShowX beta". Můžete použít tlačítko níže — připraví email automaticky.',
        en: 'Send an email to hello@xlabproject.net with the subject "ShowX beta". Use the button below — it pre-fills the email for you.',
      },
    },
    {
      n: '02',
      h: { cs: 'Krátký kontext', en: 'A short context' },
      body: {
        cs: 'V emailu uveďte venue / company, vaši roli (SM, TD, freelance op, …), a největší pain ve vašem současném FOH workflow. Tři věty stačí.',
        en: 'In your email tell us the venue / company, your role (SM, TD, freelance op, …), and the biggest pain in your current FOH workflow. Three sentences is enough.',
      },
    },
    {
      n: '03',
      h: { cs: '30-minutový hovor', en: '30-minute call' },
      body: {
        cs: 'Domluvíme krátký call (video nebo telefon). Projdeme váš show workflow, ukážeme aktuální stav ShowX, společně rozhodneme, jestli vás přidat do beta cohort.',
        en: "We book a short call (video or phone). We walk through your show workflow, show the current ShowX state, and together decide if you go into the beta cohort.",
      },
    },
  ]

  const preBeta = [
    {
      h: { cs: 'Developer preview', en: 'Developer preview' },
      body: {
        cs: 'GitHub repo s aktuálním stavem implementace. Můžete sledovat bundle progress (ShowX-1 Foundation: 10/13 accepted) a číst architektonické decision notes.',
        en: 'GitHub repo with the current implementation state. You can track bundle progress (ShowX-1 Foundation: 10/13 accepted) and read architectural decision notes.',
      },
    },
    {
      h: { cs: 'Dokumentace', en: 'Documentation' },
      body: {
        cs: 'Architektura, modul SDK, protokol reference, .showx file format spec. Vše veřejné na GitHubu.',
        en: 'Architecture, module SDK, protocol reference, .showx file format spec. All public on GitHub.',
      },
    },
    {
      h: { cs: 'Example show files', en: 'Example show files' },
      body: {
        cs: 'Tři referenční .showx packages: malé divadlo (Hamlet), corporate AV (product launch), hybrid event (kongres). Otevřete v textovém editoru a podívejte se, jak vypadá data model v praxi.',
        en: 'Three reference .showx packages: small theatre (Hamlet), corporate AV (product launch), hybrid event (conference). Open in any text editor to see what the data model looks like in practice.',
      },
    },
    {
      h: { cs: 'Customer interviews', en: 'Customer interviews' },
      body: {
        cs: 'Před public 0.1 chceme udělat 5-10 interviews s FOH SM-y a corporate AV TD-y. Pokud máte 30 minut, váš input formuje produkt.',
        en: 'Before public 0.1 we want to do 5-10 interviews with FOH SMs and corporate AV TDs. If you have 30 minutes, your input shapes the product.',
      },
    },
  ]

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-deep mr-2 align-middle" />
                {t('gs.label')}
              </div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('gs.headline.line1')}<br />
                <em className="font-light text-accent-deep not-italic">{t('gs.headline.line2')}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">{t('gs.intro')}</p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">05</div>
      </section>

      {/* THREE STEPS */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Tři kroky' : 'Three steps'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Krátká cesta' : 'A short path'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'do beta cohort.' : 'into the beta cohort.'}</em>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            {steps.map(s => (
              <div key={s.n} className="bg-ground p-10 flex flex-col gap-4">
                <div className="font-mono text-xs text-accent-deep">{s.n}</div>
                <h3 className="display-serif text-2xl">{cs ? s.h.cs : s.h.en}</h3>
                <p className="copy text-sm">{cs ? s.body.cs : s.body.en}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap gap-3">
            <a
              href="mailto:hello@xlabproject.net?subject=ShowX%20beta&body=Hi%20XLAB%2C%0A%0AI'd%20like%20to%20join%20the%20ShowX%20beta.%0A%0AVenue%2Fcompany%3A%20%0ARole%3A%20%0ABiggest%20pain%20in%20current%20FOH%20workflow%3A%20%0A%0AThanks!"
              className="btn-primary"
            >
              {cs ? 'Otevřít předvyplněný email' : 'Open pre-filled email'} →
            </a>
            <Link to="/docs" className="btn-ghost">{cs ? 'Číst docs' : 'Read the docs'}</Link>
          </div>
        </div>
      </section>

      {/* PRE-BETA */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-16">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Před betou' : 'Before the beta'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Co můžete dělat' : 'What you can do'}<br />
                <em className="text-muted italic font-light">{cs ? 'už teď.' : 'right now.'}</em>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {preBeta.map((p, i) => (
              <div key={i} className="border-t border-ink pt-5">
                <div className="font-mono text-xs text-accent-deep mb-3">{String(i + 1).padStart(2, '0')}</div>
                <h3 className="display-serif text-2xl mb-3">{cs ? p.h.cs : p.h.en}</h3>
                <p className="copy text-sm">{cs ? p.body.cs : p.body.en}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO SHOULD APPLY */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-5">
              <div className="section-label mb-4">{cs ? 'Pro koho je beta' : 'Who the beta is for'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? '50 venues' : '50 venues'}<br />
                <em className="text-accent-deep font-light not-italic">{cs ? '+ freelance SMs.' : '+ freelance SMs.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-7">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="section-label mb-3 text-accent-deep">{cs ? 'Hledáme' : 'Looking for'}</div>
                  <ul className="space-y-2 text-sm copy">
                    <li>● {cs ? 'Theatres 50-800 sedadel' : 'Theatres 50-800 seats'}</li>
                    <li>● {cs ? 'Corporate AV TD-y (konference, awards)' : 'Corporate AV TDs (conferences, awards)'}</li>
                    <li>● {cs ? 'Freelance SMs s 5+ show / rok' : 'Freelance SMs with 5+ shows / year'}</li>
                    <li>● {cs ? 'Festivaly s cross-discipline workflow' : 'Festivals with cross-discipline workflow'}</li>
                    <li>● {cs ? 'Existující BridgeX zákazníci' : 'Existing BridgeX customers'}</li>
                  </ul>
                </div>
                <div>
                  <div className="section-label mb-3 text-muted">{cs ? 'Nehledáme' : 'Not looking for'}</div>
                  <ul className="space-y-2 text-sm copy text-muted">
                    <li>○ {cs ? 'Broadcast TV (CuePilot vlastní)' : 'Broadcast TV (CuePilot owns)'}</li>
                    <li>○ {cs ? 'Touring koncerty (timecode-only)' : 'Touring concerts (timecode-only)'}</li>
                    <li>○ {cs ? 'Theme parks (Medialon vlastní)' : 'Theme parks (Medialon owns)'}</li>
                    <li>○ {cs ? 'One-op podcaster / streamer' : 'One-op podcaster / streamer'}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
