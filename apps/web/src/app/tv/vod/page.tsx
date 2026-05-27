'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import SmartHomeRow from '@/components/tv/SmartHomeRow';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { useT } from '@/lib/i18n';

// /tv/vod — movies & series rails.
//
// We don't ship a VOD catalogue yet (that lives behind /api/vod when the
// metadata backend is online). For now, when the user has a playlist
// we surface the movie-flavoured channels from it via SmartHomeRow.
// Otherwise we show a single empty state so paying customers never see
// placeholder posters.

export default function VodHome() {
  const { t } = useT();
  const [hasPlaylist, setHasPlaylist] = useState(
    typeof window !== 'undefined' ? (getCachedChannels()?.length ?? 0) > 0 : false,
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadChannels();
      if (!cancelled) setHasPlaylist(list.length > 0);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>
        <div style={{ padding: '24px 0 64px' }}>
          {hasPlaylist ? (
            <>
              <SmartHomeRow title={t('vod.featured')}     pick="movies"        limit={16} />
              <SmartHomeRow title={t('vod.entertainment')} pick="entertainment" limit={16} />
              <SmartHomeRow title={t('vod.documentaries')} pick="documentary"   limit={16} />
              <SmartHomeRow title={t('vod.kids')}          pick="kids"          limit={16} />
            </>
          ) : (
            <section className="tv-empty">
              <div className="tv-empty-card">
                <div className="tv-empty-icon">🎬</div>
                <h2 className="tv-empty-title">{t('vod.empty.title')}</h2>
                <p className="tv-empty-sub">{t('vod.empty.sub')}</p>
                <div className="tv-empty-actions">
                  <Link href="/tv/account/sources?tab=vod" className="tv-btn tv-btn-primary">
                    {t('vod.empty.cta')}
                  </Link>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </TvFocusProvider>
  );
}
