'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TvFocusProvider, useSetZone } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import TvHero from '@/components/tv/TvHero';
import SmartHomeRow from '@/components/tv/SmartHomeRow';
import ContinueWatchingRow from '@/components/tv/ContinueWatchingRow';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { useT } from '@/lib/i18n';

// /tv — the TV-optimised home screen.
//
// When the user has a playlist, we render category rows backed by their
// real channels via SmartHomeRow. With no playlist we render a clean
// CTA pointing them to Sources — no fake content, no placeholders.

function TvHomeInner() {
  const router = useRouter();
  const focusHero = useSetZone('hero');
  const { t } = useT();
  const [hasPlaylist, setHasPlaylist] = useState(
    typeof window !== 'undefined' ? (getCachedChannels()?.length ?? 0) > 0 : false,
  );

  // Phones get the new mobile home — bounce them off the desktop layout
  // immediately. TVs (which advertise themselves in the UA) and laptop
  // viewports stay here.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isTv = /webOS|Web0S|SmartTV|Tizen|HbbTV|CrKey|AppleTV/i.test(ua);
    const isPhone = !isTv && /Android|iPhone|iPad|Mobile/i.test(ua) && window.innerWidth <= 820;
    if (isPhone) router.replace('/tv/home');
  }, [router]);

  useEffect(() => { focusHero(); }, [focusHero]);

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

        {hasPlaylist && (
          <>
            <SmartHomeRow title={t('home.liveNow')}     pick="live"          limit={12} />
            <SmartHomeRow title={t('home.sports')}      pick="sports"        limit={12} />
            <SmartHomeRow title={t('home.recommended')} pick="entertainment" limit={12} />
            <SmartHomeRow title={t('home.recent')}      pick="movies"        limit={12} />
            <SmartHomeRow title={t('home.news')}        pick="news"          limit={12} />
            <SmartHomeRow title={t('home.kids')}        pick="kids"          limit={12} />
            <SmartHomeRow title={t('home.music')}       pick="music"         limit={12} />
            <SmartHomeRow title={t('home.documentaries')} pick="documentary" limit={12} />
          </>
        )}
        {/* When no playlist is configured the hero already carries the
            "Add my playlist" CTA — we don't duplicate it below. */}
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
