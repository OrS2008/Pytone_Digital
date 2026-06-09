'use client';

/*
 * /tv/guide
 *
 * The TV-style Programme Guide grid: channels down the left, time
 * across the top, programme bars in the middle. Past programmes are
 * clickable when the channel has catch-up; current/future programmes
 * link to live. A red now-line marks the present.
 *
 * What goes on screen vs. what stays out of the DOM:
 *
 *   - The day selector renders ±catchup-days back / +7 days forward.
 *     Without an EPG we can't draw anything, so the page short-circuits
 *     to the "configure EPG" CTA in that case.
 *
 *   - The grid is laid out at 4 px per minute → 5760 px per day. The
 *     channel rail (left) is sticky, the hour ribbon (top) is sticky,
 *     and the inner pane scrolls in two axes. We render every channel
 *     row up front (typical playlists are 200–1000 channels, which is
 *     fine), but only programmes for the SELECTED day, so the DOM stays
 *     under a few thousand bars.
 *
 *   - A programme click resolves to /tv/live: ?start=UTC&dur=MIN for
 *     anything in the past (the existing catch-up flow picks it up),
 *     or just ?ch=N for current/future programmes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import { getCachedChannels, loadChannels } from '@/lib/channelCache';
import { loadEpgIndex, getUserEpgUrl, programmesFor, type EpgIndex } from '@/lib/epgCache';
import { loadDigest } from '@/lib/digestClient';
import type { EpgProgramme } from '@/lib/epg';
import type { M3UChannel } from '@/lib/m3u';
import type { DigestChannel } from '@/lib/digest';

// Default dimensions for desktop / TV. The component reads viewport
// width on mount and shrinks them on phones (see useLayout below) so
// the grid is usable on a 360 px screen as well as a 4 K living-room TV.
const DESKTOP_LAYOUT = {
  pxPerMin:    4,
  rowHeight:   64,
  railWidth:   200,
  headerHeight: 56,
};
const MOBILE_LAYOUT = {
  pxPerMin:    2.5,   // 150 px / hour → 4 hours visible on a 600 px viewport
  rowHeight:   56,
  railWidth:   116,
  headerHeight: 44,
};
function useLayout() {
  const [layout, setLayout] = useState(DESKTOP_LAYOUT);
  useEffect(() => {
    const pick = () => setLayout(window.innerWidth < 720 ? MOBILE_LAYOUT : DESKTOP_LAYOUT);
    pick();
    window.addEventListener('resize', pick);
    return () => window.removeEventListener('resize', pick);
  }, []);
  return layout;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function fmtDayLabel(offset: number): string {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() + offset);
  if (offset === 0) return 'Today';
  if (offset === -1) return 'Yesterday';
  if (offset === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface RowData {
  channel: M3UChannel;
  programmes: EpgProgramme[];
}

// The digest endpoint hands us programmes as a compact {s, e, t}
// triple. Inflate to EpgProgramme so the row component doesn't need to
// know which path the data came from.
function digestToRowData(digestChannels: DigestChannel[]): RowData[] {
  const out: RowData[] = [];
  for (const ch of digestChannels) {
    if (ch.programmes.length === 0) continue;
    const programmes: EpgProgramme[] = ch.programmes.map((p) => ({
      channelId: ch.tvgId || ch.id,
      start: p.s,
      stop:  p.e,
      title: p.t,
      description: p.d,
      catchupId: p.c,
    }));
    out.push({ channel: ch, programmes });
  }
  return out;
}

export default function GuidePage() {
  const layout = useLayout();
  const PX_PER_MIN   = layout.pxPerMin;
  const PX_PER_HOUR  = PX_PER_MIN * 60;
  const DAY_WIDTH_PX = PX_PER_HOUR * 24;
  const ROW_HEIGHT   = layout.rowHeight;
  const RAIL_WIDTH   = layout.railWidth;
  const HEADER_HEIGHT = layout.headerHeight;

  const [channels, setChannels] = useState<M3UChannel[]>(
    (typeof window !== 'undefined' ? getCachedChannels() : null) ?? [],
  );
  const [epgIndex, setEpgIndex] = useState<EpgIndex | null>(null);
  const [digestRows, setDigestRows] = useState<RowData[] | null>(null);
  const [epgState, setEpgState] = useState<'idle' | 'loading' | 'ready' | 'none'>(
    typeof window !== 'undefined' && getUserEpgUrl() ? 'idle' : 'none',
  );
  const [dayOffset, setDayOffset] = useState(0);
  const [q, setQ] = useState('');
  const [now, setNow] = useState(Date.now());
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Refresh "now" every minute so the now-line tracks live time even
  // when the user leaves the tab open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Load channels + EPG on mount. We try the pre-matched server digest
  // first (one round-trip, KV-cached, no client-side parsing) and fall
  // back to the legacy two-fetch flow if the digest endpoint is
  // unavailable or returns an error — that way a deploy that hasn't
  // shipped the digest endpoint yet still gets a working guide.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEpgState('loading');
      const { digest, source } = await loadDigest();
      if (cancelled) return;
      if (digest && digest.channels.length > 0) {
        setChannels(digest.channels);
        const rows = digestToRowData(digest.channels);
        setDigestRows(rows);
        setEpgState(rows.length > 0 ? 'ready' : 'none');
        return;
      }
      // Fallback path — same as the original flow.
      const list = await loadChannels();
      if (!cancelled && list.length > 0) setChannels(list);
      if (!getUserEpgUrl()) {
        setEpgState(source === 'unconfigured' ? 'none' : 'none');
        return;
      }
      const idx = await loadEpgIndex();
      if (cancelled) return;
      setEpgIndex(idx);
      setEpgState(idx ? 'ready' : 'none');
    })();
    return () => { cancelled = true; };
  }, []);

  // On first paint, scroll the grid so "now" is roughly 25 % from the
  // left edge. Without this the user lands on 00:00 and has to manually
  // scroll five hours to see the current programme.
  useEffect(() => {
    if (epgState !== 'ready' || dayOffset !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    const minutesIntoDay = (Date.now() - startOfDay(Date.now())) / 60_000;
    const target = Math.max(0, minutesIntoDay * PX_PER_MIN - el.clientWidth * 0.25);
    el.scrollLeft = target;
  }, [epgState, dayOffset]);

  const dayStart = useMemo(() => {
    const base = startOfDay(Date.now());
    return base + dayOffset * 86_400_000;
  }, [dayOffset]);
  const dayEnd = dayStart + 86_400_000;

  // Build per-channel programme lists for the selected day. We filter
  // here rather than in the row component so a fresh search query
  // doesn't re-walk the full EPG once per visible row.
  //
  // Two data sources merge into the same shape: the server digest
  // (`digestRows` — already matched per channel) and the legacy
  // client-side EPG index (`epgIndex` — re-matched on every render).
  // Whichever loaded first wins.
  const rows = useMemo<RowData[]>(() => {
    const needle = q.trim().toLowerCase();
    const dayFilter = (progs: EpgProgramme[]) =>
      progs.filter((p) => p.stop > dayStart && p.start < dayEnd);

    if (digestRows) {
      const out: RowData[] = [];
      for (const r of digestRows) {
        if (needle && !r.channel.name.toLowerCase().includes(needle)) continue;
        const day = dayFilter(r.programmes);
        if (day.length === 0) continue;
        out.push({ channel: r.channel, programmes: day });
      }
      return out;
    }
    if (!epgIndex) return [];
    const out: RowData[] = [];
    for (const ch of channels) {
      if (needle && !ch.name.toLowerCase().includes(needle)) continue;
      const all = programmesFor(epgIndex, ch);
      if (all.length === 0) continue;
      const day = dayFilter(all);
      if (day.length === 0) continue;
      out.push({ channel: ch, programmes: day });
    }
    return out;
  }, [channels, digestRows, epgIndex, q, dayStart, dayEnd]);

  const todayMs = startOfDay(now);
  const isToday = dayStart === todayMs;
  const nowLineLeft = isToday ? ((now - dayStart) / 60_000) * PX_PER_MIN : -1;

  // ----- empty / loading states -----
  if (epgState === 'none') {
    return (
      <TvFocusProvider>
        <main style={{ minHeight: '100vh' }}>
          <div style={{ height: 100 }}><TvNav /></div>
          <div style={{ padding: 48, textAlign: 'center', color: '#B7BEC9' }}>
            <h1 style={{ margin: '0 0 12px', color: '#E9EBF1' }}>TV Guide</h1>
            <p>The Programme Guide needs an XMLTV EPG feed to show what's on.</p>
            <Link href="/tv/account/sources" style={{
              display: 'inline-block', marginTop: 16, padding: '10px 18px',
              background: '#FF3B6E', color: '#fff', borderRadius: 10,
              textDecoration: 'none', fontWeight: 700,
            }}>Add an EPG source</Link>
          </div>
        </main>
      </TvFocusProvider>
    );
  }
  if (epgState !== 'ready') {
    return (
      <TvFocusProvider>
        <main style={{ minHeight: '100vh' }}>
          <div style={{ height: 100 }}><TvNav /></div>
          <div style={{ padding: 48, textAlign: 'center', color: '#B7BEC9' }}>Loading guide…</div>
        </main>
      </TvFocusProvider>
    );
  }

  return (
    <TvFocusProvider>
      <main style={{ minHeight: '100vh' }}>
        <div style={{ height: 100 }}><TvNav /></div>

        {/* day selector + search */}
        <header style={{
          padding: '16px 24px 8px',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          maxWidth: 1600, margin: '0 auto',
        }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#E9EBF1' }}>TV Guide</h1>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, minWidth: 0 }}>
            {[-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7].map((off) => (
              <button
                key={off}
                onClick={() => setDayOffset(off)}
                style={{
                  padding: '8px 14px', borderRadius: 10, border: 'none',
                  background: off === dayOffset ? '#FF3B6E' : 'rgba(255,255,255,0.06)',
                  color: off === dayOffset ? '#fff' : '#B7BEC9',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {fmtDayLabel(off)}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search channels…"
            style={{
              padding: '8px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#E9EBF1', minWidth: 200,
            }}
          />
        </header>

        {/* the grid */}
        <div
          ref={scrollerRef}
          style={{
            position: 'relative',
            overflow: 'auto',
            maxWidth: 1600, margin: '0 auto',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.2)',
            height: 'calc(100vh - 220px)',
          }}
        >
          <div style={{
            position: 'relative',
            width: RAIL_WIDTH + DAY_WIDTH_PX,
            minHeight: HEADER_HEIGHT + rows.length * ROW_HEIGHT,
          }}>
            {/* hour ribbon — sticky to the top of the scroller */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 3,
              height: HEADER_HEIGHT,
              display: 'flex', alignItems: 'flex-end',
              background: 'rgba(15,17,22,0.96)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(6px)',
            }}>
              <div style={{
                width: RAIL_WIDTH, flexShrink: 0,
                position: 'sticky', left: 0, zIndex: 4,
                height: HEADER_HEIGHT,
                background: 'rgba(15,17,22,0.96)',
                borderRight: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#8B95A7', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5,
              }}>
                {fmtDayLabel(dayOffset)}
              </div>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} style={{
                  width: PX_PER_HOUR, flexShrink: 0,
                  borderInlineStart: '1px solid rgba(255,255,255,0.04)',
                  color: '#8B95A7', fontSize: 12, fontWeight: 600,
                  padding: '0 8px 8px',
                }}>
                  {fmtHour(h)}
                </div>
              ))}
            </div>

            {/* now-line — only on today, drawn above rows */}
            {nowLineLeft >= 0 && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: RAIL_WIDTH + nowLineLeft,
                  top: HEADER_HEIGHT,
                  width: 2,
                  height: rows.length * ROW_HEIGHT,
                  background: '#FF3B6E',
                  zIndex: 2,
                  pointerEvents: 'none',
                  boxShadow: '0 0 8px rgba(255,59,110,0.6)',
                }}
              />
            )}

            {/* one row per channel */}
            {rows.length === 0 ? (
              <div style={{
                padding: '40px 24px', color: '#8B95A7',
                position: 'sticky', left: 0, maxWidth: 800,
              }}>
                No programmes match {q ? `"${q}"` : 'the selected day'}.
                {q && <button onClick={() => setQ('')} style={{
                  marginInlineStart: 12, padding: '4px 12px',
                  background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6,
                  color: '#E9EBF1', cursor: 'pointer',
                }}>Clear</button>}
              </div>
            ) : rows.map((row) => (
              <GuideRow
                key={row.channel.id + '|' + row.channel.number}
                row={row}
                dayStart={dayStart}
                dayEnd={dayEnd}
                now={now}
                layout={layout}
              />
            ))}
          </div>
        </div>
      </main>
    </TvFocusProvider>
  );
}

function GuideRow({ row, dayStart, dayEnd, now, layout }: {
  row: RowData;
  dayStart: number;
  dayEnd: number;
  now: number;
  layout: typeof DESKTOP_LAYOUT;
}) {
  const PX_PER_MIN = layout.pxPerMin;
  const ROW_HEIGHT = layout.rowHeight;
  const RAIL_WIDTH = layout.railWidth;
  const { channel, programmes } = row;
  const catchupDays = channel.catchupDays ?? 7;
  const earliestCatchup = now - catchupDays * 86_400_000;

  return (
    <div style={{
      position: 'relative',
      height: ROW_HEIGHT,
      display: 'flex',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {/* channel rail cell — sticky to the left so it stays visible
          while the user scrolls hours of programmes horizontally. */}
      <div style={{
        position: 'sticky', left: 0, zIndex: 1,
        width: RAIL_WIDTH, flexShrink: 0,
        background: 'rgba(15,17,22,0.96)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
      }}>
        <span style={{
          fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 800,
          color: '#FF3B6E', minWidth: 28, textAlign: 'end',
        }}>{channel.number}</span>
        {channel.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.logoUrl}
            alt=""
            width={28} height={28}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
          />
        ) : <div style={{ width: 28, flexShrink: 0 }} />}
        <span style={{
          fontSize: 13, color: '#E9EBF1', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{channel.name}</span>
      </div>

      {/* programme bars — absolutely positioned along the row */}
      <div style={{ position: 'relative', flex: 1 }}>
        {programmes.map((p) => {
          const clippedStart = Math.max(p.start, dayStart);
          const clippedStop  = Math.min(p.stop,  dayEnd);
          const left = ((clippedStart - dayStart) / 60_000) * PX_PER_MIN;
          const width = Math.max(2, ((clippedStop - clippedStart) / 60_000) * PX_PER_MIN);
          const inPast = p.stop <= now;
          const isCurrent = p.start <= now && p.stop > now;
          const reachable = p.start >= earliestCatchup;
          const canPlay = isCurrent || (inPast && reachable);
          const durationMin = Math.max(1, Math.round((p.stop - p.start) / 60_000));
          // /tv/live's ?start= parameter is in MILLISECONDS — its
          // `setCatchupMs` reads it verbatim and passes it as `startMs`
          // to the catch-up URL builder, which divides by 1000 to get
          // utcStart. Sending seconds here used to produce a UTC stamp
          // 1000× too small, e.g. `video-1780915-2700.m3u8` instead of
          // `video-1780915000-2700.m3u8`, and the provider's silent-live
          // fallback would play.
          const href = inPast
            ? `/tv/live?ch=${channel.number}&start=${p.start}&dur=${durationMin}`
            : `/tv/live?ch=${channel.number}`;

          const bg = isCurrent
            ? 'linear-gradient(180deg,#FF3B6E,#C42154)'
            : inPast
              ? (reachable ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)')
              : 'rgba(255,255,255,0.08)';
          const fg = isCurrent ? '#fff' : '#E9EBF1';
          const opacity = inPast && !reachable ? 0.45 : 1;

          const inner = (
            <div style={{
              height: ROW_HEIGHT - 8, padding: '6px 8px',
              borderRadius: 6, overflow: 'hidden',
              background: bg, color: fg, opacity,
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              boxSizing: 'border-box',
              border: '1px solid rgba(0,0,0,0.2)',
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{p.title}</div>
              <div style={{ fontSize: 10, opacity: 0.75 }}>
                {fmtClock(p.start)}–{fmtClock(p.stop)}
              </div>
            </div>
          );

          const style = {
            position: 'absolute' as const,
            left, width, top: 4,
            cursor: canPlay ? 'pointer' : 'default',
          };

          return canPlay ? (
            <Link
              key={p.start + '|' + p.title}
              href={href}
              style={style}
              title={`${p.title} · ${fmtClock(p.start)}–${fmtClock(p.stop)}`}
            >
              {inner}
            </Link>
          ) : (
            <div
              key={p.start + '|' + p.title}
              style={style}
              title={p.start >= now
                ? 'Future programme — switch to live to wait for it'
                : 'This programme is older than the catch-up window'}
            >
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
