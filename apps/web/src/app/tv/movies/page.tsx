'use client';

// Movies from the active Xtream / Stalker provider.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import Catalog, { Poster, type CatalogItem } from '@/components/tv/vod/Catalog';
import NoProvider from '@/components/tv/vod/NoProvider';
import FavButton from '@/components/tv/vod/FavButton';
import { listFavorites, onFavoritesChange, type VodFavorite } from '@/lib/vodFavorites';
import { useT } from '@/lib/i18n';
import { activeProviderId, getMovie, getMovies, type ProviderApiError } from '@/lib/providersClient';
import { continueWatching, getProgress, progressKey, type Progress } from '@/lib/vodProgress';
import type { Category, Movie, MovieDetail } from '@/lib/providers/types';
import '@/components/tv/vod/vod.css';

type PlayArgs = { id: string; ext: string; name: string; poster: string };

export default function MoviesPage() {
  const { t } = useT();
  const router = useRouter();
  const [pid, setPid] = useState<string | null | undefined>(undefined);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Movie | null>(null);
  const [cw, setCw] = useState<Progress[]>([]);
  const [favs, setFavs] = useState<VodFavorite[]>([]);
  useEffect(() => {
    const id = activeProviderId();
    const load = () => setFavs(listFavorites(id, 'movie'));
    load();
    return onFavoritesChange(load);
  }, []);

  useEffect(() => {
    const id = activeProviderId();
    setPid(id);
    if (!id) { setLoading(false); return; }
    setCw(continueWatching(id, 'movie'));
    getMovies(id)
      .then((r) => { setMovies(r.movies); setCategories(r.categories); })
      .catch((e: ProviderApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const items: CatalogItem[] = useMemo(() => movies.map((m) => {
    const p = pid ? getProgress(progressKey(pid, 'movie', m.id)) : null;
    return { ...m, progress: p && p.duration ? p.position / p.duration : undefined };
  }), [movies, pid]);

  const play = useCallback((m: PlayArgs) => {
    if (!pid) return;
    const q = new URLSearchParams({ p: pid, k: 'movie', id: m.id, ext: m.ext, t: m.name, img: m.poster });
    router.push(`/tv/watch?${q}`);
  }, [pid, router]);

  const closeSheet = useCallback(() => setOpen(null), []);

  return (
    <TvFocusProvider>
      <main className="vod">
        <div style={{ height: 100 }}><TvNav /></div>
        {pid === null || (error && movies.length === 0 && !loading)
          ? <NoProvider kind="movies" error={pid ? error : null} />
          : (
            <>
              {cw.length > 0 && (
                <>
                  <div className="vod-section">{t('vod.continue')}</div>
                  <div className="vod-rail">
                    {cw.map((p) => (
                      <Poster
                        key={p.key}
                        item={{ id: p.id, name: p.title, poster: p.poster, categoryId: '', rating: null, year: null, progress: p.duration ? p.position / p.duration : 0 }}
                        onOpen={() => play({ id: p.id, ext: p.ext, name: p.title, poster: p.poster })}
                      />
                    ))}
                  </div>
                </>
              )}
              {favs.length > 0 && (
                <>
                  <div className="vod-section">{t('vod.myList')}</div>
                  <div className="vod-rail">
                    {favs.map((f) => (
                      <Poster key={f.key} item={{ id: f.id, name: f.name, poster: f.poster, categoryId: '', rating: null, year: null }}
                        onOpen={() => setOpen(movies.find((m) => m.id === f.id) ?? { id: f.id, name: f.name, poster: f.poster, categoryId: '', rating: null, year: null, added: null, ext: f.ext || 'mp4' })} />
                    ))}
                  </div>
                </>
              )}
              <Catalog
                title={t('nav.movies')}
                items={items}
                categories={categories}
                loading={loading || pid === undefined}
                onOpen={(i) => setOpen(movies.find((m) => m.id === i.id) ?? null)}
              />
            </>
          )}
        {open && pid && <MovieSheet pid={pid} movie={open} onClose={closeSheet} onPlay={play} />}
      </main>
    </TvFocusProvider>
  );
}

function MovieSheet({ pid, movie, onClose, onPlay }: {
  pid: string; movie: Movie; onClose: () => void; onPlay: (m: PlayArgs) => void;
}) {
  const { t } = useT();
  const [d, setD] = useState<MovieDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const resume = getProgress(progressKey(pid, 'movie', movie.id));

  useEffect(() => {
    getMovie(pid, movie.id).then((r) => setD(r.movie)).catch((e: Error) => setErr(e.message));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'GoBack') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pid, movie.id, onClose]);

  const m: MovieDetail = d ?? { ...movie, plot: '', genre: '', durationMin: null, cast: '', director: '', backdrop: '' };
  return (
    <div className="vod-sheet-backdrop" onClick={onClose} role="presentation">
      <div className="vod-sheet" role="dialog" aria-modal="true" aria-label={m.name} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="vod-close" onClick={onClose} aria-label={t('vod.close')}>×</button>
        <div className="vod-hero" style={m.backdrop ? { backgroundImage: `url("${m.backdrop.replace(/["\\]/g, '')}")` } : undefined}>
          <div className="vod-hero-body">
            <div className="vod-hero-poster">{m.poster ? <img src={m.poster} alt="" referrerPolicy="no-referrer" /> : null}</div>
            <div>
              <h1>{m.name}</h1>
              <div className="vod-facts">
                {m.year ? <span>{m.year}</span> : null}
                {m.durationMin ? <span>{m.durationMin} {t('vod.min')}</span> : null}
                {m.rating ? <span>★ {m.rating.toFixed(1)}</span> : null}
                {m.genre ? <span>{m.genre}</span> : null}
              </div>
            </div>
          </div>
        </div>
        <div className="vod-body">
          <div className="vod-actions">
            <button type="button" className="vod-btn" autoFocus onClick={() => onPlay({ id: m.id, ext: m.ext, name: m.name, poster: m.poster })}>
              ▶ {resume ? t('vod.resume') : t('vod.play')}
            </button>
            <FavButton item={{ provider: pid, kind: 'movie', id: m.id, name: m.name, poster: m.poster, ext: m.ext }} />
          </div>
          {err && <div className="vod-error" style={{ margin: '12px 0 0' }}>{err}</div>}
          {m.plot ? <p className="vod-plot">{m.plot}</p> : null}
          {(m.cast || m.director) ? (
            <div className="vod-credits">
              {m.director ? <div>{t('vod.director')}: {m.director}</div> : null}
              {m.cast ? <div>{t('vod.cast')}: {m.cast}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
