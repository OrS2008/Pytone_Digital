'use client';

// Series from the active Xtream / Stalker provider.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import Catalog, { Poster, type CatalogItem } from '@/components/tv/vod/Catalog';
import NoProvider from '@/components/tv/vod/NoProvider';
import { useT } from '@/lib/i18n';
import { activeProviderId, getSeriesList, type ProviderApiError } from '@/lib/providersClient';
import { continueWatching, type Progress } from '@/lib/vodProgress';
import type { Category, Series } from '@/lib/providers/types';
import '@/components/tv/vod/vod.css';

export default function SeriesPage() {
  const { t } = useT();
  const router = useRouter();
  const [pid, setPid] = useState<string | null | undefined>(undefined);
  const [series, setSeries] = useState<Series[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cw, setCw] = useState<Progress[]>([]);

  useEffect(() => {
    const id = activeProviderId();
    setPid(id);
    if (!id) { setLoading(false); return; }
    // One entry per series: the most recently watched episode.
    const seen = new Set<string>();
    setCw(continueWatching(id, 'episode').filter((p) => p.seriesId && !seen.has(p.seriesId) && seen.add(p.seriesId)));
    getSeriesList(id)
      .then((r) => { setSeries(r.series); setCategories(r.categories); })
      .catch((e: ProviderApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const items: CatalogItem[] = useMemo(() => series.map((s) => ({ ...s, added: null })), [series]);
  const openSeries = (id: string) => pid && router.push(`/tv/series/view?p=${pid}&id=${encodeURIComponent(id)}`);

  return (
    <TvFocusProvider>
      <main className="vod">
        <div style={{ height: 100 }}><TvNav /></div>
        {pid === null || (error && series.length === 0 && !loading)
          ? <NoProvider kind="series" error={pid ? error : null} />
          : (
            <>
              {cw.length > 0 && (
                <>
                  <div className="vod-section">{t('vod.continue')}</div>
                  <div className="vod-rail">
                    {cw.map((p) => (
                      <Poster
                        key={p.key}
                        item={{ id: p.seriesId!, name: p.title, poster: p.poster, categoryId: '', rating: null, year: null, progress: p.duration ? p.position / p.duration : 0 }}
                        onOpen={() => openSeries(p.seriesId!)}
                      />
                    ))}
                  </div>
                </>
              )}
              <Catalog
                title={t('nav.series')}
                items={items}
                categories={categories}
                loading={loading || pid === undefined}
                onOpen={(i) => openSeries(i.id)}
              />
            </>
          )}
      </main>
    </TvFocusProvider>
  );
}
