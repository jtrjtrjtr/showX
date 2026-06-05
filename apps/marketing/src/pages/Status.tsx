import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

interface SharedService {
  name: string
  description: { cs: string; en: string }
}

const sharedServices: SharedService[] = [
  { name: 'Logger', description: { cs: 'JSONL strukturovaný log + rotace.', en: 'JSONL structured log + rotation.' } },
  {
    name: 'EventBus',
    description: {
      cs: 'Typovaný pub/sub mezi shared services a moduly.',
      en: 'Typed pub/sub between shared services and modules.',
    },
  },
  {
    name: 'HealthBus',
    description: {
      cs: 'Per-modul health state machine + crash izolace.',
      en: 'Per-module health state machine + crash isolation.',
    },
  },
  {
    name: 'PersistedStore',
    description: {
      cs: 'Key-value JSON persistence v Electron app data.',
      en: 'Key-value JSON persistence in Electron app data.',
    },
  },
  {
    name: 'SecretStore',
    description: {
      cs: 'Encrypted secret storage (keychain backend).',
      en: 'Encrypted secret storage (keychain backend).',
    },
  },
  {
    name: 'AssetServer',
    description: {
      cs: 'Express na portu 5300 servuje PWA bundle + assets.',
      en: 'Express on port 5300 serves the PWA bundle + assets.',
    },
  },
  {
    name: 'MdnsService',
    description: {
      cs: 'Bonjour advertising `_showx._tcp.local`.',
      en: 'Bonjour advertising `_showx._tcp.local`.',
    },
  },
  {
    name: 'SyncBroker',
    description: {
      cs: 'Embedded y-websocket node uvnitř Electron procesu.',
      en: 'Embedded y-websocket node inside the Electron process.',
    },
  },
  {
    name: 'OutputDispatcher',
    description: {
      cs: 'OSC + MIDI + DMX transport pools s claim/release API.',
      en: 'OSC + MIDI + DMX transport pools with claim/release API.',
    },
  },
  {
    name: 'InputRegistrar',
    description: {
      cs: 'OSC + MIDI listener registry per modul.',
      en: 'OSC + MIDI listener registry per module.',
    },
  },
  {
    name: 'PairingStore',
    description: {
      cs: 'HMAC tokens + 6-digit PIN + QR pairing flow.',
      en: 'HMAC tokens + 6-digit PIN + QR pairing flow.',
    },
  },
]

const stats = [
  { value: '~12,500', key: 'loc' },
  { value: '269', key: 'tests' },
  { value: '~7h', key: 'wall' },
  { value: '25', key: 'commits' },
  { value: '2', key: 'rescues' },
] as const

const nextBundleTasks = [
  'B002-001 · BridgeX source copy',
  'B002-002 · EventX Bridge module skeleton',
  'B002-003 · module internal core migration',
  'B002-004 · adapter migration OutputDispatcher',
  'B002-005 · Supabase subscriber reconnect',
  'B002-006 · rule engine config schema',
  'B002-007 · auth-manager placement',
  'B002-008 · UI panel migration',
  'B002-009 · config migration script',
  'B002-010 · parity scenarios PT-001..015',
  'B002-011 · parity scenarios PT-016..025',
  'B002-012 · parity scenarios PT-026..035',
  'B002-013 · migration test harness',
  'B002-014 · Apple Developer ID rebrand',
  'B002-015 · ShowX 0.5 internal release',
]

const comingBundles = ['b3', 'b4', 'b5'] as const
const openQuestions = ['q22', 'q23', 'q25', 'q26', 'q31'] as const

export function Status() {
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
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-deep mr-2 align-middle" />
                {t('status.label')}
              </div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('status.headline.line1')}
                <br />
                <em className="font-light text-accent-deep not-italic">{t('status.headline.line2')}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">{t('status.intro')}</p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">
          03
        </div>
      </section>

      {/* CURRENT PHASE */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('status.phase.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('status.phase.h')}
              </h2>
              <p className="copy mt-6 max-w-2xl">{t('status.phase.body')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-rule border border-rule">
            {stats.map((s, i) => (
              <div key={s.key} className="bg-ground p-6 flex flex-col gap-2">
                <div className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</div>
                <div className="display-serif text-3xl text-accent-deep">{s.value}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  {t(`status.stats.${s.key}`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT WORKS */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('status.works.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('status.works.h')}
              </h2>
              <p className="copy mt-6 max-w-2xl">{t('status.works.body')}</p>
            </div>
          </div>
          <div className="border border-rule rounded-sm bg-ground overflow-hidden">
            <table className="w-full">
              <thead className="bg-paper/40 border-b border-rule">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-12">#</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-56">
                    {cs ? 'Služba' : 'Service'}
                  </th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    {cs ? 'Popis' : 'Description'}
                  </th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-28">
                    {cs ? 'Stav' : 'State'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sharedServices.map((s, i) => (
                  <tr key={s.name} className="border-b border-rule last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</td>
                    <td className="px-4 py-3 font-mono text-sm">{s.name}</td>
                    <td className="px-4 py-3 text-sm copy">{cs ? s.description.cs : s.description.en}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm font-mono bg-accent text-ink">
                        ✓ {cs ? 'V provozu' : 'Operational'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* NEXT BUNDLE */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('status.next.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('status.next.h')}
              </h2>
              <p className="copy mt-6 max-w-2xl">{t('status.next.body')}</p>
            </div>
          </div>
          <div className="border border-rule rounded-sm bg-ground overflow-hidden">
            <table className="w-full">
              <thead className="bg-paper/40 border-b border-rule">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    {cs ? 'Task' : 'Task'}
                  </th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-28">
                    {cs ? 'Stav' : 'Status'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {nextBundleTasks.map(task => (
                  <tr key={task} className="border-b border-rule last:border-b-0">
                    <td className="px-4 py-3 text-sm font-mono">{task}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm font-mono border border-rule text-muted">
                        {cs ? 'Queued' : 'Queued'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* WHAT'S COMING */}
      <section className="rule-top bg-ink text-cream">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label text-cream/60">{t('status.coming.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 text-cream leading-tight">
                {t('status.coming.h')}
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {comingBundles.map((b, i) => (
              <div key={b} className="border border-cream/15 rounded-sm p-6 bg-ink/40">
                <div className="flex items-baseline justify-between mb-4">
                  <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/60">
                    {cs ? 'Plánováno' : 'Planned'}
                  </span>
                </div>
                <h3 className="display-serif text-xl text-cream mb-3">{t(`status.coming.${b}.title`)}</h3>
                <p className="text-cream/70 text-xs leading-relaxed">{t(`status.coming.${b}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PARITY */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('status.parity.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('status.parity.h')}
              </h2>
              <p className="copy mt-6 max-w-3xl">{t('status.parity.body')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* OPEN QUESTIONS */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{t('status.open.label')}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {t('status.open.h')}
              </h2>
              <p className="copy mt-6 max-w-2xl">{t('status.open.body')}</p>
            </div>
          </div>
          <div className="space-y-4">
            {openQuestions.map((q, i) => (
              <div key={q} className="border border-rule rounded-sm p-6 bg-ground grid grid-cols-12 gap-6 items-start">
                <div className="col-span-12 md:col-span-3">
                  <div className="font-mono text-xs text-accent-deep">{String(i + 1).padStart(2, '0')}</div>
                  <h3 className="display-serif text-lg mt-2">{t(`status.open.${q}`)}</h3>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <p className="copy text-sm">{t(`status.open.${q}.body`)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <a
              href="https://github.com/xlab/showx/blob/main/docs/agent_exchange/decisions/2026-06-05_open_questions_architect.md"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs uppercase tracking-[0.18em] text-accent-deep hover:text-ink"
            >
              {cs ? 'Plný seznam 31 otázek →' : 'Full list of 31 questions →'}
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Chcete sledovat víc?' : 'Want to follow more closely?'}
                <br />
                <em className="text-accent-deep italic font-light not-italic">
                  {cs ? 'Naklonujte repo.' : 'Clone the repo.'}
                </em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 flex md:justify-end flex-wrap gap-3">
              <Link to="/try-it" className="btn-primary">
                {cs ? 'Návod /try-it' : 'Walkthrough /try-it'} →
              </Link>
              <Link to="/docs" className="btn-ghost">
                {cs ? 'Docs' : 'Docs'}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
