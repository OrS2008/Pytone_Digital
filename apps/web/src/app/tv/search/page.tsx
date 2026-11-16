'use client';

/*
 * Search — real client-side filter across the channels the user
 * actually loaded (their M3U on /tv/account/sources). With Web Speech
 * API behind the mic button so users can speak the query instead of
 * typing.
 *
 * Tries the user's channels first; falls back to a thin demo list
 * when no playlist is configured so the page is never empty.
 */

import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import Link from 'next/link';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import type { M3UChannel } from '@/lib/m3u';
import { useT } from '@/lib/i18n';
import { activeProviderId, cachedCaps, getMovies, getSeriesList } from '@/lib/providersClient';
import type { Movie, Series } from '@/lib/providers/types';

interface SpeechRecognitionResult { transcript: string }
interface SpeechRecognitionEvent { results: { 0: { 0: SpeechRecognitionResult } } & ArrayLike<unknown> }
interface SpeechRecognitionInstance {
  lang: string; interimResults: boolean; continuous: boolean;
  start: () => void; stop: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror:  ((e: { error?: string }) => void) | null;
  onend:    (() => void) | null;
}
declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    SpeechRecognition?:        new () => SpeechRecognitionInstance;
  }
}

export default function SearchHome() {
  const { t } = useT();
  const [q, setQ] = useState('');
  // Unified search: when the active provider offers movies / series,
  // their titles are searched too. Catalogues load on the first query.
  const [vodPid, setVodPid] = useState<string | null>(null);
  const [vod, setVod] = useState<{ movies: Movie[]; series: Series[] } | null>(null);
  useEffect(() => {
    const id = activeProviderId();
    const caps = cachedCaps(id);
    if (id && (caps?.vod || caps?.series)) setVodPid(id);
  }, []);
  useEffect(() => {
    if (!vodPid || vod || q.trim().length < 2) return;
    const caps = cachedCaps(vodPid);
    Promise.all([
      caps?.vod ? getMovies(vodPid).then((r) => r.movies).catch(() => [] as Movie[]) : Promise.resolve([] as Movie[]),
      caps?.series ? getSeriesList(vodPid).then((r) => r.series).catch(() => [] as Series[]) : Promise.resolve([] as Series[]),
    ]).then(([movies, series]) => setVod({ movies, series }));
  }, [vodPid, vod, q]);
  // Hydrate synchronously from the shared cache so the channel grid
  // appears instantly when the user comes back from another tab.
  // Hydration-safe: start empty (matches the server HTML); the layout
  // effect swaps in the cache before first paint. Cache-in-initializer
  // caused React #418 on warm visits.
  const [channels, setChannels] = useState<M3UChannel[]>([]);
  const [loading, setLoading]   = useState(true);
  useLayoutEffect(() => {
    const cached = getCachedChannels();
    if (cached && cached.length > 0) { setChannels(cached); setLoading(false); }
  }, []);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const parsed = await loadChannels();
      if (cancelled) return;
      setChannels(parsed);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Selected category ('' = all). Reset when the playlist changes so a
  // category from a previous playlist can't leave the list empty.
  const [cat, setCat] = useState('');
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of channels) {
      const k = c.category || '';
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [channels]);
  useEffect(() => {
    if (cat && !categories.some((c) => c.name === cat)) setCat('');
  }, [cat, categories]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = cat ? channels.filter((c) => c.category === cat) : channels;
    if (!needle) return pool;
    return pool.filter((c) =>
      c.name.toLowerCase().includes(needle) ||
      c.category.toLowerCase().includes(needle) ||
      String(c.number).includes(needle),
    );
  }, [q, cat, channels]);
  // Cap what we render; the count line still reports the full number.
  const filtered = useMemo(() => matches.slice(0, q.trim() || cat ? 300 : 60), [matches, q, cat]);

  // ---- Voice ----------------------------------------------------------
  const vodMatches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!vod || needle.length < 2) return [];
    const hit = (n: string) => n.toLowerCase().includes(needle);
    return [
      ...vod.movies.filter((m) => hit(m.name)).map((m) => ({ kind: 'movie' as const, id: m.id, name: m.name, poster: m.poster, year: m.year, ext: m.ext })),
      ...vod.series.filter((s) => hit(s.name)).map((s) => ({ kind: 'series' as const, id: s.id, name: s.name, poster: s.poster, year: s.year, ext: '' })),
    ];
  }, [vod, q]);

  const recRef = useRef<SpeechRecognitionInstance | null>(null);

  function startVoice() {
    setVoiceError(null);
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { setVoiceError('Voice search is not supported on this browser.'); return; }
    try {
      const r = new Ctor();
      r.lang = (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
      r.interimResults = false;
      r.continuous = false;
      r.onresult = (e) => {
        const transcript = (e.results[0] as unknown as { 0: SpeechRecognitionResult })[0].transcript;
        setQ(transcript);
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed') setVoiceError('Microphone permission was denied.');
        else if (e.error === 'no-speech') setVoiceError('No speech detected. Try again.');
        else setVoiceError('Voice search failed.');
      };
      r.onend = () => setListening(false);
      r.start();
      recRef.current = r;
      setListening(true);
    } catch { setVoiceError('Voice search unavailable.'); }
  }
  function stopVoice() { recRef.current?.stop(); setListening(false); }

  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>

        <div style={{ padding: '24px 24px 16px', maxWidth: 980, margin: '0 auto' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('search.ph')}
              style={{
                width: '100%',
                fontSize: 24,
                padding: '18px 56px 18px 24px',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: '#E9EBF1',
                outline: 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />
            <button
              type="button"
              onClick={listening ? stopVoice : startVoice}
              title={listening ? 'Stop listening' : 'Search by voice'}
              aria-label={listening ? 'Stop voice search' : 'Start voice search'}
              style={{
                position: 'absolute',
                right: 10, top: '50%', transform: 'translateY(-50%)',
                width: 44, height: 44, borderRadius: 999,
                border: 0,
                background: listening ? 'var(--ns-accent, #FF3B6E)' : 'rgba(255,255,255,0.08)',
                color: '#fff', fontSize: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: listening ? '0 0 0 6px rgba(255,59,110,0.18)' : 'none',
                transition: 'all 160ms',
              }}
            >
              {listening ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
                </svg>
              )}
            </button>
          </div>

          {voiceError && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--ns-danger, #FF6B7B)' }}>{voiceError}</div>
          )}

          {/* Category filter — built from the playlist that is loaded
              right now, biggest categories first. Scrolls sideways on
              phones instead of wrapping into a wall of chips. */}
          {categories.length > 1 && (
            <div
              role="tablist"
              aria-label={t('search.categories')}
              style={{
                display: 'flex', gap: 8, marginTop: 16, paddingBottom: 6,
                overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {[{ name: '', count: channels.length }, ...categories].map((c) => {
                const on = cat === c.name;
                return (
                  <button
                    key={c.name || '__all'}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setCat(c.name)}
                    style={{
                      flex: '0 0 auto',
                      padding: '9px 14px', borderRadius: 999,
                      background: on ? 'var(--ns-accent, #FF3B6E)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                      color: on ? '#fff' : '#B7BEC9',
                      cursor: 'pointer', fontSize: 14, fontWeight: on ? 700 : 500,
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                  >
                    {c.name || t('search.all')}
                    <span style={{ opacity: 0.6, marginInlineStart: 6, fontSize: 12 }}>{c.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Movies & series matches (unified search) */}
        {vodPid && vodMatches.length > 0 && (
          <div style={{ padding: '0 24px 8px', maxWidth: 1280, margin: '0 auto' }}>
            <div style={{ fontSize: 13, color: '#6E7480', marginBottom: 10 }}>{t('search.vodHeading')} · {vodMatches.length}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 12, marginBottom: 18 }}>
              {vodMatches.slice(0, 24).map((m) => (
                <Link
                  key={m.kind + m.id}
                  href={m.kind === 'movie'
                    ? `/tv/watch?${new URLSearchParams({ p: vodPid, k: 'movie', id: m.id, ext: m.ext, t: m.name, img: m.poster })}`
                    : `/tv/series/view?p=${vodPid}&id=${encodeURIComponent(m.id)}`}
                  style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 12, alignItems: 'center', padding: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, textDecoration: 'none', color: '#E9EBF1' }}
                >
                  <div style={{ width: 40, height: 60, borderRadius: 6, overflow: 'hidden', background: '#161A22' }}>
                    {m.poster ? <img src={m.poster} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: '#8B95A7' }}>{m.kind === 'movie' ? t('nav.movies') : t('nav.series')}{m.year ? ` · ${m.year}` : ''}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        <div style={{ padding: '0 24px 64px', maxWidth: 1280, margin: '0 auto' }}>
          {loading && <p style={{ color: '#B7BEC9' }}>{t('search.loading')}</p>}
          {!loading && channels.length === 0 && (
            <p style={{ color: '#B7BEC9' }}>
              {t('catchup.addPlaylist')}{' '}
              <Link href="/tv/account/sources" style={{ color: 'var(--ns-accent, #FF3B6E)' }}>{t('catchup.sourcesLink')}</Link>{' '}
              {t('search.toSearch')}
            </p>
          )}
          {!loading && channels.length > 0 && (
            <>
              <div style={{ fontSize: 13, color: '#6E7480', marginBottom: 14 }}>
                {q.trim()
                  ? `${matches.length} ${t('search.results')} · "${q}"${cat ? ` · ${cat}` : ''}`
                  : cat
                    ? `${matches.length} ${t('search.channels')} · ${cat}`
                    : `${channels.length} ${t('search.channels')}`}
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 12,
              }}>
                {filtered.length === 0 && (
                  <p style={{ color: '#B7BEC9', gridColumn: '1 / -1' }}>{t('search.noResults')}</p>
                )}
                {filtered.map((c) => (
                  // Deep-link straight into the player at fullscreen
                  // by passing ?ch=<number>&preview=1 — the live page
                  // tunes the channel and starts the small-preview
                  // player but stays out of fullscreen. The user
                  // explicitly clicks ⛶ Fullscreen when they want it.
                  <Link
                    key={c.id + '-' + c.number}
                    href={`/tv/live?ch=${encodeURIComponent(String(c.number))}&preview=1`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '48px 1fr',
                      gap: 12, alignItems: 'center',
                      padding: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 12,
                      textDecoration: 'none',
                      color: '#E9EBF1',
                    }}
                  >
                    <div style={{
                      width: 48, height: 48, borderRadius: 8,
                      background: '#161A22',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {c.logoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={c.logoUrl} alt="" style={{ maxWidth: 44, maxHeight: 44, objectFit: 'contain' }} />
                        : <span style={{ fontWeight: 700, color: '#6E7480' }}>{c.number}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#8B95A7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        #{c.number} · {c.category}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </TvFocusProvider>
  );
}
