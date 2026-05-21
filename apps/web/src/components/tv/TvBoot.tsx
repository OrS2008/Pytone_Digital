'use client';

import { useEffect } from 'react';

/*
 * Client-only boot shim mounted by the TV layout.
 *
 * Responsibilities:
 *   * Force a deterministic viewport (no zoom, no scroll-on-overflow).
 *   * Translate webOS remote keycodes into KeyboardEvents the rest of the
 *     app can rely on. The TV-spec keycodes are not all DOM-standard, so
 *     we normalise them up front.
 *   * Subscribe to webOS lifecycle (relaunch, visibility) so deep links
 *     fired while the app is already running are honoured.
 *
 * Why a separate component rather than inline script in layout.tsx?
 *   * Next.js server components cannot attach window listeners.
 *   * We want it to run exactly once per session, after hydration.
 */
export default function TvBoot() {
  useEffect(() => {
    // Disable wheel + touch scrolling — TV browsers occasionally route
    // pointer-y events from accidental remote touches and we never want
    // the page to scroll natively. All scrolling is JS-driven.
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('wheel', prevent, { passive: false });
    document.addEventListener('touchmove', prevent, { passive: false });

    // Remote keycode normalisation. webOS uses these well-known codes:
    //   461 → Back            (DOM: 'GoBack' / Escape on browsers)
    //   403–406 → color keys  (Red/Green/Yellow/Blue)
    //   415 → Play, 19 → Pause, 412 → Rewind, 417 → FastForward
    //   13  → OK / Enter      (already standard)
    //
    // The rest of the app should only ever check `e.key`; this handler
    // patches `e.key` for the codes the spec lacks.
    const normaliseRemote = (e: KeyboardEvent) => {
      const map: Record<number, string> = {
        461: 'GoBack',
        403: 'ColorRed',
        404: 'ColorGreen',
        405: 'ColorYellow',
        406: 'ColorBlue',
        415: 'MediaPlay',
        19:  'MediaPause',
        412: 'MediaRewind',
        417: 'MediaFastForward',
      };
      const patched = map[e.keyCode];
      if (patched && e.key !== patched) {
        Object.defineProperty(e, 'key', { configurable: true, get: () => patched });
      }
    };
    window.addEventListener('keydown', normaliseRemote, true);

    // webOS visibilitychange lifecycle: when the user backgrounds the app
    // by pressing Home, the TV freezes our JS (no timers fire). On return
    // we want to refresh the now/next strip so EPG isn't stale.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        window.dispatchEvent(new CustomEvent('novastream:resume'));
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Initial focus: hand control to the first focusable element so the
    // remote's first arrow press lands on something visible.
    const first = document.querySelector<HTMLElement>('[data-tv-focus="1"]');
    if (first) first.focus();

    return () => {
      document.removeEventListener('wheel', prevent);
      document.removeEventListener('touchmove', prevent);
      window.removeEventListener('keydown', normaliseRemote, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
