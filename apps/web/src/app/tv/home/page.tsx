'use client';

/*
 * /tv/home — the new mobile-optimised home screen.
 *
 * Loaded by the Nova Stream Android APK on launch. Mirrors the M6+
 * style mockup we agreed on: header, search, quick-channel bubbles,
 * category chips, hero, "Live now" rail, genre grid, bottom nav.
 *
 * Real channels come from channelCache.loadChannels(); we don't fabricate
 * placeholder rows when the playlist is empty — instead we show a clean
 * "add a playlist" empty state so the page never lies about content.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { M3UChannel } from '@/lib/m3u';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { getSessionEmail } from '@/lib/session';
import './home.css';

const SKIP = /(test|placeholder|24\/?7 vod|info channel|backup|adult|xxx)/i;
const SHOWCASE = /(sport|movie|cinema|hbo|premium|football|soccer|nba|nfl|champions)/i;

const MESH = ['nshome-m1','nshome-m2','nshome-m3','nshome-m4','nshome-m5','nshome-m6','nshome-m7','nshome-m8'];

function meshFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h) + seed.charCodeAt(i); h |= 0; }
  return MESH[Math.abs(h) % MESH.length];
}

function pickHero(channels: M3UChannel[]): M3UChannel | null {
  const showcase = channels.filter((c) => !SKIP.test(c.name) && SHOWCASE.test(c.name + ' ' + c.category));
  if (showcase.length) return showcase[0];
  return channels.find((c) => !SKIP.test(c.name) && c.logoUrl) ?? channels[0] ?? null;
}

function pickLive(channels: M3UChannel[], n: number): M3UChannel[] {
  return channels.filter((c) => !SKIP.test(c.name)).slice(0, n);
}

function pickBubbles(channels: M3UChannel[], n: number): M3UChannel[] {
  // Prefer channels with logos for the bubble row; logos read much better
  // at 58px than coloured monograms do.
  const withLogos = channels.filter((c) => !SKIP.test(c.name) && c.logoUrl);
  if (withLogos.length >= n) return withLogos.slice(0, n);
  return channels.filter((c) => !SKIP.test(c.name)).slice(0, n);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}

function initials(email: string | null): string {
  if (!email) return '?';
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

const CATEGORIES = [
  { id: 'foryou',  label: 'בשבילך' },
  { id: 'live',    label: 'ערוצים חיים' },
  { id: 'movies',  label: 'סרטים' },
  { id: 'series',  label: 'סדרות' },
  { id: 'sports',  label: 'ספורט' },
  { id: 'news',    label: 'חדשות' },
  { id: 'kids',    label: 'ילדים' },
];

export default function TvMobileHome() {
  const [channels, setChannels] = useState<M3UChannel[]>(
    typeof window !== 'undefined' ? (getCachedChannels() ?? []) : [],
  );
  const [email, setEmail] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState('foryou');

  useEffect(() => { setEmail(getSessionEmail()); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadChannels();
      if (!cancelled) setChannels(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const hero    = useMemo(() => pickHero(channels),       [channels]);
  const live    = useMemo(() => pickLive(channels, 10),   [channels]);
  const bubbles = useMemo(() => pickBubbles(channels, 8), [channels]);

  return (
    <main className="nshome">

      {/* ===== header ===== */}
      <header className="nshome-top">
        <div className="nshome-top-row">
          <div className="nshome-brand">
            <div className="nshome-brand-mark">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div className="nshome-brand-name">NOVA <b>STREAM</b></div>
          </div>
          <div className="nshome-top-actions">
            <Link href="/tv/account/notifications" className="nshome-icon-btn" aria-label="התראות">
              <span className="nshome-badge"/>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </Link>
            <Link href={email ? '/tv/account' : '/tv/login'} className="nshome-avatar">
              {initials(email)}
            </Link>
          </div>
        </div>
        <div className="nshome-greet-row">
          <div className="nshome-greet">{greeting()} <span>👋</span></div>
          {email && <div className="nshome-trial-chip">חשבון פעיל</div>}
        </div>
      </header>

      {/* ===== search ===== */}
      <Link href="/tv/search" className="nshome-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
        </svg>
        חיפוש סדרות, סרטים וערוצים
      </Link>

      {/* ===== quick channel bubbles ===== */}
      {bubbles.length > 0 && (
        <div className="nshome-bubbles">
          {bubbles.map((c) => (
            <Link
              key={c.id}
              href={`/tv/live?ch=${encodeURIComponent(c.id)}`}
              className="nshome-bubble-item"
            >
              <div className={`nshome-bubble ${c.logoUrl ? '' : meshFor(c.name)}`}>
                {c.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logoUrl} alt="" loading="lazy"/>
                ) : (
                  <span>{c.name.slice(0, 2).toUpperCase()}</span>
                )}
                <span className="nshome-live-pip"/>
              </div>
              <span>{c.name}</span>
            </Link>
          ))}
        </div>
      )}

      {/* ===== category chips ===== */}
      <div className="nshome-chips">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`nshome-chip ${cat.id === activeCat ? 'active' : ''}`}
            onClick={() => setActiveCat(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ===== hero ===== */}
      <div className="nshome-hero-wrap">
        {hero ? (
          <Link href={`/tv/live?ch=${encodeURIComponent(hero.id)}`} className="nshome-hero">
            <div className={`nshome-hero-art ${meshFor(hero.name)}`}/>
            <div className="nshome-hero-fade"/>
            <div className="nshome-hero-content">
              <span className="nshome-hero-badge">בשידור עכשיו</span>
              <div className="nshome-hero-title">{hero.name}</div>
              <div className="nshome-hero-meta">{hero.category || 'ערוץ ראשי'}</div>
              <div className="nshome-hero-cta">
                <span className="nshome-btn nshome-btn-primary">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  נגן עכשיו
                </span>
                <span className="nshome-btn nshome-btn-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <div className="nshome-empty">
            <h3>ברוך הבא ל-Nova Stream</h3>
            <p>הוסף את ה-Playlist שלך כדי להתחיל לצפות.</p>
            <Link href="/tv/account/sources" className="nshome-btn nshome-btn-primary">
              הוסף Playlist
            </Link>
          </div>
        )}
      </div>

      {/* ===== live now rail ===== */}
      {live.length > 0 && (
        <section className="nshome-section">
          <div className="nshome-sec-head">
            <h2>בשידור חי עכשיו</h2>
            <Link href="/tv/live">כל הערוצים</Link>
          </div>
          <div className="nshome-rail">
            {live.map((c) => (
              <Link
                key={c.id}
                href={`/tv/live?ch=${encodeURIComponent(c.id)}`}
                className="nshome-live-card"
              >
                <div className={`nshome-live-art ${meshFor(c.name)}`}>
                  {c.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logoUrl} alt="" loading="lazy"/>
                  )}
                  <div className="nshome-live-chip">{c.name}</div>
                  <div className="nshome-live-pill">
                    <span className="nshome-live-dot"/>חי
                  </div>
                  <div className="nshome-live-now-bar">
                    <b>{c.name}</b>
                    <div className="time">{c.category || 'משדר עכשיו'}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ===== genre grid ===== */}
      <section className="nshome-section">
        <div className="nshome-sec-head"><h2>גלה לפי קטגוריה</h2></div>
        <div className="nshome-genre-grid">
          <Link href="/tv/live" className="nshome-genre-tile">
            <div className="nshome-genre-ic" style={{ background: 'color-mix(in srgb, var(--ns-accent) 14%, transparent)', color: 'var(--ns-accent-2)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="13" rx="2"/><path d="M17 2 12 7 7 2"/>
              </svg>
            </div>
            <span>ערוצים חיים</span>
          </Link>
          <Link href="/tv/sports" className="nshome-genre-tile">
            <div className="nshome-genre-ic" style={{ background: 'color-mix(in srgb, var(--ns-gold) 14%, transparent)', color: 'var(--ns-gold)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0z"/>
              </svg>
            </div>
            <span>ספורט</span>
          </Link>
          <Link href="/tv/guide" className="nshome-genre-tile">
            <div className="nshome-genre-ic" style={{ background: 'rgba(159,176,188,.14)', color: '#BCC8D6' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
              </svg>
            </div>
            <span>לוח שידורים</span>
          </Link>
          <Link href="/tv/catchup" className="nshome-genre-tile">
            <div className="nshome-genre-ic" style={{ background: 'color-mix(in srgb, var(--ns-live) 14%, transparent)', color: 'var(--ns-live)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
              </svg>
            </div>
            <span>צפייה חוזרת</span>
          </Link>
        </div>
      </section>

      {/* ===== bottom tab nav ===== */}
      <nav className="nshome-nav">
        <Link href="/tv/home" className="nshome-tab active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>
          </svg>
          בית
        </Link>
        <Link href="/tv/live" className="nshome-tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="13" rx="2"/><path d="M8 21h8M12 19v2"/>
          </svg>
          חי
        </Link>
        <Link href="/tv/search" className="nshome-tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          חיפוש
        </Link>
        <Link href="/tv/guide" className="nshome-tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
          </svg>
          לוח
        </Link>
        <Link href={email ? '/tv/account' : '/tv/login'} className="nshome-tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
          </svg>
          חשבון
        </Link>
      </nav>
    </main>
  );
}
