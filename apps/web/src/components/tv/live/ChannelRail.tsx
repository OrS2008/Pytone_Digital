'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Channel } from './types';
import { userKey } from '@/lib/session';

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
export default function ChannelRail({ channels, activeIdx, onTune, onPlay }: Props) {
  const play = onPlay ?? onTune;
  const railRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef<number>(activeIdx);
  const [spoiler, setSpoiler] = useState(false);

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
      if (e.key === 'ArrowDown') { onTune(Math.min(focusedRef.current + 1, channels.length - 1)); e.preventDefault(); }
      if (e.key === 'ArrowUp')   { onTune(Math.max(focusedRef.current - 1, 0));                   e.preventDefault(); }
      // OK on the focused row is just a "re-tune" — useful if the rail is
      // open at the current channel and you want to re-surface the info bar.
      if (e.key === 'Enter')     { onTune(focusedRef.current); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channels.length, onTune]);

  // Render with category dividers when the category changes between rows.
  const rows: React.ReactNode[] = [];
  let lastCat = '';
  channels.forEach((ch, i) => {
    if (ch.category !== lastCat) {
      rows.push(<div key={`d-${ch.category}`} className="rail-divider">{ch.category}</div>);
      lastCat = ch.category;
    }
    rows.push(
      <div
        key={ch.id}
        data-idx={i}
        className={`rail-row ${i === activeIdx ? 'active focused' : ''}`}
        onClick={() => play(i)}
      >
        <div className="rail-num">{ch.number}</div>
        <div className="rail-logo">
          {ch.logoUrl
            ? <img src={ch.logoUrl} alt="" />
            : <span style={{ color: '#5A6070', fontSize: 12, fontWeight: 700 }}>{ch.name.slice(0, 3)}</span>}
        </div>
        <div className="rail-meta">
          <div className="rail-name">{ch.name}</div>
          {ch.now  && <div className="rail-now">{fmt(ch.now.start)}  ·  {maskFor(ch) ? '— spoiler hidden —' : ch.now.title}</div>}
          {ch.next1 && <div className="rail-next">{fmt(ch.next1.start)}  ·  {maskFor(ch) ? '— spoiler hidden —' : ch.next1.title}</div>}
        </div>
      </div>,
    );
  });

  return <div ref={railRef} className="rail">{rows}</div>;
}

function fmt(d: Date) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
