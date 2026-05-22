'use client';

import { TvFocusProvider } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import TvHomeRow from '@/components/tv/TvHomeRow';

const ROWS = [
  { id: 'sp-live',       title: 'Live now' },
  { id: 'sp-football',   title: 'Football' },
  { id: 'sp-basketball', title: 'Basketball' },
  { id: 'sp-soccer',     title: 'Soccer' },
  { id: 'sp-tennis',     title: 'Tennis' },
  { id: 'sp-mma',        title: 'MMA & Boxing' },
  { id: 'sp-replays',    title: 'Replays' },
];

export default function SportsHome() {
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
