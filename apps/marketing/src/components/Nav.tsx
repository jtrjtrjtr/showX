import { NavLink, Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function Nav() {
  const { t, lang, setLang } = useI18n()
  const items = [
    { to: '/try-it', label: t('nav.try-it') },
    { to: '/status', label: t('nav.status') },
    { to: '/downloads', label: t('nav.downloads') },
    { to: '/guide', label: t('nav.guide') },
    { to: '/scenarios', label: t('nav.scenarios') },
    { to: '/docs', label: t('nav.docs') },
  ]

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-ground/90 border-b border-rule/60">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-12 h-16 flex items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <img src="/showx-logo-256.png" alt="ShowX" className="h-6 w-auto" />
          <span className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.2em] text-muted mt-1">by XLAB</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7">
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setLang(lang === 'cs' ? 'en' : 'cs')}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted hover:text-accent-deep transition-colors px-2 py-1 border border-rule rounded"
            aria-label="Toggle language"
          >
            {lang === 'cs' ? 'EN' : 'CS'}
          </button>
          <a
            href="mailto:hello@xlabproject.net?subject=ShowX%20dev%20preview%20cohort&body=Hi%20XLAB%2C%0A%0AI'd%20like%20a%20seat%20in%20the%20ShowX%20dev%20preview%20cohort.%0A%0AWho%20I%20am%3A%20%0AVenue%20%2F%20role%3A%20%0AWhat%20I%20want%20to%20see%20from%20ShowX%3A%20%0A%0AThanks!"
            className="btn-primary text-xs px-4 py-2"
          >
            {t('nav.preview')}
          </a>
        </div>
      </div>
    </header>
  )
}
