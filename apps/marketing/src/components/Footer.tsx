import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="border-t border-rule mt-32">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16 grid grid-cols-1 md:grid-cols-12 gap-12">
        <div className="md:col-span-4">
          <div className="flex items-center gap-3">
            <img src="/showx-logo-mark.svg" alt="ShowX" className="h-9 w-auto" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted mt-1">by XLAB</span>
          </div>
          <p className="copy mt-6 max-w-md text-sm">{t('footer.tagline')}</p>
          <p className="copy mt-4 max-w-md text-xs text-muted">{t('footer.brand-note')}</p>
        </div>
        <div className="md:col-span-2">
          <div className="section-label mb-4">{t('footer.product')}</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/features" className="hover:text-accent-deep">{t('nav.features')}</Link></li>
            <li><Link to="/pricing" className="hover:text-accent-deep">{t('nav.pricing')}</Link></li>
            <li><Link to="/compare" className="hover:text-accent-deep">{t('nav.compare')}</Link></li>
          </ul>
        </div>
        <div className="md:col-span-3">
          <div className="section-label mb-4">{t('footer.resources')}</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/get-started" className="hover:text-accent-deep">{t('nav.get-started')}</Link></li>
            <li><Link to="/docs" className="hover:text-accent-deep">{t('nav.docs')}</Link></li>
            <li><Link to="/downloads" className="hover:text-accent-deep">{t('nav.downloads')}</Link></li>
            <li>
              <a href="https://github.com/xlab/showx" target="_blank" rel="noreferrer" className="hover:text-accent-deep">
                {t('footer.github')}
              </a>
            </li>
          </ul>
        </div>
        <div className="md:col-span-3">
          <div className="section-label mb-4">{t('footer.contact')}</div>
          <ul className="space-y-2 text-sm">
            <li className="text-muted">XLAB — Praha</li>
            <li>
              <a href="mailto:hello@xlabproject.net?subject=ShowX%20support" className="hover:text-accent-deep">
                {t('footer.support')}
              </a>
            </li>
            <li>
              <a href="mailto:hello@xlabproject.net?subject=ShowX%20partner" className="hover:text-accent-deep">
                {t('footer.partner')}
              </a>
            </li>
            <li>
              <a href="mailto:hello@xlabproject.net?subject=ShowX%20brand" className="hover:text-accent-deep">
                {t('footer.brand')}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-rule">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs text-muted font-mono">
          <span>{t('footer.copy')}</span>
          <span>{t('footer.region')}</span>
        </div>
      </div>
    </footer>
  )
}
