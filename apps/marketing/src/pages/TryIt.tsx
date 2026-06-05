import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

interface Step {
  n: string
  key: string
  command: string
  hasNote: boolean
}

const steps: Step[] = [
  {
    n: '01',
    key: 'step1',
    command: `git clone git@github.com:xlab/showx.git
cd showx`,
    hasNote: true,
  },
  {
    n: '02',
    key: 'step2',
    command: `brew install node@20
npm install -g pnpm@8.15.0`,
    hasNote: true,
  },
  {
    n: '03',
    key: 'step3',
    command: `pnpm install`,
    hasNote: false,
  },
  {
    n: '04',
    key: 'step4',
    command: `pnpm typecheck`,
    hasNote: false,
  },
  {
    n: '05',
    key: 'step5',
    command: `pnpm test`,
    hasNote: false,
  },
  {
    n: '06',
    key: 'step6',
    command: `pnpm dev:pwa
# open http://localhost:5174`,
    hasNote: false,
  },
  {
    n: '07',
    key: 'step7',
    command: `pnpm --filter showx-main dev
# watch the 13-step boot in the console`,
    hasNote: true,
  },
  {
    n: '08',
    key: 'step8',
    command: `# in a browser tab: http://localhost:5174
# click "Add station"
# enter the 6-digit PIN from Electron shell logs`,
    hasNote: true,
  },
]

export function TryIt() {
  const { t, lang } = useI18n()
  const cs = lang === 'cs'

  const bugMailto =
    'mailto:hello@xlabproject.net?subject=ShowX%20dev%20bug&body=Hi%20XLAB%2C%0A%0AI%20hit%20a%20bug%20in%20the%20ShowX%20dev%20preview.%0A%0AStep%20%23%3A%20%0AWhat%20I%20expected%3A%20%0AWhat%20happened%3A%20%0AElectron%20console%20log%20(paste)%3A%20%0A%0AThanks!'
  const previewMailto =
    "mailto:hello@xlabproject.net?subject=ShowX%20dev%20preview%20cohort&body=Hi%20XLAB%2C%0A%0AI'd%20like%20a%20seat%20in%20the%20ShowX%20dev%20preview%20cohort.%0A%0AWho%20I%20am%3A%20%0AVenue%20%2F%20role%3A%20%0AWhat%20I%20want%20to%20see%20from%20ShowX%3A%20%0A%0AThanks!"
  const chatMailto =
    'mailto:hello@xlabproject.net?subject=ShowX%20dev%20channel&body=Hi%20XLAB%2C%0A%0AAdd%20me%20to%20the%20ShowX%20dev%20channel%20please.%0A%0AGitHub%20handle%3A%20%0A%0AThanks!'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-deep mr-2 align-middle" />
                {t('try.label')}
              </div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('try.headline.line1')}
                <br />
                <em className="font-light text-accent-deep not-italic">{t('try.headline.line2')}</em>
                <br />
                <span className="text-muted italic font-light">{t('try.headline.line3')}</span>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">{t('try.intro')}</p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">
          02
        </div>
      </section>

      {/* STEPS */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Osm kroků' : 'Eight steps'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Naklonovat.' : 'Clone it.'}
                <br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'Bootovat.' : 'Boot it.'}</em>
              </h2>
            </div>
          </div>
          <div className="space-y-6">
            {steps.map(s => (
              <div
                key={s.n}
                className="border border-rule rounded-sm p-6 lg:p-8 bg-ground grid grid-cols-12 gap-6 items-start"
              >
                <div className="col-span-12 md:col-span-2">
                  <div className="display-serif text-4xl text-accent-deep">{s.n}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mt-2">
                    {cs ? `Krok ${s.n}` : `Step ${s.n}`}
                  </div>
                </div>
                <div className="col-span-12 md:col-span-10 flex flex-col gap-4">
                  <h3 className="display-serif text-2xl">{t(`try.${s.key}.h`)}</h3>
                  <p className="copy text-sm">{t(`try.${s.key}.body`)}</p>
                  <pre className="bg-ink text-cream/90 font-mono text-[11px] leading-relaxed p-5 rounded-sm overflow-x-auto border border-ink">
                    <code>{s.command}</code>
                  </pre>
                  {s.hasNote && (
                    <p className="text-xs text-muted border-l-2 border-accent-deep/40 pl-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-deep mr-2">
                        {cs ? 'Pozn' : 'Note'}
                      </span>
                      {t(`try.${s.key}.note`)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT NEXT */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('try.next.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('try.next.h')}
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <div className="bg-ground p-8 flex flex-col gap-3">
              <div className="font-mono text-xs text-accent-deep">01</div>
              <h3 className="display-serif text-xl">{t('try.next.docs.h')}</h3>
              <p className="copy text-sm">{t('try.next.docs.body')}</p>
              <div className="mt-2 flex flex-col gap-1 font-mono text-[11px] text-muted">
                <span>→ docs/dev/architecture.md</span>
                <span>→ docs/dev/module-sdk.md</span>
                <span>→ docs/dev/protocol-reference.md</span>
              </div>
            </div>
            <div className="bg-ground p-8 flex flex-col gap-3">
              <div className="font-mono text-xs text-accent-deep">02</div>
              <h3 className="display-serif text-xl">{t('try.next.bugs.h')}</h3>
              <p className="copy text-sm">{t('try.next.bugs.body')}</p>
              <div className="mt-auto pt-3">
                <a href={bugMailto} className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-deep hover:text-ink">
                  {cs ? 'Otevřít email →' : 'Open email →'}
                </a>
              </div>
            </div>
            <div className="bg-ground p-8 flex flex-col gap-3">
              <div className="font-mono text-xs text-accent-deep">03</div>
              <h3 className="display-serif text-xl">{t('try.next.chat.h')}</h3>
              <p className="copy text-sm">{t('try.next.chat.body')}</p>
              <div className="mt-auto pt-3">
                <a href={chatMailto} className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-deep hover:text-ink">
                  {cs ? 'Požádat o přístup →' : 'Request access →'}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-7">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Žádný klon ještě?' : "Haven't cloned yet?"}
                <br />
                <em className="text-accent-deep italic font-light not-italic">
                  {cs ? 'Začněte krokem 01.' : 'Start at step 01.'}
                </em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-5 flex flex-col gap-4 md:items-end">
              <div className="flex flex-wrap gap-3">
                <a href={previewMailto} className="btn-primary">
                  {cs ? 'Požádat o přístup k repu' : 'Request repo access'} →
                </a>
                <Link to="/status" className="btn-ghost">
                  {cs ? 'Live status' : 'Live status'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
