'use client';

import { useEffect } from 'react';
import { syncDown } from '@/lib/serverSync';

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
    //
    // Default per surface: phones boot the neutral "sage" palette to
    // match the Android APK design; TVs (and laptops/desktops) keep
    // the existing "apex" default.
    try {
      const saved = localStorage.getItem('ns.theme');
      const allowed = ['apex','aurora','mono','cyber','premium','sage'];
      let pick = saved && allowed.includes(saved) ? saved : null;
      if (!pick && !isTv) {
        const isPhone = /Android|iPhone|iPad|Mobile/i.test(ua) && window.innerWidth <= 820;
        if (isPhone) pick = 'sage';
      }
      if (pick) {
        document.documentElement.setAttribute('data-theme', pick);
        document.body.setAttribute('data-theme', pick);
      }
      // Accessibility flags persisted by /tv/account/appearance.
      // Mirror them onto <html> on first paint so themes.css picks
      // them up before the user navigates to the appearance screen.
      const a11y = {
        'data-reduce-motion': localStorage.getItem('ns.a11y.reduceMotion'),
        'data-bigger-text':   localStorage.getItem('ns.a11y.biggerText'),
        'data-follow-system': localStorage.getItem('ns.a11y.followSystem'),
      };
      for (const [attr, val] of Object.entries(a11y)) {
        if (val === '1') document.documentElement.setAttribute(attr, '1');
      }
      // "Follow system" overrides the saved theme using the OS
      // preference at boot.
      if (a11y['data-follow-system'] === '1') {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const themeForMode = dark ? 'apex' : 'mono';
        document.documentElement.setAttribute('data-theme', themeForMode);
        document.body.setAttribute('data-theme', themeForMode);
      }
    } catch { /* localStorage may be locked */ }

    // Pull settings down from the server. If the user is logged in
    // (session cookie present), their M3U / EPG / preferences populate
    // this device's localStorage before any page starts reading from
    // it. Anonymous sessions get a 401 and we silently no-op.
    syncDown().catch(() => { /* offline / 5xx — local data still works */ });

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
