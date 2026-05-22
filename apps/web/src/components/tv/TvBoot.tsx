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
    // Detect a real TV launch — only there should we lock scroll, force
    // initial focus, and translate remote keycodes. In a regular browser
    // (phone, laptop, desktop) the user expects native scrolling and
    // pointer focus, and any of the TV-specific hijacks make the page
    // feel broken.
    const ua = navigator.userAgent || '';
    const isTv =
      /webOS|Web0S|SmartTV|Tizen|HbbTV|CrKey|AppleTV/i.test(ua) ||
      typeof (window as unknown as { webOS?: unknown }).webOS !== 'undefined';

    // Apply the saved theme on first paint so the user never sees a
    // flash of the default before their preference loads. The choice is
    // written by /tv/account/appearance to localStorage. This runs on
    // every device — theme persistence is not TV-specific.
    try {
      const saved = localStorage.getItem('ns.theme');
      if (saved && ['apex','aurora','mono','cyber','premium'].includes(saved)) {
        document.documentElement.setAttribute('data-theme', saved);
        document.body.setAttribute('data-theme', saved);
      }
    } catch { /* localStorage may be locked */ }

    if (!isTv) return;

    // --- below this line, TV-only behaviour ---

    // Scroll lock — see comment above. (Account screens have their own
    // managed scrollers; this only suppresses the page-level scroll the
    // TV remote sometimes triggers via accidental pointer events.)
    const prevent = (e: Event) => {
      const target = e.target as Element | null;
      if (target?.closest('.ac-panel, .ac-sidebar, .ac-rail')) return;
      e.preventDefault();
    };
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
