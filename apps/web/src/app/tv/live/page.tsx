'use client';

/*
 * Live TV — the channel-list-first IPTV experience.
 *
 * Two viewing modes:
 *   - "browsing" (default) — rail on the left, a small preview tile on
 *      the right showing what would play.
 *   - "watching"           — player goes full-screen, rail dismissed.
 *      Esc / Back / click-on-edge returns to browsing.
 *
 * Clicking a channel ("OK" on the remote) tunes + enters watching mode
 * + starts playback. Up arrow from inside the player brings the rail
 * back so the user can keep zapping.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import TvNav from '@/components/tv/TvNav';
import { TvFocusProvider } from '@/components/tv/TvFocus';
import ChannelRail from '@/components/tv/live/ChannelRail';
import PlayerSurface from '@/components/tv/live/PlayerSurface';
import InfoBar from '@/components/tv/live/InfoBar';
import NumberZap from '@/components/tv/live/NumberZap';
import LiveScrubber from '@/components/tv/live/LiveScrubber';
import type { Channel } from '@/components/tv/live/types';
import { userKey } from '@/lib/session';
import { recordWatch } from '@/lib/watchHistory';
import { getCachedChannels, getUserSourceUrl, loadChannelsResult } from '@/lib/channelCache';
import { loadEpgIndex, hydrateChannels, getUserEpgUrl } from '@/lib/epgCache';
import { proxiedStreamUrl } from '@/lib/streamProxy';
import { buildCatchupUrl } from '@/lib/catchup';
import { maskSourceUrl } from '@/lib/maskUrl';
import { useT } from '@/lib/i18n';
import './live.css';

// Fullscreen API helpers. Spec-name in modern browsers, webkit-
// prefixed on Safari (iPadOS, macOS Safari) — we try both so a
// single click works everywhere instead of failing silently on iOS.
interface FsCapableElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FsCapableDocument extends Document {
  webkitExitFullscreen?:    () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}
function requestFullscreen(el: HTMLElement): Promise<void> {
  const node = el as FsCapableElement;
  const fn = node.requestFullscreen || node.webkitRequestFullscreen;
  if (!fn) return Promise.reject(new Error('Fullscreen API unavailable'));
  return Promise.resolve(fn.call(node));
}
function exitFullscreen(): Promise<void> {
  const doc = document as FsCapableDocument;
  const fn = doc.exitFullscreen || doc.webkitExitFullscreen;
  if (!fn) return Promise.resolve();
  return Promise.resolve(fn.call(doc));
}
function currentFullscreenElement(): Element | null {
  const doc = document as FsCapableDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; count: number; sourceTitle: string }
  | { kind: 'mock' }
  | { kind: 'error'; message: string; url: string };

// Defensive: callers should send `?start=` in milliseconds, but a
// historical bug used to ship the value in seconds. Anything that looks
// like a unix-second timestamp (year 2001 – year 2099 worth of seconds,
// 10-digit range) gets multiplied by 1000 so the downstream catch-up
// builder doesn't divide twice and land in 1970. Real ms values are at
// least 13 digits (~1e12) and stay untouched.
function normaliseEpoch(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // 1_000_000_000 sec = 2001-09-09, 4_000_000_000 sec = 2096. Outside
  // that range we assume it's already milliseconds (or junk we leave
  // for the date constructor to reject).
  if (raw >= 1_000_000_000 && raw < 10_000_000_000) return raw * 1000;
  return raw;
}

export default function LivePage() {
  // Synchronous hydration: if the cache already has the user's
  // playlist from a previous visit / route, use it instantly.
  // Otherwise the rail starts empty and the page renders an
  // "add your playlist" empty state — no demo channels.
  const initialCached = (() => {
    if (typeof window === 'undefined') return null;
    return getCachedChannels();
  })();
  const initialDeep = (() => {
    if (typeof window === 'undefined') return { idx: 0, watch: false, startMs: 0, durMin: 0 };
    const params = new URLSearchParams(window.location.search);
    const want = params.get('ch');
    const startMs = normaliseEpoch(Number(params.get('start')) || 0);
    const durMin  = Number(params.get('dur'))   || 0;
    // ?preview=1 means "tune this channel but stay in the small
    // preview" — Search uses this so a click on a result doesn't
    // hijack the user into fullscreen.
    const preview = params.get('preview') === '1';
    if (!want || !initialCached) return { idx: 0, watch: false, startMs, durMin };
    const idx = initialCached.findIndex((c) => String(c.number) === want);
    return idx >= 0 ? { idx, watch: !preview, startMs, durMin } : { idx: 0, watch: false, startMs, durMin };
  })();

  const [channels, setChannels] = useState<Channel[]>(initialCached ?? []);
  const [activeIdx, setActiveIdx] = useState(initialDeep.idx);
  const [infoVisible, setInfoVisible] = useState(true);
  const [watching, setWatching] = useState(initialDeep.watch);
  // Ref to the player overlay so we can put it into OS-level
  // fullscreen via the Fullscreen API. The overlay always covers
  // the viewport via CSS too; requesting fullscreen on top lets the
  // user use their actual screen real estate (no browser chrome).
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // Which candidate timeshift URL the player is currently attached to.
  // Surfaces in the catch-up diagnostic panel so users can copy the
  // exact URL into a browser when their panel doesn't honour the
  // first format we tried.
  const [activeCatchupUrl, setActiveCatchupUrl] = useState<
    { idx: number; total: number; url: string } | null
  >(null);
  // Catch-up mode. When set, the active channel plays from this past
  // timestamp instead of the live edge. Cleared when the user clicks
  // "Return to live" or picks a different channel from the rail.
  const [catchupMs, setCatchupMs] = useState<number>(initialDeep.startMs);
  // Optimistic preview of the pending seek target during a ← / → skip
  // burst. The actual catchupMs only updates after the LiveScrubber
  // debounce; this preview keeps the InfoBar's progress slider tracking
  // every keystroke immediately. Null when no scrub is in progress.
  const [previewMs, setPreviewMs] = useState<number | null>(null);
  // Duration hint passed in the deeplink (?dur=X minutes). The live
  // page can't know past-programme durations from active.now (which
  // only covers the current live programme), so the catchup page bakes
  // the real EPG duration into the URL. Used as the Flussonic segment
  // length when the programme lookup below doesn't match.
  const [catchupDurMin, setCatchupDurMin] = useState(initialDeep.durMin);
  const [catchupError, setCatchupError] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadState>(
    initialCached
      ? { kind: 'ready', count: initialCached.length, sourceTitle: getUserSourceUrl()?.title || 'My playlist' }
      : { kind: 'idle' },
  );
  // EPG state: idle | loading (banner says "loading guide") | ready | none
  // (user hasn't configured an XMLTV source). Drives the small status
  // text shown below the now/next line in the preview meta strip.
  const [epgState, setEpgState] = useState<'idle' | 'loading' | 'ready' | 'none'>(
    typeof window !== 'undefined' && getUserEpgUrl() ? 'idle' : 'none',
  );

  // In Next.js App Router the component is server-rendered with
  // window=undefined, so initialDeep.startMs/durMin are 0. The
  // useState initialiser inherits that server value on hydration.
  // This effect corrects catchupMs/catchupDurMin on the client as
  // soon as the first paint finishes — before the user sees anything.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const ms  = normaliseEpoch(Number(p.get('start')) || 0);
    const dur = Number(p.get('dur'))   || 0;
    if (ms  > 0) setCatchupMs(ms);
    if (dur > 0) setCatchupDurMin(dur);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = channels[activeIdx];

  // Derive the channel object the player actually plays. When we're
  // in catch-up mode AND the channel's playlist entry declares
  // catchup-source / catchup="...", we swap its live URL for the
  // expanded catch-up URL. If the channel doesn't support it, we
  // surface a friendly explanation in the meta strip and just play
  // the live edge.
  const playable: Channel | undefined = useMemo(() => {
    if (!active) return undefined;
    if (!catchupMs) { return active; }
    const programme = active.now && active.now.start.getTime() <= catchupMs && active.now.stop.getTime() > catchupMs
      ? active.now
      : active.next1 && active.next1.start.getTime() <= catchupMs && active.next1.stop.getTime() > catchupMs
      ? active.next1
      : undefined;
    // For past programmes active.now never matches, so fall back to the
    // duration baked into the deeplink URL (?dur=). Default 60 min is
    // the last resort for scrubber seeks where no URL hint is available.
    const durationMin = programme
      ? Math.max(1, Math.round((programme.stop.getTime() - programme.start.getTime()) / 60_000))
      : (catchupDurMin > 0 ? catchupDurMin : 60);
    const built = buildCatchupUrl({
      channel: {
        id: active.id, number: active.number, name: active.name,
        logoUrl: active.logoUrl, category: active.category,
        streamUrl: active.streamUrl || '',
        tvgId: active.tvgId,
        catchupKind: active.catchupKind,
        catchupSource: active.catchupSource,
        catchupDays: active.catchupDays,
        catchupCorrection: active.catchupCorrection,
      },
      startMs: catchupMs,
      durationMin,
      catchupId: programme?.catchupId,
    });
    if (!built.url) {
      return active; // fall through to live edge; banner explains why
    }
    return { ...active, streamUrl: built.url, streamUrlAlts: built.fallbacks };
  }, [active, catchupMs, catchupDurMin]);

  // When the catchup builder can't produce a real archive URL (no
  // catchup attributes, unrecognised provider shape) we silently fall
  // back to live instead of staring at an error modal. The user
  // experience is "the past programme didn't open — we're showing
  // live now" rather than a wall of red.
  useEffect(() => {
    if (!active || !catchupMs) { setCatchupError(null); return; }
    if (playable && playable.streamUrl !== active.streamUrl) {
      setCatchupError(null);          // a real catchup URL was built
    } else {
      // No archive URL → clear the catchup request entirely so the
      // player binds to the live edge and the "Replaying from X"
      // banner disappears.
      setCatchupError(null);
      setCatchupMs(0);
    }
  }, [active, catchupMs, playable]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const src = getUserSourceUrl();
      if (!src) { if (!cancelled) setLoad({ kind: 'mock' }); return; }

      // If we already hydrated from cache we still kick a background
      // refresh, but we don't show a loading state — the user keeps
      // seeing their channels the whole time.
      const wasHydrated = initialCached !== null;
      if (!wasHydrated) setLoad({ kind: 'loading' });

      const result = await loadChannelsResult();
      if (cancelled) return;
      if (result.error || result.channels.length === 0) {
        // If we had a cached snapshot, keep showing it — only surface
        // the error to users who had nothing.
        if (!wasHydrated) {
          setLoad({
            kind: 'error',
            message: result.error || 'No channels found in playlist.',
            url: src.url,
          });
        }
        return;
      }
      setChannels(result.channels);

      // Deep-link from /tv/search or Continue Watching. Search opts
      // into preview-only mode via &preview=1; every other caller
      // jumps straight into fullscreen because they came from a
      // "play this now" affordance (Continue Watching, catch-up
      // programme card, recordings).
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const want        = params?.get('ch') ?? null;
      const preview     = params?.get('preview') === '1';
      const startMsUrl  = Number(params?.get('start')) || 0;
      const durMinUrl   = Number(params?.get('dur'))   || 0;
      if (want) {
        const idx = result.channels.findIndex((c) => String(c.number) === want);
        if (idx >= 0) {
          setActiveIdx(idx);
          // Belt-and-suspenders: also set catchupMs/durMin here in case
          // the useEffect above ran before hydration completed (SSR path).
          if (startMsUrl > 0) setCatchupMs(startMsUrl);
          if (durMinUrl  > 0) setCatchupDurMin(durMinUrl);
          if (!preview) setWatching(true);
        }
      }
      setLoad({ kind: 'ready', count: result.channels.length, sourceTitle: src.title });

      // Now that channels are on screen, kick off EPG hydration in
      // the background. Channels appear instantly; programme titles
      // pop in a few seconds later (or never, if no EPG source is
      // configured). We deliberately don't block the rail on this.
      if (getUserEpgUrl()) {
        setEpgState('loading');
        const idx = await loadEpgIndex();
        if (cancelled) return;
        if (idx && idx.byId.size > 0) {
          setChannels((cur) => hydrateChannels(cur, idx));
          setEpgState('ready');
        } else {
          setEpgState('none');
        }
      }
    }
    run();
    return () => { cancelled = true; };
    // initialCached is captured once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the watching state to the browser's Fullscreen API so that
  // "⛶ Fullscreen" actually fills the user's display (no tabs, no
  // dock, no menu bar) instead of just covering the viewport. We have
  // to do this in a useEffect rather than the click handler because
  // the overlay isn't in the DOM until React renders it — modern
  // browsers still grant the request because the user-activation
  // token from the click survives a tick or two of microtask work.
  useEffect(() => {
    const el = overlayRef.current;
    if (watching && el) {
      if (currentFullscreenElement() !== el) {
        requestFullscreen(el).catch(() => { /* user / policy denial */ });
      }
    } else if (!watching && currentFullscreenElement()) {
      exitFullscreen().catch(() => { /* already exiting */ });
    }
  }, [watching]);

  // The browser's Esc-to-leave-fullscreen path bypasses React, so we
  // listen for the change event and bring our own state back in
  // sync. Without this, pressing Esc once would shrink the player
  // out of fullscreen but leave watching=true, and the next click
  // would jam — we'd be requesting fullscreen again from a stale
  // overlay state.
  useEffect(() => {
    function onFsChange() {
      if (!currentFullscreenElement() && watching) setWatching(false);
    }
    document.addEventListener('fullscreenchange',       onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange',       onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, [watching]);

  // Auto-enter fullscreen whenever the user rotates the phone — in
  // EITHER direction. Any orientation change while a channel is selected
  // is treated as "I want to watch", so the player goes fullscreen on
  // its own. We ONLY ever enter (setWatching(true)); we never auto-exit,
  // because an "exit on portrait" rule fires the instant the user taps a
  // channel (watching=true while still portrait) and slams the player
  // shut again — the "I click a channel and nothing plays" bug. The user
  // leaves the player with the × button.
  //
  // We attach the listener ONCE (empty deps) and read the live `watching`
  // / `active` values through refs, so state changes never re-run this
  // effect (which is what caused the slam-shut regression).
  const watchingRef = useRef(watching);
  const hasChannelRef = useRef(!!active);
  useEffect(() => { watchingRef.current = watching; }, [watching]);
  useEffect(() => { hasChannelRef.current = !!active; }, [active]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isPhone = window.innerWidth <= 819;
    if (!isPhone) return;

    function enterFullscreen() {
      // Any rotation → go fullscreen, as long as a channel is selected
      // and we're not already watching. Direction-agnostic on purpose.
      if (hasChannelRef.current && !watchingRef.current) setWatching(true);
    }

    const screenOrient = screen.orientation as ScreenOrientation | undefined;
    screenOrient?.addEventListener?.('change', enterFullscreen);
    window.addEventListener('orientationchange', enterFullscreen);
    return () => {
      screenOrient?.removeEventListener?.('change', enterFullscreen);
      window.removeEventListener('orientationchange', enterFullscreen);
    };
  }, []);

  // The 5-second auto-hide window is re-armed imperatively on every
  // activity tick (mouse move, click, key press inside the player
  // overlay). We used to drive this via a useEffect with `activityTick`
  // in the deps, but on the SECOND showing the cleanup+effect cycle
  // could lose the timer when the mousemove batched with the previous
  // hide — the bar then stayed visible forever. Managing the timer
  // through a ref sidesteps all of that.
  const lastActivityRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setInfoVisible(false), 5000);
  }, []);
  const wakeInfoBar = useCallback(() => {
    const now = Date.now();
    // Throttle to once every 250 ms so a moving mouse doesn't churn.
    if (now - lastActivityRef.current < 250) return;
    lastActivityRef.current = now;
    setInfoVisible(true);
    armHide();
  }, [armHide]);

  // Arm the hide on first mount (bar starts visible) and on every
  // channel change (tune() sets visible=true and we want a fresh 5 s).
  useEffect(() => {
    if (!infoVisible) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      return;
    }
    armHide();
    return () => {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    };
  }, [infoVisible, activeIdx, armHide]);

  // Channel prefetch — warm the HLS manifest of the channels above and
  // below the current one so the next zap is closer to instant. Opt-in
  // via /tv/account/preferences (defaults on).
  useEffect(() => {
    let prefetchOn = true;
    try {
      const raw = localStorage.getItem(userKey('prefs.prefetchNeighbours'));
      if (raw === '0') prefetchOn = false;
    } catch { /* ignore */ }
    if (!prefetchOn) return;

    const neighbours = [activeIdx - 1, activeIdx + 1]
      .filter((i) => i >= 0 && i < channels.length)
      .map((i) => channels[i]?.streamUrl)
      .filter((u): u is string => typeof u === 'string' && /\.m3u8(\?|$)/i.test(u))
      .map(proxiedStreamUrl);

    const controllers = neighbours.map((url) => {
      const ac = new AbortController();
      // We fire-and-forget — the goal is for the browser to hold the
      // DNS + TLS + first segments warm. We deliberately don't await
      // the response.
      fetch(url, { signal: ac.signal, mode: 'no-cors', cache: 'force-cache' as RequestCache }).catch(() => {});
      return ac;
    });
    return () => { controllers.forEach((c) => c.abort()); };
  }, [activeIdx, channels]);

  // Record the active channel into watch history. We count "watched"
  // only after a 4-second dwell so the user doesn't churn history by
  // zapping through the rail.
  useEffect(() => {
    const ch = channels[activeIdx];
    if (!ch || !watching) return;
    const started = Date.now();
    const dwell = setTimeout(() => {
      recordWatch({ id: ch.id, number: ch.number, name: ch.name, logoUrl: ch.logoUrl }, 0);
    }, 4000);
    return () => {
      clearTimeout(dwell);
      // On unmount / channel change after dwell crossed, add elapsed
      // duration to the existing entry.
      const elapsed = Date.now() - started;
      if (elapsed > 4000) recordWatch({ id: ch.id, number: ch.number, name: ch.name, logoUrl: ch.logoUrl }, elapsed);
    };
  }, [activeIdx, watching, channels]);

  // Tuning behaviour. Clicking / pressing OK on a channel selects it AND
  // enters watching mode so the player goes full-screen and starts
  // playback. Pressing Up while watching brings the rail back so the
  // user can switch channels without losing what they're on (player keeps
  // playing in the background).
  const tune = useCallback(
    (idx: number, opts?: { enterWatching?: boolean; keepCatchup?: boolean }) => {
      if (idx < 0 || idx >= channels.length) return;
      setActiveIdx(idx);
      setInfoVisible(true);
      // Switching channel exits catch-up mode — the previous timestamp
      // doesn't make sense on a different schedule.
      if (!opts?.keepCatchup) setCatchupMs(0);
      if (opts?.enterWatching) setWatching(true);
    },
    [channels.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'PageUp')   tune(activeIdx - 1, { enterWatching: watching });
      if (e.key === 'PageDown') tune(activeIdx + 1, { enterWatching: watching });
      if (e.key === 'i' || e.key === 'Info') setInfoVisible((v) => !v);
      if ((e.key === 'Escape' || e.key === 'GoBack') && watching) {
        setWatching(false);
      }
      // ArrowUp used to exit watching mode, but that fought the
      // scrubber: a remote user pressing ↑ to nudge volume was
      // bouncing back to the channel list. Esc / Back is the
      // explicit way out now.
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, tune, watching]);

  const tuneByNumber = useCallback(
    (num: number) => {
      const i = channels.findIndex((c) => c.number === num);
      if (i >= 0) tune(i, { enterWatching: true });
    },
    [channels, tune],
  );

  const { t } = useT();
  const layout = useMemo(() => 'live-layout' + (watching ? ' watching' : ''), [watching]);
  return (
    <TvFocusProvider>
      <div className={layout}>
        {!watching && <TvNav />}

        {!watching && load.kind === 'loading' && (
          <div className="live-status">{t('live.loadingPlaylist')}</div>
        )}
        {!watching && load.kind === 'ready' && (
          <div className="live-status live-status-ok">
            {load.sourceTitle} · {t('live.channelsLoaded').replace('{count}', String(load.count))}
          </div>
        )}
        {!watching && load.kind === 'mock' && (
          <div className="live-empty">
            <div className="live-empty-card">
              <div className="live-empty-icon">📺</div>
              <h2 className="live-empty-title">{t('live.empty.title')}</h2>
              <p className="live-empty-sub">{t('live.empty.sub')}</p>
              <div className="live-empty-actions">
                <Link href="/tv/account/sources" className="tv-btn tv-btn-primary">
                  {t('live.empty.cta')}
                </Link>
                <Link href="/tv/account/help" className="tv-btn">
                  {t('live.empty.help')}
                </Link>
              </div>
            </div>
          </div>
        )}
        {!watching && load.kind === 'error' && (
          <PlaylistErrorBanner
            message={load.message}
            url={load.url}
            onRetry={async () => {
              setLoad({ kind: 'loading' });
              const fresh = await loadChannelsResult();
              if (fresh.error || fresh.channels.length === 0) {
                setLoad({
                  kind: 'error',
                  message: fresh.error || 'No channels found in playlist.',
                  url: load.url,
                });
              } else {
                setChannels(fresh.channels);
                setLoad({
                  kind: 'ready',
                  count: fresh.channels.length,
                  sourceTitle: getUserSourceUrl()?.title || 'My playlist',
                });
              }
            }}
          />
        )}

        <div className="live-body" style={channels.length === 0 ? { display: 'none' } : undefined}>
          <ChannelRail
            channels={channels}
            activeIdx={activeIdx}
            // Arrow keys / remote: just browse — preview updates, no
            // fullscreen. Click on a card: enter watching mode straight
            // away. On phones the preview tile sits below the grid
            // (off-screen), so a click without entering watching looks
            // like nothing happened.
            onTune={(i) => tune(i)}
            onPlay={(i) => tune(i, { enterWatching: true })}
          />
          {!watching && (
            <div className="live-preview">
              <div className="live-preview-player">
                {playable ? (
                  <PlayerSurface
                    channel={playable}
                    autoPlay
                    onCandidateChange={(info) => setActiveCatchupUrl(info)}
                  />
                ) : (
                  <div className="live-preview-empty">
                    <div style={{ fontSize: 32 }}>📺</div>
                    <div>Pick a channel from the list to start watching.</div>
                  </div>
                )}
                {catchupMs > 0 && (
                  <CatchupBanner
                    startMs={catchupMs}
                    error={catchupError}
                    onReturnLive={() => setCatchupMs(0)}
                    diagnostic={activeCatchupUrl}
                  />
                )}
              </div>
              {active && (
                <div className="live-preview-meta">
                  {active.logoUrl && (
                    <div className="live-preview-meta-logo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={active.logoUrl} alt="" />
                    </div>
                  )}
                  <div className="live-preview-meta-text">
                    <div className="live-preview-meta-name">
                      #{active.number} · {active.name}
                    </div>
                    <div className="live-preview-meta-schedule">
                      {active.now ? (
                        <div className="live-preview-meta-row">
                          <span className="live-preview-meta-eyebrow">{t('live.now')}</span>
                          <span className="live-preview-meta-title">{active.now.title}</span>
                          <span className="live-preview-meta-time">
                            {fmtHM(active.now.start)}–{fmtHM(active.now.stop)}
                          </span>
                        </div>
                      ) : (
                        <div className="live-preview-meta-row">
                          <span className="live-preview-meta-eyebrow">{t('live.now')}</span>
                          {epgState === 'loading' ? (
                            <span className="live-preview-meta-empty">{t('live.loadingGuide')}</span>
                          ) : epgState === 'none' ? (
                            <Link
                              href="/tv/account/sources?tab=epg"
                              className="live-preview-meta-empty live-preview-meta-link"
                            >
                              {t('live.addGuide')}
                            </Link>
                          ) : (
                            <span className="live-preview-meta-empty">{t('live.noProgramme')}</span>
                          )}
                        </div>
                      )}
                      {active.next1 && (
                        <div className="live-preview-meta-row">
                          <span className="live-preview-meta-eyebrow next">{t('live.next')}</span>
                          <span className="live-preview-meta-title">{active.next1.title}</span>
                          <span className="live-preview-meta-time">{fmtHM(active.next1.start)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="live-preview-fs"
                    onClick={() => setWatching(true)}
                    title={t('live.fullscreen')}
                  >
                    ⛶  {t('live.fullscreen')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {watching && (
          <div
            ref={overlayRef}
            className="live-player-overlay"
            onMouseMove={wakeInfoBar}
            onClick={wakeInfoBar}
            onKeyDown={wakeInfoBar}
          >
            <PlayerSurface
              channel={playable}
              autoPlay
              startUnmuted
              onCandidateChange={(info) => setActiveCatchupUrl(info)}
            />
            {catchupMs > 0 && (
              <CatchupBanner
                startMs={catchupMs}
                error={catchupError}
                onReturnLive={() => setCatchupMs(0)}
                fullscreen
                diagnostic={activeCatchupUrl}
              />
            )}
            {active && !catchupError && (
              <LiveScrubber
                catchupMs={catchupMs}
                maxRewindDays={active.catchupDays ?? 7}
                onSeek={(ms) => { setCatchupMs(ms); setPreviewMs(null); }}
                onReturnLive={() => { setCatchupMs(0); setPreviewMs(null); }}
                onPreview={(ms) => setPreviewMs(ms)}
                active={watching}
                infoBarVisible={infoVisible}
              />
            )}
            <button
              className="live-close"
              onClick={() => setWatching(false)}
              title="Back to channel list (Esc)"
              aria-label="Close player"
            >×</button>
            <InfoBar
              channel={active}
              visible={infoVisible}
              onDismiss={() => setInfoVisible(false)}
              onTune={(i) => tune(i, { enterWatching: true })}
              activeIdx={activeIdx}
              channels={channels}
              inCatchup={catchupMs > 0}
              playheadMs={previewMs ?? (catchupMs > 0 ? catchupMs : Date.now())}
              onReturnLive={() => setCatchupMs(0)}
              onRestartProgramme={() => {
                if (active?.now) setCatchupMs(active.now.start.getTime());
              }}
            />
          </div>
        )}

        <NumberZap onCommit={tuneByNumber} />
      </div>
    </TvFocusProvider>
  );
}

// Floating banner shown over the player when we're in catch-up mode.
// Two distinct UIs:
//   - error    → big, centred, blocking-looking card that explains
//                exactly why the past programme isn't playing and
//                lays out the options. We commit to making this
//                unmissable because falling through to the live edge
//                silently is what tripped users up before.
//   - success  → small pill at the top showing the replay timestamp
//                and a one-tap Return-to-live shortcut.
function CatchupBanner({
  startMs,
  error,
  onReturnLive,
  fullscreen,
  diagnostic,
}: {
  startMs: number;
  error: string | null;
  onReturnLive: () => void;
  fullscreen?: boolean;
  diagnostic?: { idx: number; total: number; url: string } | null;
}) {
  const when = new Date(startMs);
  const label =
    `${String(when.getDate()).padStart(2, '0')}/${String(when.getMonth() + 1).padStart(2, '0')} ` +
    `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;


  return (
    <>
      <div
        role="status"
        style={{
          position: 'absolute',
          top: fullscreen ? 16 : 10,
          left:  fullscreen ? '50%' : 10,
          right: fullscreen ? 'auto' : 10,
          transform: fullscreen ? 'translateX(-50%)' : undefined,
          zIndex: 4,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 14px',
          background: 'rgba(0, 0, 0, 0.65)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 999,
          color: '#fff',
          fontSize: 13,
          backdropFilter: 'blur(8px)',
        }}
      >
        <span style={{ fontWeight: 700 }}>⏪</span>
        <span style={{ maxWidth: 480, lineHeight: 1.35 }}>Replaying from {label}</span>
        <button
          onClick={onReturnLive}
          style={{
            background: 'var(--ns-accent, #FF3B6E)', color: 'var(--ns-accent-text-on, #fff)',
            border: 0, borderRadius: 999,
            padding: '6px 14px', fontWeight: 700, fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ▶ Return to live
        </button>
      </div>
      {/* Diagnostic panel: shows the exact timeshift URL the player is
          currently attached to. Lets users copy + paste the URL into
          a browser to verify what their panel responds with — the
          fastest path to understanding "why does this jump to live?"
          when the URL format isn't right for their provider. */}
      {diagnostic && (
        <div
          style={{
            position: 'absolute',
            top: fullscreen ? 72 : 60,
            left:  fullscreen ? '50%' : 10,
            right: fullscreen ? 'auto' : 10,
            transform: fullscreen ? 'translateX(-50%)' : undefined,
            maxWidth: fullscreen ? 720 : 'unset',
            zIndex: 4,
            padding: '8px 12px',
            background: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            color: '#E9EBF1',
            fontSize: 11,
            lineHeight: 1.4,
            backdropFilter: 'blur(8px)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{
              padding: '2px 6px', borderRadius: 4,
              background: 'rgba(255, 59, 110, 0.2)', color: '#FF6B7B',
              fontWeight: 700, fontSize: 10, letterSpacing: 0.5,
            }}>
              Format {diagnostic.idx + 1} of {diagnostic.total}
            </span>
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(diagnostic.url).catch(() => {}); }}
              style={{
                padding: '2px 8px', borderRadius: 4,
                background: 'rgba(255,255,255,0.08)', color: '#E9EBF1',
                border: '1px solid rgba(255,255,255,0.12)',
                fontSize: 10, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >Copy URL</button>
          </div>
          <div style={{ wordBreak: 'break-all', color: '#B7BEC9' }}>{maskSourceUrl(diagnostic.url)}</div>
        </div>
      )}
    </>
  );
}

// Inline error card shown above the channel rail when /api/m3u failed.
//
// Designed to be unmissable AND debuggable:
//   - the technical message wraps on multiple lines so long error
//     strings don't get truncated by viewport width
//   - the URL we tried is rendered as a monospace code block so the
//     user can spot a typo at a glance
//   - "Try again" runs the fetch in place without a navigation, which
//     is the right call when the upstream is intermittent
//   - "Copy details" puts everything (URL + message) on the clipboard
//     for the user to send us in a support ticket or paste back here
//   - a small build-id chip lets us tell, just from a screenshot,
//     whether the user is on the current deploy or a stale CDN copy
function PlaylistErrorBanner({
  message,
  url,
  onRetry,
}: {
  message: string;
  url: string;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy,   setBusy]   = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`URL: ${url}\nError: ${message}\nBuild: ${BUILD_ID}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked / unsupported */ }
  }

  async function retry() {
    setBusy(true);
    try { await onRetry(); } finally { setBusy(false); }
  }

  return (
    <div
      role="alert"
      style={{
        margin: '10px 14px',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'rgba(255,107,123,0.08)',
        border: '1px solid rgba(255,107,123,0.30)',
        color: 'var(--ns-danger, #FF6B7B)',
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
        We couldn&apos;t load your playlist.
      </div>
      <div style={{ color: 'var(--ns-text, #E6E8EE)', marginBottom: 8 }}>
        {message}
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--ns-text-faint, #8B92A3)' }}>URL attempted:</span>{' '}
        <code style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 12,
          color: 'var(--ns-text-muted, #B7BEC9)',
          background: 'rgba(255,255,255,0.04)',
          padding: '2px 6px',
          borderRadius: 4,
          wordBreak: 'break-all',
        }}>{url || '(none)'}</code>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={retry}
          disabled={busy}
          className="ac-btn ac-btn-sm"
          style={{ opacity: busy ? 0.7 : 1 }}
        >
          {busy ? 'Retrying…' : 'Try again'}
        </button>
        <Link href="/tv/account/sources" className="ac-btn ac-btn-sm">
          Edit URL
        </Link>
        <button onClick={copy} className="ac-btn ac-btn-sm">
          {copied ? 'Copied ✓' : 'Copy details'}
        </button>
        <span style={{
          marginInlineStart: 'auto',
          fontSize: 10,
          color: 'var(--ns-text-faint, #8B92A3)',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        }}>build {BUILD_ID}</span>
      </div>
    </div>
  );
}

// Short build identifier baked at compile time. Used in the error card
// so a screenshot tells us whether the user is on the latest deploy or
// hitting a stale CDN copy.
const BUILD_ID = (process.env.NEXT_PUBLIC_BUILD_ID || process.env.CF_PAGES_COMMIT_SHA || 'dev').slice(0, 7);

function fmtHM(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
