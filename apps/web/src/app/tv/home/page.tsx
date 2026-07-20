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

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { M3UChannel } from '@/lib/m3u';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { getSessionEmail } from '@/lib/session';
import { getHistory, type WatchEntry } from '@/lib/watchHistory';
import { loadEpgIndex, programmesFor, getUserEpgUrl, type EpgIndex } from '@/lib/epgCache';
import { getFavorites, onFavoritesChange } from '@/lib/favorites';
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

// Category rails for the home page. Each rail is keyword-matched
// against the channel name + its M3U group-title, so the home fills
// out with several content rows (like the Opus / Netflix layout)
// using ONLY the user's real playlist — no placeholder content. A
// rail that matches nothing is simply not rendered, so a news-only
// playlist won't show empty Sports/Movies rows.
const CATEGORY_RAILS: { titleKey: string; re: RegExp }[] = [
  { titleKey: 'home.sports',        re: /sport|football|soccer|nba|nfl|nhl|mlb|espn|league|champion|tennis|golf|f1|formula|racing|rugby|cricket|boxing|ufc|fight/i },
  { titleKey: 'home.movies',        re: /movie|cinema|film|hbo|cinemax|paramount|mgm|starz|showtime|fox movies|sky cinema/i },
  { titleKey: 'home.news',          re: /news|cnn|bbc|fox news|sky news|al ?jazeera|msnbc|euronews|cnbc|bloomberg/i },
  { titleKey: 'home.documentaries', re: /discovery|nat ?geo|geographic|history|documentary|animal|science|nature|crime/i },
  { titleKey: 'home.kids',          re: /kid|cartoon|disney|nick|baby|junior|boomerang|pbs kids/i },
];

function pickByCategory(channels: M3UChannel[], re: RegExp, n: number): M3UChannel[] {
  return channels
    .filter((c) => !SKIP.test(c.name) && re.test(`${c.name} ${c.category}`))
    .slice(0, n);
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

// Current-programme info attached to a card when the user has an EPG
// configured. `progress` is 0..1 through the programme's runtime — the
// thin bar under the art, exactly like M6+ / TF1+ live cards.
interface NowInfo { title: string; progress: number }

interface RailCardProps {
  href: string;
  name: string;
  sub?: string;
  logoUrl?: string;
  showLive?: boolean;
  now?: NowInfo;
  t: (k: string) => string;
}

function RailCard({ href, name, sub, logoUrl, showLive, now, t }: RailCardProps) {
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
        {now && (
          <div className="nshome-live-progress" aria-hidden="true">
            <div
              className="nshome-live-progress-fill"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, now.progress)) * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="nshome-live-meta">
        <div className="nshome-live-meta-title">{name}</div>
        {/* Programme title beats the static category when we know it —
            "what's on RIGHT NOW" is what a live-TV user scans for. */}
        {(now?.title || sub) && (
          <div className="nshome-live-meta-sub">{now?.title ?? sub}</div>
        )}
      </div>
    </Link>
  );
}

interface RailProps {
  title: string;
  items: M3UChannel[];
  t: (k: string) => string;
  showLive?: boolean;
  nowFor?: (c: M3UChannel) => NowInfo | undefined;
}

function Rail({ title, items, t, showLive, nowFor }: RailProps) {
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
            now={nowFor?.(c)}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

// Skeleton placeholders shown while the playlist is still loading —
// shaped exactly like the real hero + rail so the page doesn't jump
// when content lands (the M6+/Netflix loading pattern).
function HomeSkeleton() {
  return (
    <>
      <div className="nshome-hero-wrap">
        <div className="nshome-skel nshome-skel-hero" aria-hidden="true"/>
      </div>
      <section className="nshome-section" aria-hidden="true">
        <div className="nshome-sec-head"><div className="nshome-skel nshome-skel-title"/></div>
        <div className="nshome-rail">
          {[0, 1, 2].map((i) => (
            <div key={i} className="nshome-live-card">
              <div className="nshome-skel nshome-skel-card"/>
              <div className="nshome-skel nshome-skel-line"/>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function TvMobileHome() {
  const router = useRouter();
  const { t, locale, setLocale } = useT();
  // Start EMPTY on both server and client so hydration matches (reading
  // the sessionStorage cache inside the useState initializer produced
  // React #418 — the server HTML had no channels but the client's first
  // render did). useLayoutEffect swaps in the cache before first paint,
  // so there is no visible flash.
  const [channels, setChannels] = useState<M3UChannel[]>([]);
  useLayoutEffect(() => {
    const cached = getCachedChannels();
    if (cached && cached.length > 0) setChannels(cached);
  }, []);
  const [email, setEmail] = useState<string | null>(null);
  const [history, setHistory] = useState<WatchEntry[]>([]);
  // Greeting is time-of-day dependent. Computing it during render bakes
  // the BUILD-time hour into the static HTML and the client recomputes
  // with the local hour — another #418. Render a stable default first,
  // correct after mount.
  const [greetKey, setGreetKey] = useState<string>('home.greet.evening');
  useEffect(() => { setGreetKey(greetingKey()); }, []);

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
  // True until the first loadChannels() resolves — drives the skeleton
  // hero/rail so the page never flashes empty while the playlist loads.
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadChannels();
      if (!cancelled) { setChannels(list); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // EPG hydration — once channels exist and the user has an XMLTV
  // source, resolve the CURRENT programme per channel. `epgTick` bumps
  // every minute so progress bars crawl forward without a refetch.
  const [epgIndex, setEpgIndex] = useState<EpgIndex | null>(null);
  const [epgTick, setEpgTick] = useState(0);
  useEffect(() => {
    if (channels.length === 0 || !getUserEpgUrl()) return;
    let cancelled = false;
    (async () => {
      const idx = await loadEpgIndex();
      if (!cancelled && idx && idx.byId.size > 0) setEpgIndex(idx);
    })();
    return () => { cancelled = true; };
  }, [channels]);
  useEffect(() => {
    if (!epgIndex) return;
    const iv = setInterval(() => setEpgTick((v) => v + 1), 60_000);
    return () => clearInterval(iv);
  }, [epgIndex]);

  // Current-programme lookup used by every rail card + the hero.
  const nowFor = useMemo(() => {
    void epgTick; // recompute each minute
    if (!epgIndex) return () => undefined;
    const nowMs = Date.now();
    return (c: M3UChannel): NowInfo | undefined => {
      const progs = programmesFor(epgIndex, c);
      const cur = progs.find((p) => p.start <= nowMs && p.stop > nowMs);
      if (!cur) return undefined;
      return {
        title: cur.title,
        progress: (nowMs - cur.start) / Math.max(1, cur.stop - cur.start),
      };
    };
  }, [epgIndex, epgTick]);

  // My List — favorite channels resolved against the loaded playlist.
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setFavIds(getFavorites());
    return onFavoritesChange(() => setFavIds(getFavorites()));
  }, []);
  const favorites = useMemo(
    () => channels.filter((c) => favIds.has(c.id)).slice(0, 12),
    [channels, favIds],
  );

  const hero = useMemo(() => pickHero(channels),     [channels]);
  const heroNow = hero ? nowFor(hero) : undefined;
  const live = useMemo(() => pickList(channels, 12), [channels]);
  // Build the category rails once per playlist change. We keep only the
  // rails that actually have channels, so the home page grows with the
  // playlist instead of showing empty rows.
  const catRails = useMemo(
    () =>
      CATEGORY_RAILS
        .map((c) => ({ titleKey: c.titleKey, items: pickByCategory(channels, c.re, 12) }))
        .filter((r) => r.items.length >= 3),
    [channels],
  );

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
            {t(greetKey)} <span className="nshome-greet-wave" aria-hidden="true">👋</span>
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
              {/* With an EPG: the current programme + a live progress
                  bar. Without: the channel's category, as before. */}
              {heroNow ? (
                <>
                  <p className="nshome-hero-meta nshome-hero-now">
                    <span className="nshome-hero-now-label">{t('live.now')}</span>
                    {heroNow.title}
                  </p>
                  <div className="nshome-hero-progress" aria-hidden="true">
                    <div
                      className="nshome-hero-progress-fill"
                      style={{ width: `${Math.round(heroNow.progress * 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="nshome-hero-meta">{hero.category || t('home.cat.live')}</p>
              )}
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
        ) : loading ? null : (
          <div className="nshome-welcome">
            <h3>{t('home.welcome.title')}</h3>
            <p>{t('home.welcome.sub')}</p>
            <Link href="/tv/account/sources" className="nshome-btn nshome-btn-primary">
              {t('home.welcome.cta')}
            </Link>
          </div>
        )}
      </div>

      {/* ===== skeletons while the playlist is still loading ===== */}
      {loading && channels.length === 0 && <HomeSkeleton />}

      {/* ===== my list (favorites) ===== */}
      <Rail title={t('home.myList')} items={favorites} t={t} nowFor={nowFor} />

      {/* ===== continue watching (only if there's history) ===== */}
      {history.length > 0 && (
        <section className="nshome-section">
          <div className="nshome-sec-head">
            <h2>{t('home.continue')}</h2>
          </div>
          <div className="nshome-rail">
            {history.slice(0, 10).map((h) => {
              const ch = channels.find((c) => c.id === h.channelId);
              return (
                <RailCard
                  key={h.channelId}
                  href={`/tv/live?ch=${encodeURIComponent(h.number)}`}
                  name={h.name}
                  logoUrl={h.logoUrl}
                  now={ch ? nowFor(ch) : undefined}
                  t={t}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ===== live now rail ===== */}
      <Rail title={t('home.liveNow')} items={live} t={t} showLive nowFor={nowFor} />

      {/* ===== category rails — one row per content type that the
           user's playlist actually contains (Sports / Movies / News /
           Docs / Kids). Gives the home the rich multi-row feel of a
           real streaming app without any placeholder content. ===== */}
      {catRails.map((r) => (
        <Rail key={r.titleKey} title={t(r.titleKey)} items={r.items} t={t} nowFor={nowFor} />
      ))}

      {/* ===== quick-access tiles =====
           Three large square tiles in the Opus IPTV style — icon up
           top on a tinted square, label, then a small count subtitle
           ("N Channels" for live, "Live now" for sports, "Today" for
           guide). The fourth tile (Catchup) moved into the live page
           UI so we hit the canonical 3-up layout. */}
      <section className="nshome-section">
        <div className="nshome-genre-grid">
          <Link href="/tv/live" className="nshome-genre-tile">
            <span className="nshome-genre-ic nshome-ic-live" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="13" rx="2"/><path d="M17 2 12 7 7 2"/>
              </svg>
            </span>
            <span className="nshome-genre-tile-label">{t('home.cat.live')}</span>
            {channels.length > 0 && (
              <span className="nshome-genre-tile-count">
                {channels.length} {t('home.channels')}
              </span>
            )}
          </Link>
          <Link href="/tv/sports" className="nshome-genre-tile">
            <span className="nshome-genre-ic nshome-ic-sports" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0z"/>
              </svg>
            </span>
            <span className="nshome-genre-tile-label">{t('home.cat.sports')}</span>
            <span className="nshome-genre-tile-count">{t('home.liveNow')}</span>
          </Link>
          <Link href="/tv/guide" className="nshome-genre-tile">
            <span className="nshome-genre-ic nshome-ic-guide" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>
              </svg>
            </span>
            <span className="nshome-genre-tile-label">{t('home.cat.guide')}</span>
            <span className="nshome-genre-tile-count">{t('home.today')}</span>
          </Link>
        </div>
      </section>

      {/* Bottom tab nav is rendered globally by the /tv layout
          (MobileTabBar); no duplicate here. */}
    </main>
  );
}
