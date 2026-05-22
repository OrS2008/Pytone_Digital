'use client';

import { TvFocusProvider } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import TvHomeRow from '@/components/tv/TvHomeRow';

const ROWS = [
  { id: 'vod-new',       title: 'New releases' },
  { id: 'vod-trending',  title: 'Trending movies' },
  { id: 'vod-action',    title: 'Action' },
  { id: 'vod-drama',     title: 'Drama' },
  { id: 'vod-comedy',    title: 'Comedy' },
  { id: 'vod-thriller',  title: 'Thrillers' },
  { id: 'vod-family',    title: 'Family' },
  { id: 'vod-documentary', title: 'Documentaries' },
];

export default function VodHome() {
  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>
        <div style={{ padding: '24px 0 64px' }}>
          {ROWS.map((r, i) => (
            <TvHomeRow
              key={r.id}
              zoneId={r.id}
              title={r.title}
              upZone={i === 0 ? undefined : ROWS[i - 1].id}
              downZone={i === ROWS.length - 1 ? undefined : ROWS[i + 1].id}
            />
          ))}
        </div>
      </main>
    </TvFocusProvider>
  );
}
