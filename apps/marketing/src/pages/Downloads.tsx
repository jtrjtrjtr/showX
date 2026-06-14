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
    version: '0.7.0',
    name: { cs: 'Internal preview — pro testery', en: 'Internal preview — for testers' },
    target: 'Available now',
    status: 'preview',
    notes: {
      cs: 'Aktuální build. Postaveno napříč F1 (operátorské základy) → F2 (čas: master clock, MTC/LTC chase + generování, timecode cues, odpočtová stanice) → F3 (důvěra: zdraví zařízení, multi-destination záloha, předshow kontrola, cue lights) → F4 (AI showcaller: caller script, generování ze scénáře, klonování hlasu, lokální přehrávání, interrupt). ~2240 testů. macOS Apple Silicon, unsigned interní build.',
      en: 'Current build. Built across F1 (operator essentials) → F2 (time: master clock, MTC/LTC chase + generate, timecode cues, countdown station) → F3 (trust: device health, multi-destination backup, pre-show check, cue lights) → F4 (AI showcaller: caller script, generate from sheet, voice clone, local playback, interrupt). ~2240 tests. macOS Apple Silicon, unsigned internal build.',
    },
  },
  {
    version: '1.0',
    name: { cs: 'Public 1.0', en: 'Public 1.0' },
    target: 'Later',
    status: 'planned',
    notes: {
      cs: 'Signed + notarized DMG (Apple Developer ID), rundown vrstva, živý pricing, produktový web a docs portál. Otevřené registrace. Cíl: z testovacího preview na veřejný produkt.',
      en: 'Signed + notarized DMG (Apple Developer ID), rundown layer, live pricing, product web and docs portal. Open signups. Goal: from tester preview to a public product.',
    },
  },
]

interface BuiltLayer {
  id: string
  title: { cs: string; en: string }
  detail: { cs: string; en: string }
}

const builtLayers: BuiltLayer[] = [
  {
    id: 'F1',
    title: { cs: 'Cuelist Core', en: 'Cuelist Core' },
    detail: {
      cs: 'Multi-operator cuelist, per-department views, REHEARSAL ↔ SHOW režim, compound cues, payloady (OSC/MIDI/MSC/DMX Art-Net+sACN/webhook/wait/group/lx_ref), triggery (GO/auto-follow/auto-continue/timecode/hotkey), audition (náhled GO), disarm, panic, cue editor v prohlížeči.',
      en: 'Multi-operator cuelist, per-department views, REHEARSAL ↔ SHOW mode, compound cues, payloads (OSC/MIDI/MSC/DMX Art-Net+sACN/webhook/wait/group/lx_ref), triggers (GO/auto-follow/auto-continue/timecode/hotkey), audition (preview GO), disarm, panic, in-browser cue editor.',
    },
  },
  {
    id: 'F2',
    title: { cs: 'Časová vrstva', en: 'Time layer' },
    detail: {
      cs: 'Master clock, velký timecode (HH:MM:SS:FF) na všech pohledech, MTC chase IN + generování OUT, LTC chase IN + generování OUT, timecode-triggered cues, show-time OSC broadcast, odpočtová stanice (kiosk na Raspberry Pi).',
      en: 'Master clock, big timecode (HH:MM:SS:FF) on every view, MTC chase IN + generate OUT, LTC chase IN + generate OUT, timecode-triggered cues, show-time OSC broadcast, countdown station (Raspberry Pi kiosk).',
    },
  },
  {
    id: 'F3',
    title: { cs: 'Důvěra & bezpečí', en: 'Trust & safety' },
    detail: {
      cs: 'Zdraví zařízení (green/red z reálných dispatch výsledků), potvrzený stav zařízení, multi-destination patch (primární + záloha, failover), předshow kontrola, cue lights (SM standby → operator potvrdí → GO), návrhy změn v SHOW, oprávnění operátorů.',
      en: 'Per-device health (green/red from real dispatch outcomes), device feedback, multi-destination patch (primary + backup, failover), pre-show health check, cue lights (SM standby → operator acknowledge → GO), SHOW-mode proposals, per-operator authority.',
    },
  },
  {
    id: 'F4',
    title: { cs: 'AI showcaller', en: 'AI showcaller' },
    detail: {
      cs: 'Caller script per cue, deterministické generování ze scénáře + agregace souběžných marků, volitelný LLM návrh (Claude), klonování hlasu (ElevenLabs), předgenerování při zkoušce → lokální přehrávání při show, interrupt (TAKE OVER / MUTE < 200 ms), intercom výstup.',
      en: 'Caller script per cue, deterministic generation from the sheet + aggregation of simultaneous marks, optional LLM draft (Claude), voice clone (ElevenLabs), rehearsal pre-generation → local playback at show, interrupt (TAKE OVER / MUTE < 200 ms), intercom out.',
    },
  },
  {
    id: 'I/O',
    title: { cs: 'Protokoly + import/export', en: 'Protocols + import/export' },
    detail: {
      cs: 'OSC, MIDI, MSC, DMX Art-Net, DMX sACN, webhook, MTC, LTC, mDNS objevení; Routing UI mapuje payloady → zařízení. CSV import (QLab + Eos), JSON/PDF export, otevření .showx balíčku.',
      en: 'OSC, MIDI, MSC, DMX Art-Net, DMX sACN, webhook, MTC, LTC, mDNS discovery; Routing UI maps payloads → devices. CSV import (QLab + Eos), JSON/PDF export, open a .showx package.',
    },
  },
]

const releaseStatusBadge = (s: string, cs: boolean) => {
  if (s === 'development') return { label: cs ? 'Vývoj' : 'In development', cls: 'bg-ink text-accent' }
  if (s === 'planned') return { label: cs ? 'Plánováno' : 'Planned', cls: 'border border-rule text-muted' }
  if (s === 'preview') return { label: cs ? 'Preview' : 'Preview', cls: 'bg-accent text-ink' }
  return { label: s, cls: '' }
}

export function Downloads() {
  const { lang } = useI18n()
  const cs = lang === 'cs'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">{cs ? 'Ke stažení · v0.7.0' : 'Downloads · v0.7.0'}</div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {cs ? 'Ke stažení.' : 'Downloads.'}<br />
                <em className="font-light text-accent-deep not-italic">{cs ? 'Pro testery.' : 'For testers.'}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">
                {cs
                  ? 'ShowX v0.7.0 je interní preview pro testery — ne veřejný prodej. Jeden DMG, Apple Silicon Mac, a kompletní FOH show-control: cuelist, timecode, cue lights a AI showcaller. Stanice běží v prohlížeči.'
                  : 'ShowX v0.7.0 is an internal preview for testers — not a public sale. One DMG, an Apple Silicon Mac, and complete FOH show control: cuelist, timecode, cue lights and an AI showcaller. Stations run in any browser.'}
              </p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">04</div>
      </section>

      {/* DOWNLOAD v0.7.0 — LIVE */}
      <section className="rule-top bg-accent/10">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Aktuální release' : 'Current release'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                ShowX v0.7.0<br />
                <em className="text-accent-deep font-light not-italic">
                  {cs ? 'internal preview — dostupné nyní' : 'internal preview — available now'}
                </em>
              </h2>
              <p className="copy mt-6 max-w-2xl">
                {cs
                  ? 'Kompletní FOH show-control. F1 cuelist + F2 časová vrstva (vč. MTC/LTC chase + generování) + F3 důvěra a cue lights + F4 AI showcaller — vše postaveno. ~2240 testů. macOS Apple Silicon. Unsigned interní build — Gatekeeper bypass níže. Plný návod krok-za-krokem je na /try-it.'
                  : 'Complete FOH show control. F1 cuelist + F2 time layer (incl. MTC/LTC chase + generate) + F3 trust and cue lights + F4 AI showcaller — all built. ~2240 tests. macOS Apple Silicon. Unsigned internal build — Gatekeeper bypass below. The full step-by-step guide is at /try-it.'}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <a
                  href="/ShowX-0.7.0-arm64.dmg"
                  className="btn-primary"
                  download
                >
                  {cs ? 'Stáhnout ShowX v0.7.0 (arm64)' : 'Download ShowX v0.7.0 (arm64)'}
                </a>
                <Link
                  to="/try-it"
                  className="text-sm copy underline decoration-1 underline-offset-4 self-center"
                >
                  {cs ? 'Plný návod pro testery /try-it' : 'Full tester guide /try-it'} →
                </Link>
              </div>

              <div className="mt-12 border-l-2 border-accent-deep pl-6 max-w-2xl">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-3">
                  {cs ? 'Instalace (unsigned interní build)' : 'Install (unsigned internal build)'}
                </div>
                <ol className="copy text-sm space-y-2 list-decimal list-inside">
                  <li>{cs ? 'Stáhněte ShowX-0.7.0-arm64.dmg (tlačítko výše)' : 'Download ShowX-0.7.0-arm64.dmg (button above)'}</li>
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
                  <li>
                    {cs
                      ? 'Pro rychlé párování stanic spusťte s pevným testovacím PINem:'
                      : 'For fast station pairing, launch with a fixed test PIN:'}{' '}
                    <code className="font-mono text-xs">SHOWX_PAIRING_TEST_PIN=000000</code>
                    {cs ? ' → PIN 000000 nikdy nevyprší.' : ' → PIN 000000 never expires.'}
                  </li>
                </ol>
                <p className="copy text-xs text-muted mt-4">
                  {cs
                    ? '⚠️ Interní preview pro testery. Bez Apple cert / notarizace; signed + notarized build a plná hardwarová validace LTC teprve přijdou.'
                    : '⚠️ Internal preview for testers. No Apple cert / notarization yet; a signed + notarized build and full LTC hardware validation are still pending.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT'S BUILT */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Co je postaveno' : "What's built"}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'F1–F4 + LTC' : 'F1–F4 + LTC'}<br />
                <em className="text-accent-deep font-light not-italic">
                  {cs ? 'vše v tomhle buildu' : 'all in this build'}
                </em>
              </h2>
              <p className="copy mt-4 max-w-2xl text-sm">
                {cs
                  ? 'Cuelist UI, časová vrstva i AI showcaller jsou hotové — žádné "přijde někdy příště". Tohle je co dostanete v DMG.'
                  : "The cuelist UI, time layer and AI showcaller are done — no “arrives later”. This is what's in the DMG."}
              </p>
            </div>
          </div>
          <div className="border border-rule rounded-sm bg-ground overflow-hidden">
            <table className="w-full">
              <thead className="bg-paper/40 border-b border-rule">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-16">{cs ? 'Vrstva' : 'Layer'}</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted w-44">
                    {cs ? 'Oblast' : 'Area'}
                  </th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    {cs ? 'Co obsahuje' : "What's in it"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {builtLayers.map(b => (
                  <tr key={b.id} className="border-b border-rule last:border-b-0 align-top">
                    <td className="px-4 py-4 font-mono text-xs text-accent-deep">{b.id}</td>
                    <td className="px-4 py-4 text-sm display-serif">{cs ? b.title.cs : b.title.en}</td>
                    <td className="px-4 py-4 text-sm copy">{cs ? b.detail.cs : b.detail.en}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/docs" className="btn-ghost">{cs ? 'Funkce + scénáře' : 'Features + scenarios'} →</Link>
            <Link to="/status" className="btn-ghost">{cs ? 'Live status' : 'Live status'}</Link>
          </div>
          <p className="copy text-xs text-muted mt-6 max-w-2xl">
            {cs
              ? 'Integrace s EventX (EventX Bridge) je na roadmapě, není součástí tohoto buildu.'
              : 'EventX integration (EventX Bridge) is on the roadmap, not part of this build.'}
          </p>
        </div>
      </section>

      {/* RELEASES */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Release roadmap' : 'Release roadmap'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Z preview na public 1.0.' : 'From preview to public 1.0.'}
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
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Návod' : 'Walkthrough'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Od DMG po první cue.' : 'From DMG to first cue.'}
              </h2>
              <p className="copy mt-6 max-w-2xl">
                {cs
                  ? 'Kompletní 9-krokový návod pro testery: stažení, první spuštění unsigned buildu, testovací PIN, otevření demo show, spárování stanice, volitelné API klíče a ověření výstupu na drátě.'
                  : 'A complete 9-step tester guide: download, first open of the unsigned build, the test PIN, opening the demo show, pairing a station, optional API keys, and verifying output on the wire.'}
              </p>
              <div className="mt-8">
                <Link to="/try-it" className="btn-primary">{cs ? 'Otevřít návod /try-it' : 'Open the walkthrough /try-it'} →</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHEN SIGNED */}
      <section className="rule-top bg-ink text-cream">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label text-cream/60">{cs ? 'Co ještě přijde' : "What's still pending"}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 text-cream leading-tight">
                {cs ? 'Signed build a public 1.0.' : 'A signed build and public 1.0.'}
              </h2>
              <p className="text-cream/80 mt-6 max-w-3xl text-sm leading-relaxed">
                {cs
                  ? 'v0.7.0 je unsigned interní preview pro testery. Signed + notarized DMG (Apple Developer ID), plná hardwarová validace LTC, rundown vrstva a živý pricing přijdou s cestou k public 1.0. Do té doby používejte Gatekeeper bypass z instalace výše.'
                  : 'v0.7.0 is an unsigned internal preview for testers. A signed + notarized DMG (Apple Developer ID), full LTC hardware validation, a rundown layer and live pricing arrive on the path to public 1.0. Until then, use the Gatekeeper bypass from the install steps above.'}
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
                {cs ? 'Stáhnout v0.7.0?' : 'Grab v0.7.0?'}<br />
                <em className="text-accent-deep italic font-light not-italic">
                  {cs ? 'Nebo nejdřív projít návod.' : 'Or walk the guide first.'}
                </em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 flex md:justify-end flex-wrap gap-3">
              <a href="/ShowX-0.7.0-arm64.dmg" download className="btn-primary">
                {cs ? 'Stáhnout DMG' : 'Download DMG'} →
              </a>
              <Link to="/try-it" className="btn-ghost">
                {cs ? 'Návod /try-it' : 'Walkthrough /try-it'}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
