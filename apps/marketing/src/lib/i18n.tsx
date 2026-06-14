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
  'nav.features': { cs: 'Funkce', en: 'Features' },
  'nav.guide': { cs: 'Návod', en: 'Guide' },
  'nav.scenarios': { cs: 'Scénáře', en: 'Scenarios' },
  'nav.preview': { cs: 'Požádat o přístup →', en: 'Request preview access →' },

  // Footer
  'footer.tagline': {
    cs: 'LAN-first FOH show-control na Macu — cuelist, timecode, cue lights a AI showcaller. v0.7.0 internal preview pro testery, ne v prodeji.',
    en: 'LAN-first FOH show control on a Mac — cuelist, timecode, cue lights and an AI showcaller. v0.7.0 internal preview for testers, not for sale.',
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
    cs: '© 2026 XLAB · ShowX v0.7.0 internal preview — cuelist + timecode + cue lights + AI showcaller hotové, public 1.0 později',
    en: '© 2026 XLAB · ShowX v0.7.0 internal preview — cuelist + timecode + cue lights + AI showcaller built, public 1.0 later',
  },
  'footer.region': { cs: 'LAN-first runtime · Postaveno v Praze', en: 'LAN-first runtime · Built in Prague' },
  'footer.brand-note': {
    cs: 'ShowX — FOH show-control z rodiny XLAB.',
    en: 'ShowX — FOH show control from the XLAB family.',
  },

  // Home — hero
  'home.label': {
    cs: 'ShowX · internal preview · v0.7.0',
    en: 'ShowX · internal preview · v0.7.0',
  },
  'home.hero.line1': { cs: 'Cuelist, timecode,', en: 'Cuelist, timecode,' },
  'home.hero.line2': { cs: 'cue lights, AI showcaller.', en: 'cue lights, AI showcaller.' },
  'home.hero.line3': { cs: 'LAN-first na Macu.', en: 'LAN-first on a Mac.' },
  'home.hero.copy': {
    cs: 'LAN-first FOH show-control na Macu — cuelist, timecode, cue lights a AI showcaller. Stanice běží v jakémkoli prohlížeči, žádná instalace pro operátory. ShowX v0.7.0 internal preview má celý feature set postavený (F1–F4 + LTC, ~2240 testů). Je to skutečná aplikace s DMG — stáhněte, otevřete show a párujte stanice po LAN.',
    en: 'LAN-first FOH show control on a Mac — cuelist, timecode, cue lights and an AI showcaller. Stations run in any browser, zero install for operators. ShowX v0.7.0 internal preview ships the full feature set (F1–F4 + LTC, ~2240 tests). It is a real app with a DMG — download it, open a show, and pair stations over your LAN.',
  },
  'home.cta.try': { cs: 'Stáhnout + spustit →', en: 'Download + run →' },
  'home.cta.status': { cs: 'Live status', en: 'Live status' },

  // Home — status panel (live mock)
  'home.live.status': { cs: 'Co je hotové', en: "What's built" },
  'home.live.cuelist': { cs: 'Cuelist + payloady', en: 'Cuelist + payloads' },
  'home.live.timecode': { cs: 'Timecode (MTC/LTC)', en: 'Timecode (MTC/LTC)' },
  'home.live.cuelights': { cs: 'Cue lights', en: 'Cue lights' },
  'home.live.ai': { cs: 'AI showcaller', en: 'AI showcaller' },
  'home.live.tests': { cs: 'Testy (~2240)', en: 'Tests (~2240)' },
  'home.live.dmg': { cs: 'DMG build', en: 'DMG build' },
  'home.live.signing': { cs: 'Podpis + notarizace', en: 'Signing + notarization' },
  'home.live.ltchw': { cs: 'LTC live-signal lock', en: 'LTC live-signal lock' },
  'home.live.ok': { cs: 'OK', en: 'OK' },
  'home.live.wip': { cs: 'WIP', en: 'WIP' },
  'home.live.no': { cs: '—', en: '—' },
  'home.live.footnote': {
    cs: 'v0.7.0 internal · F1–F4 + LTC postaveno',
    en: 'v0.7.0 internal · F1–F4 + LTC built',
  },

  // Home — today (what's live)
  'home.today.label': { cs: '02 — Co je živé', en: "02 — What's live" },
  'home.today.h1': { cs: 'Celý show workflow.', en: 'The whole show workflow.' },
  'home.today.h2': { cs: 'Postaveno a otestováno.', en: 'Built and tested.' },
  'home.today.intro': {
    cs: 'v0.7.0 internal preview má celý feature set postavený napříč F1–F4 + LTC. Sem patří, co aplikace skutečně umí už teď — od cuelistu po AI showcaller.',
    en: 'v0.7.0 internal preview ships the full feature set across F1–F4 + LTC. This is what the app actually does today — from cuelist to AI showcaller.',
  },
  'home.today.t1': { cs: 'Multi-operator cuelist', en: 'Multi-operator cuelist' },
  'home.today.t1.body': {
    cs: 'Jeden sdílený show doc, per-department views (LX/SX/VIDEO/PYRO/FS/AUTO), REHEARSAL ↔ SHOW režim, compound cues. Payloady: OSC, MIDI, MSC, DMX (Art-Net + sACN), webhook, wait, group, lx_ref. Triggery: GO, auto-follow, auto-continue, timecode, hotkey.',
    en: 'One shared show doc, per-department views (LX/SX/VIDEO/PYRO/FS/AUTO), REHEARSAL ↔ SHOW mode, compound cues. Payloads: OSC, MIDI, MSC, DMX (Art-Net + sACN), webhook, wait, group, lx_ref. Triggers: GO, auto-follow, auto-continue, timecode, hotkey.',
  },
  'home.today.t2': { cs: 'Browser stanice, žádná instalace', en: 'Browser stations, zero install' },
  'home.today.t2.body': {
    cs: 'PWA v jakémkoli prohlížeči (iPad/Mac/Win), mDNS discovery, QR + PIN párování, local-first (Yjs CRDT) — show běží, i když spadne Wi-Fi. GO ergonomie: armed GO, Back, hold-to-GO, panic, disarm, audition (náhled GO bez reálného výstupu).',
    en: 'PWA in any browser (iPad/Mac/Win), mDNS discovery, QR + PIN pairing, local-first (Yjs CRDT) — the show runs even if Wi-Fi drops. GO ergonomics: armed GO, Back, hold-to-GO, panic, disarm, audition (preview GO with no real output).',
  },
  'home.today.t3': { cs: 'Časová vrstva: MTC + LTC', en: 'Time layer: MTC + LTC' },
  'home.today.t3.body': {
    cs: 'Hlavní hodiny, velký timecode displej (HH:MM:SS:FF) na všech views, MTC chase IN + generování OUT, LTC chase IN + generování OUT, timecode-triggered cues, show-time OSC broadcast, odpočtová stanice (Raspberry Pi kiosk recipe v docs).',
    en: 'Master clock, big timecode display (HH:MM:SS:FF) on all views, MTC chase IN + generate OUT, LTC chase IN + generate OUT, timecode-triggered cues, show-time OSC broadcast, countdown-only view (Raspberry Pi kiosk recipe in docs).',
  },
  'home.today.t4': { cs: 'Cue lights (standby → potvrzení → GO)', en: 'Cue lights (standby → ack → GO)' },
  'home.today.t4.body': {
    cs: 'SM pošle STANDBY oddělení → stanice operátora ukáže velký STANDBY + POTVRDIT → SM vidí, kdo je připraven → GO. Softwarové cue lights jako moderní náhrada za ukončený ETC CueSystem.',
    en: 'SM sends STANDBY to a department → the operator station shows a big STANDBY + ACKNOWLEDGE → SM sees who is ready → GO. Software cue lights as the modern replacement for the discontinued ETC CueSystem.',
  },
  'home.today.t5': { cs: 'AI showcaller (Pro+)', en: 'AI showcaller (Pro+)' },
  'home.today.t5.body': {
    cs: 'Caller script per cue, generování ze scénáře (agregace souběžných marků), volitelný LLM draft (Claude) pro přirozené fráze, klonování hlasu (ElevenLabs), předgenerování při zkoušce → lokální přehrávání při show (žádný internet, žádná latence), interrupt (převzetí <200 ms), intercom výstup.',
    en: 'Caller script per cue, generate from the sheet (aggregates simultaneous marks), optional LLM draft (Claude) for natural phrasing, voice clone (ElevenLabs), rehearsal pre-generation → local playback at show (no internet, no latency), interrupt (take over <200 ms), intercom out.',
  },
  'home.today.t6': { cs: 'Trust, safety, import/export', en: 'Trust, safety, import/export' },
  'home.today.t6.body': {
    cs: 'Per-device health (zelená/červená), potvrzený stav (OSC reply), multi-destination patch (primární + záloha, failover), předshow health check wizard, SHOW-mode návrhy změn, oprávnění operátorů. CSV import (QLab + Eos), JSON/PDF export, otevření `.showx` balíčku.',
    en: 'Per-device health (green/red), confirmed state (OSC reply), multi-destination patch (primary + backup, failover), pre-show health check wizard, SHOW-mode proposals, per-operator authority. CSV import (QLab + Eos), JSON/PDF export, open a `.showx` package.',
  },

  // Home — not yet (honest pending)
  'home.not.label': { cs: '03 — Co je ještě pending', en: "03 — What's still pending" },
  'home.not.h1': { cs: 'Buďme upřímní:', en: "Let's be honest:" },
  'home.not.h2': { cs: 'tohle ještě dolaďujeme.', en: 'this is still being finished.' },
  'home.not.signing': { cs: 'Podpis + notarizace', en: 'Signing + notarization' },
  'home.not.signing.body': {
    cs: 'DMG je zatím nepodepsaný (internal). Při prvním otevření: pravý klik → Otevřít, nebo `xattr -dr com.apple.quarantine`. Podepsaný + notarizovaný build je pending.',
    en: 'The DMG is unsigned for now (internal). First open: right-click → Open, or `xattr -dr com.apple.quarantine`. A signed + notarized build is pending.',
  },
  'home.not.ltchw': { cs: 'LTC live-signal na HW', en: 'LTC live-signal on hardware' },
  'home.not.ltchw.body': {
    cs: 'LTC chase IN + generování OUT jsou postavené; live-signal lock na reálném audio interface se ještě validuje na hardwaru. Vyžaduje audio interface.',
    en: 'LTC chase IN + generate OUT are built; the live-signal lock on a real audio interface is still being validated on hardware. Needs an audio interface.',
  },
  'home.not.keys': { cs: 'AI vyžaduje klíče', en: 'AI needs API keys' },
  'home.not.keys.body': {
    cs: 'AI showcaller potřebuje vlastní klíče: ElevenLabs (klonování hlasu) a volitelně Anthropic (LLM draft). Bez nich se tyto funkce elegantně vypnou — zbytek běží.',
    en: 'The AI showcaller needs your own keys: ElevenLabs (voice clone) and optionally Anthropic (LLM draft). Without them those features gracefully disable — the rest still runs.',
  },
  'home.not.public': { cs: 'Není to public 1.0', en: 'Not public 1.0 yet' },
  'home.not.public.body': {
    cs: 'v0.7.0 je internal preview pro testery, ne veřejný prodej. Public 1.0 přijde později (rundown vrstva, živý pricing, produktový web).',
    en: 'v0.7.0 is an internal preview for testers, not a public sale. Public 1.0 comes later (rundown layer, live pricing, product web).',
  },
  'home.not.repo': { cs: 'Preview přes pozvánku', en: 'Preview by invite' },
  'home.not.repo.body': {
    cs: 'Přístup k preview je přes XLAB pozvánku — pošlete email a přidáme vás do testovacího cohortu.',
    en: 'Preview access is via XLAB invite — email us and we add you to the tester cohort.',
  },

  // Home — get seat
  'home.seat.label': { cs: '04 — Přístup', en: '04 — Get a seat' },
  'home.seat.h1': { cs: 'Žádný registrační', en: 'No signup' },
  'home.seat.h2': { cs: 'formulář. Email.', en: 'form. Email.' },
  'home.seat.body': {
    cs: 'Žádný portál, žádný onboarding flow. Napište nám, kdo jste, jaký venue / role, a co byste chtěli z ShowX vidět. Když to dává smysl, přidáme vás do testovacího cohortu a pošleme DMG.',
    en: 'No portal, no onboarding flow. Email us who you are, what venue / role, and what you want to see from ShowX. If it fits, we add you to the tester cohort and send the DMG.',
  },
  'home.seat.cta': { cs: 'Napsat o preview přístup', en: 'Email for preview access' },

  // Home — feature pillars
  'home.bundle.label': { cs: '05 — Postaveno', en: '05 — Built' },
  'home.bundle.h1': { cs: 'Čtyři vrstvy.', en: 'Four layers.' },
  'home.bundle.h2': { cs: 'Všechny hotové.', en: 'All built.' },
  'home.bundle.b1.title': { cs: 'Cuelist Core', en: 'Cuelist Core' },
  'home.bundle.b1.status': { cs: 'F1 · live ✅', en: 'F1 · live ✅' },
  'home.bundle.b1.body': {
    cs: 'Multi-operator cuelist, compound cues, payloady (OSC/MIDI/MSC/DMX/webhook), triggery, browser stanice, REHEARSAL ↔ SHOW režim.',
    en: 'Multi-operator cuelist, compound cues, payloads (OSC/MIDI/MSC/DMX/webhook), triggers, browser stations, REHEARSAL ↔ SHOW mode.',
  },
  'home.bundle.b2.title': { cs: 'Časová vrstva', en: 'Time layer' },
  'home.bundle.b2.status': { cs: 'F2 + LTC · live ✅', en: 'F2 + LTC · live ✅' },
  'home.bundle.b2.body': {
    cs: 'Hlavní hodiny, velký timecode, MTC + LTC chase IN/generování OUT, timecode-triggered cues, odpočtová stanice. (LTC live-signal lock se validuje na HW.)',
    en: 'Master clock, big timecode, MTC + LTC chase IN / generate OUT, timecode-triggered cues, countdown view. (LTC live-signal lock validating on HW.)',
  },
  'home.bundle.b3.title': { cs: 'Trust + cue lights', en: 'Trust + cue lights' },
  'home.bundle.b3.status': { cs: 'F3 · live ✅', en: 'F3 · live ✅' },
  'home.bundle.b3.body': {
    cs: 'Per-device health, potvrzený stav, multi-destination failover, předshow check, cue lights (standby → potvrzení → GO), oprávnění operátorů.',
    en: 'Per-device health, confirmed state, multi-destination failover, pre-show check, cue lights (standby → ack → GO), per-operator authority.',
  },
  'home.bundle.b4.title': { cs: 'AI showcaller', en: 'AI showcaller' },
  'home.bundle.b4.status': { cs: 'F4 · live ✅ (Pro+)', en: 'F4 · live ✅ (Pro+)' },
  'home.bundle.b4.body': {
    cs: 'Caller script per cue, generování ze scénáře, LLM draft (Claude), klonování hlasu (ElevenLabs), předgenerování → lokální přehrávání, interrupt, intercom out.',
    en: 'Caller script per cue, generate from the sheet, LLM draft (Claude), voice clone (ElevenLabs), pre-gen → local playback, interrupt, intercom out.',
  },

  // Home — roadmap (remaining)
  'home.roadmap.label': { cs: '06 — Co zbývá', en: "06 — What's left" },
  'home.roadmap.h1': { cs: 'Internal teď.', en: 'Internal now.' },
  'home.roadmap.h2': { cs: 'Public 1.0 později.', en: 'Public 1.0 later.' },
  'home.roadmap.t1': { cs: 'Teď · v0.7.0', en: 'Now · v0.7.0' },
  'home.roadmap.t1.body': { cs: 'Internal preview pro testery. Celý feature set postaven (F1–F4 + LTC), ~2240 testů.', en: 'Internal preview for testers. Full feature set built (F1–F4 + LTC), ~2240 tests.' },
  'home.roadmap.t2': { cs: 'Pending · podpis', en: 'Pending · signing' },
  'home.roadmap.t2.body': { cs: 'Podepsaný + notarizovaný DMG (Apple Developer ID). Než to bude, nepodepsaný internal build.', en: 'Signed + notarized DMG (Apple Developer ID). Until then, an unsigned internal build.' },
  'home.roadmap.t3': { cs: 'Pending · LTC HW', en: 'Pending · LTC HW' },
  'home.roadmap.t3.body': { cs: 'LTC live-signal lock validovaný na reálném audio interface.', en: 'LTC live-signal lock validated on a real audio interface.' },
  'home.roadmap.t4': { cs: 'Příště · rundown', en: 'Next · rundown' },
  'home.roadmap.t4.body': { cs: 'Rundown vrstva nad cuelistem — strukturovaný běh show.', en: 'Rundown layer on top of the cuelist — structured show running order.' },
  'home.roadmap.t5': { cs: 'Příště · pricing', en: 'Next · pricing' },
  'home.roadmap.t5.body': { cs: 'Živý pricing + plány (Free / Pro / Production / Team).', en: 'Live pricing + plans (Free / Pro / Production / Team).' },
  'home.roadmap.t6': { cs: 'Cíl · public 1.0', en: 'Goal · public 1.0' },
  'home.roadmap.t6.body': { cs: 'Veřejný produktový web + public 1.0 release. (EventX integrace je dál na roadmapě.)', en: 'Public product web + public 1.0 release. (EventX integration remains further out on the roadmap.)' },

  // Home — footer CTA
  'home.foot.label': { cs: '07 — Další kroky', en: '07 — Next steps' },
  'home.foot.h1': { cs: 'Stáhnout DMG.', en: 'Download the DMG.' },
  'home.foot.h2': { cs: 'Číst docs.', en: 'Read the docs.' },
  'home.foot.try': { cs: 'Návod k instalaci →', en: 'Install guide →' },
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
