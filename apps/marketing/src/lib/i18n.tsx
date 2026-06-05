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
  'nav.features': { cs: 'Funkce', en: 'Features' },
  'nav.pricing': { cs: 'Ceník', en: 'Pricing' },
  'nav.compare': { cs: 'Srovnání', en: 'Compare' },
  'nav.get-started': { cs: 'Začínáme', en: 'Get started' },
  'nav.downloads': { cs: 'Ke stažení', en: 'Downloads' },
  'nav.docs': { cs: 'Dokumentace', en: 'Docs' },
  'nav.beta': { cs: 'Beta →', en: 'Join beta →' },

  // Footer
  'footer.tagline': {
    cs: 'LAN-first FOH platforma pro živé show. Cuelist, který vidí každý v sále po svém. Navrženo a provozováno XLAB.',
    en: 'LAN-first FOH platform for live shows. A cuelist everyone in the room sees through their own lens. Designed and operated by XLAB.',
  },
  'footer.product': { cs: 'Produkt', en: 'Product' },
  'footer.resources': { cs: 'Zdroje', en: 'Resources' },
  'footer.contact': { cs: 'Kontakt', en: 'Contact' },
  'footer.support': { cs: 'Podpora', en: 'Support' },
  'footer.partner': { cs: 'Partner program', en: 'Partner program' },
  'footer.brand': { cs: 'Brand kit', en: 'Brand kit' },
  'footer.github': { cs: 'GitHub', en: 'GitHub' },
  'footer.copy': {
    cs: '© 2026 XLAB · ShowX 0.1 preview — vývoj, public release Q1 2027',
    en: '© 2026 XLAB · ShowX 0.1 preview — in development, public release Q1 2027',
  },
  'footer.region': { cs: 'LAN-first runtime · Postaveno v Praze', en: 'LAN-first runtime · Built in Prague' },
  'footer.brand-note': {
    cs: 'EventX + ShowX — sourozenecké produkty z rodiny XLAB.',
    en: 'EventX + ShowX — sibling products from the XLAB family.',
  },

  // Home
  'home.label': { cs: 'FOH platforma · 0.1 preview', en: 'FOH platform · v0.1 preview' },
  'home.hero.line1': { cs: 'Cuelist pro každého', en: 'Cuelist for everyone' },
  'home.hero.line2': { cs: 'v sále.', en: 'in the room.' },
  'home.hero.copy': {
    cs: 'ShowX je LAN-first FOH platforma pro živé show — každé oddělení vidí show po svém, Stage Manager volá GO napříč všemi, a jediná podepsaná aplikace na FOH Macu obsluhuje všechny kabely.',
    en: 'ShowX is the LAN-first FOH platform for live shows — every department sees the show through their own lens, the Stage Manager calls GO across all of them, and a single signed app on the FOH Mac handles the wires.',
  },
  'home.cta.beta': { cs: 'Přidat se do bety →', en: 'Join beta →' },
  'home.cta.compare': { cs: 'Jak se to liší', en: 'How it compares' },
  'home.live.status': { cs: 'FOH Mac stav', en: 'FOH Mac status' },
  'home.live.broker': { cs: 'Sync broker', en: 'Sync broker' },
  'home.live.mdns': { cs: 'mDNS discovery', en: 'mDNS discovery' },
  'home.live.pairing': { cs: 'Lokální pairing', en: 'Local pairing' },
  'home.live.dispatch': { cs: 'Protokol dispatcher', en: 'Protocol dispatch' },
  'home.live.ok': { cs: 'OK', en: 'OK' },
  'home.live.footnote': {
    cs: 'LAN-first runtime · 8 protokolů · žádná WAN závislost',
    en: 'LAN-first runtime · 8 protocols · zero WAN dependency',
  },

  // Home — Who it's for
  'home.who.label': { cs: '02 — Pro koho', en: '02 — Who it serves' },
  'home.who.h1': { cs: 'Stage Manager.', en: 'Stage Manager.' },
  'home.who.h2': { cs: 'Tech ops. Producent.', en: 'Tech ops. Producer.' },
  'home.who.h3': { cs: 'Stejný show file, různé oči.', en: 'Same show file, different lenses.' },
  'home.who.sm': { cs: 'Pro Stage Managera', en: 'For Stage Managers' },
  'home.who.sm.body': {
    cs: 'Master view nad celým show. Standby + GO napříč LX/SX/Video. Prompt-book řádky vedle cue. Žádný papír, žádné slovní cue volání bez podpory.',
    en: 'Master view across the whole show. Standby + GO across LX/SX/Video. Prompt-book lines next to each cue. No paper, no unbacked verbal calls.',
  },
  'home.who.ops': { cs: 'Pro tech operátory', en: 'For tech ops' },
  'home.who.ops.body': {
    cs: 'Jeden iPad, jeden kontext. LX operátor vidí jen LX cue. Video operátor vidí jen video. Jeden cue „Q 47" může spustit i light, i zvuk, i video — každý vidí svůj payload.',
    en: 'One iPad, one context. LX op sees only LX cues. Video op sees only video. A single Q 47 can fire light + sound + video at once — each role sees its own payload.',
  },
  'home.who.prod': { cs: 'Pro producenty', en: 'For producers' },
  'home.who.prod.body': {
    cs: 'Jedna podepsaná aplikace na FOH Macu. Žádná cloud závislost na show day. Open .showx formát — když odejdete, váš show jde s vámi.',
    en: 'One signed app on the FOH Mac. No cloud dependency on show day. Open .showx file format — when you leave, the show leaves with you.',
  },

  // Home — Problem
  'home.problem.label': { cs: '03 — Mezera v trhu', en: '03 — Where the market fails' },
  'home.problem.h1': { cs: 'Cuelist tools', en: 'Cuelist tools' },
  'home.problem.h2': { cs: 'neumí mosty.', en: "don't bridge." },
  'home.problem.h3': { cs: 'Mosty neumí cuelist.', en: "Bridges don't cuelist." },
  'home.problem.body1': {
    cs: 'V roce 2026 si FOH operátor postaví show z QLab + Companion + Eos + papírového prompt book a slovních cue volání. Každý nástroj je nejlepší ve své vrstvě, ale žádný neřeší koordinaci. Když chcete jeden show file napříč LX, SX a Video s vlastním pohledem pro každou roli, narazíte na zeď.',
    en: 'In 2026 a FOH op stitches a show together from QLab + Companion + Eos + a paper prompt book and verbal cue calls. Each tool is best-in-class in its layer, but none of them solves coordination. The moment you want one show file across LX, SX and Video with a role-shaped view for each, you hit a wall.',
  },
  'home.problem.body2': {
    cs: 'ShowX zaplňuje mezeru, ne nahrazuje konzole. Lighting cue stále jede přes Eos. Sound cue stále jede přes QLab. ShowX je koordinační vrstva nad tím — jeden cuelist, který každý vidí po svém.',
    en: "ShowX fills the gap rather than replacing consoles. Lighting still fires from Eos. Sound still fires from QLab. ShowX is the coordination layer above — one cuelist, every role sees their own slice.",
  },

  // Home — Pillars
  'home.pillars.label': { cs: '04 — Tři pilíře', en: '04 — Three pillars' },
  'home.pillars.h1': { cs: 'Per-department views.', en: 'Per-department views.' },
  'home.pillars.h2': { cs: 'REHEARSAL ↔ SHOW.', en: 'REHEARSAL ↔ SHOW.' },
  'home.pillars.h3': { cs: 'LAN-first.', en: 'LAN-first.' },

  'home.pillars.views.label': { cs: 'Per-department views', en: 'Per-department views' },
  'home.pillars.views.p1': {
    cs: 'Jeden Show dokument. Každý cue má první-třídní department tag (LX, SX, VIDEO, AUTO, PYRO, FS, SM). Stanice operátora si pamatuje vlastní department — vidí jen své cue, plus to, co označí jako sledované.',
    en: 'One Show document. Every cue carries a first-class department tag (LX, SX, VIDEO, AUTO, PYRO, FS, SM). Each operator station remembers its own department — sees only owned cues plus anything it explicitly watches.',
  },
  'home.pillars.views.p2': {
    cs: 'Stage Manager vidí všechno, s prompt-book řádkem vedle cue. Žádný fork, žádný merge — jen filtr nad sdíleným dokumentem.',
    en: 'Stage Manager sees everything, with prompt-book line attached to each cue. No fork, no merge — just a filter over the shared document.',
  },

  'home.pillars.modes.label': { cs: 'REHEARSAL ↔ SHOW mode', en: 'REHEARSAL ↔ SHOW mode' },
  'home.pillars.modes.p1': {
    cs: 'REHEARSAL: plná Yjs CRDT kolaborace, optimistické UI, kdokoliv s edit právem může mutovat strukturu cuelistu, presence dots.',
    en: 'REHEARSAL: full Yjs CRDT collab, optimistic UI, anyone with edit perm can mutate cue structure, presence dots.',
  },
  'home.pillars.modes.p2': {
    cs: 'SHOW: cuelist zamčený jediným SM klikem. Edity payloadů jsou návrhy ke schválení. GO autorita je single-station. Cue jsou zasnapshotované. history.jsonl loguje každý event.',
    en: 'SHOW: cuelist locked with one SM click. Payload edits become proposals. GO authority is single-station. Cues are snapshotted. history.jsonl captures every event.',
  },

  'home.pillars.lan.label': { cs: 'LAN-first runtime', en: 'LAN-first runtime' },
  'home.pillars.lan.p1': {
    cs: 'Embedded y-websocket sync broker uvnitř ShowX Electron procesu. PWA stanice jsou servírované přes lokální HTTP. mDNS objevuje FOH Mac. Lokální pairing tokens. Žádná WAN, žádný Supabase account pro venue runtime.',
    en: 'Embedded y-websocket sync broker inside the ShowX Electron process. PWA stations served over local HTTP. mDNS finds the FOH Mac. Local pairing tokens. No WAN, no Supabase account needed for venue runtime.',
  },
  'home.pillars.lan.p2': {
    cs: 'Cloud Sync je opt-in modul, ne core path. Když WAN umře v půlce show, ShowX dál běží.',
    en: 'Cloud Sync is an opt-in module, not the core path. When the WAN dies mid-show, ShowX keeps running.',
  },

  // Home — How it works
  'home.how.label': { cs: '05 — Jak to funguje', en: '05 — How it works' },
  'home.how.h1': { cs: 'Jedna podepsaná aplikace.', en: 'One signed app.' },
  'home.how.h2': { cs: 'Tolik stanic, kolik chcete.', en: 'As many stations as you want.' },
  'home.how.station': { cs: 'PWA stanice', en: 'PWA stations' },
  'home.how.station.body': { cs: 'iPad nebo prohlížeč. SM master view + per-operator filtrované views.', en: 'iPad or browser. SM master view + per-operator filtered views.' },
  'home.how.broker': { cs: 'Embedded sync broker', en: 'Embedded sync broker' },
  'home.how.broker.body': { cs: 'y-websocket node uvnitř Electron procesu. Žádné externí brokery.', en: 'y-websocket node inside the Electron process. No external broker.' },
  'home.how.dispatch': { cs: 'Protokol dispatcher', en: 'Protocol dispatcher' },
  'home.how.dispatch.body': { cs: 'OSC / MIDI / DMX / MSC / sACN / Art-Net / LTC. Jeden modul, sdílený všemi.', en: 'OSC / MIDI / DMX / MSC / sACN / Art-Net / LTC. One module, shared by all.' },
  'home.how.down': { cs: 'Downstream hardware', en: 'Downstream hardware' },
  'home.how.down.body': { cs: 'Eos / grandMA / Disguise / QLab. ShowX neraplační — fires by reference.', en: 'Eos / grandMA / Disguise / QLab. ShowX never renders — fires by reference.' },

  // Home — Modules
  'home.modules.label': { cs: '06 — Moduly', en: '06 — Modules' },
  'home.modules.h1': { cs: 'Pět modulů.', en: 'Five modules.' },
  'home.modules.h2': { cs: 'Jeden podepsaný binary.', en: 'One signed binary.' },
  'home.modules.eventx-bridge': { cs: 'EventX Bridge', en: 'EventX Bridge' },
  'home.modules.eventx-bridge.body': {
    cs: 'Absorbuje BridgeX 0.3.x. Subscribuje EventX Supabase changes, dispatchuje OSC/MIDI/DMX. Free tier.',
    en: 'Absorbs BridgeX 0.3.x. Subscribes to EventX Supabase changes, dispatches OSC/MIDI/DMX. Free tier.',
  },
  'home.modules.cuelist-core': { cs: 'Cuelist Core', en: 'Cuelist Core' },
  'home.modules.cuelist-core.body': {
    cs: 'Show dokument, cuelist, cue + payloads, REHEARSAL mode. Free pro jednoho operátora.',
    en: 'Show document, cuelist, cue + payloads, REHEARSAL mode. Free for single operator.',
  },
  'home.modules.show-mode': { cs: 'SHOW mode', en: 'SHOW mode' },
  'home.modules.show-mode.body': {
    cs: 'Lock + edit proposal queue + history snapshots. Pro+.',
    en: 'Lock + edit proposal queue + history snapshots. Pro+.',
  },
  'home.modules.router': { cs: 'Custom Router', en: 'Custom Router' },
  'home.modules.router.body': {
    cs: 'WD-style rule table pro OSC↔MIDI↔DMX glue mimo Cuelist sémantiku. Pro+.',
    en: 'WD-style rule table for OSC↔MIDI↔DMX glue beyond Cuelist semantics. Pro+.',
  },
  'home.modules.cloud': { cs: 'Cloud Sync', en: 'Cloud Sync' },
  'home.modules.cloud.body': {
    cs: 'Opt-in Supabase backup + cross-venue Yjs multi-provider stack. Pro+.',
    en: 'Opt-in Supabase backup + cross-venue Yjs multi-provider stack. Pro+.',
  },

  // Home — Why not
  'home.whynot.label': { cs: '07 — Proč ne …', en: '07 — Why not …' },
  'home.whynot.h1': { cs: 'QLab. CuePilot.', en: 'QLab. CuePilot.' },
  'home.whynot.h2': { cs: 'Companion. Eos.', en: 'Companion. Eos.' },
  'home.whynot.qlab.title': { cs: 'Proč ne QLab', en: 'Why not QLab' },
  'home.whynot.qlab.body': {
    cs: 'QLab 5 je nejlepší single-discipline cuelist na macOS. Není multi-operator (last-edit-wins), není per-department, je macOS-only. ShowX trianguluje QLab cuelist data model na web + collab + offline.',
    en: 'QLab 5 is the dominant single-discipline cuelist on macOS. Not multi-operator (last-edit-wins), not per-department, macOS-only. ShowX triangulates QLab cuelist data model onto web + collab + offline.',
  },
  'home.whynot.cuepilot.title': { cs: 'Proč ne CuePilot', en: 'Why not CuePilot' },
  'home.whynot.cuepilot.body': {
    cs: 'CuePilot vyřešil per-role views — pro broadcast. Cloud-native, enterprise pricing, broadcast-shaped UX (cue-jako-shot). ShowX vezme per-role pattern do theatre a corporate AV, LAN-first, dostupnou cenou.',
    en: 'CuePilot cracked per-role views — for broadcast. Cloud-native, enterprise pricing, broadcast-shaped UX (cue-as-shot). ShowX takes the per-role pattern into theatre and corporate AV, LAN-first, at an attainable price.',
  },
  'home.whynot.companion.title': { cs: 'Proč ne Companion', en: 'Why not Companion' },
  'home.whynot.companion.body': {
    cs: 'Bitfocus Companion je univerzální protokolový most. Není cuelist — buttons fire actions, žádný time-ordered show. ShowX přebírá protocol openness, nepřebírá button-grid mental model.',
    en: 'Bitfocus Companion is the universal protocol bridge. Not a cuelist — buttons fire actions, no time-ordered show. ShowX inherits the protocol openness, rejects the button-grid mental model.',
  },
  'home.whynot.eos.title': { cs: 'Proč ne Eos / MA', en: 'Why not Eos / MA' },
  'home.whynot.eos.body': {
    cs: 'Eos Apex a grandMA3 mají nejzralejší multi-user model v branži — pro lighting. ShowX je nikdy nepřebije v jejich oboru. Nepokouší se o to. ShowX volá LX cue na Eos referencí (cue list + cue number → OSC/MSC).',
    en: 'Eos Apex and grandMA3 own the most mature multi-user model in the industry — for lighting. ShowX will never beat them at their craft. It does not try to. ShowX fires LX cues on Eos by reference (cue list + cue number → OSC/MSC).',
  },

  // Home — Pricing teaser
  'home.pricing.label': { cs: '08 — Ceník', en: '08 — Pricing' },
  'home.pricing.h1': { cs: 'Free pokrývá', en: 'Free covers' },
  'home.pricing.h2': { cs: 'současný BridgeX use case.', en: "today's BridgeX use case." },
  'home.pricing.free': { cs: 'Free', en: 'Free' },
  'home.pricing.free.body': { cs: 'EventX Bridge + 1 cuelist REHEARSAL + 1 op', en: 'EventX Bridge + 1 cuelist REHEARSAL + 1 op' },
  'home.pricing.pro': { cs: '$29 / seat / mo', en: '$29 / seat / mo' },
  'home.pricing.pro.body': { cs: 'Všechny moduly, multi-op, SHOW mode', en: 'All modules, multi-op, SHOW mode' },
  'home.pricing.production': { cs: '$99 / show', en: '$99 / show' },
  'home.pricing.production.body': { cs: 'Jedna show, 7-day expiry, freelance SM', en: 'One show, 7-day expiry, freelance SM' },
  'home.pricing.team': { cs: '$499 / mo flat', en: '$499 / mo flat' },
  'home.pricing.team.body': { cs: 'Unlimited seats per venue, priority support', en: 'Unlimited seats per venue, priority support' },
  'home.pricing.detail': { cs: 'Detailní ceník →', en: 'See full pricing →' },

  // Home — Timeline
  'home.timeline.label': { cs: '09 — Časová osa', en: '09 — Timeline' },
  'home.timeline.h1': { cs: 'Q1 2027 první', en: 'Q1 2027 first' },
  'home.timeline.h2': { cs: 'placený pilot.', en: 'paid pilot.' },
  'home.timeline.body': {
    cs: 'Jsme upřímní: ShowX 0.1 ještě nedodáváme. ShowX shell + EventX Bridge module ship end-2026 jako 0.5 internal. Cuelist Core + REHEARSAL mode publicly Q1 2027. SHOW mode + první placený pilot Q2 2027. Public beta Q4 2027.',
    en: "We're honest: ShowX 0.1 isn't shipping yet. The ShowX shell + EventX Bridge module ship end-2026 as 0.5 internal. Cuelist Core + REHEARSAL mode publicly Q1 2027. SHOW mode + first paid pilot Q2 2027. Public beta Q4 2027.",
  },
  'home.timeline.t1': { cs: 'Q3-Q4 2026', en: 'Q3-Q4 2026' },
  'home.timeline.t1.body': { cs: 'BridgeX 0.3.x absorpce, Electron shell, sync broker, mDNS', en: 'BridgeX 0.3.x absorption, Electron shell, sync broker, mDNS' },
  'home.timeline.t2': { cs: 'End-2026', en: 'End-2026' },
  'home.timeline.t2.body': { cs: 'ShowX 0.5 internal — EventX Bridge parity validated', en: 'ShowX 0.5 internal — EventX Bridge parity validated' },
  'home.timeline.t3': { cs: 'Q1 2027', en: 'Q1 2027' },
  'home.timeline.t3.body': { cs: 'ShowX 0.1 public — Cuelist Core + REHEARSAL', en: 'ShowX 0.1 public — Cuelist Core + REHEARSAL' },
  'home.timeline.t4': { cs: 'Q2 2027', en: 'Q2 2027' },
  'home.timeline.t4.body': { cs: 'SHOW mode + první placený pilot', en: 'SHOW mode + first paid pilot' },
  'home.timeline.t5': { cs: 'Q4 2027', en: 'Q4 2027' },
  'home.timeline.t5.body': { cs: 'Public beta', en: 'Public beta' },

  // Home — Beta CTA
  'home.cta.label': { cs: '10 — Beta', en: '10 — Beta' },
  'home.cta.h1': { cs: 'Buďte mezi', en: 'Be in the' },
  'home.cta.h2': { cs: 'prvními padesáti.', en: 'first fifty.' },
  'home.cta.body': {
    cs: 'Hledáme 50 venues + freelance SMs, kteří se chtějí podívat na ShowX dřív, než půjde public. Theatres 50-800 sedadel, malá-střední corporate AV, divadelní festivaly. Napište nám a domluvíme 30-minutový hovor.',
    en: "We're looking for 50 venues + freelance SMs to see ShowX before it goes public. Theatres 50-800 seats, small-to-mid corporate AV, festival ops. Email us and we'll book a 30-minute call.",
  },
  'home.cta.email': { cs: 'Napsat o beta přístup', en: 'Email for beta access' },
  'home.cta.docs': { cs: 'Číst dokumentaci →', en: 'Read the docs →' },

  // Features page
  'features.title': { cs: 'Funkce', en: 'Features' },
  'features.label': { cs: 'ShowX 0.1 surface area', en: 'ShowX 0.1 surface area' },
  'features.headline.line1': { cs: 'Pět modulů.', en: 'Five modules.' },
  'features.headline.line2': { cs: 'Šest cross-cutting funkcí.', en: 'Six cross-cutting capabilities.' },
  'features.intro': {
    cs: 'ShowX 0.1 ships jako jeden signed Electron binary na FOH Macu, který načítá moduly podle vašeho tieru. Stanice běží jako PWA v prohlížeči. Vše je jednou kódovou základnou; nic není mock.',
    en: 'ShowX 0.1 ships as one signed Electron binary on the FOH Mac, loading modules based on your tier. Stations run as a PWA in any browser. One codebase; nothing is a mock.',
  },

  // Pricing page
  'pricing.title': { cs: 'Ceník', en: 'Pricing' },
  'pricing.label': { cs: 'Tier model', en: 'Tier model' },
  'pricing.headline.line1': { cs: 'Free pro každého', en: 'Free for everyone' },
  'pricing.headline.line2': { cs: 'kdo už používá BridgeX.', en: 'who already runs BridgeX.' },
  'pricing.intro': {
    cs: 'Free tier pokrývá současný BridgeX use case (EventX Bridge module). Pro tier je SaaS chleba — všechny moduly, multi-op, SHOW mode. Production je jednorázová show licence. Team je venue kontrakt.',
    en: "Free tier covers today's BridgeX use case (EventX Bridge module). Pro is the bread-and-butter SaaS — all modules, multi-op, SHOW mode. Production is the one-off show license. Team is the venue contract.",
  },
  'pricing.faq.label': { cs: 'FAQ', en: 'FAQ' },
  'pricing.faq.h': { cs: 'Často kladené otázky.', en: 'Frequently asked.' },

  // Compare page
  'compare.title': { cs: 'Srovnání', en: 'Compare' },
  'compare.label': { cs: 'FOH landscape 2026', en: 'FOH landscape 2026' },
  'compare.headline.line1': { cs: 'Žádný nástroj dnes', en: 'No tool today' },
  'compare.headline.line2': { cs: 'nedělá to, co ShowX dělá.', en: 'does what ShowX does.' },
  'compare.intro': {
    cs: 'V roce 2026 cuelist tools neumí mosty, mosty neumí cuelist, a konzole jsou single-discipline. Tady je srovnání jeden-k-jednomu napříč nejbližšími referencemi.',
    en: "In 2026 cuelist tools don't bridge, bridges don't cuelist, and consoles are single-discipline. Here's a one-to-one comparison across the closest references.",
  },

  // Get started page
  'gs.title': { cs: 'Začínáme', en: 'Get started' },
  'gs.label': { cs: 'Beta starts Q1 2027', en: 'Beta starts Q1 2027' },
  'gs.headline.line1': { cs: 'Beta startuje', en: 'Beta starts' },
  'gs.headline.line2': { cs: 'Q1 2027.', en: 'Q1 2027.' },
  'gs.intro': {
    cs: 'ShowX 0.1 je ještě v aktivním vývoji. Pokud chcete být mezi prvními 50 venues + freelance SMs, kteří dostanou přístup k preview build, postup je krátký.',
    en: "ShowX 0.1 is still in active development. If you want to be among the first 50 venues + freelance SMs to access the preview build, the path is short.",
  },

  // Downloads page
  'dl.title': { cs: 'Ke stažení', en: 'Downloads' },
  'dl.label': { cs: 'Pre-release', en: 'Pre-release' },
  'dl.headline.line1': { cs: 'Stažení', en: 'Downloads' },
  'dl.headline.line2': { cs: 'jsou Q1 2027.', en: 'land Q1 2027.' },
  'dl.intro': {
    cs: 'ShowX 0.1 je v aktivním vývoji. Žádné public binaries zatím nejsou. Sledujte tuto stránku nebo se přidejte do bety pro early build.',
    en: 'ShowX 0.1 is in active development. No public binaries yet. Watch this page or join the beta for an early build.',
  },

  // Docs page
  'docs.title': { cs: 'Dokumentace', en: 'Documentation' },
  'docs.label': { cs: 'Resources', en: 'Resources' },
  'docs.headline.line1': { cs: 'Dokumentace.', en: 'Documentation.' },
  'docs.headline.line2': { cs: 'Architektura. Specy.', en: 'Architecture. Specs.' },
  'docs.intro': {
    cs: 'ShowX vyvíjíme veřejně. Specy, architektura, modul SDK, protokoly i postup bundle review jsou v GitHub repo. Tady jsou rozcestníky.',
    en: "We build ShowX in the open. Specs, architecture, module SDK, protocols, and bundle review status all live in the GitHub repo. Here are the entry points.",
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
