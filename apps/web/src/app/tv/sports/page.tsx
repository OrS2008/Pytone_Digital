'use client';

import { useEffect, useState, useLayoutEffect } from 'react';
import Link from 'next/link';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import SmartHomeRow from '@/components/tv/SmartHomeRow';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { useT } from '@/lib/i18n';

// /tv/sports — sports rails sourced from the user's own channels.
// No fake "Football #1, #2…" tiles. If there's no playlist, we say so
// and link to the place where it's added.

export default function SportsHome() {
  const { t } = useT();
  // Hydration-safe (React #418 fix): match server HTML, hydrate pre-paint.
  const [hasPlaylist, setHasPlaylist] = useState(false);
  useLayoutEffect(() => {
    if ((getCachedChannels()?.length ?? 0) > 0) setHasPlaylist(true);
  }, []);
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
              <SmartHomeRow title={t('sports.liveNow')}   pick="sports"  limit={20} />
              <SmartHomeRow title={t('sports.newsTalk')}  pick="news"    limit={12} />
            </>
          ) : (
            <section className="tv-empty">
              <div className="tv-empty-card">
                <div className="tv-empty-icon">🏟️</div>
                <h2 className="tv-empty-title">{t('sports.empty.title')}</h2>
                <p className="tv-empty-sub">{t('sports.empty.sub')}</p>
                <div className="tv-empty-actions">
                  <Link href="/tv/account/sources" className="tv-btn tv-btn-primary">
                    {t('sports.empty.cta')}
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
