'use client';

import { useEffect } from 'react';
import { TvFocusProvider, useSetZone } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import TvHero from '@/components/tv/TvHero';
import TvHomeRow from '@/components/tv/TvHomeRow';

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

const ROWS = [
  { id: 'home-continue',   title: 'Continue Watching' },
  { id: 'home-live',       title: 'Live Now' },
  { id: 'home-sports',     title: 'Sports' },
  { id: 'home-trending',   title: 'Trending' },
  { id: 'home-recommended',title: 'Recommended for You' },
  { id: 'home-recent',     title: 'Recently Added' },
  { id: 'home-replay',     title: 'Replay Highlights' },
];

function TvHomeInner() {
  const focusHero = useSetZone('hero');
  useEffect(() => { focusHero(); }, [focusHero]);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ height: 100 }}><TvNav /></div>
      <TvHero />
      <div style={{ marginTop: 32, paddingBottom: 64 }}>
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
