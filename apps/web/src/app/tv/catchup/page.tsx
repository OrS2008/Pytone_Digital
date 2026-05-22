'use client';

/*
 * /tv/catchup — pick up a programme that already aired.
 *
 * In production this reads from the catch-up service: every channel
 * the user is subscribed to streams to a 14-day rolling segment store
 * (S3, content-addressed), and the EPG service tags each programme
 * with a catchupAvailable boolean. The page then lists the user's
 * channels and lets them open any programme from the last week.
 *
 * Without the backend we render the same shape from what we already
 * have on the client:
 *   - The recordings list the user actually scheduled (Record button
 *     on the live screen).
 *   - The user's channels grouped by category, each with a synthesised
 *     "earlier today" / "yesterday" placeholder row so the page
 *     demonstrates the catalogue shape until the backend is up.
 *
 * Clicking any item routes to /tv/live?ch=<N> and a future revision
 * will pass a &start=<ts> query the catch-up player honours.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { userKey } from '@/lib/session';
import type { M3UChannel } from '@/lib/m3u';

interface Recording {
  id:        string;
  channelId: string;
  number:    number;
  channel:   string;
  title:     string;
  startsAt:  number;
  stopsAt:   number;
  scheduledAt: number;
}

type TabId = 'all' | 'recordings' | 'today' | 'yesterday' | 'week';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all',         label: 'All channels' },
  { id: 'recordings',  label: 'My recordings' },
  { id: 'today',       label: 'Earlier today' },
  { id: 'yesterday',   label: 'Yesterday' },
  { id: 'week',        label: 'Last 7 days' },
];

function fmtClock(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtDayClock(d: Date) {
  const date = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  return `${date} ${fmtClock(d)}`;
}

// Build a synthetic catch-up listing per channel — six half-hour slots
// going back from the current top of the hour. Used until the EPG
// backend provides real catchup metadata.
function syntheticSlots(now: Date, count = 6): { start: Date; stop: Date; titleSeed: string }[] {
  const base = new Date(now);
  base.setMinutes(0, 0, 0);
  const out: { start: Date; stop: Date; titleSeed: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const start = new Date(base.getTime() - i * 30 * 60_000);
    const stop  = new Date(start.getTime() + 30 * 60_000);
    out.push({ start, stop, titleSeed: `slot-${i}` });
  }
  return out;
}

export default function CatchupPage() {
  const [channels, setChannels] = useState<M3UChannel[]>(
    (typeof window !== 'undefined' ? getCachedChannels() : null) ?? [],
  );
  const [recs, setRecs] = useState<Recording[]>([]);
  const [tab, setTab] = useState<TabId>('all');
  const [q,   setQ]   = useState('');

  // Load channels (uses the shared cache so it's instant after the
  // first visit) and recordings on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadChannels();
      if (!cancelled && list.length > 0) setChannels(list);
    })();
    try {
      const raw = localStorage.getItem(userKey('recordings'));
      if (raw) setRecs(JSON.parse(raw) as Recording[]);
    } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, []);

  const visibleChannels = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return channels
      .filter((c) => !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.category.toLowerCase().includes(needle) ||
        String(c.number).includes(needle))
      // Cap the list so the page renders fast even on 5000-channel playlists.
      .slice(0, 40);
  }, [channels, q]);

  function removeRecording(id: string) {
    const next = recs.filter((r) => r.id !== id);
    setRecs(next);
    try { localStorage.setItem(userKey('recordings'), JSON.stringify(next)); } catch { /* ignore */ }
  }

  const now = new Date();

  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>

        <header style={{ padding: '24px 24px 8px', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#6E7480', textTransform: 'uppercase' }}>Catch-up</div>
          <h1 style={{ margin: '6px 0 4px', fontSize: 28, fontWeight: 800, color: '#E9EBF1' }}>
            Watch what you missed
          </h1>
          <p style={{ margin: 0, color: '#B7BEC9', fontSize: 14, maxWidth: 720 }}>
            Anything that aired in the last 7 days, plus every programme you scheduled to record.
          </p>
        </header>

        <div style={{ padding: '8px 24px 0', maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {TABS.map((tt) => (
            <button
              key={tt.id}
              onClick={() => setTab(tt.id)}
              style={{
                padding: '8px 16px',
                fontSize: 13, fontWeight: 600,
                borderRadius: 999,
                border: 0,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: tab === tt.id ? '#FF3B6E' : 'rgba(255,255,255,0.05)',
                color:      tab === tt.id ? '#fff'    : '#B7BEC9',
              }}
            >
              {tt.label}
            </button>
          ))}
        </div>

        {tab !== 'recordings' && (
          <div style={{ padding: '12px 24px 0', maxWidth: 1280, margin: '0 auto' }}>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter channels…"
              style={{
                width: '100%',
                fontSize: 15,
                padding: '12px 16px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: '#E9EBF1',
                outline: 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />
          </div>
        )}

        <section style={{ padding: '16px 24px 64px', maxWidth: 1280, margin: '0 auto' }}>
          {/* MY RECORDINGS TAB ---------------------------------------- */}
          {tab === 'recordings' && (
            <>
              {recs.length === 0 ? (
                <div style={{
                  padding: 32, textAlign: 'center',
                  border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 14,
                  color: '#B7BEC9',
                }}>
                  No recordings yet. Tap{' '}
                  <strong style={{ color: '#fff' }}>● Record</strong>{' '}
                  on any programme&apos;s info bar to schedule one.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {recs.map((r) => (
                    <div key={r.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '64px 1fr auto auto',
                      alignItems: 'center',
                      gap: 16,
                      padding: 14,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 12,
                    }}>
                      <div style={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 800, fontSize: 22, color: '#FF3B6E',
                        textAlign: 'center',
                      }}>{r.number}</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#E9EBF1' }}>{r.title}</div>
                        <div style={{ fontSize: 13, color: '#8B95A7' }}>
                          {r.channel} · {fmtDayClock(new Date(r.startsAt))} – {fmtClock(new Date(r.stopsAt))}
                        </div>
                      </div>
                      <Link
                        href={`/tv/live?ch=${encodeURIComponent(String(r.number))}`}
                        className="ac-btn ac-btn-primary ac-btn-sm"
                        style={{ background: '#FF3B6E', color: '#fff', padding: '8px 14px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}
                      >Play</Link>
                      <button
                        onClick={() => removeRecording(r.id)}
                        title="Remove from list"
                        style={{
                          padding: '8px 12px', borderRadius: 10,
                          background: 'transparent', color: '#FF6B7B',
                          border: '1px solid rgba(255,107,123,0.3)',
                          fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        }}
                      >Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* CHANNEL-BY-CHANNEL CATCH-UP -------------------------------- */}
          {tab !== 'recordings' && (
            <>
              {channels.length === 0 ? (
                <div style={{
                  padding: 32, textAlign: 'center',
                  border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 14,
                  color: '#B7BEC9',
                }}>
                  Add your playlist in{' '}
                  <Link href="/tv/account/sources" style={{ color: '#FF3B6E' }}>Playlists &amp; EPG</Link>{' '}
                  to see catch-up programmes for your channels.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 24 }}>
                  {visibleChannels.map((ch) => {
                    // Slot range depends on the active tab.
                    let slots = syntheticSlots(now, 6);
                    if (tab === 'yesterday') {
                      const yesterday = new Date(now);
                      yesterday.setDate(yesterday.getDate() - 1);
                      yesterday.setHours(22, 0, 0, 0);
                      slots = syntheticSlots(yesterday, 8);
                    } else if (tab === 'week') {
                      slots = Array.from({ length: 7 }).flatMap((_, d) => {
                        const day = new Date(now);
                        day.setDate(day.getDate() - (d + 1));
                        day.setHours(20, 30, 0, 0);
                        return syntheticSlots(day, 2);
                      });
                    }

                    return (
                      <div key={ch.id + '-' + ch.number}>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '44px 44px 1fr',
                          gap: 12, alignItems: 'center',
                          marginBottom: 8,
                        }}>
                          <div style={{ fontVariantNumeric: 'tabular-nums', color: '#A0A6B2', fontWeight: 700, fontSize: 16, textAlign: 'right' }}>
                            {ch.number}
                          </div>
                          <div style={{
                            width: 44, height: 32,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: '#1A1D26', borderRadius: 6, overflow: 'hidden',
                          }}>
                            {ch.logoUrl
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={ch.logoUrl} alt="" style={{ maxWidth: 40, maxHeight: 28, objectFit: 'contain' }} />
                              : <span style={{ fontSize: 10, fontWeight: 700, color: '#6E7480' }}>{ch.name.slice(0, 3)}</span>}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#E9EBF1' }}>{ch.name}</div>
                        </div>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                          gap: 8,
                        }}>
                          {slots.map((s, i) => (
                            <Link
                              key={i}
                              href={`/tv/live?ch=${encodeURIComponent(String(ch.number))}`}
                              style={{
                                display: 'block',
                                padding: 12,
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 10,
                                textDecoration: 'none',
                                color: '#E9EBF1',
                              }}
                            >
                              <div style={{ fontSize: 12, color: '#8B95A7', fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                                {fmtDayClock(s.start)} – {fmtClock(s.stop)}
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#E9EBF1' }}>
                                {ch.name} · catch-up
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </TvFocusProvider>
  );
}
