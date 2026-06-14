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

// Category keyword tables, mirroring SmartHomeRow so the home page can
// classify channels without round-tripping through that component.
// Keys are scored: primary +8, secondary +3, logo +1. Any score > 0
// qualifies the channel for the rail. Localised category aliases are
// kept Hebrew-friendly (`חדשות`, `ספורט`, `סרטים`, `ילדים`, etc.) so
// IL playlists with Hebrew group-titles classify correctly.
type Pick = 'sports' | 'news' | 'movies' | 'kids' | 'music' | 'documentary' | 'entertainment';
const KEYWORDS: Record<Pick, { primary: string[]; secondary: string[] }> = {
  sports: {
    primary:   ['sport', 'ספורט', 'espn', 'fox sports', 'eurosport', 'bein', 'sky sports', 'one', 'tnt', 'dazn'],
    secondary: ['football', 'soccer', 'basketball', 'tennis', 'nba', 'nhl', 'nfl', 'mlb', 'ufc', 'golf', 'rugby', 'liga', 'champions', 'premier'],
  },
  news: {
    primary:   ['news', 'חדשות', 'cnn', 'bbc', 'fox news', 'sky news', 'al jazeera', 'bloomberg', 'cnbc', 'i24', 'כאן', 'reshet'],
    secondary: ['breaking', '24', 'business', 'world', 'דיווח', 'מהדורה'],
  },
  movies: {
    primary:   ['movies', 'cinema', 'film', 'סרט', 'hbo', 'starz', 'showtime', 'amc', 'paramount', 'mgm', 'yes movie'],
    secondary: ['action', 'drama', 'thriller', 'classic', 'tcm', 'epix', 'hits'],
  },
  kids: {
    primary:   ['kids', 'ילדים', 'cartoon', 'nick', 'disney', 'boomerang', 'baby', 'cbeebies', 'הופ'],
    secondary: ['toon', 'family', 'junior', 'children', 'duck', 'משפח'],
  },
  music: {
    primary:   ['music', 'מוזיקה', 'mtv', 'vh1', 'kiss', 'trace', 'mezzo', 'stingray', '24music'],
    secondary: ['hits', 'pop', 'rock', 'r&b', 'urban', 'classical'],
  },
  documentary: {
    primary:   ['documentary', 'תיעוד', 'discovery', 'national geographic', 'nat geo', 'history', 'animal planet', 'crime'],
    secondary: ['nature', 'science', 'wild', 'travel', 'planet'],
  },
  entertainment: {
    primary:   ['entertainment', 'בידור', 'comedy central', 'e!', 'tlc', 'reality', 'lifestyle', 'bravo', 'yes oh', 'yes 1'],
    secondary: ['drama', 'show', 'series', 'sitcom', 'cooking', 'food', 'סדר'],
  },
};

function scoreChannel(c: M3UChannel, kw: { primary: string[]; secondary: string[] }): number {
  if (SKIP.test(c.name) || SKIP.test(c.category)) return 0;
  const hay = (c.name + ' ' + c.category).toLowerCase();
  let s = 0;
  for (const w of kw.primary)   if (hay.includes(w)) s += 8;
  for (const w of kw.secondary) if (hay.includes(w)) s += 3;
  if (c.logoUrl) s += 1;
  return s;
}

function pickByCategory(channels: M3UChannel[], pick: Pick, n: number): M3UChannel[] {
  const scored = channels
    .map((c) => ({ c, s: scoreChannel(c, KEYWORDS[pick]) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.c);
  return scored;
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
            href={`/tv/live?ch=${encodeURIComponent(c.id)}`}
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
  const { t } = useT();
  const [channels, setChannels] = useState<M3UChannel[]>(
    typeof window !== 'undefined' ? (getCachedChannels() ?? []) : [],
  );
  const [email, setEmail] = useState<string | null>(null);
  const [history, setHistory] = useState<WatchEntry[]>([]);

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

  const hero    = useMemo(() => pickHero(channels),                    [channels]);
  const live    = useMemo(() => pickList(channels, 12),                [channels]);
  const bubbles = useMemo(() => pickList(channels, 8, /* logos */ true), [channels]);
  const sports        = useMemo(() => pickByCategory(channels, 'sports',        12), [channels]);
  const news          = useMemo(() => pickByCategory(channels, 'news',          12), [channels]);
  const movies        = useMemo(() => pickByCategory(channels, 'movies',        12), [channels]);
  const kids          = useMemo(() => pickByCategory(channels, 'kids',          12), [channels]);
  const music         = useMemo(() => pickByCategory(channels, 'music',         12), [channels]);
  const documentary   = useMemo(() => pickByCategory(channels, 'documentary',   12), [channels]);
  const entertainment = useMemo(() => pickByCategory(channels, 'entertainment', 12), [channels]);

  const CATEGORIES = useMemo(() => ([
    { id: 'foryou',  label: t('home.recommended') },
    { id: 'live',    label: t('home.cat.live')   },
    { id: 'movies',  label: t('home.recent')     },
    { id: 'sports',  label: t('home.cat.sports') },
    { id: 'news',    label: t('home.news')       },
    { id: 'kids',    label: t('home.kids')       },
  ]), [t]);
  const [activeCat, setActiveCat] = useState<string>('foryou');

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
                  ? // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logoUrl} alt="" loading="lazy"/>
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
                href={`/tv/live?ch=${encodeURIComponent(h.channelId)}`}
                name={h.name}
                logoUrl={h.logoUrl}
                t={t}
              />
            ))}
          </div>
        </section>
      )}

      {/* ===== live now rail ===== */}
      <Rail title={t('home.liveNow')} items={live} t={t} showLive />

      {/* ===== genre rails — populated from the user's real playlist ===== */}
      <Rail title={t('home.cat.sports')}   items={sports}        t={t} />
      <Rail title={t('home.news')}         items={news}          t={t} />
      <Rail title={t('home.recent')}       items={movies}        t={t} />
      <Rail title={t('home.recommended')}  items={entertainment} t={t} />
      <Rail title={t('home.kids')}         items={kids}          t={t} />
      <Rail title={t('home.documentaries')} items={documentary}  t={t} />
      <Rail title={t('home.music')}        items={music}         t={t} />

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
