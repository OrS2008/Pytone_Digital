'use client';

/*
 * /tv/catchup
 *
 * Two views, driven by a `selectedNum` state:
 *
 *   1. Landing — grid of channel tiles. Searchable, capped at a
 *      sensible page size so a 12 K-channel playlist doesn't render
 *      tens of thousands of DOM nodes at once.
 *
 *   2. Per-channel detail — once a tile is clicked, the page swaps
 *      to a day selector (Today / Yesterday / N days ago) plus the
 *      programme list for that day on that channel.
 *
 * Programme data comes from the user's XMLTV index when configured
 * (live + Catch-up share the same parse). For channels without EPG
 * data we render a "no programme guide for this channel" notice
 * and a link to add one. The page deliberately doesn't synthesise
 * fake programmes any more — that was misleading because the rows
 * looked like real catch-up entries but pointed at the live edge.
 *
 * A small "My recordings" pill at the top opens the user's locally
 * scheduled recordings list (the Record button on /tv/live writes
 * those entries).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { loadEpgIndex, getUserEpgUrl } from '@/lib/epgCache';
import type { EpgProgramme } from '@/lib/epg';
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

function fmtClock(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtDayLong(d: Date, today: Date): string {
  const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short' });
}
function fmtDayShort(d: Date, today: Date): string {
  const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit' });
}
function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export default function CatchupPage() {
  const [channels, setChannels] = useState<M3UChannel[]>(
    (typeof window !== 'undefined' ? getCachedChannels() : null) ?? [],
  );
  const [epgIndex, setEpgIndex] = useState<Map<string, EpgProgramme[]> | null>(null);
  const [epgState, setEpgState] = useState<'idle' | 'loading' | 'ready' | 'none'>(
    typeof window !== 'undefined' && getUserEpgUrl() ? 'idle' : 'none',
  );
  const [recs, setRecs] = useState<Recording[]>([]);
  const [selectedNum, setSelectedNum] = useState<number | null>(null);
  const [showRecordings, setShowRecordings] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadChannels();
      if (!cancelled && list.length > 0) setChannels(list);
      if (getUserEpgUrl()) {
        setEpgState('loading');
        const idx = await loadEpgIndex();
        if (cancelled) return;
        if (idx && idx.size > 0) { setEpgIndex(idx); setEpgState('ready'); }
        else                     { setEpgState('none'); }
      }
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
      // Cap so 12K-channel playlists don't try to render every tile.
      // The filter is fast enough on top of that that the user can
      // narrow down with a few keystrokes.
      .slice(0, 200);
  }, [channels, q]);

  function removeRecording(id: string) {
    const next = recs.filter((r) => r.id !== id);
    setRecs(next);
    try { localStorage.setItem(userKey('recordings'), JSON.stringify(next)); } catch { /* ignore */ }
  }

  // Recordings overlay takes precedence over the channel detail view
  // because it's a brief dialog-style detour.
  if (showRecordings) {
    return (
      <TvFocusProvider>
        <main style={{ minHeight: '100vh' }}>
          <div style={{ height: 100 }}><TvNav /></div>
          <header style={{ padding: '24px 24px 12px', maxWidth: 1280, margin: '0 auto' }}>
            <button
              onClick={() => setShowRecordings(false)}
              style={backBtnStyle}
            >
              ← Back to catch-up
            </button>
            <h1 style={{ margin: '12px 0 4px', fontSize: 26, fontWeight: 800, color: '#E9EBF1' }}>
              My recordings
            </h1>
            <p style={{ margin: 0, color: '#B7BEC9', fontSize: 14 }}>
              Programmes you scheduled with the Record button on /tv/live.
            </p>
          </header>
          <section style={{ padding: '8px 24px 64px', maxWidth: 1280, margin: '0 auto' }}>
            {recs.length === 0 ? (
              <div style={emptyStateStyle}>
                No recordings yet. Tap <strong style={{ color: '#fff' }}>● Record</strong> on
                any programme&apos;s info bar to schedule one.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {recs.map((r) => (
                  <div key={r.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '64px 1fr auto auto',
                    alignItems: 'center', gap: 16, padding: 14,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                  }}>
                    <div style={{
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 800, fontSize: 22, color: '#FF3B6E', textAlign: 'center',
                    }}>{r.number}</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#E9EBF1' }}>{r.title}</div>
                      <div style={{ fontSize: 13, color: '#8B95A7' }}>
                        {r.channel} · {fmtClock(new Date(r.startsAt))}–{fmtClock(new Date(r.stopsAt))}
                      </div>
                    </div>
                    <Link
                      href={`/tv/live?ch=${encodeURIComponent(String(r.number))}`}
                      style={primaryBtnStyle}
                    >Play</Link>
                    <button onClick={() => removeRecording(r.id)} style={removeBtnStyle}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </TvFocusProvider>
    );
  }

  // ----- Per-channel detail view -----
  if (selectedNum !== null) {
    const channel = channels.find((c) => c.number === selectedNum);
    if (!channel) {
      // Channel disappeared (playlist refreshed) — fall back to grid.
      return (
        <TvFocusProvider>
          <main style={{ minHeight: '100vh' }}>
            <div style={{ height: 100 }}><TvNav /></div>
            <div style={{ padding: 24, textAlign: 'center', color: '#B7BEC9' }}>
              Channel not found.
              <button onClick={() => setSelectedNum(null)} style={{ ...backBtnStyle, marginInlineStart: 12 }}>
                ← Back
              </button>
            </div>
          </main>
        </TvFocusProvider>
      );
    }
    return (
      <ChannelDetail
        channel={channel}
        epgIndex={epgIndex}
        epgState={epgState}
        onBack={() => setSelectedNum(null)}
      />
    );
  }

  // ----- Landing: channel grid -----
  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>

        <header style={{ padding: '24px 24px 8px', maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 3, color: '#6E7480', textTransform: 'uppercase' }}>Catch-up</div>
              <h1 style={{ margin: '6px 0 4px', fontSize: 28, fontWeight: 800, color: '#E9EBF1' }}>
                Pick a channel
              </h1>
              <p style={{ margin: 0, color: '#B7BEC9', fontSize: 14, maxWidth: 720 }}>
                Choose a channel, then browse the last 7 days hour by hour to re-watch what aired.
              </p>
            </div>
            <button onClick={() => setShowRecordings(true)} style={pillBtnStyle}>
              ● My recordings
              {recs.length > 0 && (
                <span style={{ marginInlineStart: 6, color: '#FF3B6E', fontWeight: 800 }}>{recs.length}</span>
              )}
            </button>
          </div>
        </header>

        <div style={{ padding: '12px 24px 0', maxWidth: 1280, margin: '0 auto' }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Filter ${channels.length.toLocaleString()} channels…`}
            style={searchStyle}
          />
        </div>

        <section style={{ padding: '20px 24px 64px', maxWidth: 1280, margin: '0 auto' }}>
          {channels.length === 0 ? (
            <div style={emptyStateStyle}>
              Add your playlist in{' '}
              <Link href="/tv/account/sources" style={{ color: '#FF3B6E' }}>Playlists &amp; EPG</Link>{' '}
              to use catch-up.
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
                gap: 12,
              }}>
                {visibleChannels.map((ch) => (
                  <button
                    key={ch.id + '-' + ch.number}
                    onClick={() => setSelectedNum(ch.number)}
                    style={tileStyle}
                  >
                    <div style={tileLogoStyle}>
                      {ch.logoUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={ch.logoUrl} alt="" style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' }} />
                        : <span style={{ fontSize: 22, fontWeight: 800, color: '#5A6070' }}>{ch.name.slice(0, 3).toUpperCase()}</span>}
                    </div>
                    <div style={tileNumStyle}>#{ch.number}</div>
                    <div style={tileNameStyle}>{ch.name}</div>
                    <div style={tileCatStyle}>{ch.category}</div>
                  </button>
                ))}
              </div>
              {channels.length > visibleChannels.length && (
                <div style={{ marginTop: 16, fontSize: 12, color: '#6E7480', textAlign: 'center' }}>
                  Showing {visibleChannels.length.toLocaleString()} of{' '}
                  {channels.length.toLocaleString()}. Use the filter above to narrow down.
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </TvFocusProvider>
  );
}

// ===================================================================
//                       Channel detail view
// ===================================================================

interface DetailProps {
  channel: M3UChannel;
  epgIndex: Map<string, EpgProgramme[]> | null;
  epgState: 'idle' | 'loading' | 'ready' | 'none';
  onBack: () => void;
}

function ChannelDetail({ channel, epgIndex, epgState, onBack }: DetailProps) {
  const [selectedDay, setSelectedDay] = useState(0); // 0 = today, 1 = yesterday, …

  // Build the seven-day picker (today + 6 days back). XMLTV usually
  // covers slightly past + several days forward; catch-up cares about
  // past only.
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      arr.push(d);
    }
    return arr;
  }, [today]);

  // Pull this channel's full programme list out of the EPG index.
  // We match by tvg-id, falling back to the channel's id (some
  // playlists store the tvg-id under id directly).
  const allProgs: EpgProgramme[] = useMemo(() => {
    if (!epgIndex) return [];
    return epgIndex.get(channel.tvgId || channel.id) ?? [];
  }, [epgIndex, channel.id, channel.tvgId]);

  // Filter to just the programmes that aired during the selected day,
  // and only those that have already started (catch-up != upcoming).
  const dayProgs = useMemo(() => {
    const dayStart = startOfDay(days[selectedDay]);
    const dayEnd   = dayStart + 86_400_000;
    const now      = Date.now();
    return allProgs.filter((p) => p.start >= dayStart && p.start < dayEnd && p.start <= now);
  }, [allProgs, days, selectedDay]);

  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>

        <header style={{
          padding: '20px 24px 12px',
          maxWidth: 1280, margin: '0 auto',
        }}>
          <button onClick={onBack} style={backBtnStyle}>← Back to channels</button>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            marginTop: 16,
            padding: '14px 16px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14,
          }}>
            <div style={{
              width: 64, height: 48,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#0E1218', borderRadius: 8,
            }}>
              {channel.logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={channel.logoUrl} alt="" style={{ maxWidth: 56, maxHeight: 40, objectFit: 'contain' }} />
                : <span style={{ fontSize: 14, fontWeight: 800, color: '#5A6070' }}>{channel.name.slice(0, 3).toUpperCase()}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#8B95A7' }}>#{channel.number} · {channel.category}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#E9EBF1', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {channel.name}
              </div>
            </div>
            <Link href={`/tv/live?ch=${encodeURIComponent(String(channel.number))}`} style={primaryBtnStyle}>
              ▶ Watch live
            </Link>
          </div>
        </header>

        <div style={{
          padding: '8px 24px 0', maxWidth: 1280, margin: '0 auto',
          display: 'flex', gap: 8, overflowX: 'auto',
        }}>
          {days.map((d, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              style={{
                ...pillBtnStyle,
                background: selectedDay === i ? '#FF3B6E' : 'rgba(255,255,255,0.05)',
                color:      selectedDay === i ? '#fff'    : '#B7BEC9',
                whiteSpace: 'nowrap',
              }}
            >
              {fmtDayShort(d, today)}
            </button>
          ))}
        </div>

        <section style={{ padding: '20px 24px 64px', maxWidth: 1280, margin: '0 auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E9EBF1', margin: '0 0 12px' }}>
            {fmtDayLong(days[selectedDay], today)}
          </h2>

          {epgState === 'loading' ? (
            <div style={emptyStateStyle}>Loading programme guide…</div>
          ) : allProgs.length === 0 ? (
            <div style={emptyStateStyle}>
              No programme guide for this channel.{' '}
              {epgState === 'none' ? (
                <>
                  <Link href="/tv/account/sources?tab=epg" style={{ color: '#FF3B6E' }}>
                    Add an XMLTV EPG source
                  </Link>{' '}
                  to see catch-up programmes here.
                </>
              ) : (
                <>The guide loaded but doesn&apos;t cover this channel
                (no <code>tvg-id</code> match). Try a different EPG
                source.</>
              )}
            </div>
          ) : dayProgs.length === 0 ? (
            <div style={emptyStateStyle}>
              Nothing in the guide for {fmtDayLong(days[selectedDay], today).toLowerCase()} on this channel.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {dayProgs.map((p) => (
                <Link
                  key={`${p.channelId}-${p.start}`}
                  href={`/tv/live?ch=${encodeURIComponent(String(channel.number))}&start=${p.start}`}
                  style={progRowStyle}
                >
                  <div style={progTimeStyle}>
                    <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtClock(new Date(p.start))}
                    </div>
                    <div style={{ fontSize: 11, color: '#8B95A7', fontVariantNumeric: 'tabular-nums' }}>
                      –{fmtClock(new Date(p.stop))}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#E9EBF1' }}>{p.title}</div>
                    {p.description && (
                      <div style={{
                        fontSize: 13, color: '#B7BEC9', marginTop: 2,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{p.description}</div>
                    )}
                  </div>
                  <div style={{
                    background: '#FF3B6E', color: '#fff',
                    padding: '8px 14px', borderRadius: 10,
                    fontSize: 13, fontWeight: 700,
                  }}>▶ Watch</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </TvFocusProvider>
  );
}

// -------------------------------------------------------------------
// Shared inline styles — kept here rather than in catchup.css because
// the page composes a lot of one-off cards and a parallel CSS file
// would just be a list of selectors used once each.
// -------------------------------------------------------------------

const tileStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', textAlign: 'center', gap: 6,
  padding: '16px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 14,
  cursor: 'pointer',
  color: '#E9EBF1',
  fontFamily: 'inherit',
  transition: 'transform 120ms ease-out, background 120ms',
};
const tileLogoStyle: React.CSSProperties = {
  width: '100%', aspectRatio: '16 / 10',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#0E1218', borderRadius: 8,
};
const tileNumStyle: React.CSSProperties = {
  fontSize: 11, color: '#FF3B6E', fontWeight: 800, letterSpacing: 1,
  marginTop: 4,
};
const tileNameStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: '#E9EBF1',
  whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
  maxWidth: '100%',
};
const tileCatStyle: React.CSSProperties = {
  fontSize: 11, color: '#8B95A7',
  whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden',
  maxWidth: '100%',
};
const searchStyle: React.CSSProperties = {
  width: '100%', fontSize: 15, padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: '#E9EBF1', outline: 'none',
  fontFamily: 'Inter, system-ui, sans-serif',
};
const pillBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13, fontWeight: 600,
  borderRadius: 999, border: 0, cursor: 'pointer',
  background: 'rgba(255,255,255,0.05)', color: '#B7BEC9',
  fontFamily: 'inherit',
};
const backBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13, fontWeight: 600,
  borderRadius: 10, border: 0, cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', color: '#E9EBF1',
  fontFamily: 'inherit',
};
const primaryBtnStyle: React.CSSProperties = {
  background: '#FF3B6E', color: '#fff',
  padding: '10px 18px', borderRadius: 10,
  textDecoration: 'none', fontWeight: 700, fontSize: 13,
  whiteSpace: 'nowrap',
};
const removeBtnStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 10,
  background: 'transparent', color: '#FF6B7B',
  border: '1px solid rgba(255,107,123,0.3)',
  fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
const emptyStateStyle: React.CSSProperties = {
  padding: 32, textAlign: 'center',
  border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 14,
  color: '#B7BEC9',
};
const progRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '72px 1fr auto',
  gap: 16, padding: 14, alignItems: 'center',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  textDecoration: 'none',
  color: 'inherit',
};
const progTimeStyle: React.CSSProperties = {
  color: '#E9EBF1', textAlign: 'center',
  display: 'flex', flexDirection: 'column', gap: 2,
};
