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
import { useT } from '@/lib/i18n';
import './live.css';

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; count: number; sourceTitle: string }
  | { kind: 'mock' }
  | { kind: 'error'; message: string; url: string };

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
    if (typeof window === 'undefined') return { idx: 0, watch: false, startMs: 0 };
    const params = new URLSearchParams(window.location.search);
    const want = params.get('ch');
    const startMs = Number(params.get('start')) || 0;
    if (!want || !initialCached) return { idx: 0, watch: false, startMs };
    const idx = initialCached.findIndex((c) => String(c.number) === want);
    return idx >= 0 ? { idx, watch: true, startMs } : { idx: 0, watch: false, startMs };
  })();

  const [channels, setChannels] = useState<Channel[]>(initialCached ?? []);
  const [activeIdx, setActiveIdx] = useState(initialDeep.idx);
  const [infoVisible, setInfoVisible] = useState(true);
  const [watching, setWatching] = useState(initialDeep.watch);
  // Catch-up mode. When set, the active channel plays from this past
  // timestamp instead of the live edge. Cleared when the user clicks
  // "Return to live" or picks a different channel from the rail.
  const [catchupMs, setCatchupMs] = useState<number>(initialDeep.startMs);
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
    const durationMin = programme
      ? Math.max(1, Math.round((programme.stop.getTime() - programme.start.getTime()) / 60_000))
      : 60;
    const built = buildCatchupUrl({
      channel: {
        id: active.id, number: active.number, name: active.name,
        logoUrl: active.logoUrl, category: active.category,
        streamUrl: active.streamUrl || '',
        tvgId: active.tvgId,
        catchupKind: active.catchupKind,
        catchupSource: active.catchupSource,
        catchupDays: active.catchupDays,
      },
      startMs: catchupMs,
      durationMin,
    });
    if (!built.url) {
      return active; // fall through to live edge; banner explains why
    }
    return { ...active, streamUrl: built.url };
  }, [active, catchupMs]);

  // Sync the catch-up error message based on whether buildCatchupUrl
  // actually produced a URL. The old check (catchupKind/catchupSource
  // attributes only) was wrong now that we infer catch-up from the
  // Xtream URL pattern even without explicit attributes — the message
  // would show "no catch-up support" while we were silently playing
  // the catchup URL anyway.
  useEffect(() => {
    if (!active || !catchupMs) { setCatchupError(null); return; }
    if (playable && playable.streamUrl !== active.streamUrl) {
      setCatchupError(null);          // we built a real catchup URL
    } else {
      setCatchupError(
        "This channel doesn't expose a catch-up archive we can read. " +
        "Ask your provider for a playlist with catchup-source attributes.",
      );
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

      // Deep-link from /tv/search or Continue Watching.
      const want = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ch') : null;
      if (want) {
        const idx = result.channels.findIndex((c) => String(c.number) === want);
        if (idx >= 0) { setActiveIdx(idx); setWatching(true); }
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

  const { t } = useT();
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
            onTune={(i) => tune(i)}
          />
          {!watching && (
            <div className="live-preview">
              <div className="live-preview-player">
                {playable ? (
                  <PlayerSurface channel={playable} autoPlay />
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
                          <span className="live-preview-meta-eyebrow">Now</span>
                          <span className="live-preview-meta-title">{active.now.title}</span>
                          <span className="live-preview-meta-time">
                            {fmtHM(active.now.start)}–{fmtHM(active.now.stop)}
                          </span>
                        </div>
                      ) : (
                        <div className="live-preview-meta-row">
                          <span className="live-preview-meta-eyebrow">Now</span>
                          {epgState === 'loading' ? (
                            <span className="live-preview-meta-empty">Loading programme guide…</span>
                          ) : epgState === 'none' ? (
                            <Link
                              href="/tv/account/sources?tab=epg"
                              className="live-preview-meta-empty live-preview-meta-link"
                            >
                              Live stream · add a programme guide →
                            </Link>
                          ) : (
                            <span className="live-preview-meta-empty">No programme info</span>
                          )}
                        </div>
                      )}
                      {active.next1 && (
                        <div className="live-preview-meta-row">
                          <span className="live-preview-meta-eyebrow next">Next</span>
                          <span className="live-preview-meta-title">{active.next1.title}</span>
                          <span className="live-preview-meta-time">{fmtHM(active.next1.start)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="live-preview-fs"
                    onClick={() => setWatching(true)}
                    title="Watch fullscreen"
                  >
                    ⛶  Fullscreen
                  </button>
                </div>
              )}
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
            <PlayerSurface channel={playable} autoPlay startUnmuted />
            {catchupMs > 0 && (
              <CatchupBanner
                startMs={catchupMs}
                error={catchupError}
                onReturnLive={() => setCatchupMs(0)}
                fullscreen
              />
            )}
            {active && !catchupError && (
              <LiveScrubber
                catchupMs={catchupMs}
                maxRewindDays={active.catchupDays ?? 7}
                onSeek={(ms) => setCatchupMs(ms)}
                onReturnLive={() => setCatchupMs(0)}
                active={watching}
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
}: {
  startMs: number;
  error: string | null;
  onReturnLive: () => void;
  fullscreen?: boolean;
}) {
  const when = new Date(startMs);
  const label =
    `${String(when.getDate()).padStart(2, '0')}/${String(when.getMonth() + 1).padStart(2, '0')} ` +
    `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;

  if (error) {
    return (
      <div
        role="alert"
        style={{
          position: 'absolute',
          inset: fullscreen ? '0' : '0',
          background: 'rgba(6, 7, 10, 0.78)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          zIndex: 5,
        }}
      >
        <div style={{
          maxWidth: 520,
          background: '#10131A',
          border: '1px solid rgba(255,107,123,0.35)',
          borderRadius: 16,
          padding: '24px 26px',
          color: '#E9EBF1',
          textAlign: 'center',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠</div>
          <h3 style={{
            margin: '0 0 8px',
            fontSize: 18,
            fontWeight: 800,
            color: '#FF6B7B',
          }}>
            Catch-up not available
          </h3>
          <p style={{ margin: '0 0 6px', fontSize: 14, color: '#E9EBF1', lineHeight: 1.5 }}>
            You asked to replay from{' '}
            <strong style={{ color: '#fff' }}>{label}</strong>, but this channel can&apos;t.
          </p>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: '#B7BEC9', lineHeight: 1.5 }}>
            {error}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={onReturnLive}
              style={{
                background: '#FF3B6E', color: '#fff',
                border: 0, borderRadius: 10,
                padding: '10px 20px',
                fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ▶ Watch live instead
            </button>
            <Link
              href="/tv/catchup"
              style={{
                background: 'rgba(255,255,255,0.08)',
                color: '#E9EBF1',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 20px',
                fontWeight: 700, fontSize: 14,
                textDecoration: 'none',
              }}
            >
              ← Back to catch-up
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
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
          background: '#FF3B6E', color: '#fff',
          border: 0, borderRadius: 999,
          padding: '6px 14px', fontWeight: 700, fontSize: 12,
          cursor: 'pointer',
        }}
      >
        ▶ Return to live
      </button>
    </div>
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
