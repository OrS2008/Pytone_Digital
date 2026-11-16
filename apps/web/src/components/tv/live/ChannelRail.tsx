'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel } from './types';
import { userKey } from '@/lib/session';
import Link from 'next/link';
import { getFavorites, onFavoritesChange, toggleFavorite } from '@/lib/favorites';
import { getGroups, onGroupsChange, type ChannelGroup } from '@/lib/channelGroups';
import { useT } from '@/lib/i18n';

interface Props {
  channels: Channel[];
  activeIdx: number;
  // Two flavours of "tune":
  //   - onTune(i)            — browse (arrow keys / remote). Updates the
  //                            highlighted channel and refreshes the
  //                            preview tile, but does NOT enter
  //                            fullscreen playback. The TV / desktop
  //                            flow.
  //   - onPlay(i)            — explicit "play this now" (a click on a
  //                            card). Goes straight to fullscreen
  //                            playback. The phone flow — on mobile the
  //                            preview tile is below the fold so a
  //                            silent rail tap looks broken.
  // If onPlay is omitted we fall back to onTune so older callers (TV
  // layout, keyboard nav) keep their browse-only behaviour.
  onTune: (idx: number) => void;
  onPlay?: (idx: number) => void;
}

// Categories that benefit from spoiler protection — sports + live news.
// Programme titles in these categories get masked until the user opens
// the channel.
const SPOILER_CATS = /sport|football|soccer|basketball|tennis|league|liga|nba|nhl|nfl|mlb|fifa|uefa|game|match/i;

/*
 * Channel list rail (HOT/YES style).
 *
 * Each row: number · logo · channel name · current programme · next programme.
 * The active channel (the one currently being watched) has a left pink stripe.
 * The "focused" channel (the one the remote/keyboard cursor is on) gets a
 * lighter background so the user can see which row OK will tune to.
 *
 * Channels are grouped by category with a sticky-style divider; in a real
 * client the grouping is configurable and reorderable.
 */
// How many channels to render at first, and how many to add each time
// the user scrolls near the bottom. IPTV playlists routinely carry
// thousands of channels; rendering them all at once produced ~28k DOM
// nodes and made the WebView crawl. We window the list instead — only
// the rows near the viewport exist in the DOM.
const WINDOW_STEP = 60;

export default function ChannelRail({ channels, activeIdx, onTune, onPlay }: Props) {
  const play = onPlay ?? onTune;
  const railRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef<number>(activeIdx);
  const [spoiler, setSpoiler] = useState(false);
  // Favorites ("My List") — re-renders when a heart is toggled anywhere.
  const [favs, setFavs] = useState<Set<string>>(new Set());
  useEffect(() => {
    setFavs(getFavorites());
    return onFavoritesChange(() => setFavs(getFavorites()));
  }, []);
  const { t } = useT();
  // Group filter: '' = all channels, 'fav' = My list, else a custom
  // group id. Rows keep their index in the full list, so tuning,
  // deep links and the player are unaffected by the filter.
  const [groups, setGroups] = useState<ChannelGroup[]>([]);
  const [group, setGroup] = useState('');
  useEffect(() => {
    const sync = () => setGroups(getGroups());
    sync();
    return onGroupsChange(sync);
  }, []);
  const filterIds = useMemo<Set<string> | null>(() => {
    if (group === 'fav') return favs;
    const g = groups.find((x) => x.id === group);
    return g ? new Set(g.channels) : null;
  }, [group, groups, favs]);
  // A group that was deleted (here or on another device) resets the filter.
  useEffect(() => {
    if (group && group !== 'fav' && !groups.some((g) => g.id === group)) setGroup('');
  }, [group, groups]);
  // Indices (into `channels`) the rail shows.
  const shown = useMemo(() => {
    if (!filterIds) return null;
    const out: number[] = [];
    channels.forEach((c, i) => { if (filterIds.has(c.id)) out.push(i); });
    return out;
  }, [channels, filterIds]);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const total = shown ? shown.length : channels.length;
  // Number of channels currently rendered. Starts at one window, but
  // always includes the active channel (deep-links can target a channel
  // thousands deep) plus a small buffer so auto-scroll-to-active works.
  const [visible, setVisible] = useState(() =>
    Math.min(channels.length, Math.max(WINDOW_STEP, activeIdx + 20)),
  );
  // Position of the active channel within what the rail shows.
  const activePos = shown ? shown.indexOf(activeIdx) : activeIdx;

  // Reset the window when the playlist or the group filter changes.
  useEffect(() => {
    setVisible(Math.min(total, Math.max(WINDOW_STEP, activePos + 20)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, shown]);

  // Make sure the active channel is always within the rendered window
  // (e.g. arrow-key navigation walking past the current bottom edge, or
  // a deep-link to a far channel).
  useEffect(() => {
    setVisible((v) => Math.min(total, Math.max(v, activePos + 20)));
  }, [activePos, total]);

  // Grow the window as a sentinel near the bottom scrolls into view.
  // rootMargin pre-loads the next chunk ~2 screens early so the user
  // never sees a gap. Viewport root works whether the page scrolls
  // (mobile) or the rail itself scrolls (desktop).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (visible >= total) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(total, v + WINDOW_STEP));
        }
      },
      { rootMargin: '1200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, total]);

  // Read the spoiler-protection preference. Updates if the user flips
  // it in the preferences screen and comes back to /tv/live.
  useEffect(() => {
    try { setSpoiler(localStorage.getItem(userKey('prefs.spoilerProtection')) === '1'); } catch { /* ignore */ }
  }, []);

  // Cheap helper that decides whether a given row's metadata should
  // be masked. We only obscure programme titles, never channel names
  // or numbers — those are how the user actually navigates.
  const maskFor = useMemo(() => (ch: Channel) => spoiler && SPOILER_CATS.test(ch.category), [spoiler]);

  // Pseudo-focus index — drives the highlighted row independent of the
  // "active" (currently-tuned) channel. We don't use DOM focus because TV
  // browsers route arrow keys oddly with scroll containers.
  useEffect(() => {
    focusedRef.current = activeIdx;
  }, [activeIdx]);

  // Auto-scroll so the focused row stays visible.
  useEffect(() => {
    const el = railRef.current?.querySelector<HTMLDivElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  // Up/Down/OK at the layout level.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const list = shownRef.current;
      if (list && list.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        // Step within the filtered group.
        const pos = list.indexOf(focusedRef.current);
        const next = e.key === 'ArrowDown'
          ? list[Math.min(pos + 1, list.length - 1)]
          : list[Math.max(pos < 0 ? 0 : pos - 1, 0)];
        onTune(next);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown') { onTune(Math.min(focusedRef.current + 1, channels.length - 1)); e.preventDefault(); }
      if (e.key === 'ArrowUp')   { onTune(Math.max(focusedRef.current - 1, 0));                   e.preventDefault(); }
      // OK on the focused row is just a "re-tune" — useful if the rail is
      // open at the current channel and you want to re-surface the info bar.
      if (e.key === 'Enter')     { onTune(focusedRef.current); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channels.length, onTune]);

  // Stable callback for the memoised rows (see RailRow): a new function
  // per render would make every row re-render whenever the list grows.
  const playRef = useRef(play);
  playRef.current = play;
  const playStable = useCallback((i: number) => playRef.current(i), []);

  // Render with category dividers when the category changes between rows.
  // Only the first `visible` channels are materialised — the rest are
  // added as the sentinel scrolls into view.
  const rows: React.ReactNode[] = [];
  let lastCat = '';
  const upTo = Math.min(visible, total);
  for (let k = 0; k < upTo; k++) {
    const i = shown ? shown[k] : k;
    const ch = channels[i];
    if (ch.category !== lastCat) {
      rows.push(<div key={`d-${i}-${ch.category}`} className="rail-divider">{ch.category}</div>);
      lastCat = ch.category;
    }
    rows.push(
      <RailRow
        key={ch.id}
        ch={ch}
        idx={i}
        active={i === activeIdx}
        isFav={favs.has(ch.id)}
        masked={maskFor(ch)}
        onPlay={playStable}
      />,
    );
  }

  const chips: { id: string; label: string }[] = [
    { id: '', label: t('groups.all') },
    ...(favs.size > 0 || group === 'fav' ? [{ id: 'fav', label: `♥ ${t('groups.myList')}` }] : []),
    ...groups.map((g) => ({ id: g.id, label: g.name })),
  ];

  return (
    <div ref={railRef} className="rail">
      <div className="rail-groups" role="tablist" aria-label={t('groups.filter')}>
        {chips.map((c) => (
          <button
            key={c.id || '__all'}
            type="button"
            role="tab"
            aria-selected={group === c.id}
            className={`rail-group ${group === c.id ? 'is-on' : ''}`}
            onClick={() => setGroup(c.id)}
          ><bdi>{c.label}</bdi></button>
        ))}
        <Link href="/tv/account/groups" className="rail-group rail-group-edit">
          {groups.length ? t('groups.edit') : `+ ${t('groups.new')}`}
        </Link>
      </div>
      {shown && shown.length === 0 && (
        <div className="rail-empty">{group === 'fav' ? t('groups.emptyFav') : t('groups.emptyGroup')}</div>
      )}
      {rows}
      {visible < total && (
        <div ref={sentinelRef} className="rail-sentinel" aria-hidden="true" />
      )}
    </div>
  );
}

function fmt(d: Date) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// One channel row. Memoised: when the window grows by another chunk, or
// the active channel changes, only rows whose props changed re-render.
// Before this, every append re-rendered every row already on screen —
// thousands of rows deep that was the main source of scroll jank.
const RailRow = memo(function RailRow({ ch, idx, active, isFav, masked, onPlay }: {
  ch: Channel; idx: number; active: boolean; isFav: boolean; masked: boolean; onPlay: (i: number) => void;
}) {
  return (
    <div
      data-idx={idx}
      className={`rail-row ${active ? 'active focused' : ''}`}
      onClick={() => onPlay(idx)}
    >
      <div className="rail-num">{ch.number}</div>
      <button
        type="button"
        className={`rail-fav ${isFav ? 'is-fav' : ''}`}
        aria-label={isFav ? 'Remove from My list' : 'Add to My list'}
        aria-pressed={isFav}
        onClick={(e) => { e.stopPropagation(); toggleFavorite(ch.id); }}
      >
        <svg viewBox="0 0 24 24"
             fill={isFav ? 'currentColor' : 'none'}
             stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>
        </svg>
      </button>
      <div className="rail-logo">
        {ch.logoUrl
          ? <img src={ch.logoUrl} alt="" loading="lazy" decoding="async" />
          : <span style={{ color: '#5A6070', fontSize: 12, fontWeight: 700 }}>{ch.name.slice(0, 3)}</span>}
      </div>
      <div className="rail-meta">
        <div className="rail-name">{ch.name}</div>
        {ch.now  && <div className="rail-now">{fmt(ch.now.start)}  ·  {masked ? '— spoiler hidden —' : ch.now.title}</div>}
        {ch.next1 && <div className="rail-next">{fmt(ch.next1.start)}  ·  {masked ? '— spoiler hidden —' : ch.next1.title}</div>}
      </div>
    </div>
  );
});
