import { useI18n } from '../lib/i18n'

interface Scenario {
  id: string
  title: { cs: string; en: string }
  body: { cs: React.ReactNode; en: React.ReactNode }
}

const scenarios: Scenario[] = [
  {
    id: 'theatre-cue-lights',
    title: { cs: '1. Divadlo s cue lights', en: '1. Theatre with cue lights' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> FOH Mac se ShowX · světelný pult (Eos / MA3 / ChamSys / Hog) · zvuk v QLabu · SM volá show z tabletu, LX a SX operátoři potvrzují standby na mobilech. Cue lights jsou softwarové — STANDBY → potvrzení → GO, žádný hardware (náhrada za vyřazený ETC CueSystem).</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup (jednou, ~10 minut)</h3>
          <ol>
            <li>V ShowX okně → <strong>Routing</strong> → Add device: <code>Eos</code>, transport OSC, IP pultu, port 8000, driver <code>eos</code></li>
            <li>Add device: <code>QLab</code>, OSC, IP zvukového Macu, port 53000, driver <code>qlab</code></li>
            <li>Routing pravidla: payload <code>lx_ref</code> → Eos, oddělení <code>SX</code> → QLab</li>
            <li>Stanice (PWA v prohlížeči): SM se spáruje jako <strong>Stage Manager</strong> (sken QR + PIN), LX a SX operátoři jako <strong>Operator</strong> se svým oddělením. Žádná instalace</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Stavba show</h3>
          <ol>
            <li>V browseru: <strong>+ Add cue</strong> pro každý moment („Předscéna", „Akt 1 — světla"…). Decimální čísla cue povolena</li>
            <li>Compound cue: jeden cue, payloady pro víc oddělení — např. <code>lx_ref</code> (LX) + OSC (SX) najednou</li>
            <li>Caller script ke každému cue je volitelný — standby text pro LX a SX (využije ho i AI showcaller)</li>
            <li>Triggery: manual GO pro volané momenty, <em>auto-follow</em> pro návaznosti</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Představení — cue lights</h3>
          <ol>
            <li>Přepni odznak na <strong>SHOW</strong> — editace zamčená, GO vyžaduje podržení (hold-to-GO)</li>
            <li>SM pošle <strong>STANDBY</strong> oddělení LX (a SX) → na stanicích operátorů naskočí velký <strong>STANDBY</strong> + tlačítko <strong>ACKNOWLEDGE</strong></li>
            <li>Operátoři ťuknou ACKNOWLEDGE → SM ve standby panelu vidí, kdo je připravený</li>
            <li>Až všichni potvrdí → SM dá <strong>GO</strong>. Spletl ses? <strong>Back</strong> vrátí playhead s časováním cílového cue. <strong>Panic</strong> v nouzi</li>
            <li>Dispatch Log v shell okně = důkaz každého odpalu (kdy, kam, ok/fail)</li>
          </ol>
          <p className="mt-4"><em>Volitelně + AI showcaller (Pro+):</em> cue lights a AI caller sdílí stejná data — stejný standby/go je vidět jako světlo a zároveň zazní hlasem. Viz scénář 3.</p>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> FOH Mac running ShowX · lighting desk (Eos / MA3 / ChamSys / Hog) · sound in QLab · SM calls the show from a tablet, LX and SX operators acknowledge standby on phones. Cue lights are software — STANDBY → acknowledge → GO, no hardware (the modern replacement for the discontinued ETC CueSystem).</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup (once, ~10 min)</h3>
          <ol>
            <li>ShowX window → <strong>Routing</strong> → Add device: <code>Eos</code>, OSC transport, desk IP, port 8000, driver <code>eos</code></li>
            <li>Add device: <code>QLab</code>, OSC, sound Mac IP, port 53000, driver <code>qlab</code></li>
            <li>Routing rules: payload <code>lx_ref</code> → Eos, department <code>SX</code> → QLab</li>
            <li>Stations (PWA in a browser): SM pairs as <strong>Stage Manager</strong> (scan QR + PIN), LX and SX operators as <strong>Operator</strong> with their department. Zero install</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Building the show</h3>
          <ol>
            <li>In the browser: <strong>+ Add cue</strong> for every moment (“Pre-set”, “Act 1 — lights”…). Decimal cue numbers allowed</li>
            <li>Compound cue: one cue, payloads for several departments — e.g. <code>lx_ref</code> (LX) + OSC (SX) together</li>
            <li>A caller script per cue is optional — standby text for LX and SX (also used by the AI showcaller)</li>
            <li>Triggers: manual GO for called moments, <em>auto-follow</em> for chained cues</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Show night — cue lights</h3>
          <ol>
            <li>Flip the badge to <strong>SHOW</strong> — editing locks, GO requires hold-to-GO</li>
            <li>SM sends <strong>STANDBY</strong> to department LX (and SX) → each operator station shows a big <strong>STANDBY</strong> + an <strong>ACKNOWLEDGE</strong> button</li>
            <li>Operators tap ACKNOWLEDGE → the SM standby panel shows who is ready</li>
            <li>Once everyone confirms → SM hits <strong>GO</strong>. Mis-step? <strong>Back</strong> returns the playhead using the target cue's timing. <strong>Panic</strong> in an emergency</li>
            <li>Dispatch Log in the shell window = receipt for every fire (when, where, ok/fail)</li>
          </ol>
          <p className="mt-4"><em>Optional + AI showcaller (Pro+):</em> cue lights and the AI caller are the same data — the same standby/go is shown as a light and spoken aloud. See scenario 3.</p>
        </>
      ),
    },
  },
  {
    id: 'timecode-locked',
    title: { cs: '2. Show v timecode (LTC/MTC)', en: '2. Timecode-locked show (LTC/MTC)' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> video server / přehrávač generuje LTC nebo MTC · ShowX chase (sleduje) ten časový kód · cues se odpálí samy na zadaném timecode · na pódiu velká odpočtová stanice. LTC vyžaduje audio rozhraní (live-signal lock ověřen na hardwaru); MTC jde přes MIDI.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup časové vrstvy</h3>
          <ol>
            <li>V ShowX → časová vrstva → <strong>hlavní hodiny</strong> přepni z internal free-run na chase</li>
            <li><strong>MTC chase IN</strong>: vyber MIDI port video serveru. <strong>LTC chase IN</strong>: vyber audio vstup s LTC signálem</li>
            <li>Ověř lock: velký timecode displej (HH:MM:SS:FF) je na všech pohledech — musí běžet s příchozím kódem</li>
            <li>(Volitelně) zapni <strong>show-time OSC broadcast</strong> pro externí automatizaci / displeje</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Stavba</h3>
          <ol>
            <li>Ke každému cue nastav trigger <strong>timecode</strong> a zadej čas (HH:MM:SS:FF), na kterém má vystřelit</li>
            <li>Cue odpálí payloady (OSC/MIDI/DMX…) přesně když hodiny překročí ten timecode</li>
            <li>Momenty bez timecode nech na manual GO nebo auto-continue — kombinace TC + ruční volání je OK</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Provoz</h3>
          <ol>
            <li>Spárovat stanici a vybrat roli <strong>countdown</strong> → odpočtová stanice se jen obřími číslicemi (pro zeď na pódiu)</li>
            <li>Recept v docs: countdown běží i na Raspberry Pi v Chromium kiosku</li>
            <li>Spusť video server → ShowX chytí timecode, cues padají samy. Dispatch Log loguje každý timecode odpal</li>
            <li>Potřebuješ generovat kód ven? <strong>MTC/LTC generate OUT</strong> z hlavních hodin (driv ostatní zařízení)</li>
          </ol>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> a video server / player generates LTC or MTC · ShowX chases that timecode · cues fire automatically on a set timecode · a big countdown station on stage. LTC needs an audio interface (live-signal lock validated on hardware); MTC comes over MIDI.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Time-layer setup</h3>
          <ol>
            <li>In ShowX → time layer → switch the <strong>master clock</strong> from internal free-run to chase</li>
            <li><strong>MTC chase IN</strong>: pick the video server's MIDI port. <strong>LTC chase IN</strong>: pick the audio input carrying LTC</li>
            <li>Confirm lock: the big timecode display (HH:MM:SS:FF) is on every view — it must run with the incoming code</li>
            <li>(Optional) enable <strong>show-time OSC broadcast</strong> for external automation / displays</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Build</h3>
          <ol>
            <li>On each cue set trigger <strong>timecode</strong> and enter the time (HH:MM:SS:FF) it should fire at</li>
            <li>The cue fires its payloads (OSC/MIDI/DMX…) exactly when the clock crosses that timecode</li>
            <li>Leave non-TC moments on manual GO or auto-continue — mixing TC + hand-called cues is fine</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Run</h3>
          <ol>
            <li>Pair a station and pick role <strong>countdown</strong> → a countdown-only view of giant digits (for a stage wall)</li>
            <li>Recipe in docs: the countdown also runs on a Raspberry Pi in a Chromium kiosk</li>
            <li>Roll the video server → ShowX catches the timecode, cues fire themselves. Dispatch Log records every timecode fire</li>
            <li>Need to generate code out? <strong>MTC/LTC generate OUT</strong> from the master clock (drive other gear)</li>
          </ol>
        </>
      ),
    },
  },
  {
    id: 'ai-showcaller',
    title: { cs: '3. AI showcaller: zkouška → show', en: '3. AI showcaller: rehearsal → show' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> ShowX Pro+ s AI showcallerem · klonovaný hlas přes ElevenLabs (vyžaduje ElevenLabs API klíč) · volitelně LLM draft hlášek přes Claude (vyžaduje Anthropic klíč) · intercom audio výstup pro hlas callera. Klíčová myšlenka: AI caller a cue lights jsou stejná data — jedno jako světlo, druhé řečí.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Příprava hlášek</h3>
          <ol>
            <li>Ke každému cue napiš <strong>caller script</strong> — standby a go text per oddělení (LX, SX, PYRO…)</li>
            <li>Nebo <strong>generuj ze scénáře</strong>: deterministická šablona agreguje souběžné marky („Světla, pyro, zvuk — standby… GO")</li>
            <li>Volitelně <strong>LLM draft (Claude)</strong> pro přirozenější formulaci — vždy editovatelné. Bez Anthropic klíče se tato volba tiše vypne</li>
            <li>Nastav <strong>klonování hlasu</strong> (ElevenLabs) — vlastní hlas showcallera. Bez ElevenLabs klíče zůstane jen text</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Zkouška — předgenerování</h3>
          <ol>
            <li>Při <strong>zkoušce</strong> nech ShowX <strong>předgenerovat</strong> audio všech hlášek</li>
            <li>Audio se zamrazí do <code>.showx</code> balíčku → na show běží <strong>lokální přehrávání</strong> (žádný internet, žádná latence — LAN-first)</li>
            <li>Vyber <strong>intercom výstup</strong>: audio zařízení, kam má caller hlas jít (intercom okruh)</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Show — AI volá</h3>
          <ol>
            <li>Přepni do <strong>SHOW</strong>. AI showcaller volá <strong>standby</strong> a <strong>go</strong> hlasem podle cuelistu</li>
            <li>Souběžně svítí cue lights na stanicích — operátoři slyší i vidí to samé</li>
            <li>Jdeš mimo scénář? Velké <strong>TAKE OVER / MUTE</strong> utne AI pod 200 ms → showcaller mluví živě</li>
            <li>Dispatch Log loguje každý odpal jako u manuální show</li>
          </ol>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> ShowX Pro+ with the AI showcaller · a cloned voice via ElevenLabs (needs an ElevenLabs API key) · optional LLM draft of lines via Claude (needs an Anthropic key) · an intercom audio output for the caller voice. Key insight: the AI caller and cue lights are the same data — one as light, one spoken.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Writing the lines</h3>
          <ol>
            <li>On each cue write a <strong>caller script</strong> — standby and go text per department (LX, SX, PYRO…)</li>
            <li>Or <strong>generate from the sheet</strong>: a deterministic template aggregates simultaneous marks (“Lights, pyro, sound — standby… GO”)</li>
            <li>Optionally an <strong>LLM draft (Claude)</strong> for more natural phrasing — always editable. Without an Anthropic key this option quietly disables</li>
            <li>Set up <strong>voice clone</strong> (ElevenLabs) — the showcaller's own voice. Without an ElevenLabs key you keep text only</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Rehearsal — pre-generation</h3>
          <ol>
            <li>At <strong>rehearsal</strong> let ShowX <strong>pre-generate</strong> the audio for all lines</li>
            <li>Audio is frozen into the <code>.showx</code> package → at the show it uses <strong>local playback</strong> (no internet, no latency — LAN-first)</li>
            <li>Pick the <strong>intercom out</strong>: the audio device the caller voice should route to (intercom)</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Show — the AI calls it</h3>
          <ol>
            <li>Flip to <strong>SHOW</strong>. The AI showcaller calls <strong>standby</strong> and <strong>go</strong> aloud, following the cuelist</li>
            <li>Cue lights light up the stations at the same time — operators hear and see the same thing</li>
            <li>Going off-script? The big <strong>TAKE OVER / MUTE</strong> cuts the AI in under 200 ms → the showcaller speaks live</li>
            <li>The Dispatch Log records every fire just like a manual show</li>
          </ol>
        </>
      ),
    },
  },
  {
    id: 'corporate-redundancy',
    title: { cs: '4. Korporátní AV s redundancí', en: '4. Corporate AV with redundancy' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> jeden operátor, dva media servery (primární + záložní, např. dva Resolume / disguise stroje), světla na Art-Net / sACN. Cíl: žádný single point of failure, předshow kontrola, sledování zdraví zařízení živě.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup — multi-destination</h3>
          <ol>
            <li>V <strong>Routing</strong> přidej obě zařízení: <code>Media A</code> (primární) a <code>Media B</code> (záloha), obě OSC</li>
            <li>Nastav <strong>multi-destination patch</strong>: payloady videa míří na primární + záložní cíl (failover)</li>
            <li>Světla: zařízení na <strong>DMX Art-Net</strong> nebo <strong>sACN</strong> dle nodu</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Předshow kontrola</h3>
          <ol>
            <li>Spusť <strong>předshow kontrolu (wizard)</strong>: jsou zařízení dosažitelná? jsou přítomné assety? jsou stanice spárované?</li>
            <li>Projdi červené položky, dokud není vše zelené</li>
            <li>Kde gear umí <strong>device feedback</strong> (potvrzený stav přes OSC reply — Eos/QLab), uvidíš reálně potvrzený stav, ne jen „posláno"</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Provoz</h3>
          <ol>
            <li>Stavěj cues na programové body, duration podle harmonogramu (countdown v řádku hlídá blok)</li>
            <li>Klik → STANDBY → GO podle moderátora. Payloady letí na primární i záložní server současně</li>
            <li><strong>Zdraví zařízení</strong> (zelená/červená) v Routing i na stanicích — z reálných výsledků dispatchů. Spadne primární? Záloha už dostává stejný signál</li>
            <li>Klient chce změnu o pauze? Do REHEARSAL, edit, zpět do SHOW</li>
          </ol>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> a single operator, two media servers (primary + backup, e.g. two Resolume / disguise machines), lights on Art-Net / sACN. Goal: no single point of failure, a pre-show health check, live device-health monitoring.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup — multi-destination</h3>
          <ol>
            <li>In <strong>Routing</strong> add both devices: <code>Media A</code> (primary) and <code>Media B</code> (backup), both OSC</li>
            <li>Configure a <strong>multi-destination patch</strong>: video payloads target the primary + backup destination (failover)</li>
            <li>Lights: device on <strong>DMX Art-Net</strong> or <strong>sACN</strong> depending on the node</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Pre-show health check</h3>
          <ol>
            <li>Run the <strong>pre-show health check wizard</strong>: devices reachable? assets present? stations paired?</li>
            <li>Work through the red items until everything is green</li>
            <li>Where gear supports <strong>device feedback</strong> (confirmed state via OSC reply — Eos/QLab), you see real confirmed state, not just “sent”</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Run</h3>
          <ol>
            <li>Build cues per agenda item, duration from the schedule (the in-row countdown watches the block)</li>
            <li>Click → STANDBY → GO on the MC's pace. Payloads fly to the primary and backup server at once</li>
            <li><strong>Per-device health</strong> (green/red) in Routing and on stations — from real dispatch outcomes. Primary drops? The backup already gets the same signal</li>
            <li>Client wants a change during the break? Into REHEARSAL, edit, back to SHOW</li>
          </ol>
        </>
      ),
    },
  },
  {
    id: 'festival-multi-op',
    title: { cs: '5. Festival / víc operátorů', en: '5. Festival / multi-operator' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> jeden sdílený show dokument, víc operátorů na stanicích v prohlížeči po LAN, SM jako master. Per-oddělení pohledy (LX/SX/VIDEO/PYRO/FS/AUTO). Riziková cues lze odjistit, GO se dá vyzkoušet bez reálného výstupu.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup — víc stanic</h3>
          <ol>
            <li>Otevři show na FOH Macu. mDNS discovery zobrazí URL stanice na LAN</li>
            <li>Každý operátor otevře URL v prohlížeči (iPad / Mac / Win), naskenuje QR + zadá PIN, vybere roli a oddělení → vidí jen svoje <strong>per-oddělení pohled</strong></li>
            <li>SM se spáruje jako <strong>Stage Manager</strong> (master). <strong>Oprávnění operátorů</strong> řídí, kdo smí co GO (SM vs. per-oddělení)</li>
            <li>Local-first (Yjs CRDT) — když spadne Wi-Fi, show běží dál na stanicích</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Před otevřením dveří</h3>
          <ol>
            <li><strong>Audition / náhled GO</strong>: odpal cue <em>bez reálného výstupu</em> — uvidíš, co by poslal, aniž bys něco vystřelil. Projdi tak rizikové momenty</li>
            <li>Co dnes nehraje (chybí účinkující, vyřazený prvek): <strong>odjisti (disarm)</strong> ten cue — přeskočí se, řetěz zůstane celý</li>
            <li>Spusť předshow kontrolu (zařízení / assety / spárované stanice)</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Provoz</h3>
          <ol>
            <li>Do <strong>SHOW</strong>. SM volá standby na oddělení, operátoři potvrzují, GO</li>
            <li>Změna za běhu? Operátor může poslat <strong>návrh změny</strong> v zamčeném SHOW → SM ho schválí / zamítne</li>
            <li>Odjištěné cues se přeskakují automaticky; vše v Dispatch Logu</li>
          </ol>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> one shared show document, multiple operators on browser stations over LAN, the SM as master. Per-department views (LX/SX/VIDEO/PYRO/FS/AUTO). Risky cues can be disarmed, a GO can be auditioned with no real output.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Setup — multiple stations</h3>
          <ol>
            <li>Open the show on the FOH Mac. mDNS discovery shows the station URL on the LAN</li>
            <li>Each operator opens the URL in a browser (iPad / Mac / Win), scans QR + enters PIN, picks a role and department → sees only their <strong>per-department view</strong></li>
            <li>The SM pairs as <strong>Stage Manager</strong> (master). <strong>Per-operator authority</strong> governs who may GO what (SM vs per-department)</li>
            <li>Local-first (Yjs CRDT) — if Wi-Fi drops, the show keeps running on the stations</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Before doors</h3>
          <ol>
            <li><strong>Audition / preview GO</strong>: fire a cue with <em>no real output</em> — see what it would send without firing anything. Walk the risky moments this way</li>
            <li>Anything not playing today (missing act, dropped element): <strong>disarm</strong> that cue — it's skipped, the chain stays intact</li>
            <li>Run the pre-show health check (devices / assets / paired stations)</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Run</h3>
          <ol>
            <li>Into <strong>SHOW</strong>. The SM calls standby to departments, operators acknowledge, GO</li>
            <li>A change on the fly? An operator can send a <strong>SHOW-mode proposal</strong> in the locked SHOW → the SM accepts / rejects it</li>
            <li>Disarmed cues are skipped automatically; everything in the Dispatch Log</li>
          </ol>
        </>
      ),
    },
  },
  {
    id: 'cross-platform-booth',
    title: { cs: '6. Cross-platform booth (Win/iPad)', en: '6. Cross-platform booth (Win/iPad)' },
    body: {
      cs: (
        <>
          <p><strong>Sestava:</strong> QLab-style cuelist na FOH Macu, ale operátoři na Windows a iPadu přes stanice v prohlížeči (žádná instalace pro ně). Existující show importuješ z QLabu nebo Eosu přes CSV.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Import existující show</h3>
          <ol>
            <li>Export cuelistu z QLabu / Eosu do CSV</li>
            <li>V ShowX → <strong>CSV import</strong> → vyber dialekt (<code>QLab</code> nebo <code>Eos</code>). Mapuje i pre-wait / post-wait</li>
            <li>Zkontroluj naimportované cues: čísla, payloady, časování — uprav inline v prohlížeči (decimální čísla povolena)</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Stanice napříč platformami</h3>
          <ol>
            <li>Operátoři na <strong>Windows</strong> i <strong>iPadu</strong> otevřou URL stanice (mDNS / LAN IP), naskenují QR + PIN — PWA v jakémkoli prohlížeči, nic se neinstaluje</li>
            <li>Vyber roli (SM / operator / countdown) a oddělení</li>
            <li>Cuelist se chová QLab-style: trigger manual GO, auto-follow, auto-continue (delay), hotkey binding na klávesu</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Provoz a export</h3>
          <ol>
            <li>Do <strong>SHOW</strong>, jeď cuelist. GO ergonomie: zelený armed rámeček, hold-to-GO, Back, panic</li>
            <li>Export zpět: <strong>JSON</strong> (data), <strong>PDF</strong> (tisk/archiv), nebo otevři/sdílej celý <code>.showx</code> balíček (Yjs doc + cuelisty + snapshoty + media + historie)</li>
          </ol>
        </>
      ),
      en: (
        <>
          <p><strong>Rig:</strong> a QLab-style cuelist on the FOH Mac, but operators on Windows and iPad via browser stations (zero install for them). You import an existing show from QLab or Eos via CSV.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Import an existing show</h3>
          <ol>
            <li>Export the cuelist from QLab / Eos to CSV</li>
            <li>In ShowX → <strong>CSV import</strong> → pick the dialect (<code>QLab</code> or <code>Eos</code>). It also maps pre-wait / post-wait</li>
            <li>Check the imported cues: numbers, payloads, timing — edit inline in the browser (decimal numbers allowed)</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Stations across platforms</h3>
          <ol>
            <li>Operators on <strong>Windows</strong> and <strong>iPad</strong> open the station URL (mDNS / LAN IP), scan QR + PIN — a PWA in any browser, nothing installed</li>
            <li>Pick a role (SM / operator / countdown) and department</li>
            <li>The cuelist behaves QLab-style: trigger manual GO, auto-follow, auto-continue (delay), hotkey key binding</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Run and export</h3>
          <ol>
            <li>Into <strong>SHOW</strong>, run the cuelist. GO ergonomics: armed green border, hold-to-GO, Back, panic</li>
            <li>Export back out: <strong>JSON</strong> (data), <strong>PDF</strong> (print/archive), or open/share the whole <code>.showx</code> package (Yjs doc + cuelists + snapshots + media + history)</li>
          </ol>
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
                  ? 'Šest kompletních postupů od zapojení po GO pro testery (v0.7.0): divadlo s cue lights, show v timecode, AI showcaller, korporátní AV s redundancí, festival s víc operátory, cross-platform booth. Každý scénář = setup → stavba → provoz.'
                  : 'Six complete walkthroughs from patch to GO for testers (v0.7.0): theatre with cue lights, a timecode-locked show, the AI showcaller, corporate AV with redundancy, a festival with multiple operators, a cross-platform booth. Each scenario = setup → build → run.'}
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
