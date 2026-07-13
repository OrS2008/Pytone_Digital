// Public-facing landing page for visitors who aren't signed in. The
// root route used to bounce straight to /tv, which left newcomers
// staring at an empty player and a "no playlist configured" CTA with
// no context for what Nova Stream actually is.
//
// We render this server-side so the first paint includes the welcome
// content (good for SEO and link previews), and only redirect signed-in
// users to /tv at the cookie-check layer (../page.tsx).

import Link from 'next/link';
import type { ReactElement } from 'react';
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

const FEATURES = [
  {
    icon: 'playlist',
    title: 'Bring any playlist',
    text:
      'M3U, M3U8, Xtream Codes, Stalker portals — paste a URL and Nova ' +
      'Stream organises your channels with EPG, search, and Continue ' +
      'Watching out of the box.',
  },
  {
    icon: 'fast',
    title: 'Fast on every screen',
    text:
      'Optimised for Smart TVs, web browsers, phones and tablets. ' +
      'Remote-friendly focus model, hardware-accelerated HLS, instant ' +
      'channel switching.',
  },
  {
    icon: 'sync',
    title: 'Settings follow you',
    text:
      'Sign in once. Your playlist, parental controls, themes, history ' +
      'and recordings appear automatically on every device you open ' +
      'Nova Stream on.',
  },
  {
    icon: 'lock',
    title: 'Your data stays yours',
    text:
      "We don't host video. We don't sell data. We don't run ad " +
      'trackers. Your M3U URL stays encrypted and you can export or ' +
      'delete everything in two clicks.',
  },
];

export default function WelcomeLanding() {
  return (
    <main className="nw-root">
      <header className="nw-nav">
        <div className="nw-brand">NOVA STREAM</div>
        <nav className="nw-nav-right">
          <Link href="/tv/login" className="nw-nav-link">Sign in</Link>
          <Link href="/tv/signup" className="nw-nav-cta">Start free trial</Link>
        </nav>
      </header>

      <section className="nw-hero">
        <div className="nw-hero-eyebrow">Welcome to</div>
        <h1 className="nw-hero-title">Nova Stream</h1>
        <p className="nw-hero-tagline">
          The player for your playlists. One account. Every device. Zero noise.
        </p>
        <div className="nw-hero-actions">
          <Link href="/tv/signup" className="nw-btn nw-btn-primary">
            Create account · 7 days free
          </Link>
          <Link href="/tv/login" className="nw-btn nw-btn-ghost">
            I already have an account
          </Link>
        </div>
        <div className="nw-hero-trust">
          No credit card · Cancel anytime · Works in any modern browser
        </div>
      </section>

      <section className="nw-features">
        {FEATURES.map((f) => (
          <article className="nw-feature" key={f.title}>
            <div className="nw-feature-icon" aria-hidden>{ICONS[f.icon]}</div>
            <h3 className="nw-feature-title">{f.title}</h3>
            <p className="nw-feature-text">{f.text}</p>
          </article>
        ))}
      </section>

      <section className="nw-howto">
        <h2 className="nw-section-title">How it works</h2>
        <ol className="nw-howto-steps">
          <li>
            <span className="nw-howto-num">1</span>
            <div>
              <h4>Create your free account</h4>
              <p>Email + password. No card, no commitment. 7 days to try everything.</p>
            </div>
          </li>
          <li>
            <span className="nw-howto-num">2</span>
            <div>
              <h4>Paste your playlist URL</h4>
              <p>Drop the M3U / Xtream URL your provider gave you into Settings → Sources.</p>
            </div>
          </li>
          <li>
            <span className="nw-howto-num">3</span>
            <div>
              <h4>Watch on any device</h4>
              <p>Sign into the same account on your phone, TV, or browser — your settings come with you.</p>
            </div>
          </li>
        </ol>
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Link href="/tv/signup" className="nw-btn nw-btn-primary">
            Get started — it's free for 7 days
          </Link>
        </div>
      </section>

      <footer className="nw-footer">
        <div className="nw-footer-cols">
          <div>
            <div className="nw-footer-h">Nova Stream</div>
            <p className="nw-footer-p">
              A media player. We don't host video. You bring the
              channels, we make them feel native.
            </p>
          </div>
          <div>
            <div className="nw-footer-h">Account</div>
            <Link href="/tv/login"  className="nw-footer-link">Sign in</Link>
            <Link href="/tv/signup" className="nw-footer-link">Create account</Link>
          </div>
          <div>
            <div className="nw-footer-h">Legal</div>
            <Link href="/legal/terms"   className="nw-footer-link">Terms</Link>
            <Link href="/legal/privacy" className="nw-footer-link">Privacy</Link>
          </div>
        </div>
        <div className="nw-footer-bottom">
          © {new Date().getFullYear()} Nova Stream. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
