import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

type Cell = 'yes' | 'no' | 'partial' | string

interface Tool {
  name: string
  vendor: string
  pricing: { cs: string; en: string }
  platform: string
}

interface Row {
  feature: { cs: string; en: string }
  cells: Cell[]
}

const tools: Tool[] = [
  { name: 'ShowX', vendor: 'XLAB', pricing: { cs: 'Free / $29-$499', en: 'Free / $29-$499' }, platform: 'Mac shell + Web stations' },
  { name: 'QLab 5', vendor: 'Figure 53', pricing: { cs: 'perpetual + per-license', en: 'perpetual + per-license' }, platform: 'macOS only' },
  { name: 'CuePilot', vendor: 'CuePilot', pricing: { cs: 'enterprise', en: 'enterprise' }, platform: 'Cloud + tablet' },
  { name: 'Companion', vendor: 'Bitfocus', pricing: { cs: 'free (OSS)', en: 'free (OSS)' }, platform: 'Win / Mac / Linux / Pi' },
  { name: 'Eos Apex', vendor: 'ETC', pricing: { cs: '$25k-100k console', en: '$25k-100k console' }, platform: 'Hardware + onPC' },
  { name: 'QLab + Companion', vendor: '(hack)', pricing: { cs: 'QLab + free', en: 'QLab + free' }, platform: 'macOS + any' },
]

const rows: Row[] = [
  {
    feature: { cs: 'Per-department views (jeden show, různé role)', en: 'Per-department views (one show, role lenses)' },
    cells: ['yes', 'no', 'yes', 'partial', 'partial', 'no'],
  },
  {
    feature: { cs: 'Multi-operator real-time collab', en: 'Multi-operator real-time collab' },
    cells: ['yes', 'partial', 'yes', 'no', 'yes', 'partial'],
  },
  {
    feature: { cs: 'Cuelist jako primární data model', en: 'Cuelist as primary data model' },
    cells: ['yes', 'yes', 'yes', 'no', 'yes', 'yes'],
  },
  {
    feature: { cs: 'Multi-protocol bridge (OSC + MIDI + DMX + MSC)', en: 'Multi-protocol bridge (OSC + MIDI + DMX + MSC)' },
    cells: ['yes', 'partial', 'no', 'yes', 'yes', 'yes'],
  },
  {
    feature: { cs: 'REHEARSAL / SHOW mode toggle (lock)', en: 'REHEARSAL / SHOW mode toggle (lock)' },
    cells: ['yes', 'no', 'no', 'no', 'no', 'no'],
  },
  {
    feature: { cs: 'LAN-first (běží bez WAN)', en: 'LAN-first (runs offline of WAN)' },
    cells: ['yes', 'yes', 'no', 'yes', 'yes', 'yes'],
  },
  {
    feature: { cs: 'Cloud-optional sync', en: 'Cloud-optional sync' },
    cells: ['yes', 'no', 'yes', 'no', 'no', 'no'],
  },
  {
    feature: { cs: 'Open file format (textový)', en: 'Open file format (text)' },
    cells: ['yes', 'partial', 'no', 'yes', 'no', 'partial'],
  },
  {
    feature: { cs: 'Compound cues (multi-payload per cue)', en: 'Compound cues (multi-payload per cue)' },
    cells: ['yes', 'partial', 'no', 'no', 'no', 'no'],
  },
  {
    feature: { cs: 'Stream Deck integration', en: 'Stream Deck integration' },
    cells: ['yes', 'yes', 'partial', 'yes', 'partial', 'yes'],
  },
  {
    feature: { cs: 'iPad operator station (PWA)', en: 'iPad operator station (PWA)' },
    cells: ['yes', 'no', 'yes', 'partial', 'partial', 'no'],
  },
  {
    feature: { cs: 'Cross-platform stations', en: 'Cross-platform stations' },
    cells: ['yes', 'no', 'yes', 'yes', 'no', 'partial'],
  },
  {
    feature: { cs: 'Per-department audit log', en: 'Per-department audit log' },
    cells: ['yes', 'partial', 'yes', 'no', 'yes', 'no'],
  },
  {
    feature: { cs: 'Open OSC dictionary (third-party integration)', en: 'Open OSC dictionary (third-party integration)' },
    cells: ['yes', 'yes', 'partial', 'yes', 'yes', 'yes'],
  },
  {
    feature: { cs: 'Cena pro 4-op malé divadlo / měsíc', en: 'Price for 4-op small theatre / month' },
    cells: ['$116 (Pro 4× seat)', '~$0-$80 amortized', 'n/a (enterprise)', '$0', 'n/a (hardware)', '$80 + 0'],
  },
]

function renderCell(cell: Cell, isShowX: boolean) {
  const base = 'inline-flex items-center justify-center font-mono text-[11px] px-2 py-0.5 rounded-sm'
  if (cell === 'yes') {
    return (
      <span className={`${base} ${isShowX ? 'bg-accent text-ink' : 'bg-accent-deep/20 text-ink'}`}>●</span>
    )
  }
  if (cell === 'no') {
    return <span className={`${base} text-muted/50`}>—</span>
  }
  if (cell === 'partial') {
    return <span className={`${base} bg-paper text-muted border border-rule`}>◐</span>
  }
  return <span className={`${base} text-ink ${isShowX ? 'font-medium' : ''}`}>{cell}</span>
}

export function Compare() {
  const { t, lang } = useI18n()
  const cs = lang === 'cs'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">{t('compare.label')}</div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {t('compare.headline.line1')}<br />
                <em className="font-light text-accent-deep not-italic">{t('compare.headline.line2')}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">{t('compare.intro')}</p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">04</div>
      </section>

      {/* MATRIX */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16">
          <div className="overflow-x-auto -mx-6 lg:-mx-12 px-6 lg:px-12">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-4 align-bottom border-b border-ink">
                    <div className="section-label">{cs ? 'Funkce' : 'Capability'}</div>
                  </th>
                  {tools.map(tool => (
                    <th
                      key={tool.name}
                      className={`text-center py-4 px-2 align-bottom border-b ${tool.name === 'ShowX' ? 'border-accent-deep bg-ink/[0.03]' : 'border-ink'}`}
                    >
                      <div className={`display-serif text-base mb-1 ${tool.name === 'ShowX' ? 'text-accent-deep' : 'text-ink'}`}>
                        {tool.name}
                      </div>
                      <div className="font-mono text-[10px] text-muted normal-case tracking-normal">
                        {tool.vendor}
                      </div>
                      <div className="font-mono text-[10px] text-muted normal-case tracking-normal mt-1">
                        {tool.platform}
                      </div>
                      <div className="font-mono text-[10px] text-muted normal-case tracking-normal mt-1">
                        {cs ? tool.pricing.cs : tool.pricing.en}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-rule">
                    <td className="py-3 pr-4 text-sm copy">
                      {cs ? row.feature.cs : row.feature.en}
                    </td>
                    {row.cells.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`text-center py-3 px-2 ${tools[ci].name === 'ShowX' ? 'bg-ink/[0.03]' : ''}`}
                      >
                        {renderCell(cell, tools[ci].name === 'ShowX')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-wrap gap-6 font-mono text-[10px] text-muted">
            <span><span className="inline-block w-3 h-3 bg-accent rounded-sm align-middle mr-1" /> {cs ? 'Plně' : 'Yes'}</span>
            <span><span className="inline-block w-3 h-3 bg-paper border border-rule rounded-sm align-middle mr-1" /> {cs ? 'Částečně' : 'Partial'}</span>
            <span><span className="inline-block w-3 align-middle mr-1">—</span> {cs ? 'Ne' : 'No'}</span>
          </div>
        </div>
      </section>

      {/* NARRATIVE */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Pozicování' : 'Positioning'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'ShowX nesoutěží' : 'ShowX does not compete'}<br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 's konzolemi.' : 'with consoles.'}</em>
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-10">
            <div>
              <h3 className="display-serif text-2xl mb-4">{cs ? 'Co ShowX neumí' : "What ShowX won't do"}</h3>
              <ul className="space-y-3 text-sm copy">
                <li><strong>{cs ? 'Není DMX driver.' : 'Not a DMX driver.'}</strong> {cs ? 'Eos / MA / Vista vlastní lighting world. ShowX volá jejich cue referencí, nikdy nerenderuje pixel.' : 'Eos / MA / Vista own the lighting world. ShowX fires their cues by reference, never renders a pixel.'}</li>
                <li><strong>{cs ? 'Není media server.' : 'Not a media server.'}</strong> {cs ? 'Resolume / disguise vlastní video playback. ShowX triggeruje video referencí.' : 'Resolume / disguise own video playback. ShowX triggers video by reference.'}</li>
                <li><strong>{cs ? 'Není audio engine.' : 'Not an audio engine.'}</strong> {cs ? 'QLab / SCS vlastní sound design. ShowX posílá OSC do QLab.' : 'QLab / SCS own sound design. ShowX sends OSC to QLab.'}</li>
                <li><strong>{cs ? 'Není node graph.' : 'Not a node graph.'}</strong> {cs ? 'Widget Designer / TouchDesigner cesta je 2010s paradigm. ShowX je cuelist-shaped, ne node-shaped.' : 'The Widget Designer / TouchDesigner path is a 2010s paradigm. ShowX is cuelist-shaped, not node-shaped.'}</li>
              </ul>
            </div>
            <div>
              <h3 className="display-serif text-2xl mb-4">{cs ? 'Co ShowX umí, co nikdo jiný' : 'What only ShowX does'}</h3>
              <ul className="space-y-3 text-sm copy">
                <li><strong>{cs ? 'Jeden show, různé role.' : 'One show, multiple roles.'}</strong> {cs ? 'CuePilot to umí pro broadcast. ShowX to umí pro theatre a corporate AV, LAN-first.' : 'CuePilot does this for broadcast. ShowX does it for theatre and corporate AV, LAN-first.'}</li>
                <li><strong>{cs ? 'REHEARSAL ↔ SHOW mode.' : 'REHEARSAL ↔ SHOW mode.'}</strong> {cs ? 'Žádný cuelist nástroj dnes nemá explicit single-action lock s edit proposal queue.' : 'No cuelist tool today has explicit single-action lock with an edit proposal queue.'}</li>
                <li><strong>{cs ? 'Embedded sync broker.' : 'Embedded sync broker.'}</strong> {cs ? 'Žádné external services pro venue runtime. Jeden signed binary, hotovo.' : 'No external services for venue runtime. One signed binary, done.'}</li>
                <li><strong>{cs ? 'Open .showx package directory.' : 'Open .showx package directory.'}</strong> {cs ? 'JSON manifest + JSONL audit + asset cache. Když XLAB zmizí, show otevřete v Sublime.' : 'JSON manifest + JSONL audit + asset cache. If XLAB disappeared, the show opens in Sublime.'}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* TYPICAL HACK */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-5">
              <div className="section-label mb-4">{cs ? 'Status quo' : 'Status quo'}</div>
              <h2 className="display-serif text-display-3 leading-tight">
                {cs ? 'QLab + Companion + Eos' : 'QLab + Companion + Eos'}<br />
                <span className="text-muted italic font-light">{cs ? '+ papírový prompt book' : '+ a paper prompt book'}</span>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-7">
              <p className="copy mb-4">
                {cs
                  ? 'Tahle kombinace dnes řídí 90 % menších a středních divadel. Funguje, ale kombinuje tři vendorové stacky a jeden papír. Žádný nemá per-department view, žádný nemá show-mode lock, koordinace se děje verbálně přes interkom.'
                  : 'This combo runs 90% of small- and mid-size theatres today. It works, but it stitches three vendor stacks and one paper book. None has per-department views, none has show-mode lock, coordination happens verbally over intercom.'}
              </p>
              <p className="copy">
                {cs
                  ? 'ShowX nepřebírá ten stack. Nahrazuje papír a slovní koordinaci jedním sdíleným show file, nad kterým má každý vlastní view. Eos pořád běží. QLab pořád běží. Prompt book je teď živý cuelist, který má řádek pro každé oddělení a SM ho volá z iPadu.'
                  : 'ShowX does not take over that stack. It replaces the paper and verbal coordination with a single shared show file that each role sees through its own view. Eos still runs. QLab still runs. The prompt book is now a live cuelist with a line per department, called from an iPad.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rule-top bg-ink text-cream">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <div className="section-label text-cream/60 mb-4">{cs ? 'Další krok' : 'Next step'}</div>
              <h2 className="display-serif text-display-2 text-cream leading-tight">
                {cs ? 'Vidět to v reálu?' : 'Want to see this in real life?'}<br />
                <em className="text-accent font-light not-italic">{cs ? 'Beta startuje Q1 2027.' : 'Beta starts Q1 2027.'}</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 flex md:justify-end flex-wrap gap-3">
              <a href="mailto:hello@xlabproject.net?subject=ShowX%20beta" className="btn-primary">
                {cs ? 'Přidat se do bety' : 'Join the beta'} →
              </a>
              <Link to="/pricing" className="btn-ghost border-cream/30 text-cream hover:bg-cream hover:text-ink">
                {cs ? 'Ceník' : 'Pricing'}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
