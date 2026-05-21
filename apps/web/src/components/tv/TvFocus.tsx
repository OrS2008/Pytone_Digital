'use client';

/*
 * Web TV focus engine.
 *
 * Mirrors the Flutter app's focus model so the LG webOS app feels identical
 * to the AndroidTV/AppleTV apps:
 *
 *   * Each `TvRow` is a zone with its own horizontal cursor.
 *   * arrow-left / arrow-right walk within the row, with a smooth transform
 *     so the focused tile slides into the safe area.
 *   * arrow-up / arrow-down jump zones, restoring the remembered cursor
 *     position in the destination zone (so users can navigate back without
 *     losing context).
 *   * GoBack first dismisses any overlay, otherwise lets the browser handle
 *     it (which on webOS exits to the launcher).
 *
 * We do not rely on the DOM's native focus traversal because webOS's WebKit
 * loses :focus on non-tabindex elements and tab order is unpredictable in
 * the presence of CSS transforms. Instead we manage focus ourselves and
 * paint a `.focused` class.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ZoneState = { activeIndex: number };
type ZoneId = string;

interface FocusCtx {
  zones: Map<ZoneId, ZoneState>;
  currentZone: ZoneId | null;
  setCurrentZone: (z: ZoneId | null) => void;
  rememberIndex: (z: ZoneId, i: number) => void;
  recallIndex: (z: ZoneId) => number;
}

const Ctx = createContext<FocusCtx | null>(null);

export function TvFocusProvider({ children }: { children: ReactNode }) {
  // We keep zone memory in a ref because mutations on every keystroke would
  // re-render the whole tree if we used state.
  const zonesRef = useRef<Map<ZoneId, ZoneState>>(new Map());
  const [currentZone, setCurrentZone] = useState<ZoneId | null>(null);

  const value = useMemo<FocusCtx>(
    () => ({
      zones: zonesRef.current,
      currentZone,
      setCurrentZone,
      rememberIndex: (z, i) => {
        const state = zonesRef.current.get(z) ?? { activeIndex: 0 };
        state.activeIndex = i;
        zonesRef.current.set(z, state);
      },
      recallIndex: (z) => zonesRef.current.get(z)?.activeIndex ?? 0,
    }),
    [currentZone],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

interface TvRowProps {
  zoneId: ZoneId;
  items: ReactNode[];
  itemWidth: number;       // px
  gap?: number;            // px between tiles
  upZone?: ZoneId;         // where arrow-up should jump
  downZone?: ZoneId;       // where arrow-down should jump
}

/*
 * A horizontal strip of focusable items. The strip itself is translated
 * (transform: translateX) so the active tile is positioned 96 px from the
 * left edge — the "safe area" that keeps tiles readable on TVs with edge
 * cropping.
 */
export function TvRow({
  zoneId,
  items,
  itemWidth,
  gap = 16,
  upZone,
  downZone,
}: TvRowProps) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('TvRow must be inside <TvFocusProvider>');
  const [active, setActive] = useState(() => ctx.recallIndex(zoneId));

  const stripRef = useRef<HTMLDivElement>(null);

  // When this zone becomes the current zone, restore the remembered index.
  useEffect(() => {
    if (ctx.currentZone === zoneId) {
      setActive(ctx.recallIndex(zoneId));
    }
  }, [ctx, zoneId]);

  // Persist active index in zone memory so jumping away and back restores it.
  useEffect(() => {
    ctx.rememberIndex(zoneId, active);
  }, [active, ctx, zoneId]);

  // Translate strip so active item sits at x=96 (safe area).
  useEffect(() => {
    const safeLeft = 96;
    const offset = active * (itemWidth + gap) - safeLeft;
    if (stripRef.current) {
      stripRef.current.style.transform = `translateX(${-Math.max(0, offset)}px)`;
    }
  }, [active, itemWidth, gap]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (ctx.currentZone !== zoneId) return;
      switch (e.key) {
        case 'ArrowLeft':
          if (active > 0) setActive(active - 1);
          e.preventDefault();
          break;
        case 'ArrowRight':
          if (active < items.length - 1) setActive(active + 1);
          e.preventDefault();
          break;
        case 'ArrowUp':
          if (upZone) ctx.setCurrentZone(upZone);
          e.preventDefault();
          break;
        case 'ArrowDown':
          if (downZone) ctx.setCurrentZone(downZone);
          e.preventDefault();
          break;
      }
    },
    [active, ctx, downZone, items.length, upZone, zoneId],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  // Take focus when zone becomes current (helps screen readers + Smart UI).
  useEffect(() => {
    if (ctx.currentZone === zoneId && stripRef.current) {
      stripRef.current.focus({ preventScroll: true });
    }
  }, [ctx.currentZone, zoneId]);

  return (
    <div
      ref={stripRef}
      className="tv-row-strip"
      tabIndex={-1}
      onMouseEnter={() => ctx.setCurrentZone(zoneId)}
      role="listbox"
      aria-label={zoneId}
    >
      {items.map((node, i) => (
        <div
          key={i}
          className={`tv-tile ${ctx.currentZone === zoneId && i === active ? 'focused' : ''}`}
          role="option"
          aria-selected={i === active}
        >
          {node}
        </div>
      ))}
    </div>
  );
}

/* Hook for arbitrary single-button focus (eg nav links, hero buttons). */
export function useSetZone(zoneId: ZoneId) {
  const ctx = useContext(Ctx);
  return useCallback(() => ctx?.setCurrentZone(zoneId), [ctx, zoneId]);
}

export function useCurrentZone() {
  return useContext(Ctx)?.currentZone ?? null;
}
