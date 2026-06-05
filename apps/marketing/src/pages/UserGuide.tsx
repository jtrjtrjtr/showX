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
            ShowX 0.1 je <strong>unsigned macOS beta</strong> pro Apple Silicon (M1/M2/M3/M4).
            Cestou ke spuštění je 30 sekund práce s Gatekeeperem.
          </p>
          <ol>
            <li>Stáhnout DMG z <a href="/downloads" className="underline">/downloads</a></li>
            <li>Otevřít DMG → přetáhnout <code>ShowX.app</code> do <code>/Applications</code></li>
            <li>
              První spuštění: pravý klik na <code>ShowX.app</code> → <strong>Open</strong> →
              v dialogu potvrdit <em>Open</em>. Standardní double-click Gatekeeper zablokuje.
            </li>
            <li>
              Alternativně přes Terminal:
              <pre><code>xattr -dr com.apple.quarantine /Applications/ShowX.app</code></pre>
            </li>
          </ol>
          <p>
            Po prvním povolení už se ShowX otevře běžným kliknutím. Při auto-update v budoucnu (0.2+) bude ShowX
            signed + notarized — Gatekeeper bypass odpadne.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            ShowX 0.1 is an <strong>unsigned macOS beta</strong> for Apple Silicon (M1/M2/M3/M4).
            Getting it running takes 30 seconds of Gatekeeper coaxing.
          </p>
          <ol>
            <li>Download the DMG from <a href="/downloads" className="underline">/downloads</a></li>
            <li>Open the DMG → drag <code>ShowX.app</code> into <code>/Applications</code></li>
            <li>
              First launch: right-click <code>ShowX.app</code> → <strong>Open</strong> →
              confirm <em>Open</em> in the dialog. Standard double-click is blocked by Gatekeeper.
            </li>
            <li>
              Or via Terminal:
              <pre><code>xattr -dr com.apple.quarantine /Applications/ShowX.app</code></pre>
            </li>
          </ol>
          <p>
            After the first approval ShowX launches normally. Future auto-update (0.2+) will be signed + notarized —
            the Gatekeeper bypass goes away.
          </p>
        </>
      ),
    },
  },
  {
    id: 'first-show',
    title: { cs: '2. První show — od prázdné cuelist k GO', en: '2. First show — from empty cuelist to GO' },
    body: {
      cs: (
        <>
          <p>
            Po spuštění ShowX vidíš <strong>Cuelist Core panel</strong> — toto je FOH okno na Macu.
            Klikni <strong>New Show</strong> a vyber kde uložit <code>.showx</code> balík (doporučení:
            <code>~/Documents/ShowX/&lt;jméno_show&gt;.showx</code>). Show je teď otevřený a běží.
          </p>
          <p>
            Vedle toho běží <strong>PWA</strong> dostupný stations přes LAN: <code>http://&lt;ip-mac&gt;:5300</code>.
            Pro spárování iPadu jako Stage Manager station:
          </p>
          <ol>
            <li>Na iPadu otevři Safari → adresa <code>http://&lt;ip-mac&gt;:5300/pair</code></li>
            <li>V ShowX panelu na Macu klikni <strong>Add station</strong> → vyber roli <em>SM</em></li>
            <li>Mac zobrazí 6-číselný PIN → zadat na iPadu</li>
            <li>iPad přejmenuj („SM iPad"), zvol odpovědné oddělení (SM)</li>
            <li>Hotovo — iPad vidí cuelist, je „live" station</li>
          </ol>
          <p>
            Operatérské stations (LX, SX, VIDEO, atd.) párujte stejně, jen vyber odpovídající <em>departments</em>.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            On launch you see the <strong>Cuelist Core panel</strong> — the FOH window on the Mac.
            Click <strong>New Show</strong> and pick where to save the <code>.showx</code> package
            (recommendation: <code>~/Documents/ShowX/&lt;show_name&gt;.showx</code>). The show is now open and running.
          </p>
          <p>
            Alongside, a <strong>PWA</strong> is available to stations over LAN at <code>http://&lt;mac-ip&gt;:5300</code>.
            To pair an iPad as Stage Manager station:
          </p>
          <ol>
            <li>On the iPad open Safari → URL <code>http://&lt;mac-ip&gt;:5300/pair</code></li>
            <li>In the ShowX panel on the Mac click <strong>Add station</strong> → pick role <em>SM</em></li>
            <li>The Mac shows a 6-digit PIN → enter on the iPad</li>
            <li>Name the iPad ("SM iPad"), pick the department it owns (SM)</li>
            <li>Done — the iPad sees the cuelist as a live station</li>
          </ol>
          <p>
            Pair operator stations (LX, SX, VIDEO, etc.) the same way; just pick the matching <em>departments</em>.
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
            Cue je jednotka spustitelné akce. Má <em>label</em> (název), <em>department(s)</em> (kdo to dělá),
            <em>trigger</em> (kdy se to spustí — manual / auto-follow / auto-continue / timecode),
            jeden nebo víc <em>payloads</em> (OSC zpráva / MIDI / DMX / wait / group). „Compound cue" má payloady
            pro víc oddělení najednou (např. LX cue 47 + zvukový mute na stejné GO).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cuelist</h3>
          <p>
            Cuelist = uspořádaná sekvence cues. Show může mít víc cuelistů (pre-show, main, encore), ale 0.1 pracuje
            s jedním main cuelist per show. Sekvence se ovládá <strong>playhead</strong>em — kursor ukazuje co je „next".
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Department</h3>
          <p>
            Kanonické departments: <code>SM, LX, SX, VIDEO, AUTO, PYRO, FS, AV, COMMS</code>. Každá operatérská
            station vidí jen cues, kde její department je <em>owned</em>. SM station vidí všechno + má GO authority.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">REHEARSAL ↔ SHOW mode</h3>
          <p>
            <strong>REHEARSAL</strong> = volný edit mode. Kdokoliv může editovat cues, payloady, pořadí.
            <strong>SHOW</strong> = locked mode pro běh produkce. Payloady jsou frozen, jen meta-fields
            (notes, standby_note) editovatelné. Tlačítko v SM stations: <em>Lock SHOW</em> / <em>Unlock REHEARSAL</em>.
            Snapshot show stavu se uloží před každým flipem.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">GO authority</h3>
          <p>
            Kdo má právo zmáčknout GO. Tři režimy:
          </p>
          <ul>
            <li><code>sm_only</code> — pouze SM station</li>
            <li><code>sm_called</code> — SM volá „standby", operator pak může GO (jen pro svoje cues)</li>
            <li><code>any_owner</code> — kdokoliv kdo vidí cue (per-dept GO)</li>
          </ul>
          <p>
            Default pro 0.1 je <code>sm_called</code>. Při GO bez authority → request odmítnut s důvodem
            (toast „Rejected: not_sm" na neoprávněné station).
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue</h3>
          <p>
            A cue is a unit of fireable action. It has a <em>label</em> (name), <em>department(s)</em> (who does it),
            a <em>trigger</em> (when — manual / auto-follow / auto-continue / timecode), and one or more
            <em>payloads</em> (OSC message / MIDI / DMX / wait / group). A "compound cue" carries payloads for
            multiple departments at once (e.g., LX cue 47 + sound mute on the same GO).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cuelist</h3>
          <p>
            A cuelist is an ordered sequence of cues. A show can have several (pre-show, main, encore), but 0.1
            works with one main cuelist per show. The sequence is driven by a <strong>playhead</strong> — the cursor that marks what's next.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Department</h3>
          <p>
            Canonical departments: <code>SM, LX, SX, VIDEO, AUTO, PYRO, FS, AV, COMMS</code>. Each operator station
            sees only the cues where its department is <em>owned</em>. The SM station sees everything and holds GO authority.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">REHEARSAL ↔ SHOW mode</h3>
          <p>
            <strong>REHEARSAL</strong> = free edit mode. Anyone can edit cues, payloads, ordering.
            <strong>SHOW</strong> = locked mode for production. Payloads are frozen; only meta fields
            (notes, standby_note) remain editable. The toggle lives on SM stations: <em>Lock SHOW</em> /
            <em>Unlock REHEARSAL</em>. A snapshot of show state is saved before each flip.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">GO authority</h3>
          <p>
            Who's allowed to press GO. Three modes:
          </p>
          <ul>
            <li><code>sm_only</code> — SM station only</li>
            <li><code>sm_called</code> — SM calls "standby", then the operator can GO (for their cues only)</li>
            <li><code>any_owner</code> — anyone who sees the cue (per-dept GO)</li>
          </ul>
          <p>
            Default in 0.1 is <code>sm_called</code>. A GO without authority is rejected with a reason
            (toast "Rejected: not_sm" on the unauthorized station).
          </p>
        </>
      ),
    },
  },
  {
    id: 'sm-master',
    title: { cs: '4. SM Master View', en: '4. SM Master View' },
    body: {
      cs: (
        <>
          <p>
            Hlavní pohled pro Stage Managera. Zobrazí celý cuelist se všemi cues bez ohledu na oddělení.
            Klíčové elementy:
          </p>
          <ul>
            <li><strong>Calling text</strong> (32 px nahoře) — momentální stav: <code>STANDBY</code>, <code>GO</code>, <code>Ready</code>. Screen reader-friendly.</li>
            <li><strong>Cue rows</strong> — label, trigger ikona (⏵ manual / → auto-follow / ⏩ auto-continue / ⏱ timecode), dept chips, presence indikátory (kdo to vidí online)</li>
            <li><strong>Playhead</strong> = červený „NOW" chip na levém okraji řádku, který hraje</li>
            <li><strong>Standby panel</strong> (spodní zásuvka) — armed cue (červený callout) + next 3 cards</li>
            <li><strong>GO button</strong> — velký vpravo dole. Flash při fire, shake při rejection. 1.5s long-press = override (jen pokud máš autoritu na všech)</li>
            <li><strong>Search</strong> — Cmd+F nebo top bar. Filtruje cues podle labelu</li>
          </ul>
          <p>
            Keyboard zkratky:
          </p>
          <table className="text-sm my-4">
            <thead>
              <tr><th className="text-left pr-6">Klávesa</th><th className="text-left">Akce</th></tr>
            </thead>
            <tbody>
              <tr><td className="font-mono">Space</td><td>GO (manual)</td></tr>
              <tr><td className="font-mono">Q</td><td>Standby next cue</td></tr>
              <tr><td className="font-mono">↑ / ↓</td><td>Move playhead</td></tr>
              <tr><td className="font-mono">?</td><td>Show help overlay</td></tr>
              <tr><td className="font-mono">Cmd+Shift+G</td><td>Override GO (skip authority check)</td></tr>
              <tr><td className="font-mono">Esc</td><td>Unarm</td></tr>
            </tbody>
          </table>
        </>
      ),
      en: (
        <>
          <p>
            The main view for the Stage Manager. Shows the whole cuelist with every cue regardless of department.
            Key elements:
          </p>
          <ul>
            <li><strong>Calling text</strong> (32 px at top) — current state: <code>STANDBY</code>, <code>GO</code>, <code>Ready</code>. Screen reader-friendly.</li>
            <li><strong>Cue rows</strong> — label, trigger icon (⏵ manual / → auto-follow / ⏩ auto-continue / ⏱ timecode), dept chips, presence indicators (who's watching online)</li>
            <li><strong>Playhead</strong> = red "NOW" chip on the left edge of the playing row</li>
            <li><strong>Standby panel</strong> (bottom drawer) — armed cue (red callout) + next 3 cards</li>
            <li><strong>GO button</strong> — large bottom-right. Flash on fire, shake on rejection. 1.5s long-press = override (only if you have authority over all departments)</li>
            <li><strong>Search</strong> — Cmd+F or top bar. Filters cues by label</li>
          </ul>
          <p>Keyboard shortcuts:</p>
          <table className="text-sm my-4">
            <thead>
              <tr><th className="text-left pr-6">Key</th><th className="text-left">Action</th></tr>
            </thead>
            <tbody>
              <tr><td className="font-mono">Space</td><td>GO (manual)</td></tr>
              <tr><td className="font-mono">Q</td><td>Standby next cue</td></tr>
              <tr><td className="font-mono">↑ / ↓</td><td>Move playhead</td></tr>
              <tr><td className="font-mono">?</td><td>Show help overlay</td></tr>
              <tr><td className="font-mono">Cmd+Shift+G</td><td>Override GO (skip authority check)</td></tr>
              <tr><td className="font-mono">Esc</td><td>Unarm</td></tr>
            </tbody>
          </table>
        </>
      ),
    },
  },
  {
    id: 'operator',
    title: { cs: '5. Operator View (per-dept)', en: '5. Operator View (per-dept)' },
    body: {
      cs: (
        <>
          <p>
            Pohled pro operatéra konkrétního oddělení. Filtruje cues: vidí jen ty, kde jeho oddělení je
            <em>owned</em> (nebo <em>watched</em> v některých variantách). Layout se mění podle oddělení:
          </p>
          <ul>
            <li><strong>LX Operator</strong> — column „Console cue" (vystavený LXRef payload číslo), „Fade time", standby/dim chip</li>
            <li><strong>SX Operator</strong> — column „Track" (zvuk/QLab cue ID), „Type" (mute/play/cross-fade)</li>
            <li><strong>VIDEO Operator</strong> — column „Source" (input/clip), „Action" (play/stop/cue)</li>
            <li><strong>AUTO Operator</strong> — single „Position" column (departure/arrival/target schematic) — placeholder pro 0.2</li>
            <li><strong>PYRO Operator</strong> — <strong>SPECIÁLNÍ:</strong> dvojfázový Arm → Fire safety gate. Tlačítko <em>Fire</em> je disabled dokud nestiskneš <em>Arm</em>. Při <em>per_dept</em> authority také vyžaduje SM-called. Červené header warning.</li>
            <li><strong>FS Operator</strong> — Front-of-house / facilities, hlavně standby_note display</li>
            <li><strong>Generic</strong> — fallback pro multi-dept compound cues nebo neznámá oddělení</li>
          </ul>
          <p>
            Payloady, které tvoje oddělení vlastní, jsou <strong>highlighted</strong> (bold). Ostatní jsou <em>dimmed</em>
            (např. SX operator vidí LX-tagged payloady šedě = kontext).
          </p>
        </>
      ),
      en: (
        <>
          <p>
            The view for an operator in a specific department. Filters cues: only ones where the operator's department is
            <em>owned</em> (or <em>watched</em> in some variants). Layout shifts with department:
          </p>
          <ul>
            <li><strong>LX Operator</strong> — column "Console cue" (the LXRef payload number being fired), "Fade time", standby/dim chip</li>
            <li><strong>SX Operator</strong> — column "Track" (audio/QLab cue ID), "Type" (mute/play/cross-fade)</li>
            <li><strong>VIDEO Operator</strong> — column "Source" (input/clip), "Action" (play/stop/cue)</li>
            <li><strong>AUTO Operator</strong> — single "Position" column (departure/arrival/target schematic) — placeholder for 0.2</li>
            <li><strong>PYRO Operator</strong> — <strong>SPECIAL:</strong> two-stage Arm → Fire safety gate. The <em>Fire</em> button is disabled until you press <em>Arm</em>. Under <em>per_dept</em> authority it also requires SM-called. Red header warning.</li>
            <li><strong>FS Operator</strong> — Front-of-house / facilities, primarily a standby_note display</li>
            <li><strong>Generic</strong> — fallback for multi-dept compound cues or unknown departments</li>
          </ul>
          <p>
            Payloads owned by your department are <strong>highlighted</strong> (bold). Others are <em>dimmed</em>
            (e.g., SX operator sees LX-tagged payloads in gray = context only).
          </p>
        </>
      ),
    },
  },
  {
    id: 'cue-editor',
    title: { cs: '6. Cue Editor (REHEARSAL)', en: '6. Cue Editor (REHEARSAL)' },
    body: {
      cs: (
        <>
          <p>
            Klik na cue v jakékoliv station → otevře cue editor. V REHEARSAL módu lze editovat všechno; v SHOW módu
            jen meta-fields (notes, standby_note), payloady jsou locked.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue metadata</h3>
          <ul>
            <li><strong>Label</strong> — co se zobrazí v cuelist row (např. „LX 47 Sunset", „SX Door slam")</li>
            <li><strong>Description</strong> — víceřádkový popis (kontext pro tým)</li>
            <li><strong>Standby note</strong> — text který se zobrazí v Standby panelu, když je cue armed (např. „Watch for actor entry SR")</li>
            <li><strong>Notes</strong> — interní poznámky (nezobrazuje se v Standby panelu)</li>
            <li><strong>Departments</strong> — multi-select chip (LX / SX / VIDEO / atd.). Musí být alespoň 1.</li>
            <li><strong>Duration hint (ms)</strong> — odhad jak dlouho cue trvá. Použito pro auto-follow timing odhady.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Trigger</h3>
          <ul>
            <li><code>manual</code> — čeká na GO</li>
            <li><code>auto_follow</code> — spustí se automaticky po dokončení předchozí cue (sleduje její duration_hint)</li>
            <li><code>auto_continue</code> — spustí se s konstantním delay po startu předchozí cue (default 0 = immediately)</li>
            <li><code>timecode</code> — spuštění podle externího timecode signálu (0.2 feature, v 0.1 placeholder)</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Payloads</h3>
          <p>
            Tlačítko <strong>+ Add payload</strong> nabízí 7 typů:
          </p>
          <ul>
            <li><strong>OSC</strong> — adresa + argumenty + cílový device</li>
            <li><strong>MSC</strong> — MIDI Show Control SysEx (cue list, cue number, command)</li>
            <li><strong>LXRef</strong> — světlený console abstraction (Eos / MA3 / Hog4 / ChamSys driver volby)</li>
            <li><strong>MIDI</strong> — note_on / note_off / cc / program_change / raw bytes</li>
            <li><strong>Webhook</strong> — HTTPS POST (0.1 stub, full impl 0.2)</li>
            <li><strong>Wait</strong> — pauza payload iteration (ms, blocking)</li>
            <li><strong>Group</strong> — odkaz na další cues (parallel / series fire mode)</li>
          </ul>
          <p>
            Payloady se ukládají automaticky (každých ~30s + při blur fieldu). Žádné Save tlačítko.
            V REHEARSAL můžeš payloady reorder drag-and-drop. Compound cue je cue s payloady pro víc oddělení.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            Click any cue from any station → opens the cue editor. In REHEARSAL mode you can edit everything; in SHOW
            mode only meta fields (notes, standby_note) — payloads are locked.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue metadata</h3>
          <ul>
            <li><strong>Label</strong> — what shows in the cuelist row (e.g., "LX 47 Sunset", "SX Door slam")</li>
            <li><strong>Description</strong> — multi-line description (team context)</li>
            <li><strong>Standby note</strong> — text that appears in the Standby panel when the cue is armed (e.g., "Watch for actor entry SR")</li>
            <li><strong>Notes</strong> — internal notes (not shown in Standby panel)</li>
            <li><strong>Departments</strong> — multi-select chip (LX / SX / VIDEO / etc.). Must be at least 1.</li>
            <li><strong>Duration hint (ms)</strong> — estimated cue length. Used for auto-follow timing.</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Trigger</h3>
          <ul>
            <li><code>manual</code> — waits for GO</li>
            <li><code>auto_follow</code> — fires automatically after the previous cue completes (uses its duration_hint)</li>
            <li><code>auto_continue</code> — fires with a fixed delay after the previous cue starts (default 0 = immediately)</li>
            <li><code>timecode</code> — driven by external timecode signal (0.2 feature; 0.1 has placeholder only)</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Payloads</h3>
          <p>The <strong>+ Add payload</strong> button offers 7 types:</p>
          <ul>
            <li><strong>OSC</strong> — address + arguments + target device</li>
            <li><strong>MSC</strong> — MIDI Show Control SysEx (cue list, cue number, command)</li>
            <li><strong>LXRef</strong> — lighting console abstraction (Eos / MA3 / Hog4 / ChamSys driver)</li>
            <li><strong>MIDI</strong> — note_on / note_off / cc / program_change / raw bytes</li>
            <li><strong>Webhook</strong> — HTTPS POST (0.1 stub, full impl in 0.2)</li>
            <li><strong>Wait</strong> — pause payload iteration (ms, blocking)</li>
            <li><strong>Group</strong> — reference to other cues (parallel / series fire mode)</li>
          </ul>
          <p>
            Payloads auto-save (every ~30s + on field blur). No Save button.
            In REHEARSAL you can drag-and-drop reorder payloads. A compound cue is a cue with payloads for multiple departments.
          </p>
        </>
      ),
    },
  },
  {
    id: 'go-button',
    title: { cs: '7. GO button + rejection toasts', en: '7. GO button + rejection toasts' },
    body: {
      cs: (
        <>
          <p>
            GO button na SM station spustí armed cue. Vizuální stavy:
          </p>
          <ul>
            <li><strong>Klid</strong> — modrý velký button, label „GO"</li>
            <li><strong>Armed</strong> — pulzuje (Q nebo přechod cursoru)</li>
            <li><strong>Fired</strong> — flash bílá, pak zpět modrá</li>
            <li><strong>Rejected</strong> — shake animace + toast „Rejected: &lt;důvod&gt;" nad buttonem (auto-clear 2s)</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Rejection důvody</h3>
          <ul>
            <li><code>not_sm</code> — go_authority=sm_only/sm_called a station nemá SM roli</li>
            <li><code>not_owner</code> — go_authority=any_owner ale operator nevidí dané cue</li>
            <li><code>not_armed</code> — cue není ve standby/armed stavu (musíš nejdřív Q)</li>
            <li><code>historic_replay</code> — request přišel s timestampem &gt;5s starým (zpožděná reconnect zpráva)</li>
            <li><code>duplicate</code> — stejný request_id už byl zpracován (idempotence)</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Override</h3>
          <p>
            Long-press GO (1.5s) na SM station → otevře <em>Confirm override</em> dialog.
            Při potvrzení dispatch obejde authority check (debugging / emergency use).
            Logováno v history.jsonl jako <code>override: true</code>.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            The GO button on the SM station fires the armed cue. Visual states:
          </p>
          <ul>
            <li><strong>Idle</strong> — blue large button, label "GO"</li>
            <li><strong>Armed</strong> — pulses (after Q or cursor advance)</li>
            <li><strong>Fired</strong> — white flash, then back to blue</li>
            <li><strong>Rejected</strong> — shake animation + toast "Rejected: &lt;reason&gt;" above the button (auto-clear 2s)</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Rejection reasons</h3>
          <ul>
            <li><code>not_sm</code> — go_authority=sm_only/sm_called and the station isn't SM</li>
            <li><code>not_owner</code> — go_authority=any_owner but the operator doesn't own the cue</li>
            <li><code>not_armed</code> — cue isn't standby/armed (you must Q first)</li>
            <li><code>historic_replay</code> — request arrived with a timestamp &gt;5s old (stale reconnect message)</li>
            <li><code>duplicate</code> — same request_id already processed (idempotency)</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Override</h3>
          <p>
            Long-press GO (1.5s) on the SM station → opens a <em>Confirm override</em> dialog.
            On confirm the dispatch skips the authority check (debugging / emergency use).
            Logged in history.jsonl as <code>override: true</code>.
          </p>
        </>
      ),
    },
  },
  {
    id: 'import',
    title: { cs: '8. Import (CSV)', en: '8. Import (CSV)' },
    body: {
      cs: (
        <>
          <p>
            Cuelist Core panel → <strong>Import</strong> → vyber CSV soubor. ShowX auto-detekuje dialect:
          </p>
          <ul>
            <li><strong>QLab</strong> — export z QLab v4/v5. Mapuje Continue / Pre-wait / Auto-follow.</li>
            <li><strong>Eos</strong> — text export ze ETC Eos consoles. Mapuje cue numbers + console refs.</li>
            <li><strong>Generic</strong> — fallback pro vlastní CSV s headery <code>label,department,duration_ms,notes</code>.</li>
          </ul>
          <p>
            Import respektuje quoted commas (RFC-4180). Rows s invalid daty se přeskočí — výsledek hlásí
            <code>{`{imported: N, skipped: M, warnings: [...]}`}</code>. Cues se přidají na konec aktuální cuelist.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            Cuelist Core panel → <strong>Import</strong> → pick a CSV file. ShowX auto-detects the dialect:
          </p>
          <ul>
            <li><strong>QLab</strong> — export from QLab v4/v5. Maps Continue / Pre-wait / Auto-follow.</li>
            <li><strong>Eos</strong> — text export from ETC Eos consoles. Maps cue numbers + console refs.</li>
            <li><strong>Generic</strong> — fallback for your own CSV with headers <code>label,department,duration_ms,notes</code>.</li>
          </ul>
          <p>
            Import respects quoted commas (RFC-4180). Rows with invalid data are skipped — the result reports
            <code>{`{imported: N, skipped: M, warnings: [...]}`}</code>. Cues are appended to the current cuelist.
          </p>
        </>
      ),
    },
  },
  {
    id: 'export',
    title: { cs: '9. Export (JSON + PDF)', en: '9. Export (JSON + PDF)' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">JSON .showx export</h3>
          <p>
            Standardní formát pro share / backup. <code>.showx</code> je adresář-balík obsahující
            <code>show.json</code>, <code>cuelists/&lt;id&gt;.json</code>, <code>operators.json</code>,
            <code>routing.json</code>, <code>history.jsonl</code>, a <code>doc.yjs</code> (CRDT snapshot).
            Jednolitkový JSON export do single-file je také dostupný (pro email forward).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">PDF cue-sheet</h3>
          <p>
            Export → <strong>PDF cue-sheet</strong>. A4, multi-page. Možnosti:
          </p>
          <ul>
            <li><strong>SM master sheet</strong> — všechny cues, full info</li>
            <li><strong>Per-department sheet</strong> — filtruje cues podle oddělení (LX-only, SX-only, ...)</li>
            <li><strong>Atomic write</strong> — vždy hotový soubor (žádné half-written PDF při crash)</li>
          </ul>
          <p>
            Použití: <strong>print backup pro fallback</strong> kdyby ShowX při show selhal. Operatéři mají
            papír + verbal comms a show se nezastaví.
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">JSON .showx export</h3>
          <p>
            The standard share / backup format. <code>.showx</code> is a package directory containing
            <code>show.json</code>, <code>cuelists/&lt;id&gt;.json</code>, <code>operators.json</code>,
            <code>routing.json</code>, <code>history.jsonl</code>, and <code>doc.yjs</code> (CRDT snapshot).
            A single-file JSON export is also available (for email forwarding).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">PDF cue-sheet</h3>
          <p>
            Export → <strong>PDF cue-sheet</strong>. A4, multi-page. Options:
          </p>
          <ul>
            <li><strong>SM master sheet</strong> — every cue, full info</li>
            <li><strong>Per-department sheet</strong> — filters cues by department (LX-only, SX-only, …)</li>
            <li><strong>Atomic write</strong> — finished file always (no half-written PDF on crash)</li>
          </ul>
          <p>
            Use: <strong>printed backup for fallback</strong> if ShowX fails during a show. Operators have
            paper + verbal comms and the show keeps moving.
          </p>
        </>
      ),
    },
  },
  {
    id: 'streamdeck',
    title: { cs: '10. Stream Deck (Companion)', en: '10. Stream Deck (Companion)' },
    body: {
      cs: (
        <>
          <p>
            Pro Elgato Stream Deck integraci použij <strong>Companion komunitní modul</strong> dodávaný se ShowX.
          </p>
          <ol>
            <li>Instaluj <a href="https://bitfocus.io/companion" target="_blank" rel="noopener noreferrer" className="underline">Companion</a> (free)</li>
            <li>
              Stáhni ShowX modul: <code>external/companion-module-showx/</code> z repa
              (<a href="https://github.com/jtrjtrjtr/showX/tree/main/external/companion-module-showx" target="_blank" rel="noopener noreferrer" className="underline">GitHub link</a>)
            </li>
            <li>V Companion: Modules → <em>Import module</em> → vyber stažený adresář</li>
            <li>Connect instance: zadej <code>ws://&lt;mac-ip&gt;:5300/events/&lt;show_id&gt;?token=&lt;pairing-token&gt;</code></li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Dostupné akce</h3>
          <ul>
            <li><strong>GO</strong> — fire armed cue</li>
            <li><strong>GO override</strong> — long-press equivalent</li>
            <li><strong>Standby Next</strong> — Q next cue</li>
            <li><strong>Stop / Pause / Resume</strong></li>
            <li><strong>Goto cue</strong> — direct jump podle cue ID</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Feedbacks (button color)</h3>
          <ul>
            <li>Connected (zelená)</li>
            <li>Disconnected (červená)</li>
            <li>SHOW mode (červená)</li>
            <li>Cue armed (žlutá)</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Variables (pro multi-button layouts)</h3>
          <p>
            <code>connected</code>, <code>current_cue_label</code>, <code>armed_cue_label</code>,
            <code>last_fired_label</code>, <code>mode</code>, <code>stations_online</code>.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            For Elgato Stream Deck integration use the <strong>Companion community module</strong> shipped with ShowX.
          </p>
          <ol>
            <li>Install <a href="https://bitfocus.io/companion" target="_blank" rel="noopener noreferrer" className="underline">Companion</a> (free)</li>
            <li>
              Download the ShowX module: <code>external/companion-module-showx/</code> from the repo
              (<a href="https://github.com/jtrjtrjtr/showX/tree/main/external/companion-module-showx" target="_blank" rel="noopener noreferrer" className="underline">GitHub link</a>)
            </li>
            <li>In Companion: Modules → <em>Import module</em> → select the downloaded directory</li>
            <li>Connect an instance: enter <code>ws://&lt;mac-ip&gt;:5300/events/&lt;show_id&gt;?token=&lt;pairing-token&gt;</code></li>
          </ol>
          <h3 className="display-serif text-xl mt-6 mb-2">Available actions</h3>
          <ul>
            <li><strong>GO</strong> — fire armed cue</li>
            <li><strong>GO override</strong> — long-press equivalent</li>
            <li><strong>Standby Next</strong> — Q next cue</li>
            <li><strong>Stop / Pause / Resume</strong></li>
            <li><strong>Goto cue</strong> — direct jump by cue ID</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Feedbacks (button color)</h3>
          <ul>
            <li>Connected (green)</li>
            <li>Disconnected (red)</li>
            <li>SHOW mode (red)</li>
            <li>Cue armed (yellow)</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Variables (for multi-button layouts)</h3>
          <p>
            <code>connected</code>, <code>current_cue_label</code>, <code>armed_cue_label</code>,
            <code>last_fired_label</code>, <code>mode</code>, <code>stations_online</code>.
          </p>
        </>
      ),
    },
  },
  {
    id: 'troubleshooting',
    title: { cs: '11. Troubleshooting', en: '11. Troubleshooting' },
    body: {
      cs: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">iPad se nepřipojí přes LAN</h3>
          <p>
            Zkontroluj: (1) Mac a iPad na stejné WiFi/LAN, (2) Mac firewall nepouští <code>:5300</code> →
            System Preferences → Network → Firewall Options → povolit ShowX, (3) IP adresa Macu se nemění (DHCP fixed lease).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue se nespustí — žádný OSC výstup</h3>
          <p>
            (1) Otevři <strong>Routing</strong> v ShowX panelu → zkontroluj že device má host + port,
            (2) zkontroluj že payload je <em>highlighted</em> v Operator view (jinak je context-only),
            (3) ověř že cue je armed (Standby panel ji zobrazuje červeně).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">GO „Rejected: not_sm"</h3>
          <p>
            Tvoje station není SM ale go_authority je <code>sm_only</code> nebo <code>sm_called</code>. Buď:
            (a) přepárovat station jako SM, (b) změnit go_authority na <code>any_owner</code> v cuelist settings.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">PWA „Connection lost"</h3>
          <p>
            ShowX side-channel reconnects automaticky (exp backoff 1→2→5→10→30s). Pokud trvá &gt;1 min,
            zkontroluj Mac stále běží + PWA URL je správné. Po reconnect ShowX pošle <em>resume</em> request
            a station dohnala missed events z ring bufferu.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">REHEARSAL → SHOW lock nejde</h3>
          <p>
            Lock vyžaduje SM station. Pokud lock fail, zkontroluj log v Cuelist Core panelu (sekce „Recent activity").
            Snapshot před lockem může selhat pokud disk plný — zkontroluj <code>~/Documents/ShowX/&lt;show&gt;.showx/snapshots/</code>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">ShowX se zasekne / crash</h3>
          <p>
            Quit přes Cmd+Q. Při restartu ShowX auto-recovery načte poslední consistent snapshot. Pokud
            <code>doc.yjs</code> corrupted, ShowX rebuilduje Y.Doc z JSON projekce (degraded mode, ale funkční).
            Pro report: send logs z Konsole (filtruj „ShowX") + last 100 řádků <code>history.jsonl</code>.
          </p>
        </>
      ),
      en: (
        <>
          <h3 className="display-serif text-xl mt-6 mb-2">iPad won't connect over LAN</h3>
          <p>
            Check: (1) Mac and iPad on the same WiFi/LAN, (2) Mac firewall allows <code>:5300</code> →
            System Settings → Network → Firewall Options → allow ShowX, (3) the Mac's IP doesn't change (DHCP fixed lease).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">Cue doesn't fire — no OSC out</h3>
          <p>
            (1) Open <strong>Routing</strong> in the ShowX panel → verify the device has host + port,
            (2) check the payload is <em>highlighted</em> in the Operator view (otherwise it's context-only),
            (3) make sure the cue is armed (Standby panel shows it in red).
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">GO "Rejected: not_sm"</h3>
          <p>
            Your station isn't SM but go_authority is <code>sm_only</code> or <code>sm_called</code>. Either:
            (a) re-pair the station as SM, (b) change go_authority to <code>any_owner</code> in cuelist settings.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">PWA "Connection lost"</h3>
          <p>
            The ShowX side-channel auto-reconnects (exp backoff 1→2→5→10→30s). If it lasts &gt;1 min,
            check the Mac is still running and the PWA URL is correct. On reconnect ShowX sends a <em>resume</em> request
            and the station catches up missed events from the ring buffer.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">REHEARSAL → SHOW lock fails</h3>
          <p>
            Locking requires the SM station. If it fails, check the log in the Cuelist Core panel (section "Recent activity").
            The pre-lock snapshot can fail if disk is full — check <code>~/Documents/ShowX/&lt;show&gt;.showx/snapshots/</code>.
          </p>
          <h3 className="display-serif text-xl mt-6 mb-2">ShowX hangs / crashes</h3>
          <p>
            Quit with Cmd+Q. On restart ShowX auto-recovery loads the last consistent snapshot. If
            <code>doc.yjs</code> is corrupted, ShowX rebuilds the Y.Doc from the JSON projection (degraded mode but functional).
            For a report: send logs from Console.app (filter "ShowX") + last 100 lines of <code>history.jsonl</code>.
          </p>
        </>
      ),
    },
  },
  {
    id: 'feedback',
    title: { cs: '12. Co je beta, jak nahlásit', en: '12. What is beta, how to report' },
    body: {
      cs: (
        <>
          <p>
            ShowX 0.1 je <strong>první public beta</strong>. Cíl: získat feedback od reálných uživatelů (LD, SM, AV tech) na:
          </p>
          <ul>
            <li>Workflow — co je nepřirozené, co chybí</li>
            <li>Stability — kde to padá, kde to tiká</li>
            <li>Missing features — co očekáváš, ale není tam</li>
          </ul>
          <p>
            Známé limitace 0.1:
          </p>
          <ul>
            <li>macOS Apple Silicon only (Intel + Windows + Linux později)</li>
            <li>Unsigned build (Gatekeeper bypass nutný)</li>
            <li>Webhook payload = stub (full impl 0.2)</li>
            <li>Timecode trigger = stub (real impl 0.2)</li>
            <li>SHOW mode lock = basic (edit proposals + history snapshots v 0.2)</li>
            <li>Žádné Cloud Sync (LAN only)</li>
            <li>Žádný auto-update</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">Jak nahlásit</h3>
          <p>
            <strong>GitHub Issues:</strong>{' '}
            <a href="https://github.com/jtrjtrjtr/showX/issues" target="_blank" rel="noopener noreferrer" className="underline">
              github.com/jtrjtrjtr/showX/issues
            </a>{' '}
            — bug + feature request.
          </p>
          <p>
            <strong>Email Jindřichovi:</strong> <code>jindrich.trapl@xlab.cz</code> — pro pilotní debrief nebo
            přímý kontakt.
          </p>
          <p>
            Při bug reportu prosím přidej: macOS verze, ShowX version (z About menu), kroky k reprodukci,
            poslední 100 řádků <code>history.jsonl</code> ze tvé <code>.showx</code> složky.
          </p>
        </>
      ),
      en: (
        <>
          <p>
            ShowX 0.1 is the <strong>first public beta</strong>. Goal: collect feedback from real users (LD, SM, AV tech) on:
          </p>
          <ul>
            <li>Workflow — what feels unnatural, what's missing</li>
            <li>Stability — where it crashes, where it lags</li>
            <li>Missing features — what you expect that isn't there</li>
          </ul>
          <p>Known limitations in 0.1:</p>
          <ul>
            <li>macOS Apple Silicon only (Intel + Windows + Linux later)</li>
            <li>Unsigned build (Gatekeeper bypass required)</li>
            <li>Webhook payload = stub (full impl 0.2)</li>
            <li>Timecode trigger = stub (real impl 0.2)</li>
            <li>SHOW mode lock = basic (edit proposals + history snapshots in 0.2)</li>
            <li>No Cloud Sync (LAN only)</li>
            <li>No auto-update</li>
          </ul>
          <h3 className="display-serif text-xl mt-6 mb-2">How to report</h3>
          <p>
            <strong>GitHub Issues:</strong>{' '}
            <a href="https://github.com/jtrjtrjtr/showX/issues" target="_blank" rel="noopener noreferrer" className="underline">
              github.com/jtrjtrjtr/showX/issues
            </a>{' '}
            — bug + feature request.
          </p>
          <p>
            <strong>Email Jindřich directly:</strong> <code>jindrich.trapl@xlab.cz</code> — for pilot debrief or
            direct contact.
          </p>
          <p>
            For bug reports please include: macOS version, ShowX version (from About menu), repro steps,
            last 100 lines of <code>history.jsonl</code> from your <code>.showx</code> folder.
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
                ShowX 0.1<br />
                <em className="font-light text-accent-deep not-italic">{cs ? 'od krabičky k GO' : 'box to GO'}</em>
              </h1>
              <p className="copy text-lg mt-10 max-w-2xl">
                {cs
                  ? 'Kompletní průvodce pro testery 0.1 beta. Co je co, jak to funguje, co očekávat.'
                  : 'Complete walkthrough for 0.1 beta testers. What is what, how it works, what to expect.'}
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
