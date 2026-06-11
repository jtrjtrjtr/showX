import { useI18n } from '../lib/i18n'

interface Scenario {
  id: string
  title: { cs: string; en: string }
  body: { cs: React.ReactNode; en: React.ReactNode }
}

const scenarios: Scenario[] = [
  {
    id: 'theatre',
    title: { cs: '1. Divadelní představení', en: '1. Theatre show' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> FOH Mac se ShowX · světelný pult (ETC Eos / ChamSys / ONYX) · zvuk v QLabu · SM volá show z tabletu, LX/SX operátoři vidí svoje cues na mobilech.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup (jednou, ~10 minut)</h3>
          <ol>
            <li>V ShowX okně → <strong>Devices</strong> → Add device: <code>Eos</code>, transport OSC, IP pultu, port 8000, driver <code>eos</code></li>
            <li>Add device: <code>QLab</code>, OSC, IP zvukového Macu, port 53000, driver <code>qlab</code></li>
            <li><strong>Routing</strong> → pravidlo: payload typ <code>lx_ref</code> → Eos. Druhé pravidlo: tag <code>SX</code> → QLab</li>
            <li>Stanice: SM se spáruje jako <strong>Stage Manager</strong>, operátoři jako <strong>Operator</strong> se svým departmentem (LX / SND) — QR kód v shell okně</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Stavba show</h3>
          <ol>
            <li>V browseru: <strong>+ Add cue</strong> pro každý moment („Předscéna", „Akt 1 — světla", …). Číslo cue klávesou <kbd>N</kbd> (volej „LX 10" jako na pultu)</li>
            <li>Double-click cue → <strong>Payloads</strong> → lx_ref s číslem cue na pultu, nebo OSC pro QLab</li>
            <li>Follow sekvence: trigger buňka (⏵) → <em>auto follow</em> — jedno GO odpálí celou návaznost</li>
            <li>Standby note ke každému cue (<kbd>O</kbd>) — SM ji vidí ve standby panelu při volání</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Představení</h3>
          <ol>
            <li>Přepni badge na <strong>SHOW</strong> — editace zamčená, GO vyžaduje podržení (ochrana proti překliku)</li>
            <li>SM volá: klik na cue → <strong>STBY</strong> (operátoři vidí standby na svých stanicích) → <strong>GO</strong></li>
            <li>Spletl ses? <strong>BACK</strong> vrátí playhead a postaví předchozí cue na standby. Nic nevystřelí</li>
            <li>Dispatch Log v shell okně = důkaz každého odpalu (kdy, kam, ok/fail)</li>
          </ol>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> FOH Mac running ShowX · lighting desk (ETC Eos / ChamSys / ONYX) · sound in QLab · SM calls the show from a tablet, LX/SX operators watch their cues on phones.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup (once, ~10 min)</h3>
          <ol>
            <li>ShowX window → <strong>Devices</strong> → Add device: <code>Eos</code>, OSC transport, desk IP, port 8000, driver <code>eos</code></li>
            <li>Add device: <code>QLab</code>, OSC, sound Mac IP, port 53000, driver <code>qlab</code></li>
            <li><strong>Routing</strong> → rule: payload type <code>lx_ref</code> → Eos. Second rule: tag <code>SX</code> → QLab</li>
            <li>Stations: SM pairs as <strong>Stage Manager</strong>, operators as <strong>Operator</strong> with their department (LX / SND) — QR code in the shell window</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Building the show</h3>
          <ol>
            <li>In the browser: <strong>+ Add cue</strong> for every moment. Cue number via <kbd>N</kbd> (call “LX 10” like on the desk)</li>
            <li>Double-click a cue → <strong>Payloads</strong> → lx_ref with the desk cue number, or OSC for QLab</li>
            <li>Follow sequences: trigger cell (⏵) → <em>auto follow</em> — one GO fires the whole chain</li>
            <li>Standby note per cue (<kbd>O</kbd>) — the SM sees it in the standby panel while calling</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Show night</h3>
          <ol>
            <li>Flip the badge to <strong>SHOW</strong> — editing locks, GO requires hold-to-fire</li>
            <li>SM calls: click cue → <strong>STBY</strong> (operators see standby on their stations) → <strong>GO</strong></li>
            <li>Mis-step? <strong>BACK</strong> returns the playhead and re-arms the previous cue. Fires nothing</li>
            <li>Dispatch Log in the shell window = receipt for every fire (when, where, ok/fail)</li>
          </ol>
        </>
      ),
    },
  },
  {
    id: 'corporate',
    title: { cs: '2. Konference / korporátní event', en: '2. Conference / corporate event' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> jeden operátor, projekce (Resolume / PowerPoint Mac s OSC bridge), světla na ArtNet node, moderátor. Typicky: openingy řečníků, přechody, votingové bloky.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup</h3>
          <ol>
            <li>Devices: <code>Resolume</code> (OSC, port 7000), světelný node</li>
            <li>Routing: tag <code>VIDEO</code> → Resolume, tag <code>LX</code> → node</li>
            <li>Jedna stanice — operátor jako Stage Manager (má GO)</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Stavba</h3>
          <ol>
            <li>Cue na každý programový bod: „Opening loop", „Řečník 1 — title slide", „Coffee break"…</li>
            <li>Duration (<kbd>D</kbd>) podle harmonogramu — countdown v řádku ti hlídá čas bloku</li>
            <li>Přesuny v programu na poslední chvíli = drag &amp; drop řádků, mazání s Undo</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Provoz</h3>
          <p>Klik → STBY → GO podle moderátora. ELAPSED nahoře = čas od začátku akce. Klient chce změnu o pauze? REHEARSAL mode, edit, zpět do SHOW.</p>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> single operator, projection (Resolume / OSC bridge), lights on an ArtNet node, an MC. Typical: speaker openers, transitions, voting blocks.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup</h3>
          <ol>
            <li>Devices: <code>Resolume</code> (OSC, port 7000), lighting node</li>
            <li>Routing: tag <code>VIDEO</code> → Resolume, tag <code>LX</code> → node</li>
            <li>One station — the operator pairs as Stage Manager (owns GO)</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Build</h3>
          <ol>
            <li>A cue per agenda item: “Opening loop”, “Speaker 1 — title slide”, “Coffee break”…</li>
            <li>Duration (<kbd>D</kbd>) from the schedule — the in-row countdown watches the block for you</li>
            <li>Last-minute agenda shuffles = drag &amp; drop rows, delete with Undo</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Run</h3>
          <p>Click → STBY → GO on the MC's pace. ELAPSED up top = time since doors. Client wants a change during the break? REHEARSAL mode, edit, back to SHOW.</p>
        </>
      ),
    },
  },
  {
    id: 'installation',
    title: { cs: '3. Interaktivní instalace / expozice', en: '3. Interactive installation / exhibit' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> ShowX jako řídicí vrstva pro Notch / TouchDesigner / Unreal — scénické stavy, denní smyčky, ruční overridy pro obsluhu.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup</h3>
          <ol>
            <li>Device: media server (OSC, generic driver) — payload pak nese surovou OSC adresu, např. <code>/scene/forest/start</code></li>
            <li>Obsluha (hosteska) dostane stanici na tabletu — vidí jen pojmenované stavy, žádnou techniku</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Stavba</h3>
          <ol>
            <li>Cue = stav instalace: „Idle loop", „Scéna les", „Finále", „Servisní blackout"</li>
            <li><em>auto continue +N s</em> triggery = samoběžná smyčka; manual cues = overridy</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Provoz</h3>
          <p>Ráno: otevřít show, GO na „Idle loop". Obsluha přepíná stavy STBY→GO z tabletu. Dispatch Log = audit pro servis. (Plánované: scheduled triggery pro plně bezobslužný den.)</p>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> ShowX as the control layer for Notch / TouchDesigner / Unreal — scene states, daily loops, manual overrides for floor staff.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup</h3>
          <ol>
            <li>Device: media server (OSC, generic driver) — payloads then carry raw OSC addresses, e.g. <code>/scene/forest/start</code></li>
            <li>Floor staff get a tablet station — they see named states, no tech</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Build</h3>
          <ol>
            <li>Cue = installation state: “Idle loop”, “Forest scene”, “Finale”, “Service blackout”</li>
            <li><em>auto continue +N s</em> triggers = self-running loop; manual cues = overrides</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Run</h3>
          <p>Morning: open show, GO “Idle loop”. Staff switch states STBY→GO from the tablet. Dispatch Log = service audit trail. (Planned: scheduled triggers for fully unattended days.)</p>
        </>
      ),
    },
  },
  {
    id: 'band',
    title: { cs: '4. Kapela / klubová show', en: '4. Band / club show' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> světla + video na setlist, MIDI do efektů/backing-track mašiny. Jeden člověk u FOH, kapela chce „ať to jede samo po písničkách".</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup</h3>
          <ol>
            <li>Device: světelný SW/pult (OSC). Device: efekty (MIDI — vyber port v Devices, na Macu funguje i IAC Driver)</li>
            <li>Routing: <code>lx_ref</code> → světla, <code>midi</code> → efekty</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Stavba</h3>
          <ol>
            <li>Cue na píseň („01 Intro", „02 Hymna"…), uvnitř písně follow řetězy na breaky</li>
            <li>MIDI payload: program change na efektovou scénu k písni</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Gig</h3>
          <p>GO na začátku písně, zbytek jede přes follow/continue. Přídavek mimo setlist? REHEARSAL, drag píseň nahoru, SHOW, GO.</p>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> lights + video per setlist, MIDI to FX / backing-track rig. One person at FOH, the band wants it to “just run per song”.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup</h3>
          <ol>
            <li>Device: lighting SW/desk (OSC). Device: FX unit (MIDI — pick the port in Devices; macOS IAC Driver works too)</li>
            <li>Routing: <code>lx_ref</code> → lights, <code>midi</code> → FX</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Build</h3>
          <ol>
            <li>A cue per song (“01 Intro”, “02 Anthem”…), follow chains inside songs for breaks</li>
            <li>MIDI payload: program change to the song's FX scene</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Gig</h3>
          <p>GO at the top of each song, the rest rides follow/continue. Surprise encore? REHEARSAL, drag the song up, SHOW, GO.</p>
        </>
      ),
    },
  },
  {
    id: 'eventx',
    title: { cs: '5. Interaktivní event s publikem (EventX)', en: '5. Audience-interactive event (EventX)' },
    body: {
      cs: (
        <>
          <p><strong>Přichází v ShowX 0.3 (EventX Bridge modul).</strong> Diváci hlasují / posílají slova z mobilů přes EventX → ShowX překládá výsledky na OSC do vizuálů — ve stejné appce, kde běží tvůj cuelist.</p>
          <ul>
            <li>Cue „Spusť hlasování" → otevře EventX aktivitu</li>
            <li>Živé výsledky tečou do Notche/Resolume přes stejný Dispatch Log</li>
            <li>Cue „Ukonči a vyhlas" → zavře hlasování + přepne scénu</li>
          </ul>
          <p>Dnes tuto roli plní BridgeX 0.3 jako samostatná aplikace — po vydání 0.3 ji ShowX plně absorbuje a nebudeš spouštět nic navíc.</p>
        </>
      ),
      en: (
        <>
          <p><strong>Coming in ShowX 0.3 (EventX Bridge module).</strong> The audience votes / sends words from phones via EventX → ShowX translates results into OSC for visuals — in the same app running your cuelist.</p>
          <ul>
            <li>Cue “Start the vote” → opens an EventX activity</li>
            <li>Live results stream into Notch/Resolume through the same Dispatch Log</li>
            <li>Cue “Close &amp; reveal” → ends the vote + switches scene</li>
          </ul>
          <p>Today BridgeX 0.3 plays this role as a separate app — once 0.3 ships, ShowX absorbs it fully and you launch nothing extra.</p>
        </>
      ),
    },
  },
]

export function Scenarios() {
  const { lang } = useI18n()
  const cs = lang === 'cs'

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">{cs ? 'Scénáře' : 'Scenarios'}</div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                {cs ? 'Návody' : 'Guides'}<br />
                <em className="font-light text-accent-deep not-italic">{cs ? 'pro reálné akce' : 'for real shows'}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">
                {cs
                  ? 'Pět kompletních postupů od zapojení po GO: divadlo, konference, instalace, kapela, interaktivní event. Každý scénář = setup → stavba → provoz.'
                  : 'Five complete walkthroughs from patch to GO: theatre, conference, installation, band, audience-interactive. Each scenario = setup → build → run.'}
              </p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">SC</div>
      </section>

      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8">
            <aside className="col-span-12 lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
              <div className="section-label mb-4">{cs ? 'Scénáře' : 'Scenarios'}</div>
              <ul className="space-y-2 text-sm">
                {scenarios.map(s => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-muted hover:text-ink underline decoration-1 underline-offset-4 decoration-transparent hover:decoration-current"
                    >
                      {cs ? s.title.cs : s.title.en}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-8 text-sm">
                <a href="/guide" className="underline text-muted hover:text-ink">
                  {cs ? '→ kompletní User Guide' : '→ full User Guide'}
                </a>
              </div>
            </aside>

            <div className="col-span-12 lg:col-span-9 space-y-20">
              {scenarios.map(s => (
                <article key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="display-serif text-display-2 leading-tight mb-8">
                    {cs ? s.title.cs : s.title.en}
                  </h2>
                  <div className="copy prose-guide max-w-none">
                    {cs ? s.body.cs : s.body.en}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
