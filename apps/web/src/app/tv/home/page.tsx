'use client';

/*
 * /tv/home — the Android APK's home screen. Designed to feel like the
 * M6+ France app: a dense, scrollable surface of horizontal rails, each
 * one carrying a different slice of the user's playlist. The rails are
 * computed locally from the cached M3U using a keyword scorer (lifted
 * from SmartHomeRow so the home page stays one self-contained file).
 *
 * Language follows the device (navigator.language); colours follow the
 * sage theme. All cards are <Link>s explicitly set to display:block in
 * home.css so they don't collapse on older Android WebViews.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { M3UChannel } from '@/lib/m3u';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { getSessionEmail } from '@/lib/session';
import { getHistory, type WatchEntry } from '@/lib/watchHistory';
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

interface RailCardProps {
  href: string;
  name: string;
  sub?: string;
  logoUrl?: string;
  showLive?: boolean;
  t: (k: string) => string;
}

function RailCard({ href, name, sub, logoUrl, showLive, t }: RailCardProps) {
  return (
    <Link href={href} className="nshome-live-card">
      <div className="nshome-live-art">
        <div className={`nshome-live-art-bg ${meshFor(name)}`} aria-hidden="true"/>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" loading="lazy"/>
        )}
        {showLive && (
          <span className="nshome-live-pill">
            <span className="nshome-live-dot" aria-hidden="true"/>
            {t('nav.live')}
          </span>
        )}
        <span className="nshome-live-chip">{name}</span>
      </div>
      <div className="nshome-live-meta">
        <div className="nshome-live-meta-title">{name}</div>
        {sub && <div className="nshome-live-meta-sub">{sub}</div>}
      </div>
    </Link>
  );
}

interface RailProps {
  title: string;
  items: M3UChannel[];
  t: (k: string) => string;
  showLive?: boolean;
}

function Rail({ title, items, t, showLive }: RailProps) {
  if (items.length === 0) return null;
  return (
    <section className="nshome-section">
      <div className="nshome-sec-head">
        <h2>{title}</h2>
        <Link href="/tv/live">{t('home.allChannels')}</Link>
      </div>
      <div className="nshome-rail">
        {items.map((c) => (
          <RailCard
            key={c.id}
            href={`/tv/live?ch=${encodeURIComponent(c.number)}`}
            name={c.name}
            sub={c.category || t('home.liveNow')}
            logoUrl={c.logoUrl}
            showLive={showLive}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

export default function TvMobileHome() {
  const router = useRouter();
  const { t, locale, setLocale } = useT();
  const [channels, setChannels] = useState<M3UChannel[]>(
    typeof window !== 'undefined' ? (getCachedChannels() ?? []) : [],
  );
  const [email, setEmail] = useState<string | null>(null);
  const [history, setHistory] = useState<WatchEntry[]>([]);

  // /tv/home is the mobile home (designed for phones / the Android
  // APK). Non-phone users (laptop / desktop) should land on the
  // legacy /tv layout instead — the user explicitly asked not to see
  // this page on desktop. Real TVs (webOS / Tizen / AppleTV) also go
  // to /tv since /tv/home is sized for a 360px column.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isTv = /webOS|Web0S|SmartTV|Tizen|HbbTV|CrKey|AppleTV/i.test(ua);
    const isPhone = !isTv && /Android|iPhone|iPad|Mobile/i.test(ua) && window.innerWidth <= 820;
    if (!isPhone) router.replace('/tv');
  }, [router]);

  useEffect(() => {
    setEmail(getSessionEmail());
    setHistory(getHistory());
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadChannels();
      if (!cancelled) setChannels(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const hero = useMemo(() => pickHero(channels),     [channels]);
  const live = useMemo(() => pickList(channels, 12), [channels]);

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
            <button
              type="button"
              className="nshome-icon-btn nshome-locale-btn"
              onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}
              aria-label={locale === 'he' ? 'Switch to English' : 'החלף לעברית'}
              title={locale === 'he' ? 'EN' : 'עב'}
            >
              <span className="nshome-locale-label">{locale === 'he' ? 'EN' : 'עב'}</span>
            </button>
            <Link href="/tv/account/notifications" className="nshome-icon-btn" aria-label={t('chip.menu')}>
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

      {/* Bubbles + chips removed in the "make it simple" pass — the
          search + bottom tab bar already give the user category access
          and the bubbles competed with the hero for attention. */}

      {/* ===== hero ===== */}
      <div className="nshome-hero-wrap">
        {hero ? (
          <Link href={`/tv/live?ch=${encodeURIComponent(hero.number)}`} className="nshome-hero">
            <div className={`nshome-hero-art ${meshFor(hero.name)}`} aria-hidden="true"/>
            <div className="nshome-hero-fade" aria-hidden="true"/>
            {hero.logoUrl && (
              <div className="nshome-hero-poster" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hero.logoUrl} alt="" loading="eager"/>
              </div>
            )}
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

      {/* ===== continue watching (only if there's history) ===== */}
      {history.length > 0 && (
        <section className="nshome-section">
          <div className="nshome-sec-head">
            <h2>{t('home.continue')}</h2>
          </div>
          <div className="nshome-rail">
            {history.slice(0, 10).map((h) => (
              <RailCard
                key={h.channelId}
                href={`/tv/live?ch=${encodeURIComponent(h.number)}`}
                name={h.name}
                logoUrl={h.logoUrl}
                t={t}
              />
            ))}
          </div>
        </section>
      )}

      {/* ===== live now rail — the only non-empty rail by default.
           We dropped Sports / News / Movies / Entertainment / Kids /
           Docs / Music rails to keep the home page short and calm. Users
           who want category browsing tap into the grid below. ===== */}
      <Rail title={t('home.liveNow')} items={live} t={t} showLive />

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
