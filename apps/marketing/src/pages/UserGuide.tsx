import { useI18n } from '../lib/i18n'

interface Section {
  id: string
  title: { cs: string; en: string }
  body: { cs: React.ReactNode; en: React.ReactNode }
}

const sections: Section[] = [
  {
    id: 'install',
    title: { cs: '1. Instalace', en: '1. Install' },
    body: {
      cs: (
        <>
          <p>
            ShowX v0.7.0 je <strong>interní preview pro testery</strong> — unsigned macOS build pro Apple Silicon
            (M1/M2/M3/M4). Stanice pro operátory běží v prohlížeči, takže <strong>instaluješ jen aplikaci na FOH Mac</strong>.
          </p>
          <ol>
            <li>Stáhni <code>ShowX-0.7.0-arm64.dmg</code> z <a href="/downloads" className="underline">/downloads</a> (Apple Silicon).</li>
            <li>Otevři DMG → přetáhni <code>ShowX.app</code> do <code>/Applications</code>.</li>
            <li>
              Build je <strong>unsigned</strong> (interní). První spuštění: pravý klik na <code>ShowX.app</code> →
              <strong>Open</strong> → potvrď <em>Open</em>. Standardní double-click Gatekeeper zablokuje.
            </li>
            <li>
              Alternativně přes Terminal:
              <pre><code>xattr -dr com.apple.quarantine /Applications/ShowX.app</code></pre>
            </li>
            <li>
              <strong>Testovací PIN:</strong> spusť aplikaci z terminálu s pevným párovacím PINem, ať se nemusíš starat o expiraci:
              <pre><code>SHOWX_PAIRING_TEST_PIN=000000 open -a ShowX</code></pre>
              PIN <code>000000</code> pak nikdy nevyprší (jen pro testy — produkční flow PIN rotuje).
            </li>
          </ol>
          <p>
            <strong>Volitelné API klíče</strong> (nastavují se v aplikaci, sekce Keys):
          </p>
          <ul>
            <li><strong>ElevenLabs</strong> — klonování hlasu pro AI Showcaller.</li>
            <li><strong>Anthropic</strong> — LLM draft caller skriptů (Claude).</li>
          </ul>
          <p>
            Bez klíčů se tyto funkce <em>elegantně vypnou</em> — zbytek ShowX funguje normálně. Pozn.: signed/notarized
            build a plná hardwarová LTC validace jsou v plánu, zatím probíhá interní testování.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            ShowX v0.7.0 is an <strong>internal preview for testers</strong> — an unsigned macOS build for Apple Silicon
            (M1/M2/M3/M4). Operator stations run in any browser, so you only <strong>install the app on the FOH Mac</strong>.
          </p>
          <ol>
            <li>Download <code>ShowX-0.7.0-arm64.dmg</code> from <a href="/downloads" className="underline">/downloads</a> (Apple Silicon).</li>
            <li>Open the DMG → drag <code>ShowX.app</code> into <code>/Applications</code>.</li>
            <li>
              The build is <strong>unsigned</strong> (internal). First launch: right-click <code>ShowX.app</code> →
              <strong>Open</strong> → confirm <em>Open</em>. Standard double-click is blocked by Gatekeeper.
            </li>
            <li>
              Or via Terminal:
              <pre><code>xattr -dr com.apple.quarantine /Applications/ShowX.app</code></pre>
            </li>
            <li>
              <strong>Test PIN:</strong> launch from a terminal with a fixed pairing PIN so you never fight expiry:
              <pre><code>SHOWX_PAIRING_TEST_PIN=000000 open -a ShowX</code></pre>
              PIN <code>000000</code> then never expires (testing only — the production flow rotates the PIN).
            </li>
          </ol>
          <p>
            <strong>Optional API keys</strong> (set in-app, under Keys):
          </p>
          <ul>
            <li><strong>ElevenLabs</strong> — voice clone for the AI Showcaller.</li>
            <li><strong>Anthropic</strong> — LLM draft of caller scripts (Claude).</li>
          </ul>
          <p>
            Without the keys those features <em>gracefully disable</em> — the rest of ShowX runs normally. Note: a
            signed/notarized build and full LTC hardware validation are pending; this is still internal testing.
          </p>
        </>
      ),
    },
  },
  {
    id: 'connect',
    title: { cs: '2. Připojení stanic — mDNS, QR + PIN, role', en: '2. Getting connected — mDNS, QR + PIN, roles' },
    body: {
      cs: (
        <>
          <p>
            Po spuštění ShowX otevřeš nebo vytvoříš show (přiložená je <strong>demo show</strong>). FOH okno = shell.
            V shellu je <strong>STATIONS panel</strong> s adresou stanice a QR kódem.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Adresa stanice (mDNS / LAN URL)</h3>
          <ul>
            <li>Shell ukazuje URL ve tvaru <code>http://&lt;ip-macu&gt;:5300</code> (LAN IP).</li>
            <li>Na stejné síti najde stanice ShowX i přes <strong>mDNS</strong> (<code>_showx._tcp.local</code>) — stačí otevřít discovery a vybrat.</li>
            <li><strong>Open station in this Mac's browser</strong> — tlačítko pro lokální stanici přímo na FOH Macu.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Párování QR + PIN</h3>
          <ol>
            <li>Na zařízení (iPad / telefon / druhý Mac / Windows) otevři adresu stanice nebo naskenuj <strong>QR kód</strong> z shellu.</li>
            <li>Zadej <strong>6-místný PIN</strong> (v test módu předvyplněný).</li>
            <li>Pojmenuj stanici a vyber <strong>roli</strong>.</li>
            <li>Hotovo — párujеš se <strong>jednou</strong>. Refresh stránky ani restart aplikace tě o session nepřipraví (lokální token + Yjs CRDT).</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Role stanice</h3>
          <ul>
            <li><strong>Stage Manager (SM)</strong> — vidí celý cuelist, drží GO authority a playhead, volá standby.</li>
            <li><strong>Operator</strong> — vidí jen svoje oddělení (LX / SX / VIDEO / PYRO / FS / AUTO), potvrzuje standby, případně dělá GO na svoje cues.</li>
            <li><strong>Countdown</strong> — odpočtová stanice, jen velký timecode/odpočet pro nástěnný displej (viz Time layer).</li>
          </ul>
          <p>
            Zrušení zařízení: shell → Pairing → <em>revoke</em>. Stanice jsou <strong>local-first</strong> (Yjs CRDT) —
            show běží dál, i když na chvíli vypadne Wi-Fi; po obnově se stanice dosynchronizuje.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            On launch you open or create a show (a <strong>demo show</strong> is included). The FOH window is the shell.
            It carries a <strong>STATIONS panel</strong> with the station URL and a QR code.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Station address (mDNS / LAN URL)</h3>
          <ul>
            <li>The shell shows a URL like <code>http://&lt;mac-ip&gt;:5300</code> (LAN IP).</li>
            <li>On the same network, stations also find ShowX via <strong>mDNS</strong> (<code>_showx._tcp.local</code>) — just open discovery and pick it.</li>
            <li><strong>Open station in this Mac's browser</strong> — a shortcut for a local station on the FOH Mac itself.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">QR + PIN pairing</h3>
          <ol>
            <li>On a device (iPad / phone / second Mac / Windows) open the station address or scan the <strong>QR code</strong> from the shell.</li>
            <li>Enter the <strong>6-digit PIN</strong> (pre-filled in test mode).</li>
            <li>Name the station and pick a <strong>role</strong>.</li>
            <li>Done — you pair <strong>once</strong>. A page refresh or app relaunch keeps your session (local token + Yjs CRDT).</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Station roles</h3>
          <ul>
            <li><strong>Stage Manager (SM)</strong> — sees the whole cuelist, owns GO authority and the playhead, calls standby.</li>
            <li><strong>Operator</strong> — sees only their department (LX / SX / VIDEO / PYRO / FS / AUTO), acknowledges standby, and may GO their own cues.</li>
            <li><strong>Countdown</strong> — a countdown station: just the big timecode/countdown for a wall display (see Time layer).</li>
          </ul>
          <p>
            Revoke a device: shell → Pairing → <em>revoke</em>. Stations are <strong>local-first</strong> (Yjs CRDT) —
            the show keeps running even if Wi-Fi drops briefly; on reconnect the station catches up.
          </p>
        </>
      ),
    },
  },
  {
    id: 'concepts',
    title: { cs: '3. Koncepty', en: '3. Concepts' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue</h3>
          <p>
            Cue je jednotka spustitelné akce. Má <em>label</em> (název), <em>oddělení</em> (kdo to dělá),
            <em>trigger</em> (kdy se spustí), <em>timing</em> (pre-wait, duration) a jeden nebo víc <em>payloadů</em>
            (OSC / MIDI / MSC / DMX / webhook / wait / group / lx_ref). <strong>Compound cue</strong> = jedno cue
            s payloady pro víc oddělení najednou (např. LX cue 47 + zvukový mute + video play na stejné GO).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cuelist</h3>
          <p>
            Cuelist = uspořádaná sekvence cues, jeden sdílený show dokument. Sekvenci řídí <strong>playhead</strong>
            (kursor „next"). Podporují se desetinná čísla cues (vkládání mezi).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Oddělení (departments)</h3>
          <p>
            Kanonická oddělení: <code>SM, LX, SX, VIDEO, PYRO, FS, AUTO</code>. Každá operatérská stanice vidí jen cues
            svého oddělení; SM vidí vše a má GO authority.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">REHEARSAL ↔ SHOW režim</h3>
          <p>
            <strong>REHEARSAL</strong> = volný edit mód, stavíš a měníš cues. <strong>SHOW</strong> = locked mód pro
            běh produkce: payloady jsou frozen, GO je <em>hold-to-GO</em>, změny jdou jen přes návrhy. Před každým
            přepnutím se uloží <strong>snapshot</strong>. Detaily v sekci REHEARSAL vs SHOW.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Payload → routing → device</h3>
          <p>
            Třívrstvý model: <strong>payload</strong> (CO — záměr v jazyce show) → <strong>routing rule</strong>
            (CO jde KAM) → <strong>device</strong> (KAM — IP/port/MIDI port + driver, který přeloží záměr do dialektu
            zařízení). ShowX je tak sémanticky nezávislý na konkrétním hardwaru.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">.showx balík</h3>
          <p>
            Celá show je jeden <code>.showx</code> balík: Yjs dokument + cuelisty + snapshoty + média + historie.
            Lze ho otevřít, sdílet a archivovat (viz Import/Export).
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue</h3>
          <p>
            A cue is a unit of fireable action. It has a <em>label</em> (name), <em>department(s)</em> (who does it),
            a <em>trigger</em> (when), <em>timing</em> (pre-wait, duration) and one or more <em>payloads</em>
            (OSC / MIDI / MSC / DMX / webhook / wait / group / lx_ref). A <strong>compound cue</strong> = one cue
            with payloads for multiple departments at once (e.g., LX cue 47 + sound mute + video play on the same GO).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cuelist</h3>
          <p>
            A cuelist is an ordered sequence of cues, one shared show document. The sequence is driven by the
            <strong>playhead</strong> (the "next" cursor). Decimal cue numbers are supported (insert between).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Departments</h3>
          <p>
            Canonical departments: <code>SM, LX, SX, VIDEO, PYRO, FS, AUTO</code>. Each operator station sees only its
            own department's cues; the SM sees everything and holds GO authority.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">REHEARSAL ↔ SHOW mode</h3>
          <p>
            <strong>REHEARSAL</strong> = free edit mode; you build and change cues. <strong>SHOW</strong> = locked mode
            for production: payloads are frozen, GO is <em>hold-to-GO</em>, edits only go through proposals. A
            <strong>snapshot</strong> is saved before each flip. Details in the REHEARSAL vs SHOW section.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Payload → routing → device</h3>
          <p>
            Three-layer model: <strong>payload</strong> (WHAT — intent in show language) → <strong>routing rule</strong>
            (WHAT goes WHERE) → <strong>device</strong> (WHERE — IP/port/MIDI port + a driver translating intent into
            the device's dialect). ShowX is thus semantically independent of any specific hardware.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">.showx package</h3>
          <p>
            A whole show is a single <code>.showx</code> package: Yjs doc + cuelists + snapshots + media + history.
            You can open it, share it and archive it (see Import/Export).
          </p>
        </>
      ),
    },
  },
  {
    id: 'rehearsal-show',
    title: { cs: '4. REHEARSAL vs SHOW režim', en: '4. REHEARSAL vs SHOW mode' },
    body: {
      cs: (
        <>
          <p>
            ShowX má dva režimy. Přepínač drží SM stanice: <em>Lock SHOW</em> / <em>Unlock REHEARSAL</em>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">REHEARSAL — stavba a zkoušky</h3>
          <ul>
            <li>Volný edit: přidávej, maž, přesouvej cues a payloady.</li>
            <li>Můžeš použít <strong>audition / náhled GO</strong> (odpal bez reálného výstupu — viz Run the show).</li>
            <li>Tady probíhá i <strong>předgenerování</strong> AI showcaller hlasu (viz AI Showcaller).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">SHOW — naostro</h3>
          <ul>
            <li><strong>Lock:</strong> payloady jsou frozen; měnit lze jen poznámky a meta.</li>
            <li><strong>Hold-to-GO:</strong> GO vyžaduje podržení (~0,25 s, radiální výplň) — pojistka proti náhodnému odpalu.</li>
            <li><strong>Návrhy změn (proposals):</strong> operátor může navrhnout úpravu během locknuté SHOW; SM ji schválí/zamítne (viz SHOW-mode proposals).</li>
            <li><strong>Panic:</strong> nouzové zastavení dispatche.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Snapshoty</h3>
          <p>
            Před každým přepnutím REHEARSAL↔SHOW (a před lockem) ShowX uloží <strong>snapshot</strong> stavu show.
            Slouží jako bezpečný bod návratu. Snapshoty jsou součástí <code>.showx</code> balíku.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            ShowX has two modes. The toggle lives on the SM station: <em>Lock SHOW</em> / <em>Unlock REHEARSAL</em>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">REHEARSAL — building & rehearsing</h3>
          <ul>
            <li>Free editing: add, delete, reorder cues and payloads.</li>
            <li>You can use <strong>audition / preview GO</strong> (fire with no real output — see Run the show).</li>
            <li>This is also where AI showcaller voice <strong>pre-generation</strong> happens (see AI Showcaller).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">SHOW — live</h3>
          <ul>
            <li><strong>Lock:</strong> payloads are frozen; only notes and meta remain editable.</li>
            <li><strong>Hold-to-GO:</strong> GO requires a hold (~0.25 s, radial fill) — a guard against accidental fires.</li>
            <li><strong>Proposals:</strong> an operator can propose an edit during a locked SHOW; the SM accepts/rejects it (see SHOW-mode proposals).</li>
            <li><strong>Panic:</strong> emergency stop of dispatch.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Snapshots</h3>
          <p>
            Before every REHEARSAL↔SHOW flip (and before locking) ShowX saves a <strong>snapshot</strong> of show
            state. It's a safe restore point. Snapshots live inside the <code>.showx</code> package.
          </p>
        </>
      ),
    },
  },
  {
    id: 'building-cues',
    title: { cs: '5. Stavba cues — autoring, payloady, triggery, timing', en: '5. Building cues — authoring, payloads, triggers, timing' },
    body: {
      cs: (
        <>
          <p>
            Celou show postavíš <strong>ze stanice v prohlížeči</strong> — shell potřebuješ jen na devices a routing.
            Vše se živě propisuje všem stanicím a ukládá do <code>.showx</code>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Autoring cues (přidat / vložit / smazat / přesunout)</h3>
          <ul>
            <li><strong>+ Add cue</strong> (prázdná show) nebo <strong>+ below</strong> na vybraném řádku — nové cue se rovnou edituje.</li>
            <li>Desetinná čísla cues → vkládání mezi (cue 5.5 mezi 5 a 6).</li>
            <li><strong>🗑</strong> smaže cue, 2 s běží <strong>Undo</strong> toast.</li>
            <li><strong>Drag &amp; drop</strong> řádků mění pořadí (dlouhé podržení na dotyku).</li>
            <li>Rychlé klávesy na vybraném řádku: <kbd>N</kbd> číslo · <kbd>L</kbd> název · <kbd>D</kbd> duration · <kbd>O</kbd> standby note. Enter uloží, Esc zruší, Tab skočí na další pole.</li>
            <li>Inline editace přímo v řádku; bez Save tlačítka (auto-save).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Payloady — přidání a úprava v prohlížeči</h3>
          <p>Double-click cue → dialog → <strong>+ Add payload</strong>. Typy:</p>
          <ul>
            <li><strong>OSC</strong> — adresa (např. <code>/cue/47/go</code>) + argumenty (int/float/string) + cílový device.</li>
            <li><strong>MIDI</strong> — note_on / note_off / cc / program_change / raw bytes + MIDI port.</li>
            <li><strong>MSC</strong> — MIDI Show Control: cue list, cue number, command.</li>
            <li><strong>DMX</strong> — Art-Net nebo sACN: universe + kanály/hodnoty.</li>
            <li><strong>webhook</strong> — HTTP(S) POST na URL (s tělem).</li>
            <li><strong>wait</strong> — pauza v řetězci payloadů (ms, blocking).</li>
            <li><strong>group</strong> — odkaz na další cues (parallel / series fire mode).</li>
            <li><strong>lx_ref</strong> — odkaz na console cue světel: <code>eos</code> / <code>ma3</code> / <code>chamsys</code> / <code>hog</code> + číslo cue.</li>
          </ul>
          <p>Payloady lze v REHEARSAL přesouvat drag-and-drop. Compound cue = payloady pro víc oddělení v jednom cue.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Triggery — jak cue startuje</h3>
          <ul>
            <li><strong>⏵ manual</strong> — čeká na GO (výchozí).</li>
            <li><strong>→ auto-follow</strong> — startuje, když předchozí cue doběhne.</li>
            <li><strong>⏩ auto-continue (+N s)</strong> — startuje N sekund po startu předchozího.</li>
            <li><strong>⏱ timecode</strong> — odpálí se, když hlavní hodiny překročí zadaný TC (viz Time layer).</li>
            <li><strong>hotkey</strong> — přiřazená klávesa odpálí cue (key binding).</li>
          </ul>
          <p>Klik na trigger buňku (v REHEARSAL) přepíná typ. Cues, které startují samy, mají v levém okraji <code>&gt;</code> — tvar show vidíš na první pohled.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Timing</h3>
          <ul>
            <li><strong>pre-wait (před-čekání)</strong> — prodleva před startem cue.</li>
            <li><strong>duration</strong> — jak dlouho cue „běží" (pro follow timing a countdown).</li>
            <li><strong>live countdown</strong> — po GO běží v řádku odpočet + progress bar; v hlavičce <strong>elapsed/remaining</strong>.</li>
          </ul>
        </>
      ),
      en: (
        <>
          <p>
            Build the entire show <strong>from a browser station</strong> — the shell is only needed for devices and
            routing. Everything syncs live to all stations and persists into <code>.showx</code>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue authoring (add / insert / delete / drag)</h3>
          <ul>
            <li><strong>+ Add cue</strong> (empty show) or <strong>+ below</strong> on the selected row — the new cue opens straight into editing.</li>
            <li>Decimal cue numbers → insert between (cue 5.5 between 5 and 6).</li>
            <li><strong>🗑</strong> deletes with a 2-second <strong>Undo</strong> toast.</li>
            <li><strong>Drag &amp; drop</strong> rows to reorder (long-press on touch).</li>
            <li>Single-key edits on the selected row: <kbd>N</kbd> number · <kbd>L</kbd> label · <kbd>D</kbd> duration · <kbd>O</kbd> standby note. Enter commits, Esc cancels, Tab hops fields.</li>
            <li>Inline editing right in the row; no Save button (auto-save).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Payloads — add and edit in the browser</h3>
          <p>Double-click a cue → dialog → <strong>+ Add payload</strong>. Types:</p>
          <ul>
            <li><strong>OSC</strong> — address (e.g. <code>/cue/47/go</code>) + arguments (int/float/string) + target device.</li>
            <li><strong>MIDI</strong> — note_on / note_off / cc / program_change / raw bytes + MIDI port.</li>
            <li><strong>MSC</strong> — MIDI Show Control: cue list, cue number, command.</li>
            <li><strong>DMX</strong> — Art-Net or sACN: universe + channels/values.</li>
            <li><strong>webhook</strong> — HTTP(S) POST to a URL (with a body).</li>
            <li><strong>wait</strong> — pause in the payload chain (ms, blocking).</li>
            <li><strong>group</strong> — reference to other cues (parallel / series fire mode).</li>
            <li><strong>lx_ref</strong> — lighting console cue reference: <code>eos</code> / <code>ma3</code> / <code>chamsys</code> / <code>hog</code> + cue number.</li>
          </ul>
          <p>In REHEARSAL you can drag-and-drop reorder payloads. A compound cue = payloads for multiple departments in one cue.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Triggers — how a cue starts</h3>
          <ul>
            <li><strong>⏵ manual</strong> — waits for GO (default).</li>
            <li><strong>→ auto-follow</strong> — starts when the previous cue completes.</li>
            <li><strong>⏩ auto-continue (+N s)</strong> — starts N seconds after the previous cue starts.</li>
            <li><strong>⏱ timecode</strong> — fires when the master clock crosses a TC (see Time layer).</li>
            <li><strong>hotkey</strong> — an assigned key fires the cue (key binding).</li>
          </ul>
          <p>Click the trigger cell (in REHEARSAL) to change it. Self-starting cues carry a <code>&gt;</code> in the left gutter — read the show's shape at a glance.</p>
          <h3 className="display-serif text-xl mt-6 mb-2">Timing</h3>
          <ul>
            <li><strong>pre-wait</strong> — delay before the cue starts.</li>
            <li><strong>duration</strong> — how long the cue "runs" (for follow timing and countdown).</li>
            <li><strong>live countdown</strong> — after GO the row runs a countdown + progress bar; the header shows <strong>elapsed/remaining</strong>.</li>
          </ul>
        </>
      ),
    },
  },
  {
    id: 'running',
    title: { cs: '6. Běh show — GO, Back, disarm, audition, dispatch log', en: '6. Running the show — GO, Back, disarm, audition, dispatch log' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">GO ergonomie</h3>
          <ul>
            <li><strong>Armed</strong> cue má zelený rámeček — víš přesně, co odpálíš.</li>
            <li><strong>STBY</strong> = postav na standby + připrav GO.</li>
            <li><strong>GO</strong> = odpal. V REHEARSAL klik (300 ms ochrana proti dvojkliku); v <strong>SHOW</strong> je GO <em>hold-to-GO</em> (~0,25 s, radiální výplň).</li>
            <li>Pokud následují follow cues, GO ukazuje „+N follow".</li>
            <li><strong>panic</strong> — nouzové zastavení.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Back</h3>
          <p>
            <strong>BACK</strong> vrátí playhead a postaví předchozí cue na standby. Používá timing cílového cue.
            <strong>Nikdy nic neodpálí</strong> — je to bezpečný pohyb po sekvenci.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Disarm (odjištění)</h3>
          <p>
            <strong>Disarm</strong> přeskočí konkrétní cue, ale <strong>zachová řetězec</strong> (follow/continue jedou
            dál). Hodí se, když chceš jedno riskantní cue dnes vynechat, aniž bys rozbil zbytek show. <strong>UNARM</strong>
            (Esc) naopak jen zruší přípravu armed cue.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Audition / náhled GO</h3>
          <p>
            <strong>Audition</strong> odpálí cue <strong>BEZ reálného výstupu</strong> — uvidíš, co by se odeslalo
            (jaké payloady, kam), aniž bys něco poslal na hardware. Ideální na kontrolu show před otevřením dveří.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Dispatch log</h3>
          <p>
            V shell okně je <strong>Dispatch Log</strong>: každý odpal s časem, transportem (osc×1, midi×1, dmx×1…),
            výsledkem ok/fail a délkou — „účtenka" celé show. Rychlý test bez hardwaru: <code>nc -ul 7000</code>
            v terminálu a GO → uvidíš OSC packet přiletět.
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">GO ergonomics</h3>
          <ul>
            <li>An <strong>armed</strong> cue has a green border — you know exactly what you'll fire.</li>
            <li><strong>STBY</strong> = put on standby + arm GO.</li>
            <li><strong>GO</strong> = fire. In REHEARSAL it's a click (300 ms double-tap guard); in <strong>SHOW</strong> GO is <em>hold-to-GO</em> (~0.25 s, radial fill).</li>
            <li>If follow cues chain on, GO shows "+N follow".</li>
            <li><strong>panic</strong> — emergency stop.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Back</h3>
          <p>
            <strong>BACK</strong> moves the playhead back and standbys the previous cue. It uses the target cue's
            timing. It <strong>never fires anything</strong> — a safe move through the sequence.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Disarm</h3>
          <p>
            <strong>Disarm</strong> skips a specific cue but <strong>keeps the chain</strong> (follow/continue keep
            going). Handy when you want to skip one risky cue tonight without breaking the rest of the show.
            <strong>UNARM</strong> (Esc), by contrast, just drops the armed cue.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Audition / preview GO</h3>
          <p>
            <strong>Audition</strong> fires a cue with <strong>NO real output</strong> — you see what it would send
            (which payloads, where) without putting anything on the wire. Ideal for checking a show before doors.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Dispatch log</h3>
          <p>
            The shell window has a <strong>Dispatch Log</strong>: every fire with time, transport (osc×1, midi×1, dmx×1…),
            ok/fail result and duration — the show's "receipt". Quick no-hardware test: <code>nc -ul 7000</code> in a
            terminal, hit GO → watch the OSC packet land.
          </p>
        </>
      ),
    },
  },
  {
    id: 'time-layer',
    title: { cs: '7. Time layer — hodiny, timecode, MTC/LTC, odpočet', en: '7. Time layer — clock, timecode, MTC/LTC, countdown' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Hlavní hodiny (master clock)</h3>
          <p>
            Interní free-run hodiny = jeden zdroj času pro celou show. Z nich se odvozuje velký timecode i
            timecode triggery.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Velký timecode</h3>
          <p>
            Displej <code>HH:MM:SS:FF</code> je na <strong>všech</strong> pohledech — SM, operator, shell i odpočtová
            stanice. Všichni vidí stejný čas.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">MTC / LTC chase a generování</h3>
          <ul>
            <li><strong>MTC (MIDI Time Code)</strong> — chase IN (ShowX sleduje příchozí MTC) + generování OUT (ShowX vysílá MTC).</li>
            <li><strong>LTC (lineární SMPTE audio timecode)</strong> — chase IN + generování OUT. <em>Vyžaduje audio rozhraní; lock na živý signál ověřen na hardwaru.</em></li>
          </ul>
          <p>
            Typicky: video server vysílá LTC/MTC → ShowX ho <strong>chytá (chase)</strong> a synchronizuje hlavní
            hodiny → cues na timecode se odpálí samy.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cues spouštěné timecodem</h3>
          <p>
            Cue s triggerem <strong>⏱ timecode</strong> se odpálí, jakmile hlavní hodiny překročí zadaný TC. Tak
            postavíš plně timecode-locked show (viz scénář Timecode-locked show).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Show-time OSC broadcast</h3>
          <p>
            ShowX umí vysílat aktuální čas show jako <strong>OSC</strong> — žene tím externí displeje a automatizaci.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Odpočtová stanice (countdown view)</h3>
          <p>
            Pohled jen s <strong>obřími číslicemi</strong> pro nástěnný displej. Spustíš ho výběrem role
            <em>Countdown</em> při párování. Běží i na <strong>Raspberry Pi v Chromium kiosku</strong> — recept (kiosk
            pointer / autostart) je v docs.
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Master clock</h3>
          <p>
            An internal free-run clock = one time source for the whole show. The big timecode and timecode triggers
            all derive from it.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Big timecode</h3>
          <p>
            An <code>HH:MM:SS:FF</code> display is on <strong>all</strong> views — SM, operator, shell and the
            countdown station. Everyone sees the same time.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">MTC / LTC chase &amp; generate</h3>
          <ul>
            <li><strong>MTC (MIDI Time Code)</strong> — chase IN (ShowX follows incoming MTC) + generate OUT (ShowX sends MTC).</li>
            <li><strong>LTC (linear SMPTE audio timecode)</strong> — chase IN + generate OUT. <em>Needs an audio interface; live-signal lock validated on hardware.</em></li>
          </ul>
          <p>
            Typically: a video server sends LTC/MTC → ShowX <strong>chases</strong> it and syncs the master clock →
            timecode cues fire by themselves.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Timecode-triggered cues</h3>
          <p>
            A cue with the <strong>⏱ timecode</strong> trigger fires when the master clock crosses its TC. That's how
            you build a fully timecode-locked show (see the Timecode-locked show scenario).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Show-time OSC broadcast</h3>
          <p>
            ShowX can broadcast the current show time as <strong>OSC</strong> — driving external displays and automation.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Countdown view</h3>
          <p>
            A view with just <strong>giant digits</strong> for a wall display. Launch it by picking the
            <em>Countdown</em> role at pairing. It also runs on a <strong>Raspberry Pi in a Chromium kiosk</strong> —
            the recipe (kiosk pointer / autostart) is in the docs.
          </p>
        </>
      ),
    },
  },
  {
    id: 'trust',
    title: { cs: '8. Trust — zdraví zařízení, feedback, primární+záložní, předshow kontrola', en: '8. Trust — device health, feedback, primary+backup, pre-show check' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Zdraví zařízení (per-device health)</h3>
          <p>
            V Routing i na stanicích vidíš u každého zařízení <strong>zelená/červená</strong>. Stav vychází z reálných
            výsledků dispatchе — víš, co opravdu odpovídá, ne jen co je nakonfigurováno.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Device feedback (potvrzený stav)</h3>
          <p>
            Kde to hardware umí (např. Eos / QLab přes OSC reply), ShowX zobrazí <strong>potvrzený stav</strong> —
            ne jen „odeslal jsem", ale „zařízení potvrdilo".
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Multi-destination (primární + záložní)</h3>
          <p>
            Payload lze poslat na <strong>primární i záložní cíl</strong> (failover). Když primární media server
            nereaguje, ShowX má záložní cestu. Klíčové pro corporate AV s redundancí.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Předshow kontrola (health wizard)</h3>
          <p>
            Wizard před show projde: Jsou zařízení dosažitelná? Jsou přítomná média/assety? Jsou spárované stanice?
            Dostaneš jasný checklist „připraveno / nepřipraveno" dřív, než přijde publikum.
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Per-device health</h3>
          <p>
            In Routing and on stations each device shows <strong>green/red</strong>. The state comes from real dispatch
            outcomes — you see what actually answers, not just what's configured.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Device feedback (confirmed state)</h3>
          <p>
            Where the gear supports it (e.g. Eos / QLab via OSC reply), ShowX shows the <strong>confirmed state</strong>
            — not just "I sent it", but "the device acknowledged".
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Multi-destination (primary + backup)</h3>
          <p>
            A payload can be sent to a <strong>primary and a backup</strong> destination (failover). If the primary
            media server doesn't answer, ShowX has a backup path. Key for corporate AV with redundancy.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Pre-show health check wizard</h3>
          <p>
            A wizard before the show walks through: are devices reachable? are media/assets present? are stations
            paired? You get a clear "ready / not ready" checklist before the audience arrives.
          </p>
        </>
      ),
    },
  },
  {
    id: 'cue-lights',
    title: { cs: '9. Cue lights — standby → potvrzení → GO', en: '9. Cue lights — standby → acknowledge → GO' },
    body: {
      cs: (
        <>
          <p>
            Softwarové <strong>cue lights</strong> nahrazují fyzický cue-light systém (ETC CueSystem byl ukončen).
            SM a operátor je sdílí přes LAN.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Workflow</h3>
          <ol>
            <li><strong>SM:</strong> pošle <strong>STANDBY</strong> oddělení (např. LX a SX).</li>
            <li><strong>Operator:</strong> stanice ukáže velký <strong>STANDBY</strong> + tlačítko <strong>ACKNOWLEDGE</strong> (potvrzení).</li>
            <li><strong>SM:</strong> vidí, kdo je <strong>ready</strong> (kdo potvrdil).</li>
            <li><strong>SM:</strong> dá <strong>GO</strong>.</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">SM strana</h3>
          <ul>
            <li>Tlačítko <em>Standby</em> per oddělení (nebo Q na další cue).</li>
            <li>Indikátor připravenosti: kdo potvrdil, kdo ještě ne.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Operator strana</h3>
          <ul>
            <li>Velký vizuální STANDBY na celé obrazovce.</li>
            <li><strong>ACKNOWLEDGE</strong> jedním klikem → SM hned vidí, že jsi ready.</li>
          </ul>
          <p>
            Klíčový vhled: cue lights a AI showcaller jsou <strong>stejná data</strong> — jednou ukázaná jako světlo,
            jednou vyslovená.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            Software <strong>cue lights</strong> replace a physical cue-light system (ETC's CueSystem is discontinued).
            SM and operator share them over LAN.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Workflow</h3>
          <ol>
            <li><strong>SM:</strong> sends <strong>STANDBY</strong> to a department (e.g. LX and SX).</li>
            <li><strong>Operator:</strong> the station shows a big <strong>STANDBY</strong> + an <strong>ACKNOWLEDGE</strong> button.</li>
            <li><strong>SM:</strong> sees who is <strong>ready</strong> (who acknowledged).</li>
            <li><strong>SM:</strong> presses <strong>GO</strong>.</li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">SM side</h3>
          <ul>
            <li>A <em>Standby</em> button per department (or Q to the next cue).</li>
            <li>A readiness indicator: who acknowledged, who hasn't.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Operator side</h3>
          <ul>
            <li>A big full-screen visual STANDBY.</li>
            <li><strong>ACKNOWLEDGE</strong> in one tap → the SM instantly sees you're ready.</li>
          </ul>
          <p>
            Key insight: cue lights and the AI showcaller are the <strong>same data</strong> — one shown as light,
            one spoken.
          </p>
        </>
      ),
    },
  },
  {
    id: 'authority',
    title: { cs: '10. Návrhy změn v SHOW & oprávnění operátorů', en: '10. SHOW-mode proposals & per-operator authority' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Návrhy změn (SHOW-mode proposals)</h3>
          <p>
            V locknuté SHOW operátor nemůže měnit payloady přímo. Místo toho <strong>navrhne změnu</strong> →
            návrh přijde SM → SM ho <strong>přijme nebo zamítne</strong>. Tím zůstává show za běhu pod kontrolou,
            ale tým může reagovat na realitu.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Oprávnění operátorů (per-operator authority)</h3>
          <p>
            Určuje, <strong>kdo smí dát GO na co</strong>:
          </p>
          <ul>
            <li><strong>SM only</strong> — GO drží jen SM.</li>
            <li><strong>SM-called</strong> — SM volá standby, pak operátor smí GO (jen na svoje cues). Výchozí pro bezpečnost.</li>
            <li><strong>per-department / any owner</strong> — operátor smí GO na cues svého oddělení.</li>
          </ul>
          <p>
            GO bez oprávnění je odmítnuto s důvodem (toast). PYRO má navíc dvojfázový <strong>Arm → Fire</strong>
            bezpečnostní krok.
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">SHOW-mode proposals</h3>
          <p>
            In a locked SHOW an operator can't change payloads directly. Instead they <strong>propose an edit</strong>
            → the proposal reaches the SM → the SM <strong>accepts or rejects</strong> it. The running show stays under
            control, yet the team can react to reality.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Per-operator authority</h3>
          <p>
            Defines <strong>who may GO what</strong>:
          </p>
          <ul>
            <li><strong>SM only</strong> — only the SM holds GO.</li>
            <li><strong>SM-called</strong> — the SM calls standby, then the operator may GO (their cues only). Default for safety.</li>
            <li><strong>per-department / any owner</strong> — an operator may GO their own department's cues.</li>
          </ul>
          <p>
            A GO without authority is rejected with a reason (toast). PYRO additionally has a two-stage
            <strong> Arm → Fire</strong> safety step.
          </p>
        </>
      ),
    },
  },
  {
    id: 'devices-routing',
    title: { cs: '11. Devices, routing & protokoly', en: '11. Devices, routing & protocols' },
    body: {
      cs: (
        <>
          <p>
            V shellu nastavíš <strong>zařízení</strong> a <strong>routing pravidla</strong>. Třívrstvý model:
            payload (záměr) → routing rule (kam) → device (driver přeloží do dialektu zařízení).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Zařízení (devices)</h3>
          <ul>
            <li><strong>OSC</strong> — host + port + driver (<code>eos</code> / <code>ma3</code> / <code>hog</code> / <code>chamsys</code> / <code>qlab</code> / <code>generic</code>).</li>
            <li><strong>MIDI</strong> — výběr portu (na macOS funguje IAC Driver pro testy bez hardwaru).</li>
            <li><strong>DMX</strong> — Art-Net nebo sACN (universe).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Routing pravidla</h3>
          <ul>
            <li>Match podle typu payloadu / tagu / device — nejspecifičtější vyhrává, catch-all fallback jistí.</li>
            <li>Multi-destination: primární + záložní cíl (viz Trust).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Protokoly I/O (reference)</h3>
          <p>
            OSC (out+in), MIDI (out+in), MSC, DMX Art-Net, DMX sACN, webhook (out+in), MTC (in+out),
            LTC (in+out), mDNS discovery. Routing UI mapuje payloady → zařízení; per-device health.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            In the shell you configure <strong>devices</strong> and <strong>routing rules</strong>. Three-layer model:
            payload (intent) → routing rule (where) → device (a driver translates into the device's dialect).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Devices</h3>
          <ul>
            <li><strong>OSC</strong> — host + port + driver (<code>eos</code> / <code>ma3</code> / <code>hog</code> / <code>chamsys</code> / <code>qlab</code> / <code>generic</code>).</li>
            <li><strong>MIDI</strong> — a port picker (on macOS the IAC Driver works for no-hardware tests).</li>
            <li><strong>DMX</strong> — Art-Net or sACN (universe).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Routing rules</h3>
          <ul>
            <li>Match by payload type / tag / device — most specific wins, a catch-all fallback backs you up.</li>
            <li>Multi-destination: primary + backup target (see Trust).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Protocols I/O (reference)</h3>
          <p>
            OSC (out+in), MIDI (out+in), MSC, DMX Art-Net, DMX sACN, webhook (out+in), MTC (in+out),
            LTC (in+out), mDNS discovery. The Routing UI maps payloads → devices; per-device health.
          </p>
        </>
      ),
    },
  },
  {
    id: 'ai-showcaller',
    title: { cs: '12. AI Showcaller (Pro+)', en: '12. AI Showcaller (Pro+)' },
    body: {
      cs: (
        <>
          <p>
            AI Showcaller je odlišovač ShowX: cue lights, ale <strong>vyslovené</strong>. Vyžaduje Pro+. Funkce
            závislé na klíčích: <strong>ElevenLabs</strong> (klonování hlasu), <strong>Anthropic</strong> (LLM draft).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Caller skripty (hlášky)</h3>
          <p>
            Ke každému cue přiřadíš caller skript per oddělení — text pro <em>standby</em> i <em>go</em>
            (např. „Lights — standby… GO").
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Generování ze scénáře + agregace</h3>
          <p>
            <strong>Generate from the sheet</strong> = deterministická šablona + <strong>agregace souběžných marků</strong>
            do jedné hlášky („Lights, pyro, sound — standby… GO"). Volitelný <strong>LLM draft (Claude)</strong> pro
            přirozenější formulaci — vždy editovatelný.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Klonování hlasu</h3>
          <p>
            <strong>Voice clone (ElevenLabs)</strong> — vlastní hlas showcallera. <em>Vyžaduje ElevenLabs API klíč.</em>
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Předgenerování při zkoušce → lokální přehrávání</h3>
          <p>
            Audio se <strong>předgeneruje při zkoušce (rehearsal pre-gen)</strong> a zmrazí do <code>.showx</code>
            balíku. Na show se přehrává <strong>lokálně</strong> — žádný internet, žádná latence (LAN-first).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Interrupt (převzetí)</h3>
          <p>
            Velké <strong>TAKE OVER / MUTE</strong> — utne AI do &lt;200 ms, aby showcaller mohl mluvit živě, když
            jde show mimo scénář.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Intercom výstup</h3>
          <p>
            Hlas callera lze poslat na zvolené <strong>audio zařízení (intercom)</strong> — jde do uší týmu, ne do sálu.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            The AI Showcaller is ShowX's differentiator: cue lights, but <strong>spoken</strong>. Requires Pro+.
            Key-dependent features: <strong>ElevenLabs</strong> (voice clone), <strong>Anthropic</strong> (LLM draft).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Caller scripts</h3>
          <p>
            Attach a caller script to each cue per department — text for <em>standby</em> and <em>go</em>
            (e.g. "Lights — standby… GO").
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Generate from the sheet + aggregation</h3>
          <p>
            <strong>Generate from the sheet</strong> = a deterministic template + <strong>aggregation of simultaneous
            marks</strong> into one line ("Lights, pyro, sound — standby… GO"). An optional <strong>LLM draft (Claude)</strong>
            for natural phrasing — always editable.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Voice clone</h3>
          <p>
            <strong>Voice clone (ElevenLabs)</strong> — the showcaller's own voice. <em>Needs an ElevenLabs API key.</em>
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Rehearsal pre-generation → local playback</h3>
          <p>
            Audio is <strong>pre-generated at rehearsal</strong> and frozen into the <code>.showx</code> package. At the
            show it plays <strong>locally</strong> — no internet, no latency (LAN-first).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Interrupt</h3>
          <p>
            A big <strong>TAKE OVER / MUTE</strong> — cuts the AI in &lt;200 ms so the showcaller can speak live when
            the show goes off-script.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Intercom out</h3>
          <p>
            The caller voice can be routed to a chosen <strong>audio device (intercom)</strong> — into the team's ears,
            not the room.
          </p>
        </>
      ),
    },
  },
  {
    id: 'import-export',
    title: { cs: '13. Import / Export', en: '13. Import / Export' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Import CSV (QLab / Eos)</h3>
          <p>
            Cuelist Core panel → <strong>Import</strong> → vyber CSV. ShowX auto-detekuje dialect:
          </p>
          <ul>
            <li><strong>QLab</strong> — export z QLab. Mapuje pre-wait / post-wait / Continue / Auto-follow.</li>
            <li><strong>Eos</strong> — text export z ETC Eos. Mapuje cue numbers + console refs.</li>
            <li><strong>Generic</strong> — vlastní CSV s headery <code>label,department,duration_ms,notes</code>.</li>
          </ul>
          <p>
            Import respektuje quoted commas (RFC-4180). Neplatné řádky se přeskočí; výsledek hlásí
            <code>{`{imported, skipped, warnings}`}</code>. Cues se přidají na konec cuelist.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Export JSON</h3>
          <p>
            Strojově čitelný export celé show do JSON (share / backup / forward emailem).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Export PDF (cue-sheet)</h3>
          <p>
            Export → <strong>PDF cue-sheet</strong>, A4, multi-page. Možnosti: <strong>SM master sheet</strong>
            (všechny cues) nebo <strong>per-department sheet</strong> (LX-only, SX-only…). Použití: papírový
            <strong> fallback</strong>, kdyby ShowX při show selhal — tým má papír + verbal comms a show jede dál.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">.showx balík (open / share)</h3>
          <p>
            Celá show je <code>.showx</code> balík: Yjs dokument + cuelisty + snapshoty + média + historie.
            Otevři přes <em>Open show</em>, předej kolegovi, archivuj. Předgenerované AI audio je uvnitř balíku.
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">CSV import (QLab / Eos)</h3>
          <p>
            Cuelist Core panel → <strong>Import</strong> → pick a CSV. ShowX auto-detects the dialect:
          </p>
          <ul>
            <li><strong>QLab</strong> — export from QLab. Maps pre-wait / post-wait / Continue / Auto-follow.</li>
            <li><strong>Eos</strong> — text export from ETC Eos. Maps cue numbers + console refs.</li>
            <li><strong>Generic</strong> — your own CSV with headers <code>label,department,duration_ms,notes</code>.</li>
          </ul>
          <p>
            Import respects quoted commas (RFC-4180). Invalid rows are skipped; the result reports
            <code>{`{imported, skipped, warnings}`}</code>. Cues are appended to the cuelist.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">JSON export</h3>
          <p>
            A machine-readable export of the whole show to JSON (share / backup / email forward).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">PDF export (cue-sheet)</h3>
          <p>
            Export → <strong>PDF cue-sheet</strong>, A4, multi-page. Options: <strong>SM master sheet</strong>
            (every cue) or <strong>per-department sheet</strong> (LX-only, SX-only…). Use: a printed
            <strong> fallback</strong> if ShowX fails during a show — the team has paper + verbal comms and the show
            keeps moving.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">.showx package (open / share)</h3>
          <p>
            A whole show is a <code>.showx</code> package: Yjs doc + cuelists + snapshots + media + history.
            Open it via <em>Open show</em>, hand it to a colleague, archive it. Pre-generated AI audio lives inside.
          </p>
        </>
      ),
    },
  },
  {
    id: 'scenarios',
    title: { cs: '14. Scénáře (kompletní workflow)', en: '14. Scenarios (end-to-end workflows)' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Divadelní calling s cue lights</h3>
          <p>
            SM volá standby na LX a SX, operátoři potvrdí na telefonech (ACKNOWLEDGE), SM dá GO. Volitelně vše
            <strong> vyslovuje AI showcaller</strong>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Timecode-locked show</h3>
          <p>
            ShowX <strong>chytá příchozí LTC/MTC</strong> z video serveru; cues s triggerem timecode se odpálí samy;
            na pódiu běží odpočtová stanice.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">AI showcaller: zkouška → show</h3>
          <p>
            Napiš caller skripty, vygeneruj ze scénáře (s agregací), <strong>předgeneruj hlas při zkoušce</strong>,
            pak jeď show s AI, které volá standby/go. <strong>Interrupt</strong>, když jdeš mimo scénář.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Corporate AV s redundancí</h3>
          <p>
            Multi-destination <strong>primární + záložní</strong> na dva media servery, předshow health check,
            monitoring zdraví zařízení.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Festival / multi-operator</h3>
          <p>
            Per-department views, víc operátorů na browserových stanicích přes LAN, SM jako master,
            <strong> disarm</strong> riskantních cues, <strong>audition</strong> před otevřením dveří.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cross-platform booth</h3>
          <p>
            QLab-style cuelist, ale operátoři na <strong>Windows / iPad</strong> (browserové stanice),
            <strong> CSV import</strong> z existujícího QLab/Eos listu.
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Theatre cue calling with cue lights</h3>
          <p>
            The SM calls standby to LX and SX, operators acknowledge on phones (ACKNOWLEDGE), SM presses GO.
            Optionally the <strong>AI showcaller voices it all</strong>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Timecode-locked show</h3>
          <p>
            ShowX <strong>chases incoming LTC/MTC</strong> from a video server; timecode-triggered cues fire by
            themselves; a countdown station runs on stage.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">AI showcaller: rehearsal → show</h3>
          <p>
            Write caller scripts, generate from the sheet (with aggregation), <strong>pre-generate voice at
            rehearsal</strong>, then run the show with the AI calling standby/go. <strong>Interrupt</strong> when you
            go off-script.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Corporate AV with redundancy</h3>
          <p>
            Multi-destination <strong>primary + backup</strong> to two media servers, a pre-show health check,
            device-health monitoring.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Festival / multi-operator</h3>
          <p>
            Per-department views, multiple operators on browser stations over LAN, the SM as master,
            <strong> disarm</strong> risky cues, <strong>audition</strong> before doors.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cross-platform booth</h3>
          <p>
            A QLab-style cuelist but operators on <strong>Windows / iPad</strong> (browser stations),
            <strong> CSV import</strong> from an existing QLab/Eos sheet.
          </p>
        </>
      ),
    },
  },
  {
    id: 'streamdeck',
    title: { cs: '15. Stream Deck (Companion)', en: '15. Stream Deck (Companion)' },
    body: {
      cs: (
        <>
          <p>
            Pro Elgato Stream Deck použij <strong>Companion komunitní modul</strong> dodávaný se ShowX.
          </p>
          <ol>
            <li>Instaluj <a href="https://bitfocus.io/companion" target="_blank" rel="noopener noreferrer" className="underline">Companion</a> (free).</li>
            <li>Stáhni ShowX modul z repa (<code>external/companion-module-showx/</code>).</li>
            <li>V Companion: Modules → <em>Import module</em> → vyber stažený adresář.</li>
            <li>Connect instance: <code>ws://&lt;mac-ip&gt;:5300/events/&lt;show_id&gt;?token=&lt;pairing-token&gt;</code></li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Akce</h3>
          <ul>
            <li><strong>GO</strong> — odpal armed cue</li>
            <li><strong>Standby Next</strong> — Q další cue</li>
            <li><strong>Back / Disarm</strong></li>
            <li><strong>Goto cue</strong> — skok podle cue ID</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Feedbacks (barva tlačítka)</h3>
          <p>Connected (zelená) · Disconnected (červená) · SHOW mode (červená) · Cue armed (žlutá).</p>
        </>
      ),
      en: (
        <>
          <p>
            For Elgato Stream Deck use the <strong>Companion community module</strong> shipped with ShowX.
          </p>
          <ol>
            <li>Install <a href="https://bitfocus.io/companion" target="_blank" rel="noopener noreferrer" className="underline">Companion</a> (free).</li>
            <li>Download the ShowX module from the repo (<code>external/companion-module-showx/</code>).</li>
            <li>In Companion: Modules → <em>Import module</em> → select the downloaded directory.</li>
            <li>Connect an instance: <code>ws://&lt;mac-ip&gt;:5300/events/&lt;show_id&gt;?token=&lt;pairing-token&gt;</code></li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Actions</h3>
          <ul>
            <li><strong>GO</strong> — fire the armed cue</li>
            <li><strong>Standby Next</strong> — Q the next cue</li>
            <li><strong>Back / Disarm</strong></li>
            <li><strong>Goto cue</strong> — jump by cue ID</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Feedbacks (button color)</h3>
          <p>Connected (green) · Disconnected (red) · SHOW mode (red) · Cue armed (yellow).</p>
        </>
      ),
    },
  },
  {
    id: 'troubleshooting',
    title: { cs: '16. Troubleshooting', en: '16. Troubleshooting' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Stanice se nepřipojí přes LAN</h3>
          <p>
            (1) Mac a zařízení na stejné Wi-Fi/LAN; (2) firewall Macu pouští <code>:5300</code> → System Settings →
            Network → Firewall → povolit ShowX; (3) IP Macu se nemění (DHCP fixed lease). Fallback: zadej
            <code> http://&lt;ip-macu&gt;:5300</code> ručně.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue se nespustí — žádný OSC výstup</h3>
          <p>
            (1) V <strong>Routing</strong> zkontroluj device (host + port) a jeho <strong>zdraví</strong> (zelená?);
            (2) ověř, že cue je armed; (3) zkontroluj routing rule, že payload má kam jít. Test: <code>nc -ul 7000</code> + GO.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">GO „Rejected"</h3>
          <p>
            Stanice nemá oprávnění (per-operator authority). Buď přepárovat jako SM, nebo změnit authority na
            per-department. PYRO musí nejdřív <em>Arm</em>, pak <em>Fire</em>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">LTC se nezamkne</h3>
          <p>
            LTC <strong>vyžaduje audio rozhraní</strong>. Zkontroluj: správný vstup audio interface, hladina signálu,
            framerate odpovídá zdroji. MTC jede přes MIDI port (na testy IAC Driver).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">AI Showcaller mlčí / nejde vygenerovat</h3>
          <p>
            (1) Bez <strong>ElevenLabs</strong> klíče klonování hlasu vypnuté; bez <strong>Anthropic</strong> klíče
            jen deterministická šablona (bez LLM draftu); (2) při show se přehrává <strong>předgenerované</strong> audio —
            pokud chybí, spusť pre-gen při zkoušce; (3) zkontroluj intercom audio výstup.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">ShowX se zasekne / spadne</h3>
          <p>
            Cmd+Q a znovu spustit. Po restartu se načte poslední konzistentní <strong>snapshot</strong>. Pro report
            přilož: macOS verzi, ShowX verzi (About), kroky k reprodukci a poslední řádky historie z <code>.showx</code>.
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">A station won't connect over LAN</h3>
          <p>
            (1) Mac and device on the same Wi-Fi/LAN; (2) the Mac firewall allows <code>:5300</code> → System Settings →
            Network → Firewall → allow ShowX; (3) the Mac's IP doesn't change (DHCP fixed lease). Fallback: enter
            <code> http://&lt;mac-ip&gt;:5300</code> manually.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue doesn't fire — no OSC out</h3>
          <p>
            (1) In <strong>Routing</strong> check the device (host + port) and its <strong>health</strong> (green?);
            (2) make sure the cue is armed; (3) check the routing rule so the payload has somewhere to go. Test:
            <code> nc -ul 7000</code> + GO.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">GO "Rejected"</h3>
          <p>
            The station lacks authority (per-operator authority). Either re-pair as SM, or change authority to
            per-department. PYRO must <em>Arm</em> first, then <em>Fire</em>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">LTC won't lock</h3>
          <p>
            LTC <strong>needs an audio interface</strong>. Check: the right audio-interface input, signal level, and a
            framerate matching the source. MTC runs over a MIDI port (IAC Driver for tests).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">AI Showcaller is silent / won't generate</h3>
          <p>
            (1) Without an <strong>ElevenLabs</strong> key voice clone is off; without an <strong>Anthropic</strong> key
            you only get the deterministic template (no LLM draft); (2) at the show it plays
            <strong> pre-generated</strong> audio — if missing, run pre-gen at rehearsal; (3) check the intercom audio out.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">ShowX hangs / crashes</h3>
          <p>
            Cmd+Q and relaunch. On restart the last consistent <strong>snapshot</strong> loads. For a report attach:
            macOS version, ShowX version (About), repro steps, and the last lines of history from the <code>.showx</code>.
          </p>
        </>
      ),
    },
  },
  {
    id: 'feedback',
    title: { cs: '17. Status, limity a jak nahlásit', en: '17. Status, limits & how to report' },
    body: {
      cs: (
        <>
          <p>
            ShowX <strong>v0.7.0</strong> je <strong>interní preview pro testery</strong> — ne veřejný prodej.
            Postaveno napříč F1 (operátorské základy) → F2 (čas) → F3 (trust + cue lights) → F4 (AI showcaller) → LTC.
            ~2240 testů. Cíl: získat feedback od reálných uživatelů (LD, SM, AV tech) na workflow, stabilitu a chybějící funkce.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Co potřebuje hardware / klíče</h3>
          <ul>
            <li><strong>LTC</strong> chase/generate — audio rozhraní.</li>
            <li><strong>Klonování hlasu</strong> — ElevenLabs API klíč.</li>
            <li><strong>LLM draft caller skriptů</strong> — Anthropic API klíč.</li>
            <li>Bez nich se dané funkce elegantně vypnou; zbytek funguje.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Známé limity v0.7.0</h3>
          <ul>
            <li>macOS Apple Silicon only; build je unsigned (Gatekeeper bypass).</li>
            <li>Signed/notarized build + plná hardwarová LTC validace = v plánu.</li>
            <li>Veřejné 1.0 později (roadmapa: rundown layer, živý pricing, produktový web).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Jak nahlásit</h3>
          <p>
            <strong>GitHub Issues</strong> (bug + feature request) nebo email Jindřichovi:
            <code> jindrich.trapl@xlab.cz</code>. Přilož: macOS verzi, ShowX verzi (About), kroky k reprodukci a
            poslední řádky historie z tvého <code>.showx</code> balíku.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            ShowX <strong>v0.7.0</strong> is an <strong>internal preview for testers</strong> — not a public sale.
            Built across F1 (operator essentials) → F2 (time) → F3 (trust + cue lights) → F4 (AI showcaller) → LTC.
            ~2240 tests. Goal: collect feedback from real users (LD, SM, AV tech) on workflow, stability and missing features.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">What needs hardware / keys</h3>
          <ul>
            <li><strong>LTC</strong> chase/generate — an audio interface.</li>
            <li><strong>Voice clone</strong> — an ElevenLabs API key.</li>
            <li><strong>LLM draft of caller scripts</strong> — an Anthropic API key.</li>
            <li>Without them those features gracefully disable; the rest works.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Known limits in v0.7.0</h3>
          <ul>
            <li>macOS Apple Silicon only; the build is unsigned (Gatekeeper bypass).</li>
            <li>Signed/notarized build + full LTC hardware validation = pending.</li>
            <li>Public 1.0 later (roadmap: rundown layer, live pricing, product web).</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">How to report</h3>
          <p>
            <strong>GitHub Issues</strong> (bug + feature request) or email Jindřich directly:
            <code> jindrich.trapl@xlab.cz</code>. Attach: macOS version, ShowX version (About), repro steps and the
            last lines of history from your <code>.showx</code> package.
          </p>
        </>
      ),
    },
  },
]

export function UserGuide() {
  const { lang } = useI18n()
  const cs = lang === 'cs'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-24 lg:pt-32 pb-20">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 lg:col-span-9 animate-fade-up">
              <div className="section-label mb-8">{cs ? 'User Guide' : 'User Guide'}</div>
              <h1 className="display-serif text-display-1 text-ink leading-[0.95]">
                ShowX v0.7.0<br />
                <em className="font-light text-accent-deep not-italic">{cs ? 'od krabičky k GO' : 'box to GO'}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">
                {cs
                  ? 'Kompletní průvodce pro testery v0.7.0. Cuelist, timecode, cue lights a AI showcaller — co je co, jak to nastavit, jak řídit show.'
                  : 'Complete walkthrough for v0.7.0 testers. Cuelist, timecode, cue lights and an AI showcaller — what is what, how to set it up, how to run the show.'}
              </p>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-20 display-serif text-[18rem] leading-none text-accent/[0.08] select-none pointer-events-none">UG</div>
      </section>

      {/* CONTENT — Sidebar TOC + sections */}
      <section className="rule-top">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
          <div className="grid grid-cols-12 gap-8">
            {/* TOC */}
            <aside className="col-span-12 lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
              <div className="section-label mb-4">{cs ? 'Obsah' : 'Contents'}</div>
              <ul className="space-y-2 text-sm">
                {sections.map(s => (
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
            </aside>

            {/* Sections */}
            <div className="col-span-12 lg:col-span-9 space-y-20">
              {sections.map(s => (
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
