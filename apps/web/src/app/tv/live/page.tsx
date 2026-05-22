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
import { MOCK_CHANNELS } from '@/components/tv/live/mockChannels';
import type { Channel } from '@/components/tv/live/types';
import { userKey } from '@/lib/session';
import { recordWatch } from '@/lib/watchHistory';
import { getCachedChannels, getUserSourceUrl, loadChannels } from '@/lib/channelCache';
import './live.css';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; count: number; sourceTitle: string }
  | { kind: 'mock' }
  | { kind: 'error'; message: string };

export default function LivePage() {
  // Synchronous hydration: if the cache already has the user's
  // playlist from a previous visit / route, use it instantly. Mock
  // channels only ever show for users with no playlist configured.
  const initialCached = (() => {
    if (typeof window === 'undefined') return null;
    return getCachedChannels();
  })();
  const initialDeep = (() => {
    if (typeof window === 'undefined') return { idx: 0, watch: false };
    const want = new URLSearchParams(window.location.search).get('ch');
    if (!want || !initialCached) return { idx: 0, watch: false };
    const idx = initialCached.findIndex((c) => String(c.number) === want);
    return idx >= 0 ? { idx, watch: true } : { idx: 0, watch: false };
  })();

  const [channels, setChannels] = useState<Channel[]>(initialCached ?? MOCK_CHANNELS);
  const [activeIdx, setActiveIdx] = useState(initialDeep.idx);
  const [infoVisible, setInfoVisible] = useState(true);
  const [watching, setWatching] = useState(initialDeep.watch);
  const [load, setLoad] = useState<LoadState>(
    initialCached
      ? { kind: 'ready', count: initialCached.length, sourceTitle: getUserSourceUrl()?.title || 'My playlist' }
      : { kind: 'idle' },
  );

  const active = channels[activeIdx];

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

      try {
        const parsed = await loadChannels();
        if (cancelled) return;
        if (parsed.length === 0) throw new Error('No channels found in playlist.');
        setChannels(parsed);

        // Deep-link from /tv/search or Continue Watching.
        const want = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ch') : null;
        if (want) {
          const idx = parsed.findIndex((c) => String(c.number) === want);
          if (idx >= 0) { setActiveIdx(idx); setWatching(true); }
        }
        setLoad({ kind: 'ready', count: parsed.length, sourceTitle: src.title });
      } catch (e) {
        if (cancelled) return;
        // If we had a cached snapshot, keep showing it — only surface
        // the error to users who had nothing.
        if (!wasHydrated) setLoad({ kind: 'error', message: (e as Error).message });
      }
    }
    run();
    return () => { cancelled = true; };
    // initialCached is captured once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The 5-second auto-hide window is re-armed on every activity tick
  // (mouse move, click, key press inside the player overlay) so the
  // info bar surfaces whenever the user is actively interacting and
  // melts away when they settle into watching.
  const [activityTick, setActivityTick] = useState(0);
  const lastActivityRef = useRef(0);
  const wakeInfoBar = useCallback(() => {
    const now = Date.now();
    // Throttle to once every 250 ms so a moving mouse doesn't cause a
    // setState flood.
    if (now - lastActivityRef.current < 250) return;
    lastActivityRef.current = now;
    setInfoVisible(true);
    setActivityTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!infoVisible) return;
    const t = setTimeout(() => setInfoVisible(false), 5000);
    return () => clearTimeout(t);
  }, [infoVisible, activeIdx, activityTick]);

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
      .filter((u): u is string => typeof u === 'string' && /\.m3u8(\?|$)/i.test(u));

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
    (idx: number, opts?: { enterWatching?: boolean }) => {
      if (idx < 0 || idx >= channels.length) return;
      setActiveIdx(idx);
      setInfoVisible(true);
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
      if (e.key === 'ArrowUp' && watching) {
        setWatching(false);
      }
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

  const layout = useMemo(() => 'live-layout' + (watching ? ' watching' : ''), [watching]);
  return (
    <TvFocusProvider>
      <div className={layout}>
        {!watching && <TvNav />}

        {!watching && load.kind === 'loading' && (
          <div className="live-status">Loading your playlist…</div>
        )}
        {!watching && load.kind === 'ready' && (
          <div className="live-status live-status-ok">
            {load.sourceTitle} · {load.count} channels loaded. Click a channel to play.
          </div>
        )}
        {!watching && load.kind === 'mock' && (
          <div className="live-status">
            <Link href="/tv/account/sources" className="live-status-link">
              Add your playlist to see your channels →
            </Link>
          </div>
        )}
        {!watching && load.kind === 'error' && (
          <div className="live-status live-status-err">
            We couldn&apos;t load your playlist.{' '}
            <Link href="/tv/account/sources" className="live-status-link">
              Check the URL →
            </Link>
          </div>
        )}

        <div className="live-body">
          <ChannelRail
            channels={channels}
            activeIdx={activeIdx}
            onTune={(i) => tune(i, { enterWatching: true })}
          />
          {!watching && (
            <div className="live-preview" onClick={() => setWatching(true)} role="button" tabIndex={0}>
              {active?.logoUrl
                ? <img className="live-preview-logo" src={active.logoUrl} alt="" />
                : <div className="live-preview-num">{active?.number}</div>}
              <div className="live-preview-name">{active?.name}</div>
              <div className="live-preview-now">{active?.now?.title ?? 'No programme info'}</div>
              <button className="live-preview-play">▶  Watch</button>
              <div className="live-preview-hint">Or click any channel on the left</div>
            </div>
          )}
        </div>

        {watching && (
          <div
            className="live-player-overlay"
            onMouseMove={wakeInfoBar}
            onClick={wakeInfoBar}
            onKeyDown={wakeInfoBar}
          >
            <PlayerSurface channel={active} autoPlay />
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
            />
          </div>
        )}

        <NumberZap onCommit={tuneByNumber} />
      </div>
    </TvFocusProvider>
  );
}
