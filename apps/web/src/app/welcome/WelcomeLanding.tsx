// Public-facing landing page for visitors who aren't signed in. The
// root route used to bounce straight to /tv, which left newcomers
// staring at an empty player and a "no playlist configured" CTA with
// no context for what Nova Stream actually is.
//
// Still server-rendered for the first paint (SEO, link previews); it is
// a client component only so the copy can follow the visitor's
// language. ../page.tsx passes the locale it read from Accept-Language
// so a Hebrew visitor gets Hebrew in the server HTML — no English
// flash — and useT() then honours any saved choice after hydration.

'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { useT, type Locale } from '@/lib/i18n';
import './welcome.css';

// Inline SVG feature icons — crisp at every DPI, tinted via CSS, and
// consistent across platforms. (Emoji render differently on every OS
// and read as unfinished next to the rest of the design.)
const ICONS: Record<string, ReactElement> = {
  playlist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/>
    </svg>
  ),
  fast: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 3 14h7l-1 8 10-12h-7z"/>
    </svg>
  ),
  sync: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/>
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/>
      <path d="M3 22v-6h6"/><path d="M21 2v6h-6"/>
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
};

const FEATURES = ['playlist', 'fast', 'sync', 'lock'] as const;

export default function WelcomeLanding({ initialLocale }: { initialLocale?: Locale }) {
  const { t, locale, setLocale } = useT(initialLocale);
  return (
    <main className="nw-root">
      <header className="nw-nav">
        <div className="nw-brand">NOVA STREAM</div>
        <nav className="nw-nav-right">
          <button
            type="button"
            className="nw-nav-link nw-nav-lang"
            onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
            aria-label={locale === 'he' ? 'Switch to English' : 'החלף לעברית'}
          >
            {locale === 'he' ? 'EN' : 'עב'}
          </button>
          <Link href="/tv/login" className="nw-nav-link">{t('wl.signIn')}</Link>
          <Link href="/tv/signup" className="nw-nav-cta">{t('wl.startTrial')}</Link>
        </nav>
      </header>

      <section className="nw-hero">
        <div className="nw-hero-eyebrow">{t('wl.eyebrow')}</div>
        <h1 className="nw-hero-title">Nova Stream</h1>
        <p className="nw-hero-tagline">{t('wl.tagline')}</p>
        <div className="nw-hero-actions">
          <Link href="/tv/signup" className="nw-btn nw-btn-primary">{t('wl.ctaCreate')}</Link>
          <Link href="/tv/login" className="nw-btn nw-btn-ghost">{t('wl.ctaHave')}</Link>
        </div>
        <div className="nw-hero-trust">{t('wl.trust')}</div>
      </section>

      <section className="nw-features">
        {FEATURES.map((f) => (
          <article className="nw-feature" key={f}>
            <div className="nw-feature-icon" aria-hidden>{ICONS[f]}</div>
            <h3 className="nw-feature-title">{t(`wl.f.${f}.title`)}</h3>
            <p className="nw-feature-text">{t(`wl.f.${f}.text`)}</p>
          </article>
        ))}
      </section>

      <section className="nw-howto">
        <h2 className="nw-section-title">{t('wl.how')}</h2>
        <ol className="nw-howto-steps">
          {[1, 2, 3].map((n) => (
            <li key={n}>
              <span className="nw-howto-num">{n}</span>
              <div>
                <h4>{t(`wl.step${n}.title`)}</h4>
                <p>{t(`wl.step${n}.text`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Link href="/tv/signup" className="nw-btn nw-btn-primary">{t('wl.ctaBottom')}</Link>
        </div>
      </section>

      <footer className="nw-footer">
        <div className="nw-footer-cols">
          <div>
            <div className="nw-footer-h">Nova Stream</div>
            <p className="nw-footer-p">{t('wl.footAbout')}</p>
          </div>
          <div>
            <div className="nw-footer-h">{t('wl.footAccount')}</div>
            <Link href="/tv/login"  className="nw-footer-link">{t('wl.signIn')}</Link>
            <Link href="/tv/signup" className="nw-footer-link">{t('wl.createAccount')}</Link>
          </div>
          <div>
            <div className="nw-footer-h">{t('wl.footLegal')}</div>
            <Link href="/legal/terms"   className="nw-footer-link">{t('wl.terms')}</Link>
            <Link href="/legal/privacy" className="nw-footer-link">{t('wl.privacy')}</Link>
          </div>
        </div>
        <div className="nw-footer-bottom">
          © {new Date().getFullYear()} Nova Stream. {t('wl.rights')}
        </div>
      </footer>
    </main>
  );
}
