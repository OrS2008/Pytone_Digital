'use client';

import { useEffect } from 'react';
import { TvFocusProvider, useSetZone } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import TvHero from '@/components/tv/TvHero';
import TvHomeRow from '@/components/tv/TvHomeRow';
import ContinueWatchingRow from '@/components/tv/ContinueWatchingRow';
import { useT } from '@/lib/i18n';

/*
 * /tv — the TV-optimised home screen.
 *
 * The LG webOS IPK loads this URL directly. Browsers can also visit it for
 * dev / preview. The hierarchy mirrors the Flutter TV home: nav, hero, then
 * a vertical stack of horizontal focus zones.
 *
 * Why not server components? webOS WebKit hydration is slower than modern
 * Chromium; we trade SSR for a smaller and predictable client payload, which
 * is the right call for an app the IPK loads once per session.
 */

function TvHomeInner() {
  const focusHero = useSetZone('hero');
  const { t } = useT();
  useEffect(() => { focusHero(); }, [focusHero]);

  const ROWS = [
    { id: 'home-live',       title: t('home.liveNow') },
    { id: 'home-sports',     title: t('home.sports') },
    { id: 'home-trending',   title: t('home.trending') },
    { id: 'home-recommended',title: t('home.recommended') },
    { id: 'home-recent',     title: t('home.recent') },
    { id: 'home-replay',     title: t('home.replay') },
  ];

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ height: 100 }}><TvNav /></div>
      <TvHero />
      <div style={{ marginTop: 32, paddingBottom: 64 }}>
        <ContinueWatchingRow />
        {ROWS.map((r, i) => (
          <TvHomeRow
            key={r.id}
            zoneId={r.id}
            title={r.title}
            upZone={i === 0 ? 'hero' : ROWS[i - 1].id}
            downZone={i === ROWS.length - 1 ? undefined : ROWS[i + 1].id}
          />
        ))}
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
