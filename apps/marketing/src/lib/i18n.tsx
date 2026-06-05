import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type Lang = 'cs' | 'en'

interface Ctx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const I18nCtx = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (k) => k })

const dict: Record<string, { cs: string; en: string }> = {
  // Nav
  'nav.try-it': { cs: 'Vyzkoušet', en: 'Try it locally' },
  'nav.status': { cs: 'Status', en: 'Status' },
  'nav.downloads': { cs: 'Ke stažení', en: 'Downloads' },
  'nav.docs': { cs: 'Dokumentace', en: 'Docs' },
  'nav.preview': { cs: 'Požádat o přístup →', en: 'Request preview access →' },

  // Footer
  'footer.tagline': {
    cs: 'LAN-first FOH platforma pro živé show — ve vývoji, ne v prodeji. Foundation běží, cuelist UI přijde Q1 2027. Stavíme to veřejně.',
    en: 'LAN-first FOH platform for live shows — in development, not for sale. Foundation runs today; the cuelist UI lands Q1 2027. We build in the open.',
  },
  'footer.product': { cs: 'Projekt', en: 'Project' },
  'footer.resources': { cs: 'Zdroje', en: 'Resources' },
  'footer.contact': { cs: 'Kontakt', en: 'Contact' },
  'footer.support': { cs: 'Podpora', en: 'Support' },
  'footer.preview': { cs: 'Preview přístup', en: 'Preview access' },
  'footer.bugs': { cs: 'Nahlásit chybu', en: 'Report a bug' },
  'footer.github': { cs: 'GitHub (privátní)', en: 'GitHub (private)' },
  'footer.devdocs': { cs: 'Dev docs', en: 'Dev docs' },
  'footer.strategy': { cs: 'Strategy docs', en: 'Strategy docs' },
  'footer.copy': {
    cs: '© 2026 XLAB · ShowX 0.5 internal preview — Foundation 13/13, public release Q1 2027',
    en: '© 2026 XLAB · ShowX 0.5 internal preview — Foundation 13/13, public release Q1 2027',
  },
  'footer.region': { cs: 'LAN-first runtime · Postaveno v Praze', en: 'LAN-first runtime · Built in Prague' },
  'footer.brand-note': {
    cs: 'EventX + ShowX — sourozenecké produkty z rodiny XLAB.',
    en: 'EventX + ShowX — sibling products from the XLAB family.',
  },

  // Home — hero
  'home.label': {
    cs: 'ShowX · developer preview · v0.5 internal',
    en: 'ShowX · developer preview · v0.5 internal',
  },
  'home.hero.line1': { cs: 'Živé show.', en: 'Live shows.' },
  'home.hero.line2': { cs: 'Jedna platforma.', en: 'One platform.' },
  'home.hero.line3': { cs: 'Spusťte si to lokálně.', en: 'Try it locally.' },
  'home.hero.copy': {
    cs: 'ShowX-1 Foundation je hotová — 13/13 tasků accepted 2026-06-06. Shared services na FOH Macu běží: Electron shell, embedded sync broker, mDNS discovery, pairing PWA, 11 shared služeb, 269 testů passing. Cuelist UI přijde Q1 2027. Právě teď můžete naklonovat repo, spustit dev shell, projít pairing flow a vidět LAN broker bootovat.',
    en: 'ShowX-1 Foundation is complete — 13/13 tasks accepted 2026-06-06. Shared services boot on your Mac: Electron shell, embedded sync broker, mDNS discovery, pairing PWA, 11 shared services, 269 tests passing. The cuelist UI lands Q1 2027. Right now you can clone the repo, run the dev shell, walk the pairing flow, and watch the LAN broker boot.',
  },
  'home.cta.try': { cs: 'Jak to spustit →', en: 'How to run it →' },
  'home.cta.status': { cs: 'Live status', en: 'Live status' },

  // Home — status panel (live mock)
  'home.live.status': { cs: 'Build stav', en: 'Build status' },
  'home.live.foundation': { cs: 'Foundation services', en: 'Foundation services' },
  'home.live.shell': { cs: 'Electron shell', en: 'Electron shell' },
  'home.live.pwa': { cs: 'Pairing PWA', en: 'Pairing PWA' },
  'home.live.tests': { cs: 'Test suite (269)', en: 'Test suite (269)' },
  'home.live.dmg': { cs: 'Podepsaný DMG', en: 'Signed DMG' },
  'home.live.cuelist': { cs: 'Cuelist UI', en: 'Cuelist UI' },
  'home.live.ok': { cs: 'OK', en: 'OK' },
  'home.live.wip': { cs: 'WIP', en: 'WIP' },
  'home.live.no': { cs: '—', en: '—' },
  'home.live.footnote': {
    cs: 'Updated 2026-06-06 · Foundation 13/13 accepted',
    en: 'Updated 2026-06-06 · Foundation 13/13 accepted',
  },

  // Home — today
  'home.today.label': { cs: '02 — Co dneska můžete', en: '02 — What you can do today' },
  'home.today.h1': { cs: 'Naklonujte. Spusťte.', en: 'Clone it. Boot it.' },
  'home.today.h2': { cs: 'Sledujte boot logy.', en: 'Watch the boot logs.' },
  'home.today.intro': {
    cs: 'Žádné public binaries, žádný DMG zatím. Pouze source clone přes XLAB pozvánku do privátního GitHub repa. Sem patří, co skutečně máte k dispozici už teď.',
    en: 'No public binaries, no DMG yet. Source clone via XLAB invite into the private GitHub repo only. This is what is actually available right now.',
  },
  'home.today.t1': { cs: 'Naklonovat + spustit dev shell', en: 'Clone + run dev shell' },
  'home.today.t1.body': {
    cs: '`pnpm install` → `pnpm --filter showx-main dev`. Sledujte 13-krokový boot v konzoli. AssetServer naslouchá na :5300, mDNS advertuje `_showx._tcp.local`.',
    en: '`pnpm install` → `pnpm --filter showx-main dev`. Watch the 13-step boot in the console. AssetServer listens on :5300, mDNS advertises `_showx._tcp.local`.',
  },
  'home.today.t2': { cs: 'Otevřít pairing PWA', en: 'Open the pairing PWA' },
  'home.today.t2.body': {
    cs: '`pnpm dev:pwa` → http://localhost:5174. Discovery + 6-digit PIN pairing + AES-GCM token encryption + Y.Doc s IndexedDB persistentem.',
    en: '`pnpm dev:pwa` → http://localhost:5174. Discovery + 6-digit PIN pairing + AES-GCM token encryption + Y.Doc with IndexedDB persistence.',
  },
  'home.today.t3': { cs: 'Vidět 269 testů projít', en: 'See 269 tests pass' },
  'home.today.t3.body': {
    cs: '`pnpm test` přes Vitest napříč 4 workspaces. `pnpm typecheck` v strict TypeScript modu — všechno exit 0.',
    en: '`pnpm test` runs Vitest across 4 workspaces. `pnpm typecheck` in strict TypeScript mode — all exit 0.',
  },
  'home.today.t4': { cs: 'Číst 10 dev dokumentů', en: 'Read the 10 dev docs' },
  'home.today.t4.body': {
    cs: '`docs/dev/` obsahuje 10 markdown souborů, ~21k slov: architektura, modul SDK, protocol reference, pairing, data model, testing, .showx format.',
    en: '`docs/dev/` ships 10 markdown files, ~21k words: architecture, module SDK, protocol reference, pairing, data model, testing, .showx format.',
  },
  'home.today.t5': { cs: 'Sledovat bundle progress', en: 'Follow the bundle progress' },
  'home.today.t5.body': {
    cs: 'ShowX-1 Foundation: 13/13 ✅. Bundle ShowX-2 (EventX Bridge absorption): 15 speců queued, scope disabled. Týdenní progress na /status.',
    en: 'ShowX-1 Foundation: 13/13 ✅. Bundle ShowX-2 (EventX Bridge absorption): 15 specs queued, scope disabled. Weekly progress at /status.',
  },
  'home.today.t6': { cs: 'Vidět službu zhroutit a obnovit se', en: 'Watch a service crash and recover' },
  'home.today.t6.body': {
    cs: 'Modul crash isolation je live — vypněte sync broker portu uprostřed pairingu, HealthBus to zachytí, modul-level state machine se zotaví bez kill shellu.',
    en: 'Module crash isolation is live — kill the sync broker port mid-pairing, HealthBus catches it, the module-level state machine recovers without killing the shell.',
  },

  // Home — not yet
  'home.not.label': { cs: '03 — Co zatím nejde', en: '03 — What you cannot do yet' },
  'home.not.h1': { cs: 'Buďme upřímní:', en: "Let's be honest:" },
  'home.not.h2': { cs: 'tohle ještě neumíme.', en: 'this is not here yet.' },
  'home.not.dmg': { cs: 'Žádný DMG download', en: 'No DMG download' },
  'home.not.dmg.body': {
    cs: 'Apple Developer ID rebrand + podepsaný + notarizovaný DMG = B002-014/015. Plánováno post-Kongres 2026-06-17.',
    en: 'Apple Developer ID rebrand + signed + notarized DMG = B002-014/015. Scheduled post-Kongres 2026-06-17.',
  },
  'home.not.bridge': { cs: 'Žádný EventX Bridge modul', en: 'No EventX Bridge module' },
  'home.not.bridge.body': {
    cs: 'BridgeX 0.3.x source absorption = bundle ShowX-2, Q3 2026. Než to bude, EventX dál jezdí přes standalone BridgeX 0.3.23.',
    en: 'BridgeX 0.3.x source absorption = bundle ShowX-2, Q3 2026. Until then EventX still runs on standalone BridgeX 0.3.23.',
  },
  'home.not.cuelist': { cs: 'Žádný Cuelist UI', en: 'No cuelist UI' },
  'home.not.cuelist.body': {
    cs: 'Cuelist Core modul = bundle ShowX-3, Q1 2027. PWA pairing screen je hotová placeholder, ale cuelisty zatím ne.',
    en: 'Cuelist Core module = bundle ShowX-3, Q1 2027. The PWA pairing screen is a placeholder; no cuelist UI yet.',
  },
  'home.not.show': { cs: 'Žádný SHOW mode', en: 'No SHOW mode' },
  'home.not.show.body': {
    cs: 'Lock + edit proposal queue + history snapshots = bundle ShowX-4, Q2 2027.',
    en: 'Lock + edit proposal queue + history snapshots = bundle ShowX-4, Q2 2027.',
  },
  'home.not.cloud': { cs: 'Žádný Cloud Sync', en: 'No Cloud Sync' },
  'home.not.cloud.body': {
    cs: 'Opt-in Supabase backup + cross-venue Yjs multi-provider stack — post-MVP modul. Žádné datum.',
    en: 'Opt-in Supabase backup + cross-venue Yjs multi-provider stack — post-MVP module. No date yet.',
  },
  'home.not.repo': { cs: 'Repo je privátní', en: 'Repo is private' },
  'home.not.repo.body': {
    cs: 'GitHub přístup přes XLAB pozvánku — pošlete email a přidáme vás jako reader.',
    en: 'GitHub access via XLAB invite — email us and we add you as reader.',
  },

  // Home — get seat
  'home.seat.label': { cs: '04 — Přístup', en: '04 — Get a seat' },
  'home.seat.h1': { cs: 'Žádný registrační', en: 'No signup' },
  'home.seat.h2': { cs: 'formulář. Email.', en: 'form. Email.' },
  'home.seat.body': {
    cs: 'Žádný portál, žádný onboarding flow. Napište nám, kdo jste, jaký venue / role, a co byste chtěli z ShowX vidět. Když to dává smysl, přidáme vás do privátního repa + dev preview cohort.',
    en: 'No portal, no onboarding flow. Email us who you are, what venue / role, and what you want to see from ShowX. If it fits, we add you to the private repo + dev preview cohort.',
  },
  'home.seat.cta': { cs: 'Napsat o preview přístup', en: 'Email for preview access' },

  // Home — bundle progress
  'home.bundle.label': { cs: '05 — Bundle progress', en: '05 — Bundle progress' },
  'home.bundle.h1': { cs: 'Tři bundles.', en: 'Three bundles.' },
  'home.bundle.h2': { cs: 'Jeden hotový.', en: 'One done.' },
  'home.bundle.b1.title': { cs: 'ShowX-1 · Foundation', en: 'ShowX-1 · Foundation' },
  'home.bundle.b1.status': { cs: '13/13 accepted ✅', en: '13/13 accepted ✅' },
  'home.bundle.b1.body': {
    cs: 'Electron shell, modul loader, 11 shared services, PWA pairing scaffold, 269 testů. Closed 2026-06-06.',
    en: 'Electron shell, module loader, 11 shared services, PWA pairing scaffold, 269 tests. Closed 2026-06-06.',
  },
  'home.bundle.b2.title': { cs: 'ShowX-2 · EventX Bridge absorption', en: 'ShowX-2 · EventX Bridge absorption' },
  'home.bundle.b2.status': { cs: '0/15 queued · scope disabled', en: '0/15 queued · scope disabled' },
  'home.bundle.b2.body': {
    cs: 'BridgeX 0.3.x source → src/modules/eventx-bridge/. 15 task speců hotových. Startuje post-Kongres 2026-06-17.',
    en: 'BridgeX 0.3.x source → src/modules/eventx-bridge/. 15 task specs ready. Starts post-Kongres 2026-06-17.',
  },
  'home.bundle.b3.title': { cs: 'ShowX-3 · Cuelist Core', en: 'ShowX-3 · Cuelist Core' },
  'home.bundle.b3.status': { cs: '0/23 outline', en: '0/23 outline' },
  'home.bundle.b3.body': {
    cs: 'Show document, cuelist, cue + payloads, REHEARSAL mode, per-department views, multi-op Yjs sync. Q1 2027.',
    en: 'Show document, cuelist, cue + payloads, REHEARSAL mode, per-department views, multi-op Yjs sync. Q1 2027.',
  },

  // Home — roadmap
  'home.roadmap.label': { cs: '06 — Roadmap', en: '06 — Roadmap' },
  'home.roadmap.h1': { cs: 'Kongres 17. června.', en: 'Kongres on Jun 17.' },
  'home.roadmap.h2': { cs: 'Veřejná beta Q4 2027.', en: 'Public beta Q4 2027.' },
  'home.roadmap.t1': { cs: '2026-06-17', en: '2026-06-17' },
  'home.roadmap.t1.body': { cs: 'Kongres show. BridgeX 0.3.23 v provozu. ShowX-2 scope zapnut druhý den.', en: 'Kongres show. BridgeX 0.3.23 in production. ShowX-2 scope enabled day after.' },
  'home.roadmap.t2': { cs: 'Q3 2026', en: 'Q3 2026' },
  'home.roadmap.t2.body': { cs: 'BridgeX absorpce do src/modules/eventx-bridge/. Parity test harness.', en: 'BridgeX absorption into src/modules/eventx-bridge/. Parity test harness.' },
  'home.roadmap.t3': { cs: 'End-2026', en: 'End-2026' },
  'home.roadmap.t3.body': { cs: 'ShowX 0.5 internal release — BridgeX feature parity, podepsaný DMG.', en: 'ShowX 0.5 internal release — BridgeX feature parity, signed DMG.' },
  'home.roadmap.t4': { cs: 'Q1 2027', en: 'Q1 2027' },
  'home.roadmap.t4.body': { cs: 'ShowX 0.1 public — Cuelist Core + REHEARSAL mode.', en: 'ShowX 0.1 public — Cuelist Core + REHEARSAL mode.' },
  'home.roadmap.t5': { cs: 'Q2 2027', en: 'Q2 2027' },
  'home.roadmap.t5.body': { cs: 'ShowX 0.2 — SHOW mode + první placený pilot.', en: 'ShowX 0.2 — SHOW mode + first paid pilot.' },
  'home.roadmap.t6': { cs: 'Q4 2027', en: 'Q4 2027' },
  'home.roadmap.t6.body': { cs: 'Public beta — open signups.', en: 'Public beta — open signups.' },

  // Home — footer CTA
  'home.foot.label': { cs: '07 — Další kroky', en: '07 — Next steps' },
  'home.foot.h1': { cs: 'Zkusit lokálně.', en: 'Try it locally.' },
  'home.foot.h2': { cs: 'Číst docs.', en: 'Read the docs.' },
  'home.foot.try': { cs: 'Návod krok za krokem →', en: 'Step-by-step guide →' },
  'home.foot.docs': { cs: 'Dokumentace →', en: 'Documentation →' },

  // TryIt page
  'try.title': { cs: 'Vyzkoušet lokálně', en: 'Try it locally' },
  'try.label': { cs: 'Dev preview · 8 kroků', en: 'Dev preview · 8 steps' },
  'try.headline.line1': { cs: 'Žádný DMG.', en: 'No DMG.' },
  'try.headline.line2': { cs: 'Source clone.', en: 'Source clone.' },
  'try.headline.line3': { cs: 'Osm příkazů.', en: 'Eight commands.' },
  'try.intro': {
    cs: 'ShowX 0.5 internal preview běží jako Electron shell + PWA dev server. Žádné podepsané binaries; vše v source modu. Krok 1 vyžaduje XLAB pozvánku do privátního GitHub repa.',
    en: 'ShowX 0.5 internal preview runs as the Electron shell + PWA dev server. No signed binaries; everything from source. Step 1 needs an XLAB invite to the private GitHub repo.',
  },

  'try.step1.h': { cs: 'Získat repo', en: 'Get the repo' },
  'try.step1.body': {
    cs: 'Repo je privátní. Napište nám na hello@xlabproject.net (subject: ShowX dev preview cohort) — pošlete krátký kontext (kdo jste, jaký venue / role) a přidáme vás jako reader. Jakmile přijde pozvánka:',
    en: 'The repo is private. Email hello@xlabproject.net (subject: ShowX dev preview cohort) with a short context (who you are, venue / role) and we add you as reader. Once the invite lands:',
  },
  'try.step1.note': {
    cs: 'Pokud nemáte SSH klíč v GitHubu, použijte HTTPS clone variantu.',
    en: 'If your GitHub does not have an SSH key, use the HTTPS clone variant.',
  },

  'try.step2.h': { cs: 'Nainstalovat Node + pnpm', en: 'Install Node + pnpm' },
  'try.step2.body': {
    cs: 'Vyžadujeme Node 20 LTS + pnpm 8.15. Macm s Homebrew:',
    en: 'Requires Node 20 LTS + pnpm 8.15. macOS with Homebrew:',
  },
  'try.step2.note': {
    cs: 'Jiné versioning managers (mise, asdf, nvm) fungují taky — vyžadované je jen Node 20.x.',
    en: 'Other version managers (mise, asdf, nvm) work too — only Node 20.x is required.',
  },

  'try.step3.h': { cs: 'Nainstalovat dependencies', en: 'Install dependencies' },
  'try.step3.body': {
    cs: 'Workspace má 4 packages (src/main, src/shared, pwa, apps/marketing). pnpm install nainstaluje ~250 packages, ~12s na rychlém wifi.',
    en: 'Workspace ships 4 packages (src/main, src/shared, pwa, apps/marketing). pnpm install pulls ~250 packages, ~12s on fast wifi.',
  },

  'try.step4.h': { cs: 'Typecheck', en: 'Typecheck' },
  'try.step4.body': {
    cs: 'Strict TypeScript napříč všemi 4 workspaces. Měl by exit s kódem 0. Pokud něco šrotí, podívejte se do issue trackeru — nejspíš je to verze Node.',
    en: 'Strict TypeScript across all 4 workspaces. Should exit 0. If anything breaks, check the issue tracker — likely a Node version mismatch.',
  },

  'try.step5.h': { cs: 'Spustit testy', en: 'Run tests' },
  'try.step5.body': {
    cs: '269 testů přes Vitest. Pokrytí: shared services (Logger, EventBus, HealthBus, PersistedStore, SecretStore, AssetServer, MdnsService, SyncBroker, OutputDispatcher, InputRegistrar, PairingStore) + modul loader + PWA pairing flow.',
    en: '269 tests via Vitest. Coverage: shared services (Logger, EventBus, HealthBus, PersistedStore, SecretStore, AssetServer, MdnsService, SyncBroker, OutputDispatcher, InputRegistrar, PairingStore) + module loader + PWA pairing flow.',
  },

  'try.step6.h': { cs: 'Spustit PWA dev server', en: 'Run the PWA dev server' },
  'try.step6.body': {
    cs: 'Vite dev server na portu 5174. Otevřete http://localhost:5174. Uvidíte DiscoveryView; zatím nic k discovery, protože shell ještě neběží. Zachovejte terminál otevřený.',
    en: 'Vite dev server on port 5174. Open http://localhost:5174. You will see DiscoveryView; nothing to discover yet because the shell is not running. Keep the terminal open.',
  },

  'try.step7.h': { cs: 'Spustit Electron shell', en: 'Run the Electron shell' },
  'try.step7.body': {
    cs: 'V druhém terminálu. Sledujte 13-krokový boot v konzoli — Logger init → EventBus → HealthBus → PersistedStore → SecretStore → AssetServer (port 5300) → MdnsService advertuje `_showx._tcp.local` → SyncBroker (embedded y-websocket) → OutputDispatcher (OSC + MIDI + DMX) → InputRegistrar → PairingStore → modul loader → ready.',
    en: 'In a second terminal. Watch the 13-step boot in the console — Logger init → EventBus → HealthBus → PersistedStore → SecretStore → AssetServer (port 5300) → MdnsService advertises `_showx._tcp.local` → SyncBroker (embedded y-websocket) → OutputDispatcher (OSC + MIDI + DMX) → InputRegistrar → PairingStore → module loader → ready.',
  },
  'try.step7.note': {
    cs: 'Pokud port 5300 už používá něco jiného, shell exitne s ERR_PORT_BUSY. Zabijte to nebo přepište přes env.',
    en: 'If port 5300 is taken by something else, the shell exits ERR_PORT_BUSY. Kill the offending process or override via env.',
  },

  'try.step8.h': { cs: 'Otevřít PWA + spárovat', en: 'Open PWA + pair' },
  'try.step8.body': {
    cs: 'Vraťte se na http://localhost:5174. Discovery by měla najít ShowX na vaší LAN síti přes mDNS. Klikněte "Add station", zadejte 6-digit PIN, který se zobrazí v Electron shell logu. Pairing PWA použije AES-GCM šifrování pro token storage. (Pairing UI je placeholder — plný SM Allow flow přijde s ShowX-3.)',
    en: 'Return to http://localhost:5174. Discovery should find ShowX on your local network via mDNS. Click "Add station", enter the 6-digit PIN displayed in the Electron shell logs. The pairing PWA uses AES-GCM for token storage. (Pairing UI is a placeholder — full SM Allow flow lands in ShowX-3.)',
  },
  'try.step8.note': {
    cs: 'Pokud discovery selže (corporate wifi, VPN, firewall blokující mDNS), použijte manuální URL fallback: zadejte http://<vase-ip>:5300 přímo.',
    en: 'If discovery fails (corporate wifi, VPN, firewall blocking mDNS), use the manual URL fallback: enter http://<your-ip>:5300 directly.',
  },

  // TryIt — what to look at
  'try.next.label': { cs: 'Co dál', en: 'What next' },
  'try.next.h': { cs: 'Co si přečíst, kam nahlásit chybu.', en: 'What to read, where to file bugs.' },
  'try.next.docs.h': { cs: 'Číst', en: 'Read' },
  'try.next.docs.body': {
    cs: 'Architektura, modul SDK, protocol reference a data model jsou v docs/dev/ (10 souborů, ~21k slov). Začněte indexem.',
    en: 'Architecture, module SDK, protocol reference, and data model live in docs/dev/ (10 files, ~21k words). Start with the index.',
  },
  'try.next.bugs.h': { cs: 'Nahlásit chybu', en: 'File a bug' },
  'try.next.bugs.body': {
    cs: 'GitHub Issues v privátním repu (jakmile máte přístup) NEBO email na hello@xlabproject.net se subjectem ShowX dev bug. Připojte logy z Electron konzole + krok, ve kterém to spadlo.',
    en: 'GitHub Issues in the private repo (once you have access) OR email hello@xlabproject.net with subject ShowX dev bug. Attach Electron console logs + the step where it broke.',
  },
  'try.next.chat.h': { cs: 'Dev kanál', en: 'Dev channel' },
  'try.next.chat.body': {
    cs: 'Discord / Slack zatím není veřejně otevřené. Napište nám email a přidáme vás do privátního dev kanálu — pro hot dotazy, share screenshots, ráno-po-show stížnosti.',
    en: 'Discord / Slack is not publicly open yet. Email us and we add you to the private dev channel — for hot questions, screenshots, morning-after-show complaints.',
  },

  // Status page
  'status.title': { cs: 'Status', en: 'Status' },
  'status.label': { cs: 'Status · 2026-06-06 / 13:00 CEST', en: 'Status · 2026-06-06 / 13:00 CEST' },
  'status.headline.line1': { cs: 'ShowX vzniká', en: 'ShowX is being built' },
  'status.headline.line2': { cs: 'veřejně.', en: 'in the open.' },
  'status.intro': {
    cs: 'Tří-agentní tým (Architect / Forge / Critic) staví ShowX modul po modulu. Bundles se opírají o file-based workflow v `docs/agent_exchange/`. Tahle stránka ukazuje, co je hotové, co se právě dělá, co je v frontě.',
    en: 'A three-agent team (Architect / Forge / Critic) builds ShowX module by module. Bundles run off a file-based workflow in `docs/agent_exchange/`. This page shows what is done, what is in flight, what is queued.',
  },

  'status.phase.label': { cs: 'Aktuální fáze', en: 'Current phase' },
  'status.phase.h': { cs: 'ShowX-1 Foundation: ✅ Complete', en: 'ShowX-1 Foundation: ✅ Complete' },
  'status.phase.body': {
    cs: 'Bundle uzavřen 2026-06-06 ve 13:00 CEST. 13/13 task specs accepted Criticem. Tým běží na file-based coordination (žádné centralní DB) přes claude_runner_scope.json + queued/in_progress/done/reviews/.',
    en: 'Bundle closed 2026-06-06 at 13:00 CEST. 13/13 task specs accepted by Critic. The team runs file-based coordination (no central DB) via claude_runner_scope.json + queued/in_progress/done/reviews/.',
  },
  'status.stats.loc': { cs: 'LOC TypeScript', en: 'LOC TypeScript' },
  'status.stats.tests': { cs: 'Testy passing', en: 'Tests passing' },
  'status.stats.wall': { cs: 'Wall time bundle', en: 'Bundle wall time' },
  'status.stats.commits': { cs: 'Git commits', en: 'Git commits' },
  'status.stats.rescues': { cs: 'Architect rescues', en: 'Architect rescues' },

  'status.works.label': { cs: 'Co funguje', en: 'What works' },
  'status.works.h': { cs: 'Jedenáct shared services.', en: 'Eleven shared services.' },
  'status.works.body': {
    cs: 'Všechny běží uvnitř Electron main procesu. Moduly k nim získají referenci přes ModuleContext. Crash izolace per modul, nikdy ne per shared service.',
    en: 'All run inside the Electron main process. Modules get references via ModuleContext. Crash isolation is per module, never per shared service.',
  },

  'status.next.label': { cs: 'Další bundle', en: 'Next bundle' },
  'status.next.h': { cs: 'ShowX-2 · EventX Bridge module', en: 'ShowX-2 · EventX Bridge module' },
  'status.next.body': {
    cs: '15 task specs hotových v queued/. Scope zatím disabled — startuje post-Kongres 2026-06-17. Cílem je BridgeX 0.3.x source → src/modules/eventx-bridge/ s parity test harnessem proti BridgeX 0.3.23.',
    en: '15 task specs ready in queued/. Scope is disabled for now — starts post-Kongres 2026-06-17. Goal: BridgeX 0.3.x source → src/modules/eventx-bridge/ with a parity test harness against BridgeX 0.3.23.',
  },

  'status.coming.label': { cs: 'Co následuje', en: 'What is coming' },
  'status.coming.h': { cs: 'Tři bundles do public bety.', en: 'Three bundles to public beta.' },
  'status.coming.b3.title': { cs: 'ShowX-3 · Cuelist Core', en: 'ShowX-3 · Cuelist Core' },
  'status.coming.b3.body': {
    cs: 'Show document, cuelist, cue + payloads, REHEARSAL mode, per-department views, multi-op Yjs sync. Cíl: Q1 2027.',
    en: 'Show document, cuelist, cue + payloads, REHEARSAL mode, per-department views, multi-op Yjs sync. Target: Q1 2027.',
  },
  'status.coming.b4.title': { cs: 'ShowX-4 · SHOW mode', en: 'ShowX-4 · SHOW mode' },
  'status.coming.b4.body': {
    cs: 'Lock + edit proposal queue + history snapshots + per-station GO autorita. Cíl: Q2 2027.',
    en: 'Lock + edit proposal queue + history snapshots + per-station GO authority. Target: Q2 2027.',
  },
  'status.coming.b5.title': { cs: 'ShowX-5 · Custom Router', en: 'ShowX-5 · Custom Router' },
  'status.coming.b5.body': {
    cs: 'WD-style rule table pro OSC↔MIDI↔DMX glue mimo Cuelist sémantiku. Cíl: Q3 2027.',
    en: 'WD-style rule table for OSC↔MIDI↔DMX glue beyond Cuelist semantics. Target: Q3 2027.',
  },

  'status.parity.label': { cs: 'Parity target', en: 'Parity target' },
  'status.parity.h': { cs: 'ShowX 0.5 = BridgeX 0.3.x parity end-2026.', en: 'ShowX 0.5 = BridgeX 0.3.x parity end-2026.' },
  'status.parity.body': {
    cs: 'Existující BridgeX zákazníci dostanou free upgrade path. BridgeX 0.3.x zamrzlý post-Kongres — žádné nové fíčry, jen bugfixy. ShowX 0.5 internal release musí jet jejich show stejně jako BridgeX 0.3.23.',
    en: 'Existing BridgeX customers get a free upgrade path. BridgeX 0.3.x is frozen post-Kongres — no new features, bugfixes only. ShowX 0.5 internal release has to run their shows the same as BridgeX 0.3.23.',
  },

  'status.open.label': { cs: 'Otevřené otázky', en: 'Open questions' },
  'status.open.h': { cs: 'Pět věcí čeká na Architect rozhodnutí.', en: 'Five items waiting on Architect ruling.' },
  'status.open.body': {
    cs: 'Plný seznam (31 otázek) v decisions/2026-06-05_open_questions_architect.md. Tady je top-5 blokující ShowX-2 start.',
    en: 'Full list (31 questions) in decisions/2026-06-05_open_questions_architect.md. Top 5 blocking ShowX-2 start are below.',
  },
  'status.open.q22': { cs: 'Q22 — `outputs/html-renderer.ts` fate', en: 'Q22 — `outputs/html-renderer.ts` fate' },
  'status.open.q22.body': {
    cs: 'Supabase Realtime broadcast output. Cross-check EventX dashboard — pokud používá `html-renderer` kanál, migrovat jako shared/output-dispatcher/supabase-broadcast.ts. Pokud ne, retire.',
    en: 'Supabase Realtime broadcast output. Cross-check EventX dashboard — if it uses the `html-renderer` channel, migrate as shared/output-dispatcher/supabase-broadcast.ts. If not, retire.',
  },
  'status.open.q23': { cs: 'Q23 — `auth-manager.ts` placement', en: 'Q23 — `auth-manager.ts` placement' },
  'status.open.q23.body': {
    cs: 'Module-local v EventX Bridge (default) vs shell SecretStore + Cloud Sync precursor vs nová Identity core služba. Architect rozhoduje před ShowX-2 Phase 2.',
    en: 'Module-local in EventX Bridge (default) vs shell SecretStore + Cloud Sync precursor vs new Identity core service. Architect rules before ShowX-2 Phase 2.',
  },
  'status.open.q25': { cs: 'Q25 — OSC packet ordering', en: 'Q25 — OSC packet ordering' },
  'status.open.q25.body': {
    cs: 'Byte-diff parity test vs order-insensitive comparator (~300 LOC). Nondeterminism v BridgeX 0.3.x = order-insensitive. Default je byte-diff first.',
    en: 'Byte-diff parity test vs order-insensitive comparator (~300 LOC). Nondeterminism in BridgeX 0.3.x = order-insensitive. Default is byte-diff first.',
  },
  'status.open.q26': { cs: 'Q26 — YAML profile pipeline retirement', en: 'Q26 — YAML profile pipeline retirement' },
  'status.open.q26.body': {
    cs: '~2,800 LOC legacy YAML-profile kódu (aggregation/, calibration/, channels/, mapping/, outputs/profile-side, atd.). Spec doporučuje retire vše. Risk: pokud byť jeden zákazník používá YAML profily, retire = breakage. Customer interview pre-Kongres.',
    en: '~2,800 LOC legacy YAML-profile code (aggregation/, calibration/, channels/, mapping/, outputs/profile-side, etc.). Spec recommends full retire. Risk: if even one customer uses YAML profiles, retire = breakage. Customer interview pre-Kongres.',
  },
  'status.open.q31': { cs: 'Q31 — Forge wall-time pattern', en: 'Q31 — Forge wall-time pattern' },
  'status.open.q31.body': {
    cs: 'Forge cycle 1 timed out 20 min bez output při B001-001. Hypothesis: cost přečtení 5005 řádků speců. Mitigace = task spec hint "skip docs/specs/" pro tooling tasks.',
    en: 'Forge cycle 1 timed out 20 min with no output on B001-001. Hypothesis: cost of reading 5005 lines of specs. Mitigation = task spec hint "skip docs/specs/" for tooling tasks.',
  },

  // Downloads
  'dl.title': { cs: 'Ke stažení', en: 'Downloads' },
  'dl.label': { cs: 'Releases · roadmap', en: 'Releases · roadmap' },
  'dl.headline.line1': { cs: 'Ke stažení.', en: 'Downloads.' },
  'dl.headline.line2': { cs: 'Časem.', en: 'Eventually.' },
  'dl.intro': {
    cs: 'ShowX 0.1 (první public binary) přijde Q1 2027. Než to bude, dev preview přes source clone je jediná cesta. Žádný DMG, žádný notarized binary, žádný auto-update — ne dřív, než ShowX 0.5 internal release end-2026.',
    en: 'ShowX 0.1 (first public binary) lands Q1 2027. Until then, dev preview via source clone is the only path. No DMG, no notarized binary, no auto-update — not before ShowX 0.5 internal release end-2026.',
  },
  'dl.roadmap.label': { cs: 'Release roadmap', en: 'Release roadmap' },
  'dl.roadmap.h': { cs: 'Pět releases do public bety.', en: 'Five releases to public beta.' },
  'dl.dev.label': { cs: 'Dev preview', en: 'Dev preview' },
  'dl.dev.h': { cs: 'Spuštění přes source clone.', en: 'Run from source clone.' },
  'dl.dev.body': {
    cs: 'Žádné public binaries. Naklonujte privátní repo, spusťte 8 příkazů, sledujte boot. Návod krok-za-krokem je na /try-it.',
    en: 'No public binaries. Clone the private repo, run 8 commands, watch the boot. Step-by-step guide at /try-it.',
  },
  'dl.dev.cta': { cs: 'Návod /try-it →', en: 'Walkthrough /try-it →' },
  'dl.bundle.label': { cs: 'Live bundle progress', en: 'Live bundle progress' },
  'dl.bundle.h': { cs: 'ShowX-1 Foundation: 13/13 ✅', en: 'ShowX-1 Foundation: 13/13 ✅' },
  'dl.bundle.body': {
    cs: 'Foundation bundle uzavřen 2026-06-06: 13/13 accepted. Architect + Forge + Critic file-based workflow. ~12,500 LOC TypeScript + 269 testů passing. Bundle ShowX-2 (BridgeX absorption) startuje post-Kongres 2026-06-17.',
    en: 'Foundation bundle closed 2026-06-06: 13/13 accepted. Architect + Forge + Critic file-based workflow. ~12,500 LOC TypeScript + 269 tests passing. Bundle ShowX-2 (BridgeX absorption) starts post-Kongres 2026-06-17.',
  },
  'dl.dmg.label': { cs: 'Kdy DMG', en: 'When DMG' },
  'dl.dmg.h': { cs: 'End-2026 internal, Q1 2027 public.', en: 'End-2026 internal, Q1 2027 public.' },
  'dl.dmg.body': {
    cs: 'Apple Developer ID rebrand z BridgeX (bundle ID + signing identity) + notarizace přes Apple notary service = task specs B002-014/015 (queued). Cíl: signed + notarized DMG ship s ShowX 0.5 internal end-2026. Veřejně dostupný DMG až s ShowX 0.1 public Q1 2027.',
    en: 'Apple Developer ID rebrand from BridgeX (bundle ID + signing identity) + Apple notary service notarization = task specs B002-014/015 (queued). Goal: signed + notarized DMG ships with ShowX 0.5 internal end-2026. Publicly available DMG only with ShowX 0.1 public Q1 2027.',
  },

  // Docs page
  'docs.title': { cs: 'Dokumentace', en: 'Documentation' },
  'docs.label': { cs: 'Resources', en: 'Resources' },
  'docs.headline.line1': { cs: 'Dokumentace.', en: 'Documentation.' },
  'docs.headline.line2': { cs: 'Architektura. Specy.', en: 'Architecture. Specs.' },
  'docs.intro': {
    cs: 'ShowX vyvíjíme veřejně. Specy, architektura, modul SDK, protokoly i postup bundle review jsou v privátním GitHub repu (přístup přes XLAB pozvánku). Tady jsou rozcestníky.',
    en: 'We build ShowX in the open. Specs, architecture, module SDK, protocols, and bundle review status all live in the private GitHub repo (access via XLAB invite). Here are the entry points.',
  },

  // Common
  'status.live': { cs: 'V provozu', en: 'Live' },
  'status.beta': { cs: 'Beta', en: 'Beta' },
  'status.planned': { cs: 'Plánováno', en: 'Planned' },
  'status.scaffolding': { cs: 'Scaffold', en: 'Scaffold' },
  'status.development': { cs: 'Vývoj', en: 'In development' },
  'common.coming': { cs: 'Brzy', en: 'Coming' },
  'common.yes': { cs: 'Ano', en: 'Yes' },
  'common.no': { cs: 'Ne', en: 'No' },
  'common.partial': { cs: 'Částečně', en: 'Partial' },
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('showx-lang') : null
    return saved === 'cs' || saved === 'en' ? saved : 'en'
  })

  useEffect(() => {
    document.documentElement.lang = lang
    localStorage.setItem('showx-lang', lang)
  }, [lang])

  const t = (key: string) => dict[key]?.[lang] ?? key

  return <I18nCtx.Provider value={{ lang, setLang: setLangState, t }}>{children}</I18nCtx.Provider>
}

export function useI18n() {
  return useContext(I18nCtx)
}
