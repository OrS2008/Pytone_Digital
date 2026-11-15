'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getHistoryFor, type WatchEntry } from '@/lib/watchHistory';
import { loadChannels } from '@/lib/channelCache';
import { useT } from '@/lib/i18n';
import ScrollableRow from './ScrollableRow';

// Real "Continue Watching" row, fed from the tenant's localStorage
// history. Renders nothing if the user has never watched anything —
// which is the right default for new accounts.

export default function ContinueWatchingRow() {
  const [items, setItems] = useState<WatchEntry[]>([]);
  const { t } = useT();

  // Only channels that exist in the playlist loaded right now.
  useEffect(() => {
    let cancelled = false;
    loadChannels().then((list) => { if (!cancelled) setItems(getHistoryFor(list).slice(0, 12)); });
    return () => { cancelled = true; };
  }, []);

  if (items.length === 0) return null;

  return (
    <ScrollableRow rowClassName="tv-row tv-row-cw" title={t('home.continue')}>
      {items.map((e) => (
        <Link key={e.channelId} href={`/tv/live?ch=${encodeURIComponent(String(e.number))}`} className="tv-tile tv-tile-cw">
          {e.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={e.logoUrl} alt="" />
            : <div className="tv-tile-num">{e.number}</div>}
          <div className="tv-tile-gradient" />
          <div className="tv-tile-caption">{e.name}</div>
        </Link>
      ))}
    </ScrollableRow>
  );
}
