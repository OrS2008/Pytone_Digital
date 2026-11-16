'use client';

// One series: seasons and episodes. /tv/series/view?p=<provider>&id=<series>

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import { useT } from '@/lib/i18n';
import { getSeries } from '@/lib/providersClient';
import { getProgress, progressKey } from '@/lib/vodProgress';
import FavButton from '@/components/tv/vod/FavButton';
import type { SeriesDetail } from '@/lib/providers/types';
import '@/components/tv/vod/vod.css';

export default function SeriesView() {
  const { t } = useT();
  const router = useRouter();
  const [params, setParams] = useState<{ p: string; id: string } | null>(null);
  const [data, setData] = useState<SeriesDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState(0);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get('p') || '', id = q.get('id') || '';
    if (!/^[a-z0-9]{8,32}$/.test(p) || !id) { setError('Missing series reference.'); return; }
    setParams({ p, id });
    getSeries(p, id).then((d) => {
      setData(d);
      // Open on the season of the most recently watched episode.
      let best = 0, bestAt = 0;
      d.seasons.forEach((s, i) => s.episodes.forEach((e) => {
        const pr = getProgress(progressKey(p, 'episode', e.id));
        if (pr && pr.at > bestAt) { bestAt = pr.at; best = i; }
      }));
      setSeason(best);
    }).catch((e: Error) => setError(e.message));
  }, []);

  function play(seasonIdx: number, epIdx: number) {
    if (!params || !data) return;
    const s = data.seasons[seasonIdx];
    const e = s.episodes[epIdx];
    const q = new URLSearchParams({
      p: params.p, k: 'episode', id: e.id, ext: e.ext,
      t: `${data.series.name} · S${s.number}E${e.number}${e.title && !/^Episode \d+$/.test(e.title) ? ` · ${e.title}` : ''}`,
      img: data.series.poster, sid: params.id, si: String(seasonIdx), ei: String(epIdx),
    });
    router.push(`/tv/watch?${q}`);
  }

  const s = data?.series;
  return (
    <TvFocusProvider>
      <main className="vod">
        <div style={{ height: 100 }}><TvNav /></div>
        {error && <div className="vod-error">{error} <Link href="/tv/series">{t('vod.back')}</Link></div>}
        {!data && !error && <div className="vod-grid" style={{ paddingTop: 24 }}><div className="vod-skel" /></div>}
        {data && s && (
          <>
            <div className="vod-hero" style={s.backdrop ? { backgroundImage: `url("${s.backdrop.replace(/["\\]/g, '')}")` } : undefined}>
              <div className="vod-hero-body" style={{ paddingTop: 60 }}>
                <div className="vod-hero-poster">{s.poster ? <img src={s.poster} alt="" referrerPolicy="no-referrer" /> : null}</div>
                <div>
                  <h1>{s.name}</h1>
                  <div className="vod-facts">
                    {s.year ? <span>{s.year}</span> : null}
                    {s.rating ? <span>★ {s.rating.toFixed(1)}</span> : null}
                    {s.genre ? <span>{s.genre}</span> : null}
                    <span>{data.seasons.length} × {t('vod.season')}</span>
                  </div>
                </div>
              </div>
            </div>
            {params && (
              <div className="vod-actions" style={{ padding: '4px 22px 0' }}>
                <FavButton item={{ provider: params.p, kind: 'series', id: params.id, name: s.name, poster: s.poster }} />
              </div>
            )}
            {s.plot ? <p className="vod-plot" style={{ padding: '0 22px', maxWidth: 900 }}>{s.plot}</p> : null}
            {data.seasons.length > 1 && (
              <div className="vod-seasons" role="tablist" aria-label={t('vod.season')}>
                {data.seasons.map((x, i) => (
                  <button key={x.number} type="button" role="tab" aria-selected={i === season} aria-pressed={i === season}
                    className="vod-chip" onClick={() => setSeason(i)}>{x.name}</button>
                ))}
              </div>
            )}
            <div className="vod-eps">
              {data.seasons[season]?.episodes.map((e, i) => {
                const pr = params ? getProgress(progressKey(params.p, 'episode', e.id)) : null;
                return (
                  <button key={e.id} type="button" className="vod-ep" onClick={() => play(season, i)}>
                    <div className="vod-ep-thumb">
                      {e.still ? <img src={e.still} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{e.number}</span>}
                      {pr && pr.duration ? <span className="vod-progress"><i style={{ width: `${Math.round((pr.position / pr.duration) * 100)}%` }} /></span> : null}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="vod-ep-title">{e.number}. {e.title || `${t('vod.episode')} ${e.number}`}</div>
                      {e.durationMin ? <div className="vod-meta">{e.durationMin} {t('vod.min')}</div> : null}
                      {e.plot ? <div className="vod-ep-plot">{e.plot}</div> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </main>
    </TvFocusProvider>
  );
}
