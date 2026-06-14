// Public-facing landing page for visitors who aren't signed in. The
// root route used to bounce straight to /tv, which left newcomers
// staring at an empty player and a "no playlist configured" CTA with
// no context for what Nova Stream actually is.
//
// We render this server-side so the first paint includes the welcome
// content (good for SEO and link previews), and only redirect signed-in
// users to /tv at the cookie-check layer (../page.tsx).
//
// Visual notes (the "be creative" round):
//   - Aurora orbs at the top of <main> animate slowly, giving the hero
//     depth without distracting.
//   - The hero shows a side-by-side layout: tagline on the left, a
//     pixel-accurate phone mockup of the app's home rail on the right,
//     so the visitor sees what they're signing up for in two seconds.
//   - Features use hand-drawn SVG icons that match the sage palette
//     (replacing the emoji glyphs that didn't fit the brand).
//   - The how-to steps reveal on scroll via IntersectionObserver +
//     a `.nw-reveal` / `.is-shown` class pair.

import Link from 'next/link';
import './welcome.css';

// Inline icons keep the brand colour control inside CSS (currentColor).
const IconPlaylist = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="7" width="24" height="18" rx="3"/>
    <path d="M14 13l6 3-6 3z" fill="currentColor"/>
    <path d="M4 11h24"/>
  </svg>
);
const IconBolt = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 4 8 18h7l-2 10 9-14h-7z" fill="currentColor" fillOpacity=".22"/>
    <path d="M17 4 8 18h7l-2 10 9-14h-7z"/>
  </svg>
);
const IconSync = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 16a11 11 0 0 1 18.5-8M27 16A11 11 0 0 1 8.5 24"/>
    <path d="M23 4v6h-6M9 28v-6h6"/>
  </svg>
);
const IconShield = () => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4 6 8v8c0 6.5 4.5 11 10 12 5.5-1 10-5.5 10-12V8z" fill="currentColor" fillOpacity=".15"/>
    <path d="M16 4 6 8v8c0 6.5 4.5 11 10 12 5.5-1 10-5.5 10-12V8z"/>
    <path d="m11 16 3.5 3.5L21 13"/>
  </svg>
);

const FEATURES = [
  { Icon: IconPlaylist, title: 'Bring any playlist', text:
      'M3U, M3U8, Xtream Codes, Stalker portals — paste a URL and Nova Stream organises your channels with EPG, search, and Continue Watching out of the box.' },
  { Icon: IconBolt,     title: 'Fast on every screen', text:
      'Optimised for Smart TVs, web browsers, phones and tablets. Remote-friendly focus model, hardware-accelerated HLS, instant channel switching.' },
  { Icon: IconSync,     title: 'Settings follow you', text:
      'Sign in once. Your playlist, parental controls, themes, history and recordings appear automatically on every device you open Nova Stream on.' },
  { Icon: IconShield,   title: 'Your data stays yours', text:
      "We don't host video. We don't sell data. We don't run ad trackers. Your M3U URL stays encrypted and you can export or delete everything in two clicks." },
];

// Phone mockup — a small, faithful preview of the /tv/home design.
// Drawn in HTML rather than imported as an image so it crisps up on
// retina and stays in sync with palette changes. Static — no live
// data, no JS, just a visual.
function HeroPhoneMockup() {
  // Channel logos as mesh-gradient circles, faux "Live" rail tiles, etc.
  return (
    <div className="nw-mock" aria-hidden>
      <div className="nw-mock-frame">
        <div className="nw-mock-island" />
        <div className="nw-mock-screen">
          <div className="nw-mock-row nw-mock-top">
            <div className="nw-mock-brand">NOVA <b>STREAM</b></div>
            <div className="nw-mock-avatar">A</div>
          </div>
          <div className="nw-mock-greet">Good evening 👋</div>
          <div className="nw-mock-search">Search shows, movies and channels</div>
          <div className="nw-mock-bubbles">
            {['ESPN','BBC','HBO','MTV','כאן','DIS'].map((label, i) => (
              <span key={label} className={`nw-mock-bubble nw-mock-b${(i % 6) + 1}`}>{label}</span>
            ))}
          </div>
          <div className="nw-mock-hero">
            <span className="nw-mock-hero-badge">FEATURED</span>
            <span className="nw-mock-hero-title">Champions League</span>
            <span className="nw-mock-hero-play">▶ Play now</span>
          </div>
          <div className="nw-mock-rail-head">Live now</div>
          <div className="nw-mock-rail">
            <span className="nw-mock-tile nw-mock-b2"/>
            <span className="nw-mock-tile nw-mock-b3"/>
            <span className="nw-mock-tile nw-mock-b4"/>
          </div>
        </div>
      </div>
      <div className="nw-mock-glow" />
    </div>
  );
}

export default function WelcomeLanding() {
  return (
    <main className="nw-root">
      {/* Aurora orbs drifting behind the hero — pure CSS animation. */}
      <div className="nw-aurora" aria-hidden>
        <span className="nw-aurora-orb nw-aurora-1" />
        <span className="nw-aurora-orb nw-aurora-2" />
        <span className="nw-aurora-orb nw-aurora-3" />
      </div>

      <header className="nw-nav">
        <div className="nw-brand">NOVA STREAM</div>
        <nav className="nw-nav-right">
          <Link href="/tv/login" className="nw-nav-link">Sign in</Link>
          <Link href="/tv/signup" className="nw-nav-cta">Start free trial</Link>
        </nav>
      </header>

      <section className="nw-hero nw-hero-split">
        <div className="nw-hero-copy">
          <div className="nw-hero-eyebrow">Your IPTV, finally beautiful</div>
          <h1 className="nw-hero-title">
            One player.<br/><span className="nw-hero-title-em">Every screen.</span>
          </h1>
          <p className="nw-hero-tagline">
            Bring your own playlist. Nova Stream organises your channels,
            remembers where you stopped, and follows you to your phone,
            tablet, browser and TV.
          </p>
          <div className="nw-hero-actions">
            <Link href="/tv/signup" className="nw-btn nw-btn-primary nw-btn-pulse">
              Start free · 7 days
            </Link>
            <Link href="/tv/login" className="nw-btn nw-btn-ghost">
              I already have an account
            </Link>
          </div>
          <div className="nw-hero-trust">
            No credit card · Cancel anytime · Works in any modern browser
          </div>
        </div>
        <HeroPhoneMockup />
      </section>

      <section className="nw-features nw-reveal">
        {FEATURES.map(({ Icon, title, text }) => (
          <article className="nw-feature" key={title}>
            <div className="nw-feature-icon" aria-hidden><Icon /></div>
            <h3 className="nw-feature-title">{title}</h3>
            <p className="nw-feature-text">{text}</p>
          </article>
        ))}
      </section>

      <section className="nw-howto">
        <h2 className="nw-section-title nw-reveal">How it works</h2>
        <ol className="nw-howto-steps">
          <li className="nw-reveal">
            <span className="nw-howto-num">1</span>
            <div>
              <h4>Create your free account</h4>
              <p>Email + password. No card, no commitment. 7 days to try everything.</p>
            </div>
          </li>
          <li className="nw-reveal">
            <span className="nw-howto-num">2</span>
            <div>
              <h4>Paste your playlist URL</h4>
              <p>Drop the M3U / Xtream URL your provider gave you into Settings → Sources.</p>
            </div>
          </li>
          <li className="nw-reveal">
            <span className="nw-howto-num">3</span>
            <div>
              <h4>Watch on any device</h4>
              <p>Sign into the same account on your phone, TV, or browser — your settings come with you.</p>
            </div>
          </li>
        </ol>
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Link href="/tv/signup" className="nw-btn nw-btn-primary nw-btn-pulse">
            Get started — it&apos;s free for 7 days
          </Link>
        </div>
      </section>

      <footer className="nw-footer">
        <div className="nw-footer-cols">
          <div>
            <div className="nw-footer-h">Nova Stream</div>
            <p className="nw-footer-p">
              A media player. We don&apos;t host video. You bring the
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
