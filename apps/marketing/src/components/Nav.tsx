import { NavLink, Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function Nav() {
  const { t, lang, setLang } = useI18n()
  const items = [
    { to: '/features', label: t('nav.features') },
    { to: '/pricing', label: t('nav.pricing') },
    { to: '/compare', label: t('nav.compare') },
    { to: '/get-started', label: t('nav.get-started') },
    { to: '/downloads', label: t('nav.downloads') },
    { to: '/docs', label: t('nav.docs') },
  ]

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-ground/90 border-b border-rule/60">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-12 h-16 flex items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <span className="display-serif text-2xl tracking-tighter font-medium text-ink group-hover:text-accent-deep transition-colors">
            ShowX
          </span>
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
            href="mailto:hello@xlabproject.net?subject=ShowX%20beta"
            className="btn-primary text-xs px-4 py-2"
          >
            {t('nav.beta')}
          </a>
        </div>
      </div>
    </header>
  )
}
