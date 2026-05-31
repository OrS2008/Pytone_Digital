'use client';

// ScrollableRow — wraps a horizontal row of tiles and overlays two
// styled arrow buttons that scroll the strip ~80 % of its visible
// width on click. Arrows only appear when there's actually content
// to scroll to in that direction — they fade in when the strip is
// hovered, fade out on idle, and stay visible while focused via
// keyboard so the row is reachable without a mouse.
//
// Used by SmartHomeRow and ContinueWatchingRow. The strip uses native
// overflow:auto (set in tv.css under .tv-row-strip), so the arrows
// just call element.scrollTo() — no virtualisation, no scroll-anchor
// tricks, no transform race conditions.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  children: ReactNode;
  /** className for the outer row wrapper (e.g. "tv-row tv-row-cw"). */
  rowClassName?: string;
}

export default function ScrollableRow({ title, children, rowClassName }: Props) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);
  // Keep arrows visible while the row is hovered OR focused (keyboard
  // users get a more forgiving target — for mouse users we fade them
  // out when the pointer leaves so they don't clutter the screen).
  const [active, setActive] = useState(false);

  const recompute = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    // The strip is RTL-aware: in RTL languages the scrollLeft sign flips
    // on different engines, so we measure against the raw clientWidth.
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    recompute();
    const el = stripRef.current;
    if (!el) return;
    el.addEventListener('scroll', recompute, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', recompute);
      ro.disconnect();
    };
  }, [recompute, children]);

  const scrollBy = useCallback((dir: -1 | 1) => {
    const el = stripRef.current;
    if (!el) return;
    // 80 % of visible width keeps about one tile of overlap so the
    // user has visual continuity between pages.
    const delta = Math.round(el.clientWidth * 0.8) * dir;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  return (
    <div
      className={`tv-scroll-row ${rowClassName ?? ''}`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      {title && <h2>{title}</h2>}
      <div className="tv-scroll-row-track">
        <button
          type="button"
          className={`tv-scroll-arrow tv-scroll-arrow-left ${canLeft && active ? 'visible' : ''}`}
          aria-label="Scroll left"
          tabIndex={canLeft ? 0 : -1}
          onClick={() => scrollBy(-1)}
        >
          <span aria-hidden>‹</span>
        </button>
        <div ref={stripRef} className="tv-row-strip">
          {children}
        </div>
        <button
          type="button"
          className={`tv-scroll-arrow tv-scroll-arrow-right ${canRight && active ? 'visible' : ''}`}
          aria-label="Scroll right"
          tabIndex={canRight ? 0 : -1}
          onClick={() => scrollBy(1)}
        >
          <span aria-hidden>›</span>
        </button>
      </div>
    </div>
  );
}
