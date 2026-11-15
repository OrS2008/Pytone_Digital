'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/*
 * Pinch-to-zoom for the fullscreen player.
 *
 * Gestures, all handled on the container so they work wherever the
 * fingers land (over the picture, the letterbox bars or the info bar):
 *
 *   - two-finger pinch   zoom the picture 1x–MAX around the pinch point
 *   - one-finger drag    pan while zoomed
 *   - double-tap         toggle 1x <-> DOUBLE_TAP_SCALE at the tap point
 *   - ctrl + wheel       trackpad pinch on laptops
 *   - pinch-in at 1x     onPinchClose() — the caller leaves fullscreen
 *
 * The transform is written straight to the target's style on every
 * move (no React render per frame); only the rounded scale is mirrored
 * into state so the caller can show a "2.5x" badge.
 *
 * Listeners are attached natively with { passive: false } — React's
 * synthetic touchmove is passive, so preventDefault there cannot stop
 * the browser / WebView from starting its own page zoom mid-gesture.
 */

const MIN = 1;
const MAX = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 12;
/** Pinching below this while already at 1x means "close the player". */
const CLOSE_RATIO = 0.72;

interface Options {
  /** Gestures are only live while this is true (i.e. in fullscreen). */
  enabled: boolean;
  /** Element to transform. Resolved lazily — the <video> can remount. */
  getTarget: () => HTMLElement | null;
  /** Called when the user pinches in while the picture is at 1x. */
  onPinchClose?: () => void;
  /** Changing this value (e.g. the channel id) resets the zoom. */
  resetKey?: unknown;
}

interface View { s: number; x: number; y: number }

/** Touches that begin on a control must stay taps / drags for it. */
function onControl(target: EventTarget | null): boolean {
  return !!(target as Element | null)?.closest?.(
    'button, a, input, select, textarea, [role="slider"], [data-no-zoom]',
  );
}

export function usePinchZoom(
  containerRef: RefObject<HTMLElement | null>,
  { enabled, getTarget, onPinchClose, resetKey }: Options,
): { scale: number; reset: () => void } {
  const view = useRef<View>({ s: 1, x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const getTargetRef = useRef(getTarget);
  const closeRef = useRef(onPinchClose);
  getTargetRef.current = getTarget;
  closeRef.current = onPinchClose;

  const apply = useCallback((next: View, animate = false) => {
    const box = containerRef.current;
    const w = box?.clientWidth ?? 0;
    const h = box?.clientHeight ?? 0;
    const s = Math.min(MAX, Math.max(MIN, next.s));
    // Keep the scaled picture covering the frame — never pan past an edge.
    const maxX = ((s - 1) * w) / 2;
    const maxY = ((s - 1) * h) / 2;
    const x = Math.min(maxX, Math.max(-maxX, next.x));
    const y = Math.min(maxY, Math.max(-maxY, next.y));
    view.current = { s, x, y };
    const el = getTargetRef.current();
    if (el) {
      el.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
      el.style.transformOrigin = '50% 50%';
      el.style.transform = s === 1 ? '' : `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    }
    const shown = Math.round(s * 10) / 10;
    setScale((prev) => (prev === shown ? prev : shown));
  }, [containerRef]);

  const reset = useCallback(() => apply({ s: 1, x: 0, y: 0 }, true), [apply]);

  // New channel / leaving fullscreen → start from an un-zoomed picture.
  useEffect(() => {
    apply({ s: 1, x: 0, y: 0 });
  }, [resetKey, enabled, apply]);

  useEffect(() => {
    const box = containerRef.current;
    if (!enabled || !box) return;

    // Zoom to `s` keeping the point (cx, cy) — client coords — fixed.
    const zoomAt = (s: number, cx: number, cy: number, from: View, animate = false) => {
      const r = box.getBoundingClientRect();
      const fx = cx - (r.left + r.width / 2);
      const fy = cy - (r.top + r.height / 2);
      const clamped = Math.min(MAX, Math.max(MIN, s));
      const k = clamped / from.s;
      apply({ s: clamped, x: fx - (fx - from.x) * k, y: fy - (fy - from.y) * k }, animate);
    };

    type Gesture =
      | { kind: 'pinch'; dist: number; cx: number; cy: number; from: View; ratio: number }
      | { kind: 'pan'; x: number; y: number; from: View; moved: boolean }
      | null;
    let g: Gesture = null;
    let lastTap = { t: 0, x: 0, y: 0 };
    // The first tap of a double-tap still reaches the player as a click
    // and toggles play / pause. Remember the state from before it so
    // the double-tap can put playback back the way it was.
    let pausedBeforeTap: boolean | null = null;
    const video = () => {
      const el = getTargetRef.current();
      return el instanceof HTMLVideoElement ? el : null;
    };

    const pair = (e: TouchEvent) => {
      const a = e.touches[0], b = e.touches[1];
      return {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
        cx: (a.clientX + b.clientX) / 2,
        cy: (a.clientY + b.clientY) / 2,
      };
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const p = pair(e);
        g = { kind: 'pinch', ...p, from: { ...view.current }, ratio: 1 };
        e.preventDefault();
      } else if (e.touches.length === 1 && !onControl(e.target)) {
        const t = e.touches[0];
        g = { kind: 'pan', x: t.clientX, y: t.clientY, from: { ...view.current }, moved: false };
      } else {
        g = null;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!g) return;
      if (g.kind === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const p = pair(e);
        g.ratio = p.dist / g.dist;
        // Scale around the starting midpoint, then follow the fingers
        // so a two-finger drag pans at the same time.
        const s = Math.min(MAX, Math.max(MIN, g.from.s * g.ratio));
        const r = box.getBoundingClientRect();
        const fx = g.cx - (r.left + r.width / 2);
        const fy = g.cy - (r.top + r.height / 2);
        const k = s / g.from.s;
        apply({
          s,
          x: fx - (fx - g.from.x) * k + (p.cx - g.cx),
          y: fy - (fy - g.from.y) * k + (p.cy - g.cy),
        });
      } else if (g.kind === 'pan' && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - g.x, dy = t.clientY - g.y;
        if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) g.moved = true;
        if (g.moved && g.from.s > 1) {
          e.preventDefault();
          apply({ s: g.from.s, x: g.from.x + dx, y: g.from.y + dy });
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      const done = g;
      if (!done) return;
      if (done.kind === 'pinch') {
        // Still one finger down → carry on as a pan from here.
        if (e.touches.length === 1) {
          const t = e.touches[0];
          g = { kind: 'pan', x: t.clientX, y: t.clientY, from: { ...view.current }, moved: true };
        } else {
          g = null;
        }
        if (done.from.s === 1 && done.ratio < CLOSE_RATIO) closeRef.current?.();
        else if (view.current.s < 1.05) apply({ s: 1, x: 0, y: 0 }, true);
        e.preventDefault();          // no synthetic click after a pinch
        lastTap = { t: 0, x: 0, y: 0 };
        return;
      }
      if (e.touches.length > 0) return;
      g = null;
      if (done.moved) {
        if (done.from.s > 1) e.preventDefault();   // a pan is not a tap
        lastTap = { t: 0, x: 0, y: 0 };
        return;
      }
      // A clean tap — is it the second of a double-tap?
      const t = e.changedTouches[0];
      const now = Date.now();
      const isDouble =
        now - lastTap.t < DOUBLE_TAP_MS &&
        Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 40;
      if (isDouble) {
        e.preventDefault();
        lastTap = { t: 0, x: 0, y: 0 };
        const v = video();
        if (v && pausedBeforeTap !== null && v.paused !== pausedBeforeTap) {
          if (pausedBeforeTap) v.pause();
          else v.play().catch(() => { /* autoplay policy — leave paused */ });
        }
        if (view.current.s > 1) apply({ s: 1, x: 0, y: 0 }, true);
        else zoomAt(DOUBLE_TAP_SCALE, t.clientX, t.clientY, view.current, true);
      } else {
        lastTap = { t: now, x: t.clientX, y: t.clientY };
        pausedBeforeTap = video()?.paused ?? null;
      }
    };

    const onCancel = () => { g = null; };

    // Trackpad pinch arrives as ctrl+wheel; also swallows the browser's
    // own page zoom while the pointer is over the player.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(view.current.s * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY, view.current);
    };

    // Rotation / resize changes the pan limits — re-clamp.
    const onResize = () => apply(view.current);

    box.addEventListener('touchstart', onStart, { passive: false });
    box.addEventListener('touchmove', onMove, { passive: false });
    box.addEventListener('touchend', onEnd, { passive: false });
    box.addEventListener('touchcancel', onCancel);
    box.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);
    return () => {
      box.removeEventListener('touchstart', onStart);
      box.removeEventListener('touchmove', onMove);
      box.removeEventListener('touchend', onEnd);
      box.removeEventListener('touchcancel', onCancel);
      box.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }, [enabled, containerRef, apply]);

  return { scale, reset };
}
