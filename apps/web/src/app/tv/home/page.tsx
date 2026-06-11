'use client';

/*
 * /tv/home — the Android APK's home screen.
 *
 * Loaded by the APK on launch, and by the web app on phone-sized
 * viewports after sign-in. Language follows the user's device
 * (navigator.language; user can override in Account → Appearance).
 *
 * All visual rules live in home.css. Every clickable card here is
 * an <a> with display:block/flex set in CSS so heights don't
 * collapse on older Android WebViews.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { M3UChannel } from '@/lib/m3u';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { getSessionEmail } from '@/lib/session';
import { useT } from '@/lib/i18n';
import './home.css';

const SKIP = /(test|placeholder|24\/?7 vod|info channel|backup|adult|xxx)/i;
const SHOWCASE = /(sport|movie|cinema|hbo|premium|football|soccer|nba|nfl|champions)/i;
const MESH = ['nshome-m1', 'nshome-m2', 'nshome-m3', 'nshome-m4', 'nshome-m5', 'nshome-m6', 'nshome-m7', 'nshome-m8'];

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

function pickList(channels: M3UChannel[], n: number, prefersLogo = false): M3UChannel[] {
  const clean = channels.filter((c) => !SKIP.test(c.name));
  if (prefersLogo) {
    const withLogos = clean.filter((c) => c.logoUrl);
    if (withLogos.length >= n) return withLogos.slice(0, n);
  }
  return clean.slice(0, n);
}

function greetingKey(): 'home.greet.morning' | 'home.greet.afternoon' | 'home.greet.evening' | 'home.greet.night' {
  const h = new Date().getHours();
  if (h < 5)  return 'home.greet.night';
  if (h < 12) return 'home.greet.morning';
  if (h < 17) return 'home.greet.afternoon';
  if (h < 21) return 'home.greet.evening';
  return 'home.greet.night';
}

function initials(email: string | null): string {
  if (!email) return '?';
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

export default function TvMobileHome() {
  const { t } = useT();
  const [channels, setChannels] = useState<M3UChannel[]>(
    typeof window !== 'undefined' ? (getCachedChannels() ?? []) : [],
  );
  const [email, setEmail] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>('foryou');

  useEffect(() => { setEmail(getSessionEmail()); }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadChannels();
      if (!cancelled) setChannels(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const hero    = useMemo(() => pickHero(channels),                    [channels]);
  const live    = useMemo(() => pickList(channels, 10),                [channels]);
  const bubbles = useMemo(() => pickList(channels, 8, /* logos */ true), [channels]);

  const CATEGORIES = useMemo(() => ([
    { id: 'foryou',  label: t('home.recommended') },
    { id: 'live',    label: t('home.cat.live')   },
    { id: 'movies',  label: t('home.recent')     },
    { id: 'sports',  label: t('home.cat.sports') },
    { id: 'news',    label: t('home.news')       },
    { id: 'kids',    label: t('home.kids')       },
  ]), [t]);

  return (
    <main className="nshome">

      {/* ===== header ===== */}
      <header className="nshome-top">
        <div className="nshome-top-row">
          <div className="nshome-brand">
            <span className="nshome-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </span>
            <span className="nshome-brand-name">NOVA <b>STREAM</b></span>
          </div>
          <div className="nshome-top-actions">
            <Link href="/tv/account/notifications" className="nshome-icon-btn" aria-label="Notifications">
              <span className="nshome-badge" aria-hidden="true"/>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <div className="nshome-greet">
            {t(greetingKey())} <span className="nshome-greet-wave" aria-hidden="true">👋</span>
          </div>
          {email && <span className="nshome-trial-chip">{t('home.trialActive')}</span>}
        </div>
      </header>

      {/* ===== search ===== */}
      <Link href="/tv/search" className="nshome-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <span>{t('home.searchPh')}</span>
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
              <span className={`nshome-bubble ${c.logoUrl ? '' : meshFor(c.name)}`}>
                {c.logoUrl
                  ? <img src={c.logoUrl} alt="" loading="lazy"/>
                  : <span>{c.name.slice(0, 2).toUpperCase()}</span>}
                <span className="nshome-live-pip" aria-hidden="true"/>
              </span>
              <span className="nshome-bubble-item-label">{c.name}</span>
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
            <div className={`nshome-hero-art ${meshFor(hero.name)}`} aria-hidden="true"/>
            <div className="nshome-hero-fade" aria-hidden="true"/>
            <div className="nshome-hero-content">
              <span className="nshome-hero-badge">{t('home.featured')}</span>
              <h2 className="nshome-hero-title">{hero.name}</h2>
              <p className="nshome-hero-meta">{hero.category || t('home.cat.live')}</p>
              <div className="nshome-hero-cta">
                <span className="nshome-btn nshome-btn-primary">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  {t('home.playNow')}
                </span>
                <span className="nshome-btn nshome-btn-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <div className="nshome-welcome">
            <h3>{t('home.welcome.title')}</h3>
            <p>{t('home.welcome.sub')}</p>
            <Link href="/tv/account/sources" className="nshome-btn nshome-btn-primary">
              {t('home.welcome.cta')}
            </Link>
          </div>
        )}
      </div>

      {/* ===== live now rail ===== */}
      {live.length > 0 && (
        <section className="nshome-section">
          <div className="nshome-sec-head">
            <h2>{t('home.liveNow')}</h2>
            <Link href="/tv/live">{t('home.allChannels')}</Link>
          </div>
          <div className="nshome-rail">
            {live.map((c) => (
              <Link
                key={c.id}
                href={`/tv/live?ch=${encodeURIComponent(c.id)}`}
                className="nshome-live-card"
              >
                <div className="nshome-live-art">
                  <div className={`nshome-live-art-bg ${meshFor(c.name)}`} aria-hidden="true"/>
                  {c.logoUrl && <img src={c.logoUrl} alt="" loading="lazy"/>}
                  <span className="nshome-live-pill">
                    <span className="nshome-live-dot" aria-hidden="true"/>
                    {t('nav.live')}
                  </span>
                  <span className="nshome-live-chip">{c.name}</span>
                </div>
                <div className="nshome-live-meta">
                  <div className="nshome-live-meta-title">{c.name}</div>
                  <div className="nshome-live-meta-sub">{c.category || t('home.liveNow')}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ===== genre grid ===== */}
      <section className="nshome-section">
        <div className="nshome-sec-head"><h2>{t('home.discover')}</h2></div>
        <div className="nshome-genre-grid">
          <Link href="/tv/live" className="nshome-genre-tile">
            <span className="nshome-genre-ic nshome-ic-live" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="13" rx="2"/><path d="M17 2 12 7 7 2"/>
              </svg>
            </span>
            <span className="nshome-genre-tile-label">{t('home.cat.live')}</span>
          </Link>
          <Link href="/tv/sports" className="nshome-genre-tile">
            <span className="nshome-genre-ic nshome-ic-sports" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0z"/>
              </svg>
            </span>
            <span className="nshome-genre-tile-label">{t('home.cat.sports')}</span>
          </Link>
          <Link href="/tv/guide" className="nshome-genre-tile">
            <span className="nshome-genre-ic nshome-ic-guide" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
              </svg>
            </span>
            <span className="nshome-genre-tile-label">{t('home.cat.guide')}</span>
          </Link>
          <Link href="/tv/catchup" className="nshome-genre-tile">
            <span className="nshome-genre-ic nshome-ic-catchup" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
              </svg>
            </span>
            <span className="nshome-genre-tile-label">{t('home.cat.catchup')}</span>
          </Link>
        </div>
      </section>

      {/* Bottom tab nav is rendered globally by the /tv layout
          (MobileTabBar); no duplicate here. */}
    </main>
  );
}
