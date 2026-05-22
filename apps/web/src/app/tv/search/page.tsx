'use client';

import { useState } from 'react';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import TvNav from '@/components/tv/TvNav';
import TvHomeRow from '@/components/tv/TvHomeRow';

const SUGGESTIONS = [
  'Premier League', 'Champions League', 'Stranger Things',
  'F1', 'NBA', 'Eurovision', 'Drake', 'Yuval Dayan',
];

export default function SearchHome() {
  const [q, setQ] = useState('');

  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>
        <div style={{ padding: '24px 24px 16px', maxWidth: 980, margin: '0 auto' }}>
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search channels, films, sports, shows…"
            style={{
              width: '100%',
              fontSize: 24,
              padding: '18px 24px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: '#E9EBF1',
              outline: 'none',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          />
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16,
            color: '#B7BEC9', fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            <span style={{ opacity: 0.6, alignSelf: 'center', marginRight: 6 }}>Try:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                style={{
                  padding: '8px 14px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'inherit', cursor: 'pointer', fontSize: 14,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div style={{ paddingBottom: 64, marginTop: 16 }}>
          <TvHomeRow zoneId="search-results" title={q ? `Results for "${q}"` : 'Popular right now'} />
          <TvHomeRow zoneId="search-recent"  title="Recently searched" upZone="search-results" />
        </div>
      </main>
    </TvFocusProvider>
  );
}
