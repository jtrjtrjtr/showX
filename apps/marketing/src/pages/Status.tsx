import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

interface Bilingual {
  cs: string
  en: string
}

interface ShippedPhase {
  id: string
  name: Bilingual
  description: Bilingual
}

// Phases F1–F4 + LTC, all built and tested in v0.7.0.
const shippedPhases: ShippedPhase[] = [
  {
    id: 'F1',
    name: { cs: 'Základ operátora', en: 'Operator essentials' },
    description: {
      cs: 'Payloady (OSC/MIDI/MSC/DMX/webhook/wait/group/lx_ref), triggery, časování s živým odpočtem, disarm (odjištění cue) a audition (náhled GO bez reálného výstupu).',
      en: 'Payloads (OSC/MIDI/MSC/DMX/webhook/wait/group/lx_ref), triggers, timing with live countdown, disarm (skip a cue) and audition (preview GO with no real output).',
    },
  },
  {
    id: 'F2',
    name: { cs: 'Časová vrstva', en: 'Time layer' },
    description: {
      cs: 'Hlavní hodiny (master clock), velký timecode HH:MM:SS:FF na všech pohledech, MTC chase IN + generování OUT, cue spouštěné timecodem a samostatná odpočtová stanice.',
      en: 'Master clock, big HH:MM:SS:FF timecode on every view, MTC chase IN + generate OUT, timecode-triggered cues and a standalone countdown view.',
    },
  },
  {
    id: 'F3',
    name: { cs: 'Důvěra + cue lights', en: 'Trust + cue lights' },
    description: {
      cs: 'Zdraví zařízení (green/red), více cílů (primární + záložní s failoverem), předshow kontrola, cue lights (standby → potvrzení → GO), návrhy změn v SHOW a oprávnění operátorů.',
      en: 'Per-device health (green/red), multi-destination patch (primary + backup failover), pre-show health wizard, cue lights (standby → acknowledge → GO), SHOW-mode proposals and per-operator authority.',
    },
  },
  {
    id: 'F4',
    name: { cs: 'AI showcaller', en: 'AI showcaller' },
    description: {
      cs: 'Caller hlášky per cue, generování ze scénáře, klonování hlasu (ElevenLabs), předgenerování při zkoušce s lokálním přehráváním, interrupt (převzetí <200 ms) a intercom výstup.',
      en: 'Caller scripts per cue, generate from the sheet, voice clone (ElevenLabs), rehearsal pre-generation with local playback, interrupt (take over in <200 ms) and intercom out.',
    },
  },
  {
    id: 'LTC',
    name: { cs: 'LTC (lineární timecode)', en: 'LTC (linear timecode)' },
    description: {
      cs: 'Chase IN + generování OUT lineárního SMPTE timecodu přes audio rozhraní. Software hotový; lock na živý signál se ještě ověřuje na hardwaru.',
      en: 'Linear/SMPTE timecode chase IN + generate OUT over an audio interface. Software complete; live-signal lock is still being validated on hardware.',
    },
  },
]

// Test-count progression across the build.
const stats = [
  { value: 'v0.7.0', label: { cs: 'Verze (interní)', en: 'Version (internal)' } },
  { value: '~2,240', label: { cs: 'Testů', en: 'Tests' } },
  { value: '5', label: { cs: 'Fází (F1–F4 + LTC)', en: 'Phases (F1–F4 + LTC)' } },
  { value: '1509→2240', label: { cs: 'Růst testů', en: 'Test growth' } },
  { value: 'macOS', label: { cs: 'Apple Silicon', en: 'Apple Silicon' } },
] as const

// Honest pending list for testers.
const pending: { title: Bilingual; body: Bilingual }[] = [
  {
    title: { cs: 'Ověření LTC na hardwaru', en: 'LTC hardware validation' },
    body: {
      cs: 'Lock na živý LTC signál přes reálné audio rozhraní (přijímaný i generovaný) se finálně ověřuje na hardwaru.',
      en: 'Live LTC signal lock through a real audio interface (both chase and generate) is undergoing final hardware validation.',
    },
  },
  {
    title: { cs: 'Podepsaný + notarizovaný DMG', en: 'Signed + notarized DMG' },
    body: {
      cs: 'Build je zatím nepodepsaný (interní). Apple Developer ID podpis a notarizace teprve přijdou — testeři build otevírají přes pravý klik → Otevřít.',
      en: 'The build is currently unsigned (internal). Apple Developer ID signing and notarization are pending — testers open it via right-click → Open.',
    },
  },
  {
    title: { cs: 'Veřejné 1.0', en: 'Public 1.0' },
    body: {
      cs: 'Cesta k veřejnému vydání: rundown vrstva, živý ceník a produktový web. Zatím interní preview pro testery, ne veřejný prodej.',
      en: 'Road to public release: rundown layer, live pricing and the product web. For now an internal preview for testers, not public sale.',
    },
  },
]

// Neutral one-line roadmap items (NOT current work).
const roadmap: Bilingual[] = [
  { cs: 'Rundown vrstva (produkční scénář)', en: 'Rundown layer (production schedule)' },
  { cs: 'Živý ceník + produktový web', en: 'Live pricing + product web' },
  { cs: 'Integrace s audience produkty (později na roadmapě)', en: 'Audience-product integration (later on the roadmap)' },
]

export function Status() {
  const { lang } = useI18n()
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
                {cs ? 'Stav projektu' : 'Project status'}
              </div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {cs ? 'ShowX v0.7.0' : 'ShowX v0.7.0'}
                <br />
                <em className="font-light text-accent-deep not-italic">
                  {cs ? 'interní preview' : 'internal preview'}
                </em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">
                {cs
                  ? 'LAN-first FOH show-control na Macu — cuelist, timecode, cue lights a AI showcaller. Postaveno napříč fázemi F1–F4 + LTC, přes 2 240 testů. Verze pro testery, ne veřejný prodej.'
                  : 'LAN-first FOH show control on a Mac — cuelist, timecode, cue lights and an AI showcaller. Built across phases F1–F4 + LTC, over 2,240 tests. A build for testers, not public sale.'}
              </p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">
          03
        </div>
      </section>

      {/* CURRENT STATE / STATS */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Kde jsme' : 'Where we are'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Interní preview v0.7.0' : 'Internal preview v0.7.0'}
              </h2>
              <p className="copy mt-6 max-w-2xl">
                {cs
                  ? 'Kompletní operátorský workflow je postavený: cuelist core, časová vrstva, vrstva důvěry s cue lights a AI showcaller. Počet testů narostl z 1 509 na zhruba 2 240. Stanice běží v prohlížeči, žádná instalace pro operátory.'
                  : 'The full operator workflow is built: cuelist core, time layer, the trust layer with cue lights, and the AI showcaller. The test count grew from 1,509 to around 2,240. Stations run in any browser, zero install for operators.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-rule border border-rule">
            {stats.map((s, i) => (
              <div key={s.value + i} className="bg-ground p-6 flex flex-col gap-2">
                <div className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</div>
                <div className="display-serif text-3xl text-accent-deep">{s.value}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  {cs ? s.label.cs : s.label.en}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SHIPPED PHASES */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Co je hotové' : 'What is shipped'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Fáze F1–F4 + LTC' : 'Phases F1–F4 + LTC'}
              </h2>
              <p className="copy mt-6 max-w-2xl">
                {cs
                  ? 'Každá fáze je postavená, otestovaná a dostupná v tomto preview buildu.'
                  : 'Every phase is built, tested and available in this preview build.'}
              </p>
            </div>
          </div>
          <div className="border border-rule rounded-sm bg-ground overflow-hidden">
            <table className="w-full">
              <thead className="bg-paper/40 border-b border-rule">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-16">#</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-56">
                    {cs ? 'Fáze' : 'Phase'}
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
                {shippedPhases.map(p => (
                  <tr key={p.id} className="border-b border-rule last:border-b-0 align-top">
                    <td className="px-4 py-3 font-mono text-xs text-accent-deep">{p.id}</td>
                    <td className="px-4 py-3 font-mono text-sm">{cs ? p.name.cs : p.name.en}</td>
                    <td className="px-4 py-3 text-sm copy">{cs ? p.description.cs : p.description.en}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm font-mono bg-accent text-ink whitespace-nowrap">
                        ✓ {cs ? 'Hotovo' : 'Shipped'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PENDING */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Co zbývá' : 'What is pending'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Otevřené body do 1.0' : 'Open items toward 1.0'}
              </h2>
              <p className="copy mt-6 max-w-2xl">
                {cs
                  ? 'Buďme upřímní k testerům — tohle ještě není hotové.'
                  : 'Being honest with testers — these are not finished yet.'}
              </p>
            </div>
          </div>
          <div className="space-y-4">
            {pending.map((item, i) => (
              <div key={i} className="border border-rule rounded-sm p-6 bg-ground grid grid-cols-12 gap-6 items-start">
                <div className="col-span-12 md:col-span-3">
                  <div className="font-mono text-xs text-accent-deep">{String(i + 1).padStart(2, '0')}</div>
                  <h3 className="display-serif text-lg mt-2">{cs ? item.title.cs : item.title.en}</h3>
                </div>
                <div className="col-span-12 md:col-span-9">
                  <p className="copy text-sm">{cs ? item.body.cs : item.body.en}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROADMAP (neutral, not current work) */}
      <section className="rule-top bg-ink text-cream">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label text-cream/60">{cs ? 'Na roadmapě' : 'On the roadmap'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 text-cream leading-tight">
                {cs ? 'Cesta k veřejnému vydání' : 'Road to a public release'}
              </h2>
              <p className="text-cream/70 mt-6 max-w-2xl text-sm leading-relaxed">
                {cs
                  ? 'Neplánovaná do tohoto preview, ale na obzoru. Bez závazného termínu.'
                  : 'Not in this preview, but on the horizon. No committed date.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {roadmap.map((item, i) => (
              <div key={i} className="border border-cream/15 rounded-sm p-6 bg-ink/40">
                <div className="flex items-baseline justify-between mb-4">
                  <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cream/60">
                    {cs ? 'Plánováno' : 'Planned'}
                  </span>
                </div>
                <p className="text-cream/80 text-sm leading-relaxed">{cs ? item.cs : item.en}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Chcete to vyzkoušet?' : 'Want to try it?'}
                <br />
                <em className="text-accent-deep italic font-light not-italic">
                  {cs ? 'Spusťte preview build.' : 'Run the preview build.'}
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
