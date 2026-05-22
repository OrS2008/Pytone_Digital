'use client';

import { useEffect, useState } from 'react';
import { TvFocusProvider, useSetZone } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import TvHero from '@/components/tv/TvHero';
import TvHomeRow from '@/components/tv/TvHomeRow';
import SmartHomeRow from '@/components/tv/SmartHomeRow';
import ContinueWatchingRow from '@/components/tv/ContinueWatchingRow';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { useT } from '@/lib/i18n';

/*
 * /tv — the TV-optimised home screen.
 *
 * Layout: hero up top, then a series of rows. When the user has a
 * playlist loaded we fill the rows with their actual channels grouped
 * by SmartHomeRow's category scorer. Without a playlist we fall back
 * to the legacy picsum-backed rows so the screen still looks alive.
 */

function TvHomeInner() {
  const focusHero = useSetZone('hero');
  const { t } = useT();
  const [hasPlaylist, setHasPlaylist] = useState(
    typeof window !== 'undefined' ? (getCachedChannels()?.length ?? 0) > 0 : false,
  );

  useEffect(() => { focusHero(); }, [focusHero]);

  // If the cache is empty on mount we kick a load — the row components
  // each subscribe and re-render once channels arrive.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadChannels();
      if (!cancelled) setHasPlaylist(list.length > 0);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ height: 100 }}><TvNav /></div>
      <TvHero />
      <div style={{ marginTop: 32, paddingBottom: 64 }}>
        <ContinueWatchingRow />

        {hasPlaylist ? (
          <>
            <SmartHomeRow title={t('home.liveNow')}     pick="live"          limit={12} />
            <SmartHomeRow title={t('home.sports')}      pick="sports"        limit={12} />
            <SmartHomeRow title={t('home.recommended')} pick="entertainment" limit={12} />
            <SmartHomeRow title={t('home.recent')}      pick="movies"        limit={12} />
            <SmartHomeRow title="News"                  pick="news"          limit={12} />
            <SmartHomeRow title="Kids"                  pick="kids"          limit={12} />
            <SmartHomeRow title="Music"                 pick="music"         limit={12} />
            <SmartHomeRow title="Documentaries"         pick="documentary"   limit={12} />
          </>
        ) : (
          // Fallback when no playlist is configured — the legacy rows
          // give the home a "filled" look until the user adds a source.
          [
            { id: 'home-live',       title: t('home.liveNow') },
            { id: 'home-sports',     title: t('home.sports') },
            { id: 'home-trending',   title: t('home.trending') },
            { id: 'home-recommended',title: t('home.recommended') },
            { id: 'home-recent',     title: t('home.recent') },
            { id: 'home-replay',     title: t('home.replay') },
          ].map((r, i, arr) => (
            <TvHomeRow
              key={r.id}
              zoneId={r.id}
              title={r.title}
              upZone={i === 0 ? 'hero' : arr[i - 1].id}
              downZone={i === arr.length - 1 ? undefined : arr[i + 1].id}
            />
          ))
        )}
      </div>
    </main>
  );
}

export default function TvHome() {
  return (
    <TvFocusProvider>
      <TvHomeInner />
    </TvFocusProvider>
  );
}
