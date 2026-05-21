'use client';

import { useEffect, useRef } from 'react';
import type { Channel } from './types';

interface Props {
  channels: Channel[];
  activeIdx: number;
  onTune: (idx: number) => void;
}

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
export default function ChannelRail({ channels, activeIdx, onTune }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef<number>(activeIdx);

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
        onClick={() => onTune(i)}
      >
        <div className="rail-num">{ch.number}</div>
        <div className="rail-logo">
          {ch.logoUrl
            ? <img src={ch.logoUrl} alt="" />
            : <span style={{ color: '#5A6070', fontSize: 12, fontWeight: 700 }}>{ch.name.slice(0, 3)}</span>}
        </div>
        <div className="rail-meta">
          <div className="rail-name">{ch.name}</div>
          {ch.now  && <div className="rail-now">{fmt(ch.now.start)}  ·  {ch.now.title}</div>}
          {ch.next1 && <div className="rail-next">{fmt(ch.next1.start)}  ·  {ch.next1.title}</div>}
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
