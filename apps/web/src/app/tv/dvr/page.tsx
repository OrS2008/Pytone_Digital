'use client';

import { TvFocusProvider } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import TvHomeRow from '@/components/tv/TvHomeRow';

const ROWS = [
  { id: 'dvr-mine',      title: 'My recordings' },
  { id: 'dvr-scheduled', title: 'Scheduled' },
  { id: 'dvr-replays',   title: 'Replay (last 14 days)' },
  { id: 'dvr-series',    title: 'Series passes' },
];

export default function DvrHome() {
  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>
        <div style={{ padding: '24px 24px 32px' }}>
          <div style={{
            color: 'var(--ns-text, #E9EBF1)',
            fontFamily: 'Inter, system-ui, sans-serif',
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
            maxWidth: 1280,
          }}>
            {[
              { k: 'Storage',       v: '184 / 500 GB' },
              { k: 'Recordings',    v: '47 titles' },
              { k: 'Scheduled',     v: '12 upcoming' },
              { k: 'Retention',     v: 'Rolling 14 days' },
            ].map((s) => (
              <div key={s.k} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: 16,
              }}>
                <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>{s.k}</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ paddingBottom: 64 }}>
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
