import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

interface Step {
  n: string
  h: { cs: string; en: string }
  body: { cs: string; en: string }
  command?: string
  note?: { cs: string; en: string }
}

const steps: Step[] = [
  {
    n: '01',
    h: { cs: 'Co budete potřebovat', en: 'What you need' },
    body: {
      cs: 'Host (FOH): Mac s Apple Silicon (M1 a novější), macOS 13+. Stanice: jakékoliv zařízení s prohlížečem (iPad, Mac, Windows, telefon) na stejné LAN/Wi-Fi. Pro AI showcaller voice navíc audio výstup; pro LTC chase/generování externí audio rozhraní.',
      en: 'Host (FOH): an Apple Silicon Mac (M1 or newer), macOS 13+. Stations: any device with a browser (iPad, Mac, Windows, phone) on the same LAN/Wi-Fi. For the AI showcaller voice you also want an audio output; for LTC chase/generate an audio interface.',
    },
  },
  {
    n: '02',
    h: { cs: 'Stáhnout DMG', en: 'Download the DMG' },
    body: {
      cs: 'Stáhněte ShowX-0.7.0-arm64.dmg (Apple Silicon). Je to unsigned interní build — Gatekeeper ho při prvním spuštění zablokuje, obejití je v kroku 04.',
      en: 'Download ShowX-0.7.0-arm64.dmg (Apple Silicon). This is an unsigned internal build — Gatekeeper will block the first launch; the bypass is in step 04.',
    },
    command: `# from the Downloads page on this site
ShowX-0.7.0-arm64.dmg`,
    note: {
      cs: 'Internal preview pro testery, ne veřejný prodej. Signed + notarized build teprve přijde.',
      en: 'Internal preview for testers, not a public sale. A signed + notarized build is still pending.',
    },
  },
  {
    n: '03',
    h: { cs: 'Přetáhnout do Aplikací', en: 'Drag to Applications' },
    body: {
      cs: 'Otevřete DMG a přetáhněte ShowX.app do /Applications.',
      en: 'Open the DMG and drag ShowX.app into /Applications.',
    },
    command: `open ShowX-0.7.0-arm64.dmg
# drag ShowX.app → Applications`,
  },
  {
    n: '04',
    h: { cs: 'První spuštění (unsigned)', en: 'First open (unsigned)' },
    body: {
      cs: 'Při prvním spuštění Gatekeeper řekne "ShowX nelze otevřít". Pravý klik na ShowX.app → Open → potvrdit "Open" v dialogu. Nebo jednorázově odstraňte quarantine flag v terminálu.',
      en: 'On first launch Gatekeeper says "ShowX can\'t be opened". Right-click ShowX.app → Open → confirm "Open" in the dialog. Or strip the quarantine flag once in the terminal.',
    },
    command: `# right-click ShowX.app → Open → Open
# or, once, in Terminal:
xattr -dr com.apple.quarantine /Applications/ShowX.app`,
    note: {
      cs: 'Unsigned build je bezpečný — jen není ještě podepsaný Apple Developer ID certifikátem.',
      en: 'The unsigned build is safe — it just is not yet signed with an Apple Developer ID certificate.',
    },
  },
  {
    n: '05',
    h: { cs: 'Spustit + testovací PIN', en: 'Launch + test PIN' },
    body: {
      cs: 'Spusťte ShowX normálně z Aplikací. Pro testování je praktické zapnout pevný párovací PIN: spusťte z terminálu s env proměnnou SHOWX_PAIRING_TEST_PIN=000000. PIN 000000 pak nikdy nevyprší a párování stanic je okamžité.',
      en: 'Launch ShowX normally from Applications. For testing it helps to enable a fixed pairing PIN: start it from the terminal with the env var SHOWX_PAIRING_TEST_PIN=000000. PIN 000000 then never expires, so station pairing is instant.',
    },
    command: `# normal launch: just open ShowX from Applications
# or, for testing, a fixed pairing PIN:
SHOWX_PAIRING_TEST_PIN=000000 /Applications/ShowX.app/Contents/MacOS/ShowX`,
    note: {
      cs: 'Bez té proměnné běží normální flow s rotujícím PINem s expirací — produkčně bezpečné.',
      en: 'Without that env var it runs the normal flow with a rotating, expiring PIN — production-safe.',
    },
  },
  {
    n: '06',
    h: { cs: 'Otevřít show', en: 'Open a show' },
    body: {
      cs: 'Při startu vyberte "Open Demo Show" (přibalená ukázka — cues napříč odděleními, compound + group cue), nebo "New" pro prázdný show, případně "Open" pro existující .showx balíček.',
      en: 'On startup pick "Open Demo Show" (a bundled sample — cues across departments, compound + group cue), or "New" for a blank show, or "Open" for an existing .showx package.',
    },
    command: `# first-launch picker:
#   Open Demo Show   ← fastest way in
#   New
#   Open  (an existing .showx package)`,
  },
  {
    n: '07',
    h: { cs: 'Spárovat stanici', en: 'Pair a station' },
    body: {
      cs: 'Na jiném zařízení (nebo druhé záložce prohlížeče) otevřete URL stanice, kterou ShowX zobrazuje (přes mDNS objevení nebo LAN IP). Naskenujte QR kód nebo zadejte PIN, pak vyberte roli: SM (stage manager), operator (oddělení) nebo countdown (odpočtová stanice).',
      en: 'On another device (or a second browser tab) open the station URL ShowX shows (via mDNS discovery or the LAN IP). Scan the QR code or enter the PIN, then pick a role: SM (stage manager), operator (department), or countdown (countdown station).',
    },
    command: `# in a browser on the same LAN:
http://<showx-host>.local:<port>/   (mDNS)
http://<lan-ip>:<port>/             (or LAN IP)
# scan QR or enter PIN (000000 if test PIN is on)
# pick a role: SM / operator / countdown`,
    note: {
      cs: 'Stanice jsou PWA v prohlížeči (iPad/Mac/Win), žádná instalace. Local-first (Yjs CRDT) — show běží dál, i když Wi-Fi vypadne.',
      en: 'Stations are a PWA in any browser (iPad/Mac/Win), zero install. Local-first (Yjs CRDT) — the show keeps running even if Wi-Fi drops.',
    },
  },
  {
    n: '08',
    h: { cs: 'Volitelné API klíče', en: 'Optional API keys' },
    body: {
      cs: 'AI showcaller je volitelný. ElevenLabs klíč zapne klonování hlasu (vlastní hlas showcallera). Anthropic (Claude) klíč zapne LLM návrh přirozenějšího znění caller scriptu — vždy editovatelný. Klíče nastavíte v aplikaci; bez nich se tyto funkce jen vlídně vypnou, zbytek běží normálně.',
      en: 'The AI showcaller is optional. An ElevenLabs key enables voice clone (the showcaller\'s own voice). An Anthropic (Claude) key enables an LLM draft for more natural caller-script phrasing — always editable. Set keys in the app; without them those features gracefully disable and everything else runs normally.',
    },
    command: `# in ShowX → Settings → Keys (both optional):
#   ElevenLabs   → AI voice clone
#   Anthropic    → LLM caller-script draft`,
    note: {
      cs: 'Deterministické generování caller scriptu ze scénáře funguje i bez jakéhokoliv klíče.',
      en: 'Deterministic caller-script generation from the sheet works even with no key at all.',
    },
  },
  {
    n: '09',
    h: { cs: 'Ověřit výstup na drátě', en: 'Verify output on the wire' },
    body: {
      cs: 'Než vystřelíte cue naostro, ověřte, že payload opravdu odchází. Pro OSC poslouchejte na portu, na který ShowX posílá (např. 7000). DMX odchytíte Art-Net/sACN snifferem. Tip: Audition / preview GO vystřelí cue BEZ reálného výstupu, abyste viděli, co by poslal.',
      en: 'Before you fire a cue for real, confirm the payload actually goes out. For OSC, listen on the port ShowX sends to (e.g. 7000). Capture DMX with an Art-Net/sACN sniffer. Tip: Audition / preview GO fires a cue with NO real output, so you can see what it would send.',
    },
    command: `# OSC — listen for UDP on the target port:
nc -ul 7000
# DMX — capture with an Art-Net / sACN tool
# or use Audition / preview GO (no real output)`,
  },
]

export function TryIt() {
  const { lang } = useI18n()
  const cs = lang === 'cs'

  const bugMailto =
    'mailto:hello@xlabproject.net?subject=ShowX%20v0.7.0%20bug&body=Hi%20XLAB%2C%0A%0AI%20hit%20a%20bug%20in%20the%20ShowX%20v0.7.0%20preview.%0A%0AStep%20%23%3A%20%0AWhat%20I%20expected%3A%20%0AWhat%20happened%3A%20%0AmacOS%20%2B%20hardware%3A%20%0A%0AThanks!'
  const previewMailto =
    "mailto:hello@xlabproject.net?subject=ShowX%20v0.7.0%20tester&body=Hi%20XLAB%2C%0A%0AI'd%20like%20to%20test%20the%20ShowX%20v0.7.0%20preview.%0A%0AWho%20I%20am%3A%20%0AVenue%20%2F%20role%3A%20%0AWhat%20I%20want%20to%20run%20on%20ShowX%3A%20%0A%0AThanks!"
  const chatMailto =
    'mailto:hello@xlabproject.net?subject=ShowX%20tester%20channel&body=Hi%20XLAB%2C%0A%0AAdd%20me%20to%20the%20ShowX%20tester%20channel%20please.%0A%0AThanks!'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-deep mr-2 align-middle" />
                {cs ? 'Internal preview · v0.7.0 · 9 kroků' : 'Internal preview · v0.7.0 · 9 steps'}
              </div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {cs ? 'Stáhnout.' : 'Download.'}
                <br />
                <em className="font-light text-accent-deep not-italic">{cs ? 'Spustit.' : 'Launch.'}</em>
                <br />
                <span className="text-muted italic font-light">{cs ? 'Spárovat stanici.' : 'Pair a station.'}</span>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">
                {cs
                  ? 'Kompletní návod pro testery v0.7.0. Od staženého DMG po první cue, kterou ověříte na drátě. ShowX je LAN-first FOH show-control na Macu — cuelist, timecode, cue lights a AI showcaller. Stanice běží v prohlížeči, pro operátory žádná instalace.'
                  : 'A complete v0.7.0 setup guide for testers. From the downloaded DMG to your first cue verified on the wire. ShowX is LAN-first FOH show control on a Mac — cuelist, timecode, cue lights and an AI showcaller. Stations run in any browser, zero install for operators.'}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/downloads" className="btn-primary">
                  {cs ? 'Stáhnout DMG' : 'Get the DMG'} →
                </Link>
                <Link to="/docs" className="btn-ghost">
                  {cs ? 'Docs + scénáře' : 'Docs + scenarios'}
                </Link>
              </div>
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
              <div className="section-label">{cs ? 'Devět kroků' : 'Nine steps'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Nainstalovat.' : 'Install it.'}
                <br />
                <em className="text-accent-deep italic font-light not-italic">{cs ? 'Spárovat.' : 'Pair it.'}</em>
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
                  <h3 className="display-serif text-2xl">{cs ? s.h.cs : s.h.en}</h3>
                  <p className="copy text-sm">{cs ? s.body.cs : s.body.en}</p>
                  {s.command && (
                    <pre className="bg-ink text-cream/90 font-mono text-[11px] leading-relaxed p-5 rounded-sm overflow-x-auto border border-ink">
                      <code>{s.command}</code>
                    </pre>
                  )}
                  {s.note && (
                    <p className="text-xs text-muted border-l-2 border-accent-deep/40 pl-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-deep mr-2">
                        {cs ? 'Pozn' : 'Note'}
                      </span>
                      {cs ? s.note.cs : s.note.en}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HONEST NOTES */}
      <section className="rule-top bg-ink text-cream">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label text-cream/60">{cs ? 'Upřímně' : 'Honest notes'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 text-cream leading-tight">
                {cs ? 'Co byste měli vědět.' : 'What you should know.'}
              </h2>
              <ul className="mt-8 space-y-4 max-w-3xl">
                <li className="text-cream/80 text-sm leading-relaxed border-l-2 border-accent pl-4">
                  {cs
                    ? 'Unsigned build. Zatím bez Apple Developer ID podpisu a notarizace — proto Gatekeeper bypass v kroku 04. Signed + notarized build je v plánu.'
                    : 'Unsigned build. No Apple Developer ID signing or notarization yet — hence the Gatekeeper bypass in step 04. A signed + notarized build is on the way.'}
                </li>
                <li className="text-cream/80 text-sm leading-relaxed border-l-2 border-accent pl-4">
                  {cs
                    ? 'LTC (lineární SMPTE timecode přes audio) chase i generování vyžaduje audio rozhraní. Lock na živý signál byl ověřen na hardwaru, ale plná hardwarová validace LTC ještě probíhá.'
                    : 'LTC (linear SMPTE timecode over audio) chase and generate needs an audio interface. Live-signal lock was validated on hardware, but full LTC hardware validation is still in progress.'}
                </li>
                <li className="text-cream/80 text-sm leading-relaxed border-l-2 border-accent pl-4">
                  {cs
                    ? 'AI showcaller hlas potřebuje ElevenLabs klíč; LLM návrh znění potřebuje Anthropic klíč. Obojí volitelné — bez klíčů se funkce vlídně vypnou.'
                    : 'The AI showcaller voice needs an ElevenLabs key; the LLM phrasing draft needs an Anthropic key. Both optional — without keys the features gracefully disable.'}
                </li>
                <li className="text-cream/80 text-sm leading-relaxed border-l-2 border-accent pl-4">
                  {cs
                    ? 'v0.7.0 je interní preview pro testery, ne veřejný prodej. Postaveno napříč F1 (operátorské základy) → F2 (čas) → F3 (důvěra + cue lights) → F4 (AI showcaller) → LTC.'
                    : 'v0.7.0 is an internal preview for testers, not a public sale. Built across F1 (operator essentials) → F2 (time) → F3 (trust + cue lights) → F4 (AI showcaller) → LTC.'}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT NEXT */}
      <section className="rule-top bg-paper/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-24">
          <div className="grid grid-cols-12 gap-8 mb-12">
            <div className="col-span-12 md:col-span-3">
              <div className="section-label">{cs ? 'Co dál' : 'What next'}</div>
            </div>
            <div className="col-span-12 md:col-span-9">
              <h2 className="display-serif text-display-2 leading-tight">
                {cs ? 'Co si přečíst, kam nahlásit chybu.' : 'What to read, where to file bugs.'}
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <div className="bg-ground p-8 flex flex-col gap-3">
              <div className="font-mono text-xs text-accent-deep">01</div>
              <h3 className="display-serif text-xl">{cs ? 'Číst' : 'Read'}</h3>
              <p className="copy text-sm">
                {cs
                  ? 'Scénáře krok-za-krokem: divadelní cue calling s cue lights, timecode-locked show, AI showcaller od zkoušky po show, korporátní AV s redundancí, festival s více operátory, cross-platform booth.'
                  : 'Step-by-step scenarios: theatre cue calling with cue lights, a timecode-locked show, the AI showcaller from rehearsal to show, corporate AV with redundancy, a multi-operator festival, a cross-platform booth.'}
              </p>
              <div className="mt-2 flex flex-col gap-1 font-mono text-[11px] text-muted">
                <span>→ {cs ? 'Funkce' : 'Features'}</span>
                <span>→ {cs ? 'Scénáře' : 'Scenarios'}</span>
                <span>→ {cs ? 'Protokoly I/O' : 'Protocols I/O'}</span>
              </div>
              <div className="mt-auto pt-3">
                <Link to="/docs" className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-deep hover:text-ink">
                  {cs ? 'Otevřít docs →' : 'Open docs →'}
                </Link>
              </div>
            </div>
            <div className="bg-ground p-8 flex flex-col gap-3">
              <div className="font-mono text-xs text-accent-deep">02</div>
              <h3 className="display-serif text-xl">{cs ? 'Nahlásit chybu' : 'File a bug'}</h3>
              <p className="copy text-sm">
                {cs
                  ? 'Napište na hello@xlabproject.net se subjectem ShowX v0.7.0 bug. Přiložte krok, ve kterém to spadlo, vaši macOS verzi + hardware a co posílal payload (klidně z Audition / preview GO).'
                  : 'Email hello@xlabproject.net with subject ShowX v0.7.0 bug. Include the step where it broke, your macOS version + hardware, and what the payload sent (Audition / preview GO is fine).'}
              </p>
              <div className="mt-auto pt-3">
                <a href={bugMailto} className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-deep hover:text-ink">
                  {cs ? 'Otevřít email →' : 'Open email →'}
                </a>
              </div>
            </div>
            <div className="bg-ground p-8 flex flex-col gap-3">
              <div className="font-mono text-xs text-accent-deep">03</div>
              <h3 className="display-serif text-xl">{cs ? 'Tester kanál' : 'Tester channel'}</h3>
              <p className="copy text-sm">
                {cs
                  ? 'Napište nám a přidáme vás do privátního tester kanálu — hot dotazy, screenshoty, stížnosti ráno po show.'
                  : 'Email us and we add you to the private tester channel — hot questions, screenshots, morning-after-show complaints.'}
              </p>
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
                {cs ? 'Ještě bez DMG?' : "Don't have the DMG yet?"}
                <br />
                <em className="text-accent-deep italic font-light not-italic">
                  {cs ? 'Začněte krokem 01.' : 'Start at step 01.'}
                </em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-5 flex flex-col gap-4 md:items-end">
              <div className="flex flex-wrap gap-3">
                <Link to="/downloads" className="btn-primary">
                  {cs ? 'Stáhnout v0.7.0' : 'Download v0.7.0'} →
                </Link>
                <a href={previewMailto} className="btn-ghost">
                  {cs ? 'Požádat o přístup pro testera' : 'Request tester access'}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
